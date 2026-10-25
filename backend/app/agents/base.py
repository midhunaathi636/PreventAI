"""
The contract every PreventAI agent honours.

Three rules hold across all four agents:

1. **Deterministic core, optional enrichment.** Every agent produces a complete,
   correct result from rules alone. The LLM layer may only add prose or reorder
   wording — it can never change a score, add an action or clear a safety flag.
2. **Degrade, don't fail.** If enrichment times out or returns malformed output,
   the agent returns its deterministic result with status ``degraded``.
3. **Everything is traced.** Each run emits an :class:`AgentTrace` with timing,
   whether the LLM was used, and a human-readable message.
"""

from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Generic, TypeVar

from app.schemas import AgentName, AgentStatus, AgentTrace

logger = logging.getLogger(__name__)

TIn = TypeVar("TIn")
TOut = TypeVar("TOut")


@dataclass
class AgentOutcome(Generic[TOut]):
    """An agent's result plus the trace row describing how it got there."""

    output: TOut
    trace: AgentTrace


class Agent(ABC, Generic[TIn, TOut]):
    """Base class for the four pipeline agents."""

    name: AgentName
    description: str = ""

    def __init__(self, llm=None) -> None:
        #: An :class:`app.llm.client.LLMClient` or ``None`` for rules-only mode.
        self.llm = llm

    # --- subclass responsibilities ---------------------------------------- #

    @abstractmethod
    def _run(self, payload: TIn) -> TOut:
        """Deterministic work. Must always produce a usable result."""

    def _enrich(self, payload: TIn, result: TOut) -> tuple[TOut, bool]:
        """Optional LLM pass. Returns ``(result, llm_was_used)``.

        Implementations must treat failure as a non-event: catch, log, and
        return the unmodified deterministic result.
        """
        return result, False

    def _summarize(self, result: TOut) -> str:
        """One line for the trace."""
        return f"{self.name.value} completed"

    def _details(self, result: TOut) -> dict:
        return {}

    def _status(self, result: TOut) -> AgentStatus:
        return AgentStatus.COMPLETED

    # --- orchestration entry point ------------------------------------------ #

    def run(self, payload: TIn) -> AgentOutcome[TOut]:
        started = time.perf_counter()
        llm_used = False
        status: AgentStatus

        try:
            result = self._run(payload)
        except Exception:  # pragma: no cover - a rules bug, not an expected path
            logger.exception("%s failed in its deterministic core", self.name.value)
            raise

        if self.llm is not None and self.llm.enabled:
            try:
                result, llm_used = self._enrich(payload, result)
            except Exception as exc:
                logger.warning("%s enrichment failed, using rules output: %s", self.name.value, exc)
                llm_used = False
                status = AgentStatus.DEGRADED
                duration = (time.perf_counter() - started) * 1000
                return AgentOutcome(
                    output=result,
                    trace=AgentTrace(
                        agent=self.name,
                        status=status,
                        message=f"{self._summarize(result)} (LLM enrichment unavailable)",
                        duration_ms=round(duration, 2),
                        llm_used=False,
                        details=self._details(result),
                    ),
                )

        status = self._status(result)
        duration = (time.perf_counter() - started) * 1000
        return AgentOutcome(
            output=result,
            trace=AgentTrace(
                agent=self.name,
                status=status,
                message=self._summarize(result),
                duration_ms=round(duration, 2),
                llm_used=llm_used,
                details=self._details(result),
            ),
        )
