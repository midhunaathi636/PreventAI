"""
Wire contracts for the PreventAI agent service.

Every agent in the pipeline declares a typed input and a typed output. The
orchestrator only ever moves these objects between agents, which is what keeps
the agents swappable (rules today, LLM-first tomorrow) without the API or the
frontend noticing.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _now() -> datetime:
    return datetime.now(UTC)


# --------------------------------------------------------------------------- #
# Enumerations
# --------------------------------------------------------------------------- #


class RiskLevel(str, Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    VERY_HIGH = "very_high"


class ActionDomain(str, Enum):
    LIFESTYLE = "lifestyle"
    SCREENING = "screening"
    BEHAVIORAL = "behavioral"
    MEDICATION_ADHERENCE = "medication_adherence"


class Severity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AgentName(str, Enum):
    RISK = "risk"
    PLAN_GENERATION = "plan_generation"
    PERSONALIZATION = "personalization"
    SAFETY = "safety"


class AgentStatus(str, Enum):
    COMPLETED = "completed"
    DEGRADED = "degraded"  # ran, but a non-essential enrichment (LLM) failed
    NEEDS_REVIEW = "needs_review"  # ran, but output must not auto-activate
    FAILED = "failed"


class DietQuality(str, Enum):
    POOR = "poor"
    FAIR = "fair"
    GOOD = "good"
    EXCELLENT = "excellent"


class Sex(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


# --------------------------------------------------------------------------- #
# Input
# --------------------------------------------------------------------------- #


class PatientSnapshot(BaseModel):
    """Everything the pipeline is allowed to reason about, at one point in time.

    Deliberately flat and self-contained: an agent never reaches back into a
    database, so a run is fully reproducible from this object alone.
    """

    model_config = ConfigDict(extra="forbid")

    patient_id: str
    age: int = Field(default=45, ge=0, le=120)
    sex: Sex = Sex.OTHER

    # Vitals / labs
    systolic_bp: float = Field(default=128, ge=50, le=300)
    diastolic_bp: float = Field(default=82, ge=30, le=200)
    total_cholesterol: float = Field(default=205, ge=50, le=600)
    hdl: float = Field(default=48, ge=10, le=150)
    ldl: float = Field(default=125, ge=10, le=500)
    fasting_glucose: float = Field(default=98, ge=30, le=600)
    bmi: float = Field(default=26, ge=10, le=80)

    # History
    smoker: bool = False
    diabetes: bool = False
    family_history_cvd: bool = False
    family_history_cancer: bool = False

    # Behaviour
    activity_minutes_week: int = Field(default=90, ge=0, le=5000)
    diet_quality: DietQuality = DietQuality.FAIR
    alcohol_drinks_week: float = Field(default=3, ge=0, le=200)

    # Context used by the personalization + safety agents
    preferences: dict[str, Any] = Field(default_factory=dict)
    constraints: list[str] = Field(default_factory=list)
    current_medications: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)

    @field_validator("constraints", "current_medications", "allergies", mode="before")
    @classmethod
    def _coerce_list(cls, v: Any) -> list[str]:
        if v is None:
            return []
        if isinstance(v, str):
            return [v]
        return [str(x) for x in v if str(x).strip()]

    def normalized_constraints(self) -> set[str]:
        """`Knee Injury` and `knee_injury` are the same constraint."""
        return {c.strip().lower().replace(" ", "_").replace("-", "_") for c in self.constraints if c.strip()}


# --------------------------------------------------------------------------- #
# Agent 1 — Risk
# --------------------------------------------------------------------------- #


class RiskFactor(BaseModel):
    """One scored reason behind a risk number, kept so the score is explainable."""

    code: str
    name: str
    value: str
    contribution: float
    targets: list[str] = Field(default_factory=list)  # which risks it feeds
    modifiable: bool = True
    rationale: str = ""


class RiskAssessment(BaseModel):
    patient_id: str
    cvd_risk: float
    diabetes_risk: float
    cancer_risk: float
    stroke_risk: float
    overall_risk: float
    risk_level: RiskLevel
    factors: list[RiskFactor] = Field(default_factory=list)
    contributing_factors: list[str] = Field(default_factory=list)
    modifiable_factors: list[str] = Field(default_factory=list)
    confidence: float = Field(default=1.0, ge=0, le=1)
    explanation: str = ""
    assessed_at: datetime = Field(default_factory=_now)


# --------------------------------------------------------------------------- #
# Agent 2/3 — Plan
# --------------------------------------------------------------------------- #


class PlanAction(BaseModel):
    code: str
    domain: ActionDomain
    title: str
    description: str
    frequency: str
    expected_impact: float = Field(ge=0, le=100)
    sort_order: int = 0
    tags: list[str] = Field(default_factory=list)
    targets: list[str] = Field(default_factory=list)
    evidence: str = ""
    personalized: bool = False
    safety_adapted: bool = False
    adaptations: list[str] = Field(default_factory=list)


class PreventionPlan(BaseModel):
    patient_id: str
    title: str
    summary: str
    actions: list[PlanAction] = Field(default_factory=list)
    expected_risk_reduction: float = 0
    explanation: str = ""
    source_risk_level: RiskLevel | None = None
    personalization_notes: list[str] = Field(default_factory=list)
    safety_verified: bool = False
    safety_notes: str = ""
    requires_clinician_review: bool = True


# --------------------------------------------------------------------------- #
# Agent 4 — Safety
# --------------------------------------------------------------------------- #


class SafetyIssue(BaseModel):
    severity: Severity
    code: str
    message: str
    related_action: str | None = None
    resolution: Literal["blocked", "adapted", "flagged"] = "flagged"


class SafetyReport(BaseModel):
    patient_id: str
    passed: bool
    issues: list[SafetyIssue] = Field(default_factory=list)
    blocked_actions: list[str] = Field(default_factory=list)
    adapted_actions: list[str] = Field(default_factory=list)
    escalate_to_clinician: bool = False
    notes: str = "No issues found."

    @property
    def critical_count(self) -> int:
        return sum(1 for i in self.issues if i.severity is Severity.CRITICAL)


# --------------------------------------------------------------------------- #
# Pipeline
# --------------------------------------------------------------------------- #


class AgentTrace(BaseModel):
    """One row of the audit trail: what an agent did and how long it took."""

    agent: AgentName
    status: AgentStatus
    message: str
    duration_ms: float = 0
    llm_used: bool = False
    details: dict[str, Any] = Field(default_factory=dict)
    started_at: datetime = Field(default_factory=_now)


class PipelineResult(BaseModel):
    run_id: str
    patient_id: str
    risk: RiskAssessment
    plan: PreventionPlan
    safety: SafetyReport
    trace: list[AgentTrace] = Field(default_factory=list)
    llm_enabled: bool = False
    total_duration_ms: float = 0
    generated_at: datetime = Field(default_factory=_now)


# --------------------------------------------------------------------------- #
# HTTP envelopes
# --------------------------------------------------------------------------- #


class AssessmentRequest(BaseModel):
    """Body of `POST /v1/assessment`."""

    model_config = ConfigDict(extra="forbid")

    patient: PatientSnapshot
    use_llm: bool | None = Field(
        default=None,
        description="Override the server default. Ignored when no provider key is configured.",
    )


class RiskOnlyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    patient: PatientSnapshot


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    version: str
    llm_enabled: bool
    llm_provider: str | None = None
    agents: list[str]
