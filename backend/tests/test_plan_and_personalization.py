from __future__ import annotations

from app.agents.personalization import PersonalizationAgent, PersonalizationInput
from app.agents.plan import PlanGenerationAgent, PlanGenerationInput
from app.agents.risk import RiskAgent
from app.knowledge.interventions import MAX_ACTIONS, MAX_TOTAL_REDUCTION
from app.schemas import ActionDomain, PatientSnapshot


def _plan_for(patient: PatientSnapshot):
    risk = RiskAgent().run(patient).output
    return risk, PlanGenerationAgent().run(PlanGenerationInput(patient, risk)).output


def test_high_risk_patient_gets_a_substantive_plan(high_risk: PatientSnapshot):
    _, plan = _plan_for(high_risk)
    assert 3 <= len(plan.actions) <= MAX_ACTIONS
    codes = {a.code for a in plan.actions}
    assert "SMOKING_CESSATION" in codes
    assert "BP_MONITORING" in codes


def test_plan_never_exceeds_the_action_cap(high_risk: PatientSnapshot):
    _, plan = _plan_for(high_risk)
    assert len(plan.actions) <= MAX_ACTIONS


def test_reduction_is_discounted_not_summed(high_risk: PatientSnapshot):
    _, plan = _plan_for(high_risk)
    naive = sum(a.expected_impact for a in plan.actions)
    assert plan.expected_risk_reduction < naive
    assert plan.expected_risk_reduction <= MAX_TOTAL_REDUCTION


def test_actions_are_ordered_and_numbered(high_risk: PatientSnapshot):
    _, plan = _plan_for(high_risk)
    assert [a.sort_order for a in plan.actions] == list(range(1, len(plan.actions) + 1))


def test_smoking_ranks_above_adherence_for_a_smoker(high_risk: PatientSnapshot):
    _, plan = _plan_for(high_risk)
    order = {a.code: a.sort_order for a in plan.actions}
    if "MEDICATION_ADHERENCE" in order:
        assert order["SMOKING_CESSATION"] < order["MEDICATION_ADHERENCE"]


def test_healthy_patient_still_gets_a_minimal_plan(healthy: PatientSnapshot):
    _, plan = _plan_for(healthy)
    assert len(plan.actions) >= 1


# --- personalization --------------------------------------------------------- #


def test_vegetarian_constraint_rewrites_the_diet_action(high_risk: PatientSnapshot):
    patient = high_risk.model_copy(update={"constraints": ["vegetarian"]})
    _, plan = _plan_for(patient)
    out = PersonalizationAgent().run(PersonalizationInput(patient, plan)).output

    diet = next(a for a in out.actions if "diet" in a.tags)
    assert "Plant-forward" in diet.title
    assert diet.personalized
    assert "VEGETARIAN_DIET" in diet.adaptations
    assert out.personalization_notes


def test_constraint_matching_is_case_and_space_insensitive(high_risk: PatientSnapshot):
    patient = high_risk.model_copy(update={"constraints": ["Knee Injury"]})
    _, plan = _plan_for(patient)
    out = PersonalizationAgent().run(PersonalizationInput(patient, plan)).output
    exercise = next(a for a in out.actions if "exercise" in a.tags)
    assert "joint-friendly" in exercise.title.lower()


def test_shift_work_loosens_the_exercise_schedule(high_risk: PatientSnapshot):
    patient = high_risk.model_copy(update={"constraints": ["shift_work"]})
    _, plan = _plan_for(patient)
    out = PersonalizationAgent().run(PersonalizationInput(patient, plan)).output
    exercise = next(a for a in out.actions if "exercise" in a.tags)
    assert "flexible" in exercise.frequency.lower()


def test_personalization_never_drops_a_clinical_action(high_risk: PatientSnapshot):
    patient = high_risk.model_copy(
        update={"constraints": ["vegetarian", "shift_work", "no_gym_access"]}
    )
    _, plan = _plan_for(patient)
    out = PersonalizationAgent().run(PersonalizationInput(patient, plan)).output
    screening_before = {a.code for a in plan.actions if a.domain is ActionDomain.SCREENING}
    screening_after = {a.code for a in out.actions if a.domain is ActionDomain.SCREENING}
    assert screening_before == screening_after


def test_adherence_action_dropped_for_low_risk_patient_on_no_medication(healthy: PatientSnapshot):
    # Give the patient one other action so dropping the check-in is possible.
    patient = healthy.model_copy(update={"activity_minutes_week": 60})
    _, plan = _plan_for(patient)
    assert any(a.domain is ActionDomain.MEDICATION_ADHERENCE for a in plan.actions)

    out = PersonalizationAgent().run(PersonalizationInput(patient, plan)).output
    assert all(a.domain is not ActionDomain.MEDICATION_ADHERENCE for a in out.actions)
    assert out.actions, "dropping the check-in must never empty the plan"


def test_adherence_action_is_kept_when_it_is_the_only_action(healthy: PatientSnapshot):
    """A one-action plan is never stripped to nothing, even when the rule would fire."""
    _, plan = _plan_for(healthy)
    if len(plan.actions) != 1:
        return
    out = PersonalizationAgent().run(PersonalizationInput(healthy, plan)).output
    assert len(out.actions) == 1


def test_adherence_action_kept_when_patient_takes_medication(healthy: PatientSnapshot):
    patient = healthy.model_copy(update={"current_medications": ["metformin 500mg"]})
    _, plan = _plan_for(patient)
    out = PersonalizationAgent().run(PersonalizationInput(patient, plan)).output
    assert any(a.domain is ActionDomain.MEDICATION_ADHERENCE for a in out.actions)


def test_no_constraints_means_no_adaptations(high_risk: PatientSnapshot):
    _, plan = _plan_for(high_risk)
    out = PersonalizationAgent().run(PersonalizationInput(high_risk, plan)).output
    assert out.personalization_notes == []
    assert all(not a.personalized for a in out.actions)


def test_bp_control_outranks_screening_for_a_hypertensive_patient():
    """Age feeds every risk track; it must not float screening above BP control."""
    patient = PatientSnapshot(
        patient_id="p-htn",
        age=58,
        sex="male",
        systolic_bp=152,
        total_cholesterol=244,
        hdl=36,
        ldl=168,
        fasting_glucose=118,
        bmi=31.2,
        smoker=True,
        activity_minutes_week=40,
        diet_quality="poor",
    )
    _, plan = _plan_for(patient)
    order = {a.code: a.sort_order for a in plan.actions}
    assert order["BP_MONITORING"] < order["CANCER_SCREENING"]
    assert order["SMOKING_CESSATION"] == 1


def test_relevance_bonus_is_capped():
    """An action answering many factors cannot leapfrog an unrelated high-weight one."""
    from app.agents.plan import MAX_RELEVANCE_BONUS

    assert MAX_RELEVANCE_BONUS <= 30
