"""
Personalization rules: how a clinically sound action is made livable.

These never change what an action is *for*, only how it is carried out — the
modality, the schedule, the wording. Anything that would change the clinical
intent belongs in the safety ruleset instead.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

RULESET_VERSION = "2026.10"


@dataclass(frozen=True)
class PersonalizationRule:
    code: str
    #: What in the patient profile switches this rule on.
    subject: str
    match_on: Literal["constraint", "preference", "medication"]
    #: For preferences: the value that must match (``*`` matches any truthy value).
    expected: str = "*"
    #: Only touch actions carrying one of these tags (empty = any action).
    applies_to_tags: list[str] = field(default_factory=list)
    #: Optional replacement title.
    retitle: str | None = None
    #: Text appended to the action description.
    append: str = ""
    #: Replacement cadence.
    refrequency: str | None = None
    add_tags: list[str] = field(default_factory=list)
    note: str = ""


PERSONALIZATION_RULES: list[PersonalizationRule] = [
    PersonalizationRule(
        code="VEGETARIAN_DIET",
        subject="vegetarian",
        match_on="constraint",
        applies_to_tags=["diet"],
        retitle="Plant-forward Mediterranean pattern",
        append=(
            " Built around legumes, tofu and tempeh, nuts, olive oil and whole grains, "
            "with eggs and dairy if you eat them — no fish or meat required."
        ),
        add_tags=["vegetarian"],
        note="Diet reshaped around a vegetarian pattern",
    ),
    PersonalizationRule(
        code="VEGAN_DIET",
        subject="vegan",
        match_on="constraint",
        applies_to_tags=["diet"],
        retitle="Whole-food plant-based pattern",
        append=(
            " Entirely plant-based: legumes, soy, nuts, seeds, whole grains and olive oil. "
            "Add a B12 supplement and check iron at your next panel."
        ),
        add_tags=["vegan"],
        note="Diet reshaped around a vegan pattern",
    ),
    PersonalizationRule(
        code="HALAL_DIET",
        subject="halal",
        match_on="constraint",
        applies_to_tags=["diet"],
        append=" Choose halal-certified fish and poultry; the rest of the pattern is unchanged.",
        add_tags=["halal"],
        note="Diet adjusted for halal requirements",
    ),
    PersonalizationRule(
        code="SHIFT_WORK_ACTIVITY",
        subject="shift_work",
        match_on="constraint",
        applies_to_tags=["exercise"],
        refrequency="flexible — 3 to 5 sessions a week",
        append=(
            " Fit sessions around night shifts; three 10-minute bouts count the same as "
            "one 30-minute block."
        ),
        add_tags=["flexible-schedule"],
        note="Activity schedule loosened for shift work",
    ),
    PersonalizationRule(
        code="JOINT_FRIENDLY",
        subject="knee_injury",
        match_on="constraint",
        applies_to_tags=["exercise"],
        retitle="Low-impact activity plan (joint-friendly)",
        append=" Swimming, cycling and seated strength work replace walking and running here.",
        add_tags=["joint-safe"],
        note="Exercise modality switched to low-impact",
    ),
    PersonalizationRule(
        code="NO_GYM",
        subject="no_gym_access",
        match_on="constraint",
        applies_to_tags=["exercise"],
        append=" Everything here works at home or outdoors — no gym membership needed.",
        add_tags=["home-based"],
        note="Exercise kept to home and outdoor options",
    ),
    PersonalizationRule(
        code="BUDGET_CONSCIOUS",
        subject="low_budget",
        match_on="constraint",
        applies_to_tags=["diet"],
        append=(
            " Frozen vegetables, dried legumes and tinned fish keep this affordable; "
            "they are nutritionally equivalent to the fresh versions."
        ),
        add_tags=["low-cost"],
        note="Diet costed down to budget-friendly staples",
    ),
    PersonalizationRule(
        code="DIGITAL_COACHING",
        subject="coaching",
        match_on="preference",
        expected="digital",
        applies_to_tags=[],
        append=" Reminders and weekly check-ins come through the app.",
        add_tags=["digital-coached"],
        note="Follow-up set to app-based check-ins",
    ),
    PersonalizationRule(
        code="IN_PERSON_COACHING",
        subject="coaching",
        match_on="preference",
        expected="in_person",
        applies_to_tags=[],
        append=" Reviewed face to face at your scheduled clinic visits.",
        note="Follow-up set to in-person reviews",
    ),
    PersonalizationRule(
        code="MINIMAL_INTENSITY",
        subject="intensity",
        match_on="preference",
        expected="gentle",
        applies_to_tags=["exercise", "diet"],
        append=" Introduced gradually — one change at a time, at a pace you set.",
        add_tags=["gradual"],
        note="Pace slowed to match a preference for gentle change",
    ),
    PersonalizationRule(
        code="MORNING_PERSON",
        subject="preferred_time",
        match_on="preference",
        expected="morning",
        applies_to_tags=["exercise"],
        append=" Scheduled in the morning, which is when you said you are most likely to follow through.",
        note="Activity scheduled for mornings",
    ),
    PersonalizationRule(
        code="EVENING_PERSON",
        subject="preferred_time",
        match_on="preference",
        expected="evening",
        applies_to_tags=["exercise"],
        append=" Scheduled in the evening to match the rest of your day.",
        note="Activity scheduled for evenings",
    ),
]


def rules_for(constraints: set[str], preferences: dict, medications: list[str]) -> list[PersonalizationRule]:
    meds = [m.lower() for m in medications]
    out: list[PersonalizationRule] = []
    for rule in PERSONALIZATION_RULES:
        if rule.match_on == "constraint":
            if rule.subject in constraints:
                out.append(rule)
        elif rule.match_on == "preference":
            raw = preferences.get(rule.subject)
            if raw is None:
                continue
            value = str(raw).strip().lower().replace(" ", "_").replace("-", "_")
            if rule.expected == "*" or value == rule.expected:
                out.append(rule)
        elif rule.match_on == "medication" and any(rule.subject in m for m in meds):
            out.append(rule)
    return out
