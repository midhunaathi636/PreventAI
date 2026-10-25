"""
Agent 1 — Risk.

Input:  PatientSnapshot
Output: RiskAssessment (four track scores, one headline score, ranked factors,
        a confidence figure and a plain-language explanation)

The scoring itself is table-driven: see ``app.knowledge.risk_rules``. This
module owns the engine, the roll-up, confidence and the narrative.
"""

from __future__ import annotations

from app.agents.base import Agent
from app.knowledge.risk_rules import (
    BASELINES,
    OVERALL_WEIGHTS,
    active_rules,
    band_for,
)
from app.llm import prompts
from app.schemas import (
    AgentName,
    PatientSnapshot,
    RiskAssessment,
    RiskFactor,
)

#: Fields whose absence makes the assessment less certain. The snapshot always
#: supplies a population default, so "missing" means "defaulted".
_CONFIDENCE_FIELDS: dict[str, float] = {
    "systolic_bp": 128.0,
    "total_cholesterol": 205.0,
    "hdl": 48.0,
    "fasting_glucose": 98.0,
    "bmi": 26.0,
}


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


class RiskAgent(Agent[PatientSnapshot, RiskAssessment]):
    name = AgentName.RISK
    description = "Scores cardiovascular, diabetes, cancer and stroke risk from a patient snapshot."

    def _run(self, patient: PatientSnapshot) -> RiskAssessment:
        tracks = dict(BASELINES)
        factors: list[RiskFactor] = []

        for rule in active_rules(patient):
            for track, points in rule.points.items():
                tracks[track] = tracks.get(track, 0.0) + points
            factors.append(
                RiskFactor(
                    code=rule.code,
                    name=rule.name,
                    value=rule.describe(patient),
                    contribution=round(rule.total_points, 1),
                    targets=sorted(rule.points.keys()),
                    modifiable=rule.modifiable,
                    rationale=rule.rationale,
                )
            )

        tracks = {k: _clamp(v) for k, v in tracks.items()}
        overall = _clamp(sum(tracks[k] * w for k, w in OVERALL_WEIGHTS.items()))
        level = band_for(overall)

        factors.sort(key=lambda f: f.contribution, reverse=True)
        top = factors[:10]
        modifiable = [f.name for f in top if f.modifiable]

        assessment = RiskAssessment(
            patient_id=patient.patient_id,
            cvd_risk=round(tracks["cvd"], 1),
            diabetes_risk=round(tracks["diabetes"], 1),
            cancer_risk=round(tracks["cancer"], 1),
            stroke_risk=round(tracks["stroke"], 1),
            overall_risk=round(overall, 1),
            risk_level=level,
            factors=top,
            contributing_factors=[f.name for f in top],
            modifiable_factors=modifiable,
            confidence=self._confidence(patient),
        )
        assessment.explanation = self._explain(assessment)
        return assessment

    # --- helpers ------------------------------------------------------------ #

    @staticmethod
    def _confidence(patient: PatientSnapshot) -> float:
        """Drop confidence for each clinical value left at its default.

        A snapshot built from a profile with no labs still scores, but the
        caller deserves to know the score is standing on assumptions.
        """
        defaulted = sum(
            1
            for field, default in _CONFIDENCE_FIELDS.items()
            if abs(getattr(patient, field) - default) < 1e-9
        )
        return round(max(0.4, 1.0 - 0.1 * defaulted), 2)

    @staticmethod
    def _explain(a: RiskAssessment) -> str:
        drivers = [f.name for f in a.factors[:3]]
        driver_text = ", ".join(drivers) if drivers else "no individual factors flagged"
        modifiable = [f.name for f in a.factors[:5] if f.modifiable]
        tail = (
            f" Of those, {', '.join(modifiable[:3])} can be changed."
            if modifiable
            else " The factors driving this are not directly modifiable, so screening matters more here."
        )
        return (
            f"Overall preventive risk is {a.overall_risk:.0f}% ({a.risk_level.value.replace('_', ' ')}): "
            f"cardiovascular {a.cvd_risk:.0f}%, diabetes {a.diabetes_risk:.0f}%, "
            f"cancer {a.cancer_risk:.0f}%, stroke {a.stroke_risk:.0f}%. "
            f"The largest contributors are {driver_text}.{tail}"
        )

    # --- optional enrichment -------------------------------------------------- #

    def _enrich(self, patient: PatientSnapshot, result: RiskAssessment) -> tuple[RiskAssessment, bool]:
        payload = {
            "overall_risk": result.overall_risk,
            "risk_level": result.risk_level.value,
            "cvd_risk": result.cvd_risk,
            "diabetes_risk": result.diabetes_risk,
            "cancer_risk": result.cancer_risk,
            "stroke_risk": result.stroke_risk,
            "top_factors": [
                {"name": f.name, "value": f.value, "modifiable": f.modifiable}
                for f in result.factors[:5]
            ],
        }
        out = self.llm.complete_json(prompts.SYSTEM, prompts.risk_explanation(payload))
        text = (out or {}).get("explanation")
        if isinstance(text, str) and len(text.strip()) > 40:
            result.explanation = text.strip()
            return result, True
        return result, False

    def _summarize(self, result: RiskAssessment) -> str:
        return (
            f"Overall risk {result.overall_risk:.0f}% ({result.risk_level.value}), "
            f"{len(result.factors)} contributing factors, confidence {result.confidence:.0%}"
        )

    def _details(self, result: RiskAssessment) -> dict:
        return {
            "overall_risk": result.overall_risk,
            "risk_level": result.risk_level.value,
            "factor_codes": [f.code for f in result.factors],
            "confidence": result.confidence,
        }
