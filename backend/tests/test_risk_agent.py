from __future__ import annotations

from app.agents.risk import RiskAgent
from app.knowledge.risk_rules import active_rules
from app.schemas import AgentStatus, PatientSnapshot, RiskLevel


def test_healthy_patient_lands_in_low_band(healthy: PatientSnapshot):
    result = RiskAgent().run(healthy)
    assert result.output.risk_level is RiskLevel.LOW
    assert result.output.overall_risk < 20
    assert result.trace.status is AgentStatus.COMPLETED


def test_high_risk_patient_scores_far_higher(healthy, high_risk):
    low = RiskAgent().run(healthy).output
    high = RiskAgent().run(high_risk).output
    assert high.overall_risk > low.overall_risk + 30
    assert high.risk_level in {RiskLevel.HIGH, RiskLevel.VERY_HIGH}


def test_scores_never_exceed_bounds(high_risk: PatientSnapshot):
    r = RiskAgent().run(high_risk).output
    for score in (r.cvd_risk, r.diabetes_risk, r.cancer_risk, r.stroke_risk, r.overall_risk):
        assert 0 <= score <= 100


def test_age_bands_do_not_stack(high_risk: PatientSnapshot):
    """A 67-year-old matches AGE_45, AGE_55 and AGE_65 — only the top one counts."""
    codes = [r.code for r in active_rules(high_risk)]
    assert codes.count("AGE_65") == 1
    assert "AGE_55" not in codes
    assert "AGE_45" not in codes


def test_bp_bands_do_not_stack(high_risk: PatientSnapshot):
    codes = [r.code for r in active_rules(high_risk)]
    assert "SBP_160" in codes
    assert "SBP_140" not in codes and "SBP_130" not in codes


def test_factors_are_ranked_by_contribution(high_risk: PatientSnapshot):
    factors = RiskAgent().run(high_risk).output.factors
    contributions = [f.contribution for f in factors]
    assert contributions == sorted(contributions, reverse=True)


def test_every_factor_carries_a_rationale(high_risk: PatientSnapshot):
    for factor in RiskAgent().run(high_risk).output.factors:
        assert factor.rationale, f"{factor.code} has no rationale"
        assert factor.value


def test_confidence_drops_when_labs_are_defaulted():
    sparse = PatientSnapshot(patient_id="p-sparse", age=50)
    detailed = PatientSnapshot(
        patient_id="p-detailed",
        age=50,
        systolic_bp=135,
        total_cholesterol=210,
        hdl=45,
        fasting_glucose=104,
        bmi=28.2,
    )
    assert RiskAgent().run(sparse).output.confidence < RiskAgent().run(detailed).output.confidence


def test_smoking_raises_cancer_and_cvd(healthy: PatientSnapshot):
    before = RiskAgent().run(healthy).output
    after = RiskAgent().run(healthy.model_copy(update={"smoker": True})).output
    assert after.cancer_risk > before.cancer_risk
    assert after.cvd_risk > before.cvd_risk


def test_scoring_is_deterministic(high_risk: PatientSnapshot):
    first = RiskAgent().run(high_risk).output
    second = RiskAgent().run(high_risk).output
    assert first.overall_risk == second.overall_risk
    assert [f.code for f in first.factors] == [f.code for f in second.factors]
