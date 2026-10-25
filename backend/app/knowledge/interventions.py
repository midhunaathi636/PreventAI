"""
The intervention catalogue the Plan Generation agent draws from.

Each entry is a candidate action with a trigger, an impact model and the risk
factor codes it answers. The agent's job is selection and ordering, not
authoring prose, which keeps clinical content reviewable in one file.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from app.schemas import ActionDomain, PatientSnapshot, RiskAssessment

CATALOGUE_VERSION = "2026.10"

# No plan should swamp the patient; impact is also capped so the pipeline never
# promises a reduction it cannot defend.
MAX_ACTIONS = 8
MAX_TOTAL_REDUCTION = 35.0


@dataclass(frozen=True)
class Intervention:
    code: str
    domain: ActionDomain
    title: str
    frequency: str
    evidence: str
    #: Fires when this action is worth proposing.
    triggers: Callable[[PatientSnapshot, RiskAssessment], bool]
    #: Patient-specific body text.
    describe: Callable[[PatientSnapshot, RiskAssessment], str]
    #: Estimated absolute reduction in overall risk, in points.
    impact: Callable[[PatientSnapshot, RiskAssessment], float]
    #: Ranking hint — higher wins when the plan is trimmed to MAX_ACTIONS.
    weight: int = 50
    tags: list[str] = field(default_factory=list)
    #: Risk factor codes this action is meant to answer.
    answers: list[str] = field(default_factory=list)
    targets: list[str] = field(default_factory=list)


def _pct(x: float) -> str:
    return f"{x:.0f}%"


INTERVENTIONS: list[Intervention] = [
    Intervention(
        code="SMOKING_CESSATION",
        domain=ActionDomain.BEHAVIORAL,
        title="Start a structured smoking cessation program",
        frequency="daily until quit date, then weekly",
        evidence="Cessation cuts excess cardiovascular risk substantially within 1-2 years.",
        triggers=lambda p, r: p.smoker,
        describe=lambda p, r: (
            "Set a quit date within 14 days and pair behavioural counselling with "
            "nicotine replacement or a prescription aid chosen with your clinician. "
            "Smoking is currently the largest single contributor to your risk profile."
        ),
        impact=lambda p, r: 12.0,
        weight=100,
        tags=["smoking", "cvd", "cancer"],
        answers=["SMOKER"],
        targets=["cvd", "cancer", "stroke"],
    ),
    Intervention(
        code="BP_MONITORING",
        domain=ActionDomain.SCREENING,
        title="Two-week home blood pressure log and clinician review",
        frequency="twice daily for 14 days",
        evidence="Home readings outperform clinic readings for diagnosis and titration.",
        triggers=lambda p, r: p.systolic_bp >= 130 or p.diastolic_bp >= 85,
        describe=lambda p, r: (
            f"Your last systolic reading was {p.systolic_bp:.0f} mmHg. Record morning and "
            "evening readings for two weeks, then review the log with your clinician to "
            "decide between lifestyle measures alone and starting medication."
        ),
        impact=lambda p, r: 9.0 if p.systolic_bp >= 140 else 5.0,
        weight=92,
        tags=["hypertension", "stroke", "bp"],
        answers=["SBP_130", "SBP_140", "SBP_160", "DBP_90"],
        targets=["cvd", "stroke"],
    ),
    Intervention(
        code="GLYCEMIC_ASSESSMENT",
        domain=ActionDomain.SCREENING,
        title="Confirm glycaemic status with HbA1c",
        frequency="once, then as your clinician orders",
        evidence="HbA1c reflects three-month control and is the standard confirmatory test.",
        triggers=lambda p, r: p.fasting_glucose >= 100 or p.diabetes,
        describe=lambda p, r: (
            f"Fasting glucose of {p.fasting_glucose:.0f} mg/dL needs confirmation. An HbA1c "
            "settles whether this is prediabetes or diabetes and sets the nutrition plan "
            "that follows."
        ),
        impact=lambda p, r: 8.0 if p.fasting_glucose >= 126 else 5.0,
        weight=90,
        tags=["diabetes", "metabolic", "labs"],
        answers=["GLUCOSE_100", "GLUCOSE_126", "DIABETES"],
        targets=["diabetes"],
    ),
    Intervention(
        code="ACTIVITY_150",
        domain=ActionDomain.LIFESTYLE,
        title="Build to 150 minutes of moderate activity each week",
        frequency="5 sessions per week",
        evidence="150 min/week is the guideline floor for cardiometabolic benefit.",
        triggers=lambda p, r: p.activity_minutes_week < 150,
        describe=lambda p, r: (
            f"You are at roughly {p.activity_minutes_week} minutes a week. Add brisk "
            "walking in 30-minute blocks, five days a week, increasing by about 10% "
            "weekly so it stays sustainable. A wearable makes the progress visible."
        ),
        impact=lambda p, r: 8.0 if r.cvd_risk >= 30 else 5.0,
        weight=88,
        tags=["exercise", "cvd", "metabolic"],
        answers=["ACTIVITY_LOW", "ACTIVITY_SUBOPTIMAL"],
        targets=["cvd", "diabetes", "cancer"],
    ),
    Intervention(
        code="LIPID_PANEL",
        domain=ActionDomain.SCREENING,
        title="Fasting lipid panel and statin eligibility discussion",
        frequency="once, then per clinician",
        evidence="Lipid management is the best-evidenced pharmacological lever for CVD.",
        triggers=lambda p, r: p.total_cholesterol >= 200 or p.ldl >= 130 or p.hdl < 40,
        describe=lambda p, r: (
            f"Current values: total {p.total_cholesterol:.0f}, LDL {p.ldl:.0f}, "
            f"HDL {p.hdl:.0f} mg/dL. Confirm with a fasting panel and review whether a "
            "statin is indicated given your overall risk."
        ),
        impact=lambda p, r: 6.0,
        weight=85,
        tags=["lipids", "cvd", "labs"],
        answers=["TC_200", "TC_240", "LDL_160", "HDL_LOW"],
        targets=["cvd", "stroke"],
    ),
    Intervention(
        code="MEDITERRANEAN_DIET",
        domain=ActionDomain.LIFESTYLE,
        title="Shift to a Mediterranean-style eating pattern",
        frequency="daily",
        evidence="The best-supported whole-diet pattern for cardiovascular prevention.",
        triggers=lambda p, r: p.diet_quality.value in {"poor", "fair"} or p.bmi >= 27,
        describe=lambda p, r: (
            "Centre meals on vegetables, whole grains, legumes, nuts, olive oil and fish; "
            "cut processed meat and sugary drinks. Change one meal at a time rather than "
            f"everything at once — you are starting from a BMI of {p.bmi:.1f}."
        ),
        impact=lambda p, r: 7.0 if p.bmi >= 30 else 4.0,
        weight=80,
        tags=["diet", "metabolic", "weight"],
        answers=["DIET_POOR", "DIET_FAIR", "BMI_27", "BMI_30"],
        targets=["cvd", "diabetes", "cancer"],
    ),
    Intervention(
        code="WEIGHT_TARGET",
        domain=ActionDomain.LIFESTYLE,
        title="Target a 5-7% body weight reduction",
        frequency="reviewed monthly",
        evidence="A 5-7% loss meaningfully lowers progression to type 2 diabetes.",
        triggers=lambda p, r: p.bmi >= 30 and p.fasting_glucose >= 100,
        describe=lambda p, r: (
            f"At BMI {p.bmi:.1f} with raised fasting glucose, a gradual 5-7% loss over "
            "six months is the highest-yield single change available to you. Aim for "
            "0.5 kg a week rather than a crash deficit."
        ),
        impact=lambda p, r: 7.0,
        weight=78,
        tags=["weight", "diabetes", "metabolic"],
        answers=["BMI_30", "GLUCOSE_100"],
        targets=["diabetes", "cvd"],
    ),
    Intervention(
        code="CANCER_SCREENING",
        domain=ActionDomain.SCREENING,
        title="Review age-appropriate cancer screening",
        frequency="per guidelines",
        evidence="Screening shifts detection earlier, where treatment works best.",
        triggers=lambda p, r: p.age >= 45 or p.family_history_cancer,
        describe=lambda p, r: (
            "Check that colorectal screening is current and review whether family history "
            "or smoking history makes you eligible for additional programmes."
        ),
        impact=lambda p, r: 5.0 if p.family_history_cancer else 4.0,
        weight=70,
        tags=["cancer", "screening"],
        answers=["AGE_45", "AGE_55", "AGE_65", "FHX_CANCER"],
        targets=["cancer"],
    ),
    Intervention(
        code="ALCOHOL_REDUCTION",
        domain=ActionDomain.BEHAVIORAL,
        title="Bring alcohol back within low-risk limits",
        frequency="weekly target",
        evidence="Risk rises continuously with intake; there is no protective threshold.",
        triggers=lambda p, r: p.alcohol_drinks_week >= 10,
        describe=lambda p, r: (
            f"You are at about {p.alcohol_drinks_week:.0f} drinks a week. Work toward "
            "no more than 7 (women) or 14 (men), with at least three alcohol-free days."
        ),
        impact=lambda p, r: 3.0,
        weight=60,
        tags=["alcohol", "cancer"],
        answers=["ALCOHOL_MODERATE", "ALCOHOL_HIGH"],
        targets=["cancer", "cvd"],
    ),
    Intervention(
        code="SLEEP_HYGIENE",
        domain=ActionDomain.LIFESTYLE,
        title="Protect 7-8 hours of sleep",
        frequency="nightly",
        evidence="Short sleep worsens blood pressure and glucose regulation.",
        triggers=lambda p, r: r.risk_level.value in {"high", "very_high"},
        describe=lambda p, r: (
            "Keep a consistent sleep and wake time, and keep screens out of the last hour. "
            "Short sleep undercuts blood pressure and glucose gains from everything else "
            "in this plan."
        ),
        impact=lambda p, r: 2.0,
        weight=40,
        tags=["sleep", "recovery"],
        answers=[],
        targets=["cvd", "diabetes"],
    ),
    Intervention(
        code="MEDICATION_ADHERENCE",
        domain=ActionDomain.MEDICATION_ADHERENCE,
        title="Weekly medication and plan check-in",
        frequency="weekly",
        evidence="Adherence is the most common reason a sound plan fails to work.",
        triggers=lambda p, r: True,
        describe=lambda p, r: (
            "Spend five minutes a week confirming prescribed therapies were taken as "
            "directed and logging the plan actions you completed. Report side effects "
            "promptly rather than stopping a medication on your own."
        ),
        impact=lambda p, r: 3.0,
        weight=30,
        tags=["adherence"],
        answers=[],
        targets=[],
    ),
]


def candidates(patient: PatientSnapshot, risk: RiskAssessment) -> list[Intervention]:
    """Triggered interventions, highest weight first."""
    fired = [i for i in INTERVENTIONS if i.triggers(patient, risk)]
    return sorted(fired, key=lambda i: i.weight, reverse=True)
