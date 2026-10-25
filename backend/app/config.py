"""Runtime configuration, read once from the environment."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

VERSION = "4.0.0"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="PREVENTAI_",
        extra="ignore",
    )

    # --- service ---------------------------------------------------------- #
    environment: Literal["dev", "staging", "prod"] = "dev"
    cors_origins: list[str] = Field(
        default=["http://localhost:5173", "http://127.0.0.1:5173"],
        description=(
            'Frontend origins allowed to call the agent service. ["*"] opens it '
            "to any origin, which also disables credentialed CORS — safe here "
            "because the service authenticates with a bearer token, not cookies."
        ),
    )

    # --- LLM (optional; the pipeline is fully functional without it) ------- #
    llm_provider: Literal["anthropic", "openai", "none"] = "none"
    llm_model: str = "claude-sonnet-4-5"
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    llm_timeout_seconds: float = 20.0
    llm_max_tokens: int = 1200

    # --- auth (Cognito) --------------------------------------------------- #
    # Left blank in dev so the service runs without an AWS account. In prod,
    # set both and every request must carry a valid Cognito access token.
    cognito_user_pool_id: str | None = None
    cognito_region: str = "us-east-1"
    cognito_app_client_id: str | None = None

    #: Let the public landing page score a risk without signing in.
    #: `/v1/risk` is a pure function: it reads nothing, writes nothing and
    #: returns only what the caller sent, so there is no patient data to leak.
    #: Assessment, which persists a plan, is never anonymous.
    allow_anonymous_risk: bool = True

    @property
    def llm_key(self) -> str | None:
        if self.llm_provider == "anthropic":
            return self.anthropic_api_key
        if self.llm_provider == "openai":
            return self.openai_api_key
        return None

    @property
    def llm_enabled(self) -> bool:
        """LLM enrichment is on only when a provider *and* its key are present."""
        return self.llm_provider != "none" and bool(self.llm_key)

    @property
    def auth_enabled(self) -> bool:
        return bool(self.cognito_user_pool_id)


@lru_cache
def get_settings() -> Settings:
    return Settings()
