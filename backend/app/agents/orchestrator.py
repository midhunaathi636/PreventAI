"""
The pipeline: risk → plan → personalize → safety.

The orchestrator owns sequencing, the shared trace and the single invariant
that matters clinically: **safety runs last and its verdict is final**. No
stage after it can edit the plan, so there is no path by which a blocked
action re-enters the output.
"""

from __future__ import annotations

import logging
import time
import uuid

from app.agents.base import Agent
from app.agents.personalization import PersonalizationAgent, PersonalizationInput
from app.agents.plan import PlanGenerationAgent, PlanGenerationInput
from app.agents.risk import RiskAgent
from app.agents.safety import SafetyAgent, SafetyInput
from app.llm.client import LLMClient, NullLLMClient
from app.schemas import PatientSnapshot, PipelineResult

logger = logging.getLogger(__name__)


class PreventionPipeline:
    """Runs the four agents in order and assembles one auditable result."""

    def __init__(self, llm: LLMClient | None = None) -> None:
        self.llm = llm or NullLLMClient()
        self.risk_agent = RiskAgent(self.llm)
        self.plan_agent = PlanGenerationAgent(self.llm)
        self.personalization_agent = PersonalizationAgent(self.llm)
        self.safety_agent = SafetyAgent(self.llm)

    @property
    def agents(self) -> list[Agent]:
        return [self.risk_agent, self.plan_agent, self.personalization_agent, self.safety_agent]

    def run(self, patient: PatientSnapshot) -> PipelineResult:
        run_id = str(uuid.uuid4())
        started = time.perf_counter()
        logger.info("pipeline start run_id=%s patient=%s", run_id, patient.patient_id)

        risk_out = self.risk_agent.run(patient)
        plan_out = self.plan_agent.run(PlanGenerationInput(patient, risk_out.output))
        personalized_out = self.personalization_agent.run(
            PersonalizationInput(patient, plan_out.output)
        )
        safety_out = self.safety_agent.run(SafetyInput(patient, personalized_out.output))

        total_ms = (time.perf_counter() - started) * 1000
        result = PipelineResult(
            run_id=run_id,
            patient_id=patient.patient_id,
            risk=risk_out.output,
            plan=safety_out.output.plan,
            safety=safety_out.output.report,
            trace=[
                risk_out.trace,
                plan_out.trace,
                personalized_out.trace,
                safety_out.trace,
            ],
            llm_enabled=self.llm.enabled,
            total_duration_ms=round(total_ms, 2),
        )
        logger.info(
            "pipeline done run_id=%s risk=%.1f actions=%d passed=%s %.0fms",
            run_id,
            result.risk.overall_risk,
            len(result.plan.actions),
            result.safety.passed,
            total_ms,
        )
        return result

    def run_risk_only(self, patient: PatientSnapshot):
        """Risk scoring on its own — used by the frontend's what-if slider."""
        return self.risk_agent.run(patient)
