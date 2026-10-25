"""
Safety rules: contraindications, drug interactions and hard stops.

The Safety agent is a gate, not a suggestion engine, so its rules are kept
apart from everything else. Two kinds exist:

* ``BLOCKING`` — the action is removed from the plan and the run is escalated.
* ``ADAPTIVE`` — the action stays but is rewritten with a safety caveat.

Anything matched here is reported with the exact rule code so a clinician can
trace why the pipeline behaved as it did.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Literal

from app.schemas import Severity


@lru_cache(maxsize=512)
def _phrase_pattern(phrase: str) -> re.Pattern[str]:
    return re.compile(rf"\b{re.escape(phrase.lower())}\b")


def mentions(text: str, phrase: str) -> bool:
    """True when `phrase` appears in `text` as whole words.

    Substring matching is what makes naive safety screens dangerous in both
    directions: "fasting" matches "fasting lipid panel" (a false block that
    removes a needed test), and a two-letter allergy like "pa" matches almost
    everything. Word boundaries fix both.
    """
    if not phrase or not phrase.strip():
        return False
    return bool(_phrase_pattern(phrase.strip()).search(text.lower()))

RULESET_VERSION = "2026.10"


@dataclass(frozen=True)
class SafetyRule:
    code: str
    severity: Severity
    action: Literal["block", "adapt"]
    message: str
    #: Patient-side trigger: a normalized constraint, a medication substring or
    #: an allergy substring, depending on `match_on`.
    subject: str
    match_on: Literal["constraint", "medication", "allergy"]
    #: Phrases that trip the rule when they appear in the action text.
    #:
    #: Matched on **word boundaries**, never as bare substrings. A rule listing
    #: "fasting" as a substring would block "fasting lipid panel" and "fasting
    #: glucose" — removing exactly the labs the patient needs — so phrases must
    #: be specific enough to name the thing that is actually unsafe.
    conflicts: list[str] = field(default_factory=list)
    #: Replacement guidance prepended to an adapted action.
    guidance: str = ""


SAFETY_RULES: list[SafetyRule] = [
    # --- pregnancy -------------------------------------------------------- #
    SafetyRule(
        code="PREG_WEIGHT_LOSS",
        severity=Severity.CRITICAL,
        action="block",
        subject="pregnant",
        match_on="constraint",
        conflicts=["weight reduction", "body weight reduction", "calorie deficit", "weight loss"],
        message="Intentional weight loss is not appropriate during pregnancy.",
    ),
    SafetyRule(
        code="PREG_ALCOHOL",
        severity=Severity.WARNING,
        action="adapt",
        subject="pregnant",
        match_on="constraint",
        conflicts=["alcohol"],
        message="Alcohol guidance must be abstinence during pregnancy.",
        guidance="Abstain from alcohol entirely for the duration of the pregnancy.",
    ),
    SafetyRule(
        code="PREG_HIGH_INTENSITY",
        severity=Severity.WARNING,
        action="adapt",
        subject="pregnant",
        match_on="constraint",
        conflicts=["high-intensity", "vigorous", "hiit"],
        message="High-intensity training needs obstetric clearance in pregnancy.",
        guidance="Keep activity moderate and cleared by your obstetric clinician.",
    ),
    SafetyRule(
        code="PREG_CESSATION_PHARMA",
        severity=Severity.WARNING,
        action="adapt",
        subject="pregnant",
        match_on="constraint",
        conflicts=["nicotine replacement", "prescription aid"],
        message="Cessation pharmacotherapy in pregnancy requires obstetric sign-off.",
        guidance="Use behavioural cessation support; any medication must be approved by your obstetric clinician.",
    ),
    # --- musculoskeletal --------------------------------------------------- #
    SafetyRule(
        code="JOINT_IMPACT",
        severity=Severity.WARNING,
        action="adapt",
        subject="knee_injury",
        match_on="constraint",
        conflicts=["brisk walking", "running", "jump", "plyometric"],
        message="High-impact activity conflicts with a knee injury.",
        guidance="Use low-impact options such as swimming, cycling or seated strength work until cleared.",
    ),
    SafetyRule(
        code="MOBILITY_IMPACT",
        severity=Severity.WARNING,
        action="adapt",
        subject="mobility_limit",
        match_on="constraint",
        conflicts=["brisk walking", "running", "30-minute blocks"],
        message="Walking-based targets conflict with a stated mobility limit.",
        guidance="Substitute seated or supported exercise, and set the target in effort rather than distance.",
    ),
    # --- cardiac / renal ---------------------------------------------------- #
    SafetyRule(
        code="CARDIAC_UNSUPERVISED",
        severity=Severity.CRITICAL,
        action="block",
        subject="unstable_angina",
        match_on="constraint",
        conflicts=["brisk walking", "moderate activity", "exercise"],
        message="Unsupervised exercise is unsafe with unstable angina; needs cardiac rehab referral.",
    ),
    SafetyRule(
        code="CKD_PROTEIN",
        severity=Severity.WARNING,
        action="adapt",
        subject="chronic_kidney_disease",
        match_on="constraint",
        conflicts=["legumes", "protein"],
        message="Protein targets need adjusting in chronic kidney disease.",
        guidance="Protein and potassium intake must be set by a renal dietitian.",
    ),
    SafetyRule(
        code="EATING_DISORDER_WEIGHT",
        severity=Severity.CRITICAL,
        action="block",
        subject="eating_disorder_history",
        match_on="constraint",
        conflicts=["weight reduction", "calorie deficit", "weight loss", "0.5 kg a week"],
        message="Weight-targeted actions are withheld given a history of disordered eating; refer to specialist care.",
    ),
    # --- drug interactions -------------------------------------------------- #
    SafetyRule(
        code="WARFARIN_VITK",
        severity=Severity.WARNING,
        action="adapt",
        subject="warfarin",
        match_on="medication",
        conflicts=["vegetables", "leafy", "legumes"],
        message="Large swings in vitamin K intake destabilise warfarin control.",
        guidance="Keep green vegetable intake steady week to week rather than increasing it suddenly, and tell the clinician managing your INR.",
    ),
    SafetyRule(
        code="INSULIN_FASTING",
        severity=Severity.CRITICAL,
        action="block",
        subject="insulin",
        match_on="medication",
        # Deliberately NOT "fasting" — that word appears in "fasting glucose"
        # and "fasting lipid panel", which are tests, not fasting protocols.
        conflicts=[
            "intermittent fasting",
            "intermittent fast",
            "extended fast",
            "fasting window",
            "fasting protocol",
            "skip meals",
            "prolonged fast",
        ],
        message="Fasting protocols risk hypoglycaemia on insulin.",
    ),
    SafetyRule(
        code="METFORMIN_CONTRAST",
        severity=Severity.INFO,
        action="adapt",
        subject="metformin",
        match_on="medication",
        conflicts=["contrast", "imaging"],
        message="Metformin is usually held around iodinated contrast imaging.",
        guidance="Confirm with your clinician whether metformin should be paused around the scan.",
    ),
    SafetyRule(
        code="STATIN_GRAPEFRUIT",
        severity=Severity.INFO,
        action="adapt",
        subject="statin",
        match_on="medication",
        conflicts=["grapefruit"],
        message="Grapefruit raises blood levels of several statins.",
        guidance="Avoid grapefruit and grapefruit juice while on a statin.",
    ),
]


#: Checks that look at the plan as a whole rather than one action.
MAX_LIFESTYLE_ACTIONS_LOW_RISK = 4


def rules_for(
    constraints: set[str],
    medications: list[str],
    allergies: list[str],
) -> list[SafetyRule]:
    """Only the rules whose subject is actually present for this patient."""
    meds = [m.lower() for m in medications]
    allergens = [a.lower() for a in allergies]
    out: list[SafetyRule] = []
    for rule in SAFETY_RULES:
        if rule.match_on == "constraint" and rule.subject in constraints or rule.match_on == "medication" and any(rule.subject in m for m in meds) or rule.match_on == "allergy" and any(rule.subject in a for a in allergens):
            out.append(rule)
    return out
