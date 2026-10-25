"""
Agent 3 — Personalization.

Input:  (PatientSnapshot, PreventionPlan)
Output: the same plan, reshaped around the patient's constraints and stated
        preferences, with every change recorded.

The boundary that matters: this agent changes *how* an action is done, never
*whether* it is clinically indicated. It may swap running for swimming; it may
not drop the blood pressure review because the patient would rather not.
Anything that would change clinical intent is the Safety agent's call.
"""

from __future__ import annotations

from app.agents.base import Agent
from app.knowledge.personalization_rules import rules_for
from app.llm import prompts
from app.schemas import (
    ActionDomain,
    AgentName,
    PatientSnapshot,
    PlanAction,
    PreventionPlan,
)


class PersonalizationInput:
    __slots__ = ("patient", "plan")

    def __init__(self, patient: PatientSnapshot, plan: PreventionPlan) -> None:
        self.patient = patient
        self.plan = plan


class PersonalizationAgent(Agent[PersonalizationInput, PreventionPlan]):
    name = AgentName.PERSONALIZATION
    description = "Adapts each action to the patient's constraints, preferences and context."

    def _run(self, payload: PersonalizationInput) -> PreventionPlan:
        patient, plan = payload.patient, payload.plan
        constraints = patient.normalized_constraints()
        rules = rules_for(constraints, patient.preferences, patient.current_medications)

        notes: list[str] = []
        adapted: list[PlanAction] = []

        for action in plan.actions:
            current = action.model_copy(deep=True)
            action_tags = {t.lower() for t in current.tags}

            for rule in rules:
                if rule.applies_to_tags and not action_tags.intersection(
                    {t.lower() for t in rule.applies_to_tags}
                ):
                    continue

                if rule.retitle:
                    current.title = rule.retitle
                if rule.append:
                    current.description = f"{current.description.rstrip()}{rule.append}"
                if rule.refrequency:
                    current.frequency = rule.refrequency
                if rule.add_tags:
                    current.tags = sorted(set(current.tags) | set(rule.add_tags))

                current.personalized = True
                current.adaptations.append(rule.code)
                if rule.note and rule.note not in notes:
                    notes.append(rule.note)

            adapted.append(current)

        adapted = self._drop_redundant_adherence(patient, plan, adapted, notes)
        adapted = self._reorder_for_preference(patient, adapted, notes)

        for index, action in enumerate(adapted, start=1):
            action.sort_order = index

        out = plan.model_copy(deep=True)
        out.actions = adapted
        out.personalization_notes = notes
        if notes:
            out.summary = f"{out.summary} Adapted to your situation in {len(notes)} ways."
        return out

    # --- plan-level adjustments ------------------------------------------------- #

    @staticmethod
    def _drop_redundant_adherence(
        patient: PatientSnapshot,
        plan: PreventionPlan,
        actions: list[PlanAction],
        notes: list[str],
    ) -> list[PlanAction]:
        """A medication check-in is noise for a low-risk patient on no medication."""
        if patient.current_medications:
            return actions
        if (plan.source_risk_level.value if plan.source_risk_level else "low") not in {"low"}:
            return actions

        kept = [a for a in actions if a.domain is not ActionDomain.MEDICATION_ADHERENCE]
        if len(kept) < len(actions) and kept:
            notes.append("Dropped the medication check-in — no current medications and low risk")
            return kept
        return actions

    @staticmethod
    def _reorder_for_preference(
        patient: PatientSnapshot,
        actions: list[PlanAction],
        notes: list[str],
    ) -> list[PlanAction]:
        """Honour a stated focus area by floating matching actions to the top."""
        focus = patient.preferences.get("focus")
        if not focus:
            return actions
        wanted = str(focus).strip().lower()
        matching = [a for a in actions if wanted in " ".join(a.tags).lower() or wanted in a.domain.value]
        if not matching or len(matching) == len(actions):
            return actions
        rest = [a for a in actions if a not in matching]
        notes.append(f"Moved your stated focus ({wanted}) to the top of the plan")
        return matching + rest

    # --- optional enrichment ------------------------------------------------------ #

    def _enrich(self, payload: PersonalizationInput, result: PreventionPlan) -> tuple[PreventionPlan, bool]:
        if not result.personalization_notes:
            return result, False
        plan_payload = {
            "actions": [{"title": a.title, "frequency": a.frequency} for a in result.actions]
        }
        out = self.llm.complete_json(
            prompts.SYSTEM,
            prompts.personalization_rationale(result.personalization_notes, plan_payload),
        )
        rationale = (out or {}).get("rationale")
        if isinstance(rationale, str) and len(rationale.strip()) > 30:
            result.explanation = f"{result.explanation} {rationale.strip()}"
            return result, True
        return result, False

    def _summarize(self, result: PreventionPlan) -> str:
        count = len(result.personalization_notes)
        if not count:
            return f"No adaptations needed; {len(result.actions)} actions unchanged"
        return f"{count} adaptations applied across {len(result.actions)} actions"

    def _details(self, result: PreventionPlan) -> dict:
        return {
            "notes": result.personalization_notes,
            "personalized_actions": [a.code for a in result.actions if a.personalized],
        }
