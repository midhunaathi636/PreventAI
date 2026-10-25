"""HTTP surface for the agent pipeline."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.agents.orchestrator import PreventionPipeline
from app.config import VERSION, Settings, get_settings
from app.deps import get_pipeline
from app.schemas import (
    AssessmentRequest,
    HealthResponse,
    PipelineResult,
    RiskAssessment,
    RiskOnlyRequest,
)
from app.security import Caller, current_caller

logger = logging.getLogger(__name__)
router = APIRouter()


def _authorize_patient(caller: Caller, patient_id: str, settings: Settings) -> None:
    """A patient may only assess themselves; a clinician may assess anyone."""
    if not settings.auth_enabled:
        return
    if caller.is_clinician or caller.subject == patient_id:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You can only run an assessment for your own record.",
    )


@router.get("/health", response_model=HealthResponse, tags=["meta"])
def health(
    pipeline: PreventionPipeline = Depends(get_pipeline),
) -> HealthResponse:
    return HealthResponse(
        version=VERSION,
        llm_enabled=pipeline.llm.enabled,
        llm_provider=pipeline.llm.provider,
        agents=[a.name.value for a in pipeline.agents],
    )


@router.get("/agents", tags=["meta"])
def list_agents(pipeline: PreventionPipeline = Depends(get_pipeline)) -> dict:
    """What the pipeline is made of — used by the frontend to render the trace."""
    return {
        "pipeline": [
            {"order": i, "name": a.name.value, "description": a.description}
            for i, a in enumerate(pipeline.agents, start=1)
        ],
        "llm_enabled": pipeline.llm.enabled,
    }


@router.post("/assessment", response_model=PipelineResult, tags=["agents"])
def run_assessment(
    body: AssessmentRequest,
    caller: Caller = Depends(current_caller),
    settings: Settings = Depends(get_settings),
    pipeline: PreventionPipeline = Depends(get_pipeline),
) -> PipelineResult:
    """Run all four agents and return the plan plus the full audit trace."""
    _authorize_patient(caller, body.patient.patient_id, settings)

    active = pipeline
    if body.use_llm is False and pipeline.llm.enabled:
        # Caller explicitly asked for the deterministic path.
        active = PreventionPipeline(llm=None)

    try:
        return active.run(body.patient)
    except Exception as exc:  # pragma: no cover - surfaced as 500 with a clean body
        logger.exception("assessment failed for patient=%s", body.patient.patient_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Assessment pipeline failed: {exc}",
        ) from exc


@router.post("/risk", response_model=RiskAssessment, tags=["agents"])
def run_risk(
    body: RiskOnlyRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
    pipeline: PreventionPipeline = Depends(get_pipeline),
) -> RiskAssessment:
    """Score risk alone. Fast enough to drive a live what-if control.

    Unlike `/assessment`, this endpoint touches no stored data: it scores the
    snapshot in the request body and returns the result. When
    `allow_anonymous_risk` is on, the public landing page can therefore run it
    without a session. With a bearer token present it is still authorised
    normally, so a signed-in patient cannot score someone else's record.
    """
    authorization = request.headers.get("authorization")
    if authorization or not settings.allow_anonymous_risk:
        caller = current_caller(authorization=authorization, settings=settings)
        _authorize_patient(caller, body.patient.patient_id, settings)

    return pipeline.run_risk_only(body.patient).output
