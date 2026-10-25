"""
Agent 2 — Plan Generation.

Input:  (PatientSnapshot, RiskAssessment)
Output: PreventionPlan — a ranked, de-duplicated set of actions across the four
        domains, each with an expected impact and the risk factor it answers.

Selection is the interesting part. Candidates come from the intervention
catalogue, then three things happen that the original single-pass version did
not do: actions are ranked by how much of *this* patient's risk they address,
the list is capped so the plan stays followable, and the headline reduction is
discounted for overlap rather than being a naive sum.
"""

from __future__ import annotations

from app.agents.base import Agent
from app.knowledge.interventions import (
    MAX_ACTIONS,
    MAX_TOTAL_REDUCTION,
    candidates,
)
from app.llm import prompts
from app.schemas import (
    AgentName,
    PatientSnapshot,
    PlanAction,
    PreventionPlan,
    RiskAssessment,
)

#: Each additional action is assumed to overlap with the ones before it, so its
#: contribution is discounted geometrically. Stacking eight actions at face
#: value would promise a reduction no prevention plan delivers.
OVERLAP_DECAY = 0.82

#: Ceiling on the ranking bonus an action earns for answering measured risk.
#: Without a cap, a factor that feeds all four tracks (age) swamps the clinical
#: weight and floats screening above blood-pressure control.
MAX_RELEVANCE_BONUS = 30.0

#: A non-modifiable factor still justifies an action, but less urgently than one
#: the patient can act on, so it earns half credit.
NON_MODIFIABLE_CREDIT = 0.5


class PlanGenerationInput:
    """Small carrier so the base class keeps a single payload argument."""

    __slots__ = ("patient", "risk")

    def __init__(self, patient: PatientSnapshot, risk: RiskAssessment) -> None:
        self.patient = patient
        self.risk = risk


class PlanGenerationAgent(Agent[PlanGenerationInput, PreventionPlan]):
    name = AgentName.PLAN_GENERATION
    description = "Selects and ranks preventive actions that answer the scored risk factors."

    def _run(self, payload: PlanGenerationInput) -> PreventionPlan:
        patient, risk = payload.patient, payload.risk
        fired = {
            f.code: f.contribution * (1.0 if f.modifiable else NON_MODIFIABLE_CREDIT)
            for f in risk.factors
        }

        scored: list[tuple[float, PlanAction]] = []
        for intervention in candidates(patient, risk):
            # How much of this patient's measured risk does this action speak to?
            # Capped, so clinical weight stays the primary ordering signal.
            answered = sum(fired.get(code, 0.0) for code in intervention.answers)
            relevance = intervention.weight + min(answered, MAX_RELEVANCE_BONUS)

            scored.append(
                (
                    relevance,
                    PlanAction(
                        code=intervention.code,
                        domain=intervention.domain,
                        title=intervention.title,
                        description=intervention.describe(patient, risk),
                        frequency=intervention.frequency,
                        expected_impact=round(intervention.impact(patient, risk), 1),
                        tags=list(intervention.tags),
                        targets=list(intervention.targets),
                        evidence=intervention.evidence,
                    ),
                )
            )

        scored.sort(key=lambda pair: pair[0], reverse=True)
        chosen = [action for _, action in scored[:MAX_ACTIONS]]
        for index, action in enumerate(chosen, start=1):
            action.sort_order = index

        reduction = self._discounted_reduction(chosen)

        plan = PreventionPlan(
            patient_id=patient.patient_id,
            title=f"Prevention plan — {risk.risk_level.value.replace('_', ' ')} risk",
            summary=self._summary(chosen, risk, reduction),
            actions=chosen,
            expected_risk_reduction=reduction,
            explanation=self._explanation(chosen, risk),
            source_risk_level=risk.risk_level,
        )
        return plan

    # --- helpers --------------------------------------------------------------- #

    @staticmethod
    def _discounted_reduction(actions: list[PlanAction]) -> float:
        """Sum impacts with diminishing returns, then cap."""
        total = 0.0
        for position, action in enumerate(sorted(actions, key=lambda a: a.expected_impact, reverse=True)):
            total += action.expected_impact * (OVERLAP_DECAY**position)
        return round(min(total, MAX_TOTAL_REDUCTION), 1)

    @staticmethod
    def _summary(actions: list[PlanAction], risk: RiskAssessment, reduction: float) -> str:
        domains = sorted({a.domain.value.replace("_", " ") for a in actions})
        return (
            f"{len(actions)} actions across {len(domains)} areas ({', '.join(domains)}), "
            f"targeting your {risk.overall_risk:.0f}% overall risk. Followed consistently, "
            f"they are estimated to lower it by around {reduction:.0f} points."
        )

    @staticmethod
    def _explanation(actions: list[PlanAction], risk: RiskAssessment) -> str:
        if not actions:
            return "No preventive actions were triggered by the current risk profile."
        lead = actions[0]
        return (
            f"Actions were chosen against the factors driving your score. "
            f"{lead.title} comes first because it addresses "
            f"{', '.join(lead.targets) if lead.targets else 'your overall profile'} — "
            f"the heaviest contributor in this assessment. The rest build out from there "
            f"across lifestyle, screening and follow-up."
        )

    # --- optional enrichment ----------------------------------------------------- #

    def _enrich(self, payload: PlanGenerationInput, result: PreventionPlan) -> tuple[PreventionPlan, bool]:
        risk_payload = {
            "overall_risk": payload.risk.overall_risk,
            "risk_level": payload.risk.risk_level.value,
            "top_factors": [f.name for f in payload.risk.factors[:5]],
        }
        plan_payload = {
            "expected_risk_reduction": result.expected_risk_reduction,
            "actions": [
                {"title": a.title, "domain": a.domain.value, "targets": a.targets}
                for a in result.actions
            ],
        }
        out = self.llm.complete_json(
            prompts.SYSTEM, prompts.plan_narrative(risk_payload, plan_payload)
        )
        if not out:
            return result, False

        used = False
        summary = out.get("summary")
        explanation = out.get("explanation")
        if isinstance(summary, str) and len(summary.strip()) > 40:
            result.summary = summary.strip()
            used = True
        if isinstance(explanation, str) and len(explanation.strip()) > 40:
            result.explanation = explanation.strip()
            used = True
        return result, used

    def _summarize(self, result: PreventionPlan) -> str:
        return (
            f"Generated {len(result.actions)} actions, "
            f"~{result.expected_risk_reduction:.0f} point estimated reduction"
        )

    def _details(self, result: PreventionPlan) -> dict:
        return {
            "action_codes": [a.code for a in result.actions],
            "expected_risk_reduction": result.expected_risk_reduction,
            "domains": sorted({a.domain.value for a in result.actions}),
        }
