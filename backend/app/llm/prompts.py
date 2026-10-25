"""Prompts for the optional enrichment layer.

Each prompt asks for *wording*, never for clinical decisions. The schema the
model is asked to return is deliberately narrow so a hallucinated extra field
is simply ignored rather than silently entering the plan.
"""

from __future__ import annotations

import json

SYSTEM = (
    "You are a clinical communication assistant inside a preventive-health pipeline. "
    "Deterministic rule engines have already made every clinical decision: the risk "
    "scores, the chosen actions, and the safety verdict are fixed and correct.\n\n"
    "Your only job is to rewrite the supporting prose so a patient understands it. "
    "You must never: change a number, add or remove an action, contradict a safety "
    "finding, name a specific drug or dose, or give a diagnosis.\n\n"
    "Write in plain, warm, second-person English at roughly an 8th-grade reading "
    "level. No bullet points, no headings, no markdown. Return JSON only."
)


def risk_explanation(risk: dict) -> str:
    return (
        "Rewrite this risk assessment as a short explanation for the patient.\n\n"
        f"{json.dumps(risk, indent=2, default=str)}\n\n"
        "Return exactly this JSON shape:\n"
        '{"explanation": "<2-4 sentences. State the overall level, name the two or '
        'three biggest drivers in plain words, and say which of them can be changed. '
        'Do not invent numbers that are not above.>"}'
    )


def plan_narrative(risk: dict, plan: dict) -> str:
    return (
        "Write the opening summary for this prevention plan.\n\n"
        f"RISK:\n{json.dumps(risk, indent=2, default=str)}\n\n"
        f"PLAN:\n{json.dumps(plan, indent=2, default=str)}\n\n"
        "Return exactly this JSON shape:\n"
        '{"summary": "<2-3 sentences framing what this plan is going after and why '
        'these actions were chosen>", "explanation": "<2-3 sentences on how the actions '
        'connect to the risk drivers, and what to expect over the next three months>"}\n\n'
        "Do not list the actions; they are shown separately. Do not promise outcomes."
    )


def personalization_rationale(notes: list[str], plan: dict) -> str:
    return (
        "A plan was just adapted to a patient's stated constraints and preferences.\n\n"
        f"ADAPTATIONS MADE:\n{json.dumps(notes, indent=2)}\n\n"
        f"RESULTING PLAN:\n{json.dumps(plan, indent=2, default=str)}\n\n"
        "Return exactly this JSON shape:\n"
        '{"rationale": "<1-2 sentences telling the patient, in the second person, how '
        'their plan was shaped around what they told us. Only mention adaptations listed '
        'above.>"}'
    )


def safety_briefing(report: dict) -> str:
    return (
        "A safety screen has finished. Its verdict is final and must not be softened "
        "or overturned.\n\n"
        f"{json.dumps(report, indent=2, default=str)}\n\n"
        "Return exactly this JSON shape:\n"
        '{"notes": "<1-3 sentences stating plainly what was flagged and what happens '
        'next. If the screen did not pass, say clearly that a clinician must review the '
        'plan before it is followed. If nothing was flagged, say so in one sentence.>"}'
    )
