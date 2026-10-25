"""
Agent 4 — Safety.

Input:  (PatientSnapshot, PreventionPlan)
Output: (screened plan, SafetyReport)

This agent is a gate and the last word in the pipeline. Three properties are
deliberate:

* It runs **after** personalization, because personalization rewrites action
  text and a screen run earlier would be checking text that no longer exists.
* It can **block** an action outright, and a blocked action is reported rather
  than silently vanishing.
* The LLM may rephrase its notes but can never flip ``passed``. Nothing
  downstream can clear a critical finding.
"""

from __future__ import annotations

from app.agents.base import Agent
from app.knowledge.safety_rules import mentions, rules_for
from app.llm import prompts
from app.schemas import (
    AgentName,
    AgentStatus,
    PatientSnapshot,
    PlanAction,
    PreventionPlan,
    SafetyIssue,
    SafetyReport,
    Severity,
)


class SafetyInput:
    __slots__ = ("patient", "plan")

    def __init__(self, patient: PatientSnapshot, plan: PreventionPlan) -> None:
        self.patient = patient
        self.plan = plan


class SafetyOutput:
    __slots__ = ("plan", "report")

    def __init__(self, plan: PreventionPlan, report: SafetyReport) -> None:
        self.plan = plan
        self.report = report


class SafetyAgent(Agent[SafetyInput, SafetyOutput]):
    name = AgentName.SAFETY
    description = "Screens every action for contraindications, interactions and allergy conflicts."

    def _run(self, payload: SafetyInput) -> SafetyOutput:
        patient, plan = payload.patient, payload.plan
        constraints = patient.normalized_constraints()
        rules = rules_for(constraints, patient.current_medications, patient.allergies)
        allergens = [a.strip().lower() for a in patient.allergies if a.strip()]

        issues: list[SafetyIssue] = []
        blocked: list[str] = []
        adapted: list[str] = []
        cleared: list[PlanAction] = []

        for action in plan.actions:
            current = action.model_copy(deep=True)
            text = f"{current.title} {current.description} {' '.join(current.tags)}".lower()
            is_blocked = False

            # Allergies first — a direct mention of a known allergen is never adapted.
            for allergen in allergens:
                if mentions(text, allergen):
                    issues.append(
                        SafetyIssue(
                            severity=Severity.CRITICAL,
                            code="ALLERGY_CONFLICT",
                            message=f"Action references '{allergen}', a documented allergy.",
                            related_action=current.title,
                            resolution="blocked",
                        )
                    )
                    is_blocked = True

            for rule in rules:
                if not any(mentions(text, conflict) for conflict in rule.conflicts):
                    continue

                if rule.action == "block":
                    issues.append(
                        SafetyIssue(
                            severity=rule.severity,
                            code=rule.code,
                            message=rule.message,
                            related_action=current.title,
                            resolution="blocked",
                        )
                    )
                    is_blocked = True
                else:
                    issues.append(
                        SafetyIssue(
                            severity=rule.severity,
                            code=rule.code,
                            message=rule.message,
                            related_action=current.title,
                            resolution="adapted",
                        )
                    )
                    guidance = rule.guidance or rule.message
                    current.description = f"Safety note: {guidance} {current.description}"
                    current.safety_adapted = True
                    current.adaptations.append(rule.code)
                    if current.title not in adapted:
                        adapted.append(current.title)

            if is_blocked:
                blocked.append(current.title)
            else:
                cleared.append(current)

        for index, action in enumerate(cleared, start=1):
            action.sort_order = index

        critical = [i for i in issues if i.severity is Severity.CRITICAL]
        passed = not critical
        # A plan stripped to nothing is not a safe plan, it is a failed one.
        empty_plan = bool(plan.actions) and not cleared
        if empty_plan:
            passed = False
            issues.append(
                SafetyIssue(
                    severity=Severity.CRITICAL,
                    code="PLAN_EMPTY_AFTER_SCREEN",
                    message="Every proposed action was blocked; this patient needs a clinician-authored plan.",
                    resolution="flagged",
                )
            )

        report = SafetyReport(
            patient_id=patient.patient_id,
            passed=passed,
            issues=issues,
            blocked_actions=blocked,
            adapted_actions=adapted,
            escalate_to_clinician=not passed,
            notes=self._notes(passed, issues, blocked, adapted),
        )

        screened = plan.model_copy(deep=True)
        screened.actions = cleared
        screened.safety_verified = passed
        screened.safety_notes = report.notes
        screened.requires_clinician_review = not passed or bool(blocked)
        return SafetyOutput(plan=screened, report=report)

    # --- helpers --------------------------------------------------------------- #

    @staticmethod
    def _notes(
        passed: bool,
        issues: list[SafetyIssue],
        blocked: list[str],
        adapted: list[str],
    ) -> str:
        if not issues:
            return "Screened against this patient's constraints, medications and allergies. No conflicts found."
        parts: list[str] = []
        if blocked:
            parts.append(f"{len(blocked)} action(s) removed: {', '.join(blocked)}")
        if adapted:
            parts.append(f"{len(adapted)} action(s) carry a safety caveat")
        if not passed:
            parts.append("Critical findings present — a clinician must review before this plan is followed")
        else:
            parts.append("No critical findings")
        return ". ".join(parts) + "."

    # --- optional enrichment ------------------------------------------------------- #

    def _enrich(self, payload: SafetyInput, result: SafetyOutput) -> tuple[SafetyOutput, bool]:
        if not result.report.issues:
            return result, False
        payload_dict = {
            "passed": result.report.passed,
            "blocked_actions": result.report.blocked_actions,
            "adapted_actions": result.report.adapted_actions,
            "issues": [
                {"severity": i.severity.value, "message": i.message} for i in result.report.issues
            ],
        }
        out = self.llm.complete_json(prompts.SYSTEM, prompts.safety_briefing(payload_dict))
        notes = (out or {}).get("notes")
        if isinstance(notes, str) and len(notes.strip()) > 30:
            # The verdict itself is never touched — only how it reads.
            result.report.notes = notes.strip()
            result.plan.safety_notes = notes.strip()
            return result, True
        return result, False

    def _status(self, result: SafetyOutput) -> AgentStatus:
        return AgentStatus.COMPLETED if result.report.passed else AgentStatus.NEEDS_REVIEW

    def _summarize(self, result: SafetyOutput) -> str:
        report = result.report
        if report.passed and not report.issues:
            return "Passed — no conflicts found"
        verdict = "Passed with caveats" if report.passed else "Needs clinician review"
        return (
            f"{verdict} — {report.critical_count} critical, "
            f"{len(report.blocked_actions)} blocked, {len(report.adapted_actions)} adapted"
        )

    def _details(self, result: SafetyOutput) -> dict:
        return {
            "passed": result.report.passed,
            "issue_codes": [i.code for i in result.report.issues],
            "blocked_actions": result.report.blocked_actions,
            "escalate": result.report.escalate_to_clinician,
        }
