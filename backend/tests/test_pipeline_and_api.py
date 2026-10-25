from __future__ import annotations

from app.agents.orchestrator import PreventionPipeline
from app.config import VERSION
from app.llm.client import LLMClient, _parse_json
from app.schemas import AgentName, PatientSnapshot


def test_pipeline_runs_all_four_agents_in_order(pipeline, high_risk):
    result = pipeline.run(high_risk)
    assert [t.agent for t in result.trace] == [
        AgentName.RISK,
        AgentName.PLAN_GENERATION,
        AgentName.PERSONALIZATION,
        AgentName.SAFETY,
    ]


def test_pipeline_result_is_self_consistent(pipeline, high_risk):
    result = pipeline.run(high_risk)
    assert result.risk.patient_id == result.plan.patient_id == result.safety.patient_id
    assert result.plan.source_risk_level is result.risk.risk_level
    assert result.total_duration_ms > 0
    assert result.run_id


def test_each_trace_row_carries_timing_and_a_message(pipeline, high_risk):
    for row in pipeline.run(high_risk).trace:
        assert row.duration_ms >= 0
        assert row.message
        assert row.llm_used is False  # rules-only pipeline


def test_pipeline_is_deterministic_without_an_llm(pipeline, high_risk):
    a = pipeline.run(high_risk)
    b = pipeline.run(high_risk)
    assert a.risk.overall_risk == b.risk.overall_risk
    assert [x.code for x in a.plan.actions] == [x.code for x in b.plan.actions]
    assert a.safety.passed == b.safety.passed


def test_pipeline_handles_a_snapshot_with_only_an_id(pipeline):
    result = pipeline.run(PatientSnapshot(patient_id="p-empty"))
    assert result.risk.overall_risk >= 0
    assert result.risk.confidence < 1.0  # everything was defaulted


def test_safety_runs_last_so_blocked_actions_cannot_return(pipeline):
    patient = PatientSnapshot(
        patient_id="p-x",
        age=58,
        bmi=32,
        fasting_glucose=118,
        current_medications=["insulin"],
    )
    result = pipeline.run(patient)
    for blocked in result.safety.blocked_actions:
        assert blocked not in [a.title for a in result.plan.actions]


# --- LLM layer --------------------------------------------------------------- #


def test_llm_disabled_without_a_key():
    from app.config import Settings

    client = LLMClient(Settings(llm_provider="none"))
    assert not client.enabled
    assert client.complete_json("s", "p") is None


def test_json_parser_survives_fenced_and_wrapped_output():
    assert _parse_json('{"a": 1}') == {"a": 1}
    assert _parse_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert _parse_json('Sure! Here you go: {"a": 1} Hope that helps.') == {"a": 1}
    assert _parse_json("not json at all") is None
    assert _parse_json("[1, 2, 3]") is None  # a list is not a valid envelope


def test_enrichment_failure_degrades_instead_of_raising(high_risk):
    class BrokenLLM:
        enabled = True
        provider = "anthropic"

        def complete_json(self, system, prompt):
            raise RuntimeError("provider is down")

    result = PreventionPipeline(llm=BrokenLLM()).run(high_risk)
    assert result.plan.actions  # clinical output survived
    assert any(t.status.value == "degraded" for t in result.trace)


def test_malformed_llm_output_is_ignored(high_risk):
    class JunkLLM:
        enabled = True
        provider = "anthropic"

        def complete_json(self, system, prompt):
            return {"unexpected": "shape"}

    rules_only = PreventionPipeline(llm=None).run(high_risk)
    with_junk = PreventionPipeline(llm=JunkLLM()).run(high_risk)
    assert with_junk.risk.explanation == rules_only.risk.explanation


def test_llm_cannot_overturn_a_safety_verdict():
    class OptimisticLLM:
        enabled = True
        provider = "anthropic"

        def complete_json(self, system, prompt):
            return {
                "notes": "Everything looks completely fine and no review is needed at all here.",
                "passed": True,
            }

    patient = PatientSnapshot(patient_id="p-1", current_medications=["insulin"], bmi=33, fasting_glucose=140)
    result = PreventionPipeline(llm=OptimisticLLM()).run(patient)
    if result.safety.blocked_actions:
        assert not result.safety.passed


# --- HTTP -------------------------------------------------------------------- #


def test_health_endpoint(client):
    body = client.get("/v1/health").json()
    assert body["status"] == "ok"
    assert body["version"] == VERSION
    assert body["agents"] == ["risk", "plan_generation", "personalization", "safety"]


def test_agents_endpoint_describes_the_pipeline(client):
    body = client.get("/v1/agents").json()
    assert [a["order"] for a in body["pipeline"]] == [1, 2, 3, 4]
    assert all(a["description"] for a in body["pipeline"])


def test_assessment_endpoint_returns_a_full_result(client):
    resp = client.post(
        "/v1/assessment",
        json={"patient": {"patient_id": "p-api", "age": 61, "smoker": True, "systolic_bp": 150}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["risk"]["overall_risk"] > 0
    assert len(body["trace"]) == 4
    assert body["plan"]["actions"]


def test_risk_endpoint_is_standalone(client):
    resp = client.post("/v1/risk", json={"patient": {"patient_id": "p-api", "age": 70}})
    assert resp.status_code == 200
    assert resp.json()["risk_level"] in {"low", "moderate", "high", "very_high"}


def test_unknown_field_is_rejected(client):
    resp = client.post(
        "/v1/assessment",
        json={"patient": {"patient_id": "p", "not_a_real_field": 1}},
    )
    assert resp.status_code == 422


def test_out_of_range_value_is_rejected(client):
    resp = client.post("/v1/assessment", json={"patient": {"patient_id": "p", "age": 500}})
    assert resp.status_code == 422


# --- anonymous risk scoring -------------------------------------------------- #


def test_risk_endpoint_works_without_a_token(client):
    """The landing page's live demo calls this with no session."""
    resp = client.post("/v1/risk", json={"patient": {"patient_id": "anon", "age": 60, "smoker": True}})
    assert resp.status_code == 200
    assert resp.json()["overall_risk"] > 0


def test_anonymous_risk_can_be_turned_off():
    from fastapi.testclient import TestClient

    from app.config import Settings, get_settings
    from app.main import create_app

    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(
        allow_anonymous_risk=False,
        cognito_user_pool_id="us-east-1_test",
    )
    with TestClient(app) as c:
        resp = c.post("/v1/risk", json={"patient": {"patient_id": "anon", "age": 60}})
    assert resp.status_code == 401


def test_assessment_is_never_anonymous_when_auth_is_on():
    """Scoring is public; persisting a plan is not."""
    from fastapi.testclient import TestClient

    from app.config import Settings, get_settings
    from app.main import create_app

    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(cognito_user_pool_id="us-east-1_test")
    with TestClient(app) as c:
        resp = c.post("/v1/assessment", json={"patient": {"patient_id": "anon", "age": 60}})
    assert resp.status_code == 401


# --- who counts as a clinician ------------------------------------------- #


def test_clinician_recognised_from_a_cognito_group():
    from app.security import Caller

    assert Caller(subject="c1", groups=["Clinicians"]).is_clinician
    assert Caller(subject="c1", groups=["doctor"]).is_clinician


def test_clinician_recognised_from_the_role_attribute():
    """Sign-up writes `custom:role`, not a group, so this is the path that
    actually fires in the deployed app."""
    from app.security import Caller

    assert Caller(subject="c1", role="clinician").is_clinician
    assert Caller(subject="c1", role="Doctor").is_clinician
    assert Caller(subject="c1", role=" clinician ").is_clinician


def test_patient_is_not_a_clinician():
    from app.security import Caller

    assert not Caller(subject="p1").is_clinician
    assert not Caller(subject="p1", role="patient").is_clinician
    assert not Caller(subject="p1", groups=["Patients"]).is_clinician
    assert not Caller(subject="p1", groups=[], role=None).is_clinician


def test_clinician_may_assess_another_patient():
    from app.api.routes import _authorize_patient
    from app.config import Settings
    from app.security import Caller

    settings = Settings(cognito_user_pool_id="us-east-1_test")
    # Does not raise.
    _authorize_patient(Caller(subject="clin-1", role="clinician"), "patient-9", settings)


def test_patient_may_not_assess_someone_else():
    import pytest
    from fastapi import HTTPException

    from app.api.routes import _authorize_patient
    from app.config import Settings
    from app.security import Caller

    settings = Settings(cognito_user_pool_id="us-east-1_test")
    with pytest.raises(HTTPException) as exc:
        _authorize_patient(Caller(subject="p1", role="patient"), "patient-9", settings)
    assert exc.value.status_code == 403

    # ...but may assess themselves.
    _authorize_patient(Caller(subject="p1", role="patient"), "p1", settings)
