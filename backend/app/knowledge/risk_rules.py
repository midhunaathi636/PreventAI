"""
Risk scoring rules, expressed as data rather than control flow.

The original implementation buried every threshold inside an if/else chain, so
changing a cut-point meant editing logic and the weights could not be reviewed
by a clinician. Here each rule is a row: a predicate, the risks it feeds, the
points it adds, and the reason it exists. The engine is twenty lines and never
changes; the table is what gets reviewed, versioned and tested.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from app.schemas import PatientSnapshot, RiskLevel

RULESET_VERSION = "2026.10"

# The four risk tracks the engine scores, with their baseline points.
BASELINES: dict[str, float] = {
    "cvd": 8.0,
    "diabetes": 5.0,
    "cancer": 5.0,
    "stroke": 5.0,
}

# How the four tracks roll up into one headline number.
OVERALL_WEIGHTS: dict[str, float] = {
    "cvd": 0.40,
    "diabetes": 0.25,
    "stroke": 0.20,
    "cancer": 0.15,
}

# Overall score -> band. Ordered low to high; first match wins.
RISK_BANDS: list[tuple[float, RiskLevel]] = [
    (20.0, RiskLevel.LOW),
    (40.0, RiskLevel.MODERATE),
    (60.0, RiskLevel.HIGH),
    (float("inf"), RiskLevel.VERY_HIGH),
]


@dataclass(frozen=True)
class RiskRule:
    """A single scored observation.

    `points` maps a risk track to the points added when `applies` is true.
    `group` lets mutually exclusive bands (age <45 / <55 / <65) collapse to the
    single highest matching rule instead of stacking.
    """

    code: str
    name: str
    applies: Callable[[PatientSnapshot], bool]
    points: dict[str, float]
    describe: Callable[[PatientSnapshot], str]
    rationale: str
    modifiable: bool = True
    group: str | None = None
    priority: int = 0  # within a group, highest priority wins
    tags: list[str] = field(default_factory=list)

    @property
    def total_points(self) -> float:
        return sum(self.points.values())


def _s(value: object) -> str:
    """Render a number without a pointless trailing .0."""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


RISK_RULES: list[RiskRule] = [
    # --- age ------------------------------------------------------------- #
    RiskRule(
        code="AGE_65",
        name="Age 65 or over",
        applies=lambda p: p.age >= 65,
        points={"cvd": 18, "diabetes": 8, "cancer": 15, "stroke": 16},
        describe=lambda p: f"{p.age} years",
        rationale="Age is the strongest non-modifiable driver across all four tracks.",
        modifiable=False,
        group="age",
        priority=3,
        tags=["demographic"],
    ),
    RiskRule(
        code="AGE_55",
        name="Age 55-64",
        applies=lambda p: p.age >= 55,
        points={"cvd": 12, "diabetes": 8, "cancer": 10, "stroke": 10},
        describe=lambda p: f"{p.age} years",
        rationale="Incidence of cardiovascular events climbs steeply from the mid-50s.",
        modifiable=False,
        group="age",
        priority=2,
        tags=["demographic"],
    ),
    RiskRule(
        code="AGE_45",
        name="Age 45-54",
        applies=lambda p: p.age >= 45,
        points={"cvd": 6, "diabetes": 8},
        describe=lambda p: f"{p.age} years",
        rationale="45 is the usual entry point for routine metabolic and cancer screening.",
        modifiable=False,
        group="age",
        priority=1,
        tags=["demographic"],
    ),
    RiskRule(
        code="SEX_MALE",
        name="Male sex",
        applies=lambda p: p.sex.value == "male",
        points={"cvd": 4},
        describe=lambda p: "male",
        rationale="Male sex carries a modestly higher baseline cardiovascular risk.",
        modifiable=False,
        tags=["demographic"],
    ),
    # --- blood pressure ---------------------------------------------------- #
    RiskRule(
        code="SBP_160",
        name="Stage 2 hypertension (SBP 160+)",
        applies=lambda p: p.systolic_bp >= 160,
        points={"cvd": 14, "stroke": 16},
        describe=lambda p: f"{_s(p.systolic_bp)} mmHg systolic",
        rationale="Severely elevated systolic pressure is the dominant modifiable stroke risk.",
        group="bp",
        priority=3,
        tags=["hypertension"],
    ),
    RiskRule(
        code="SBP_140",
        name="Hypertension (SBP 140-159)",
        applies=lambda p: p.systolic_bp >= 140,
        points={"cvd": 9, "stroke": 12},
        describe=lambda p: f"{_s(p.systolic_bp)} mmHg systolic",
        rationale="Sustained readings at or above 140 warrant treatment review.",
        group="bp",
        priority=2,
        tags=["hypertension"],
    ),
    RiskRule(
        code="SBP_130",
        name="Elevated blood pressure (SBP 130-139)",
        applies=lambda p: p.systolic_bp >= 130,
        points={"cvd": 4, "stroke": 5},
        describe=lambda p: f"{_s(p.systolic_bp)} mmHg systolic",
        rationale="Early elevation responds well to lifestyle change alone.",
        group="bp",
        priority=1,
        tags=["hypertension"],
    ),
    RiskRule(
        code="DBP_90",
        name="Elevated diastolic pressure",
        applies=lambda p: p.diastolic_bp >= 90,
        points={"cvd": 3, "stroke": 4},
        describe=lambda p: f"{_s(p.diastolic_bp)} mmHg diastolic",
        rationale="Diastolic elevation adds risk independently of systolic readings.",
        tags=["hypertension"],
    ),
    # --- lipids ------------------------------------------------------------ #
    RiskRule(
        code="TC_240",
        name="High total cholesterol (240+)",
        applies=lambda p: p.total_cholesterol >= 240,
        points={"cvd": 10, "stroke": 5},
        describe=lambda p: f"{_s(p.total_cholesterol)} mg/dL",
        rationale="High total cholesterol accelerates atherosclerotic plaque formation.",
        group="cholesterol",
        priority=2,
        tags=["lipids"],
    ),
    RiskRule(
        code="TC_200",
        name="Borderline cholesterol (200-239)",
        applies=lambda p: p.total_cholesterol >= 200,
        points={"cvd": 5},
        describe=lambda p: f"{_s(p.total_cholesterol)} mg/dL",
        rationale="Borderline levels are worth tracking before they need medication.",
        group="cholesterol",
        priority=1,
        tags=["lipids"],
    ),
    RiskRule(
        code="LDL_160",
        name="High LDL cholesterol",
        applies=lambda p: p.ldl >= 160,
        points={"cvd": 7},
        describe=lambda p: f"{_s(p.ldl)} mg/dL LDL",
        rationale="LDL is the primary treatment target in lipid management.",
        tags=["lipids"],
    ),
    RiskRule(
        code="HDL_LOW",
        name="Low HDL cholesterol",
        applies=lambda p: p.hdl < 40,
        points={"cvd": 6},
        describe=lambda p: f"{_s(p.hdl)} mg/dL HDL",
        rationale="Low HDL removes a protective factor rather than adding a harmful one.",
        tags=["lipids"],
    ),
    # --- metabolic ---------------------------------------------------------- #
    RiskRule(
        code="DIABETES",
        name="Diagnosed diabetes",
        applies=lambda p: p.diabetes,
        points={"cvd": 12, "stroke": 10},
        describe=lambda p: "diagnosed",
        rationale="Diabetes roughly doubles cardiovascular and stroke risk.",
        tags=["metabolic"],
    ),
    RiskRule(
        code="GLUCOSE_126",
        name="Fasting glucose in diabetic range",
        applies=lambda p: p.fasting_glucose >= 126,
        points={"diabetes": 40, "cvd": 6},
        describe=lambda p: f"{_s(p.fasting_glucose)} mg/dL fasting",
        rationale="Two readings at or above 126 mg/dL meet the diagnostic threshold.",
        group="glucose",
        priority=2,
        tags=["metabolic"],
    ),
    RiskRule(
        code="GLUCOSE_100",
        name="Impaired fasting glucose",
        applies=lambda p: p.fasting_glucose >= 100,
        points={"diabetes": 18, "cvd": 3},
        describe=lambda p: f"{_s(p.fasting_glucose)} mg/dL fasting",
        rationale="Prediabetes is the highest-yield point to intervene.",
        group="glucose",
        priority=1,
        tags=["metabolic"],
    ),
    RiskRule(
        code="BMI_30",
        name="Obesity (BMI 30+)",
        applies=lambda p: p.bmi >= 30,
        points={"cvd": 6, "diabetes": 15, "cancer": 6},
        describe=lambda p: f"BMI {p.bmi:.1f}",
        rationale="Obesity drives insulin resistance and several cancer types.",
        group="bmi",
        priority=2,
        tags=["metabolic", "weight"],
    ),
    RiskRule(
        code="BMI_27",
        name="Overweight (BMI 27-29.9)",
        applies=lambda p: p.bmi >= 27,
        points={"cvd": 3, "diabetes": 8},
        describe=lambda p: f"BMI {p.bmi:.1f}",
        rationale="Modest excess weight is still a meaningful diabetes signal.",
        group="bmi",
        priority=1,
        tags=["metabolic", "weight"],
    ),
    # --- behaviour ----------------------------------------------------------- #
    RiskRule(
        code="SMOKER",
        name="Current smoker",
        applies=lambda p: p.smoker,
        points={"cvd": 15, "cancer": 20, "stroke": 10},
        describe=lambda p: "current smoker",
        rationale="Smoking is the single largest modifiable risk factor in this model.",
        tags=["smoking"],
    ),
    RiskRule(
        code="ACTIVITY_LOW",
        name="Below recommended activity",
        applies=lambda p: p.activity_minutes_week < 75,
        points={"diabetes": 10, "cancer": 5, "cvd": 4},
        describe=lambda p: f"{p.activity_minutes_week} min/week",
        rationale="Under 75 min/week sits well below the 150 min guideline floor.",
        group="activity",
        priority=2,
        tags=["exercise"],
    ),
    RiskRule(
        code="ACTIVITY_SUBOPTIMAL",
        name="Activity below guideline",
        applies=lambda p: p.activity_minutes_week < 150,
        points={"diabetes": 4, "cvd": 2},
        describe=lambda p: f"{p.activity_minutes_week} min/week",
        rationale="150 min/week of moderate activity is the standard target.",
        group="activity",
        priority=1,
        tags=["exercise"],
    ),
    RiskRule(
        code="ALCOHOL_HIGH",
        name="High alcohol intake",
        applies=lambda p: p.alcohol_drinks_week >= 14,
        points={"cancer": 10, "cvd": 3},
        describe=lambda p: f"{_s(p.alcohol_drinks_week)} drinks/week",
        rationale="Intake above 14 drinks/week raises several cancer risks.",
        group="alcohol",
        priority=2,
        tags=["alcohol"],
    ),
    RiskRule(
        code="ALCOHOL_MODERATE",
        name="Alcohol above low-risk limits",
        applies=lambda p: p.alcohol_drinks_week >= 10,
        points={"cancer": 4},
        describe=lambda p: f"{_s(p.alcohol_drinks_week)} drinks/week",
        rationale="Approaching the upper low-risk limit.",
        group="alcohol",
        priority=1,
        tags=["alcohol"],
    ),
    RiskRule(
        code="DIET_POOR",
        name="Poor diet quality",
        applies=lambda p: p.diet_quality.value == "poor",
        points={"cvd": 5, "diabetes": 6, "cancer": 4},
        describe=lambda p: "self-reported poor",
        rationale="Diet quality sits upstream of weight, lipids and glucose together.",
        group="diet",
        priority=2,
        tags=["diet"],
    ),
    RiskRule(
        code="DIET_FAIR",
        name="Fair diet quality",
        applies=lambda p: p.diet_quality.value == "fair",
        points={"cvd": 2, "diabetes": 3},
        describe=lambda p: "self-reported fair",
        rationale="Room to improve without a drastic change.",
        group="diet",
        priority=1,
        tags=["diet"],
    ),
    # --- family history --------------------------------------------------- #
    RiskRule(
        code="FHX_CVD",
        name="Family history of cardiovascular disease",
        applies=lambda p: p.family_history_cvd,
        points={"cvd": 8, "stroke": 4},
        describe=lambda p: "positive",
        rationale="Premature CVD in a first-degree relative raises baseline risk.",
        modifiable=False,
        tags=["genetic"],
    ),
    RiskRule(
        code="FHX_CANCER",
        name="Family history of cancer",
        applies=lambda p: p.family_history_cancer,
        points={"cancer": 12},
        describe=lambda p: "positive",
        rationale="Family history changes which screening starts, and when.",
        modifiable=False,
        tags=["genetic"],
    ),
]


def active_rules(patient: PatientSnapshot) -> list[RiskRule]:
    """Rules that fire for this patient, with grouped bands collapsed to one."""
    fired = [r for r in RISK_RULES if r.applies(patient)]

    best_in_group: dict[str, RiskRule] = {}
    ungrouped: list[RiskRule] = []
    for rule in fired:
        if rule.group is None:
            ungrouped.append(rule)
            continue
        current = best_in_group.get(rule.group)
        if current is None or rule.priority > current.priority:
            best_in_group[rule.group] = rule

    return ungrouped + list(best_in_group.values())


def band_for(overall: float) -> RiskLevel:
    for ceiling, level in RISK_BANDS:
        if overall < ceiling:
            return level
    return RiskLevel.VERY_HIGH
