"""
Shared singletons.

The pipeline is built lazily and cached for the life of the process. Under
uvicorn that happens once at startup; in Lambda it happens on the first
request of a cold start and is then reused for every warm invocation, which is
why it cannot live on ASGI lifespan state.
"""

from __future__ import annotations

from functools import lru_cache

from app.agents.orchestrator import PreventionPipeline
from app.config import get_settings
from app.llm.client import LLMClient


@lru_cache(maxsize=1)
def get_pipeline() -> PreventionPipeline:
    """The process-wide pipeline. Built once, reused thereafter."""
    return PreventionPipeline(llm=LLMClient(get_settings()))
