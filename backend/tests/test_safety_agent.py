"""Safety is the gate, so these are the tests that must never go soft."""

from __future__ import annotations

from app.agents.orchestrator import PreventionPipeline
from app.agents.safety import SafetyAgent, SafetyInput
from app.schemas import (
    ActionDomain,
    AgentStatus,
    PatientSnapshot,
    PlanAction,
    PreventionPlan,
    RiskLevel,
    Severity,
)


def _plan(*actions: PlanAction) -> PreventionPlan:
    return PreventionPlan(
        patient_id="p-1",
        title="t",
        summary="s",
        actions=list(actions),
        source_risk_level=RiskLevel.MODERATE,
    )


def _action(title: str, description: str, tags: list[str] | None = None) -> PlanAction:
    return PlanAction(
        code="TEST",
        domain=ActionDomain.LIFESTYLE,
        title=title,
        description=description,
        frequency="daily",
        expected_impact=5,
        tags=tags or [],
    )


def test_clean_plan_passes():
    patient = PatientSnapshot(patient_id="p-1")
    plan = _plan(_action("Walk more", "Build up to 150 minutes a week."))
    out = SafetyAgent().run(SafetyInput(patient, plan)).output
    assert out.report.passed
    assert out.report.issues == []
    assert len(out.plan.actions) == 1


def test_insulin_blocks_a_fasting_action():
    patient = PatientSnapshot(patient_id="p-1", current_medications=["insulin glargine"])
    plan = _plan(_action("Try fasting", "Use an intermittent fast window of 16 hours."))
    out = SafetyAgent().run(SafetyInput(patient, plan)).output

    assert not out.report.passed
    assert out.report.escalate_to_clinician
    assert out.plan.actions == []
    assert any(i.code == "INSULIN_FASTING" for i in out.report.issues)


def test_blocked_action_is_reported_not_silently_dropped():
    patient = PatientSnapshot(patient_id="p-1", current_medications=["insulin"])
    plan = _plan(_action("Fasting plan", "An extended fast each week."))
    report = SafetyAgent().run(SafetyInput(patient, plan)).output.report
    assert "Fasting plan" in report.blocked_actions


def test_pregnancy_blocks_weight_loss_but_adapts_alcohol():
    patient = PatientSnapshot(patient_id="p-1", constraints=["pregnant"])
    plan = _plan(
        _action("Lose weight", "Target a 5-7% body weight reduction over six months."),
        _action("Cut back drinking", "Reduce alcohol to low-risk limits.", tags=["alcohol"]),
    )
    out = SafetyAgent().run(SafetyInput(patient, plan)).output

    assert not out.report.passed
    titles = [a.title for a in out.plan.actions]
    assert "Lose weight" not in titles
    assert "Cut back drinking" in titles
    alcohol = next(a for a in out.plan.actions if a.title == "Cut back drinking")
    assert alcohol.safety_adapted
    assert "Safety note" in alcohol.description


def test_adapted_action_keeps_its_original_guidance():
    patient = PatientSnapshot(patient_id="p-1", constraints=["knee_injury"])
    original = "Add brisk walking in 30-minute blocks."
    plan = _plan(_action("Move more", original, tags=["exercise"]))
    out = SafetyAgent().run(SafetyInput(patient, plan)).output
    assert out.report.passed  # a warning is not a critical finding
    assert original in out.plan.actions[0].description


def test_allergy_mention_blocks_the_action():
    patient = PatientSnapshot(patient_id="p-1", allergies=["peanut"])
    plan = _plan(_action("Snack swap", "Swap crisps for peanut butter on toast."))
    out = SafetyAgent().run(SafetyInput(patient, plan)).output
    assert not out.report.passed
    assert any(i.code == "ALLERGY_CONFLICT" for i in out.report.issues)


def test_short_allergy_strings_do_not_match_everything():
    """A two-character allergy must not blanket-block the plan."""
    patient = PatientSnapshot(patient_id="p-1", allergies=["pa"])
    plan = _plan(_action("Walk more", "Build a walking pattern across the week."))
    out = SafetyAgent().run(SafetyInput(patient, plan)).output
    assert out.report.passed


def test_fully_blocked_plan_is_a_failure_not_a_pass():
    patient = PatientSnapshot(patient_id="p-1", constraints=["eating_disorder_history"])
    plan = _plan(_action("Weight target", "Aim for a 5-7% weight loss."))
    out = SafetyAgent().run(SafetyInput(patient, plan)).output
    assert not out.report.passed
    assert any(i.code == "PLAN_EMPTY_AFTER_SCREEN" for i in out.report.issues)


def test_failed_screen_marks_the_trace_as_needs_review():
    patient = PatientSnapshot(patient_id="p-1", current_medications=["insulin"])
    plan = _plan(_action("Fast", "Intermittent fast daily."))
    outcome = SafetyAgent().run(SafetyInput(patient, plan))
    assert outcome.trace.status is AgentStatus.NEEDS_REVIEW


def test_severity_counts_are_reported():
    patient = PatientSnapshot(patient_id="p-1", constraints=["pregnant"])
    plan = _plan(_action("Lose weight", "A sustained calorie deficit."))
    report = SafetyAgent().run(SafetyInput(patient, plan)).output.report
    assert report.critical_count >= 1
    assert all(isinstance(i.severity, Severity) for i in report.issues)


def test_pipeline_marks_plan_unverified_when_safety_fails():
    patient = PatientSnapshot(
        patient_id="p-1",
        age=62,
        bmi=34,
        fasting_glucose=130,
        current_medications=["insulin glargine"],
        constraints=["eating_disorder_history"],
    )
    result = PreventionPipeline(llm=None).run(patient)
    assert result.plan.safety_verified is result.safety.passed
    if not result.safety.passed:
        assert result.plan.requires_clinician_review


# --- matching precision ------------------------------------------------------ #


def test_fasting_labs_are_not_blocked_for_an_insulin_patient():
    """"Fasting lipid panel" is a test, not a fasting protocol. Blocking it would
    remove exactly the lab this patient needs."""
    patient = PatientSnapshot(patient_id="p-1", current_medications=["insulin glargine"])
    plan = _plan(
        _action("Fasting lipid panel", "Confirm total cholesterol with a fasting lipid panel."),
        _action("Glycaemic check", "Fasting glucose of 118 mg/dL needs an HbA1c."),
    )
    out = SafetyAgent().run(SafetyInput(patient, plan)).output
    assert out.report.passed
    assert len(out.plan.actions) == 2
    assert out.report.blocked_actions == []


def test_actual_fasting_protocol_is_still_blocked_for_an_insulin_patient():
    patient = PatientSnapshot(patient_id="p-1", current_medications=["insulin glargine"])
    plan = _plan(_action("Eating window", "Adopt intermittent fasting with a 16-hour window."))
    out = SafetyAgent().run(SafetyInput(patient, plan)).output
    assert not out.report.passed
    assert any(i.code == "INSULIN_FASTING" for i in out.report.issues)


def test_allergy_matches_whole_words_only():
    """'nut' must not fire on 'nutrition'."""
    patient = PatientSnapshot(patient_id="p-1", allergies=["nut"])
    plan = _plan(_action("See a dietitian", "Book a nutrition counselling session."))
    out = SafetyAgent().run(SafetyInput(patient, plan)).output
    assert out.report.passed

    real = _plan(_action("Snack swap", "Add a handful of nut and seed mix."))
    flagged = SafetyAgent().run(SafetyInput(patient, real)).output
    assert not flagged.report.passed


def test_word_boundary_helper():
    from app.knowledge.safety_rules import mentions

    assert mentions("Adopt intermittent fasting daily", "intermittent fasting")
    assert not mentions("Fasting lipid panel", "intermittent fasting")
    assert mentions("Eat a nut mix", "nut")
    assert not mentions("Nutrition counselling", "nut")
    assert not mentions("anything", "")
