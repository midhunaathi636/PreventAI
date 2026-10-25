"""PreventAI agent service — FastAPI application entry point.

Runs under uvicorn locally and inside Lambda behind a Function URL
(`lambda_handler.py`). The only difference between the two is how the process
is started; the app itself is identical.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import VERSION, get_settings
from app.deps import get_pipeline

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
)
logger = logging.getLogger("preventai")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Warming the cache here is an optimisation, not a requirement — in Lambda
    # lifespan never runs and the first request builds the pipeline instead.
    settings = get_settings()
    pipeline = get_pipeline()
    logger.info(
        "PreventAI agents v%s ready | llm=%s | auth=%s",
        VERSION,
        pipeline.llm.provider or "disabled",
        "cognito" if settings.auth_enabled else "open (dev)",
    )
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="PreventAI Agent Service",
        version=VERSION,
        description=(
            "Four-agent preventive health pipeline: Risk → Plan Generation → "
            "Personalization → Safety. Deterministic clinical core with optional "
            "LLM enrichment."
        ),
        lifespan=lifespan,
    )

    # A wildcard origin cannot be combined with credentialed requests. The
    # service authenticates with a bearer token rather than cookies, so when
    # origins are wide open credentials are switched off instead.
    wildcard = "*" in settings.cors_origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=not wildcard,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )
    app.include_router(router, prefix="/v1")
    return app


app = create_app()
