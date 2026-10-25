from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.agents.orchestrator import PreventionPipeline
from app.main import create_app
from app.schemas import DietQuality, PatientSnapshot, Sex


@pytest.fixture
def pipeline() -> PreventionPipeline:
    """Rules-only pipeline (no LLM), which is the deterministic contract."""
    return PreventionPipeline(llm=None)


@pytest.fixture
def client() -> TestClient:
    with TestClient(create_app()) as c:
        yield c


@pytest.fixture
def healthy() -> PatientSnapshot:
    return PatientSnapshot(
        patient_id="p-healthy",
        age=30,
        sex=Sex.FEMALE,
        systolic_bp=112,
        diastolic_bp=70,
        total_cholesterol=170,
        hdl=62,
        ldl=95,
        fasting_glucose=85,
        bmi=22.0,
        activity_minutes_week=220,
        diet_quality=DietQuality.EXCELLENT,
        alcohol_drinks_week=1,
    )


@pytest.fixture
def high_risk() -> PatientSnapshot:
    return PatientSnapshot(
        patient_id="p-highrisk",
        age=67,
        sex=Sex.MALE,
        systolic_bp=168,
        diastolic_bp=96,
        total_cholesterol=255,
        hdl=34,
        ldl=172,
        fasting_glucose=138,
        bmi=33.4,
        smoker=True,
        diabetes=True,
        family_history_cvd=True,
        family_history_cancer=True,
        activity_minutes_week=20,
        diet_quality=DietQuality.POOR,
        alcohol_drinks_week=18,
    )
