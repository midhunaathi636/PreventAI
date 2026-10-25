"""
Thin, optional LLM client.

The service is designed to run with no API key at all: ``LLMClient.enabled`` is
False, agents skip enrichment, and the pipeline returns identical clinical
output. When a key is present the client returns parsed JSON, or ``None`` on any
failure — callers never see an exception, because an enrichment failure must
not be able to take down an assessment.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.config import Settings

logger = logging.getLogger(__name__)

_JSON_BLOCK = re.compile(r"\{.*\}", re.DOTALL)


def _parse_json(raw: str) -> dict[str, Any] | None:
    """Models sometimes wrap JSON in prose or a fence. Dig it out."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw.split("\n", 1)[-1] if "\n" in raw else raw
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass
    match = _JSON_BLOCK.search(raw)
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


class LLMClient:
    """Provider-agnostic single-shot JSON caller."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client: Any = None
        self._init_error: str | None = None

        if not settings.llm_enabled:
            return

        try:
            if settings.llm_provider == "anthropic":
                import anthropic  # noqa: PLC0415 - optional dependency

                self._client = anthropic.Anthropic(
                    api_key=settings.anthropic_api_key,
                    timeout=settings.llm_timeout_seconds,
                )
            elif settings.llm_provider == "openai":
                import openai  # noqa: PLC0415 - optional dependency

                self._client = openai.OpenAI(
                    api_key=settings.openai_api_key,
                    timeout=settings.llm_timeout_seconds,
                )
        except ImportError as exc:
            self._init_error = (
                f"{settings.llm_provider} SDK is not installed ({exc}). "
                "Install it or set PREVENTAI_LLM_PROVIDER=none."
            )
            logger.warning(self._init_error)
        except Exception as exc:  # pragma: no cover - credential/network setup
            self._init_error = f"LLM client init failed: {exc}"
            logger.warning(self._init_error)

    @property
    def enabled(self) -> bool:
        return self._client is not None

    @property
    def provider(self) -> str | None:
        return self.settings.llm_provider if self.enabled else None

    def complete_json(self, system: str, prompt: str) -> dict[str, Any] | None:
        """Return parsed JSON, or ``None`` if anything at all goes wrong."""
        if not self.enabled:
            return None
        try:
            if self.settings.llm_provider == "anthropic":
                resp = self._client.messages.create(
                    model=self.settings.llm_model,
                    max_tokens=self.settings.llm_max_tokens,
                    system=system,
                    messages=[{"role": "user", "content": prompt}],
                )
                text = "".join(
                    block.text for block in resp.content if getattr(block, "type", "") == "text"
                )
            else:
                resp = self._client.chat.completions.create(
                    model=self.settings.llm_model,
                    max_tokens=self.settings.llm_max_tokens,
                    response_format={"type": "json_object"},
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                )
                text = resp.choices[0].message.content or ""
        except Exception as exc:
            logger.warning("LLM call failed: %s", exc)
            return None

        parsed = _parse_json(text)
        if parsed is None:
            logger.warning("LLM returned unparseable output; falling back to rules text")
        return parsed


class NullLLMClient(LLMClient):
    """Explicitly disabled client, handy in tests."""

    def __init__(self) -> None:  # noqa: D107
        self.settings = None  # type: ignore[assignment]
        self._client = None
        self._init_error = None

    @property
    def enabled(self) -> bool:
        return False

    @property
    def provider(self) -> str | None:
        return None
