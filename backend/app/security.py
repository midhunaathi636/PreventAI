"""
Cognito access-token verification.

Auth is opt-in so the service runs locally with no AWS account: leave
``PREVENTAI_COGNITO_USER_POOL_ID`` unset and every request is treated as an
anonymous dev caller. Set it and each request must present a valid RS256 token
signed by that pool's JWKS.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

_JWKS_TTL_SECONDS = 3600


@dataclass
class Caller:
    """Who is making the request."""

    subject: str
    email: str | None = None
    groups: list[str] | None = None
    #: The `custom:role` attribute, when the token carries one.
    role: str | None = None
    authenticated: bool = True

    #: Values that grant cross-patient access, whether they arrive as a
    #: Cognito group or as the `custom:role` attribute. Matched
    #: case-insensitively and in singular or plural, because the pool defines
    #: groups as "Clinicians" while the role attribute says "clinician".
    CLINICIAN_VALUES = {"clinician", "clinicians", "doctor", "doctors"}

    @staticmethod
    def _normalise(value: str | None) -> str:
        return (value or "").strip().lower()

    @property
    def is_clinician(self) -> bool:
        """True when this caller may act on another patient's record.

        Two sources, because the app has both. Cognito *groups* are the
        authoritative signal — a user cannot put themselves in one — but
        nothing currently assigns them: sign-up writes the role to the
        `custom:role` attribute instead. So the attribute is accepted as a
        fallback, which is what makes a clinician's assessment work today.

        Note that `custom:role` is a mutable user attribute, so it is a
        weaker claim than a group. See the note in DEPLOY.md on assigning
        groups at sign-up, which makes this authoritative.
        """
        if any(self._normalise(g) in self.CLINICIAN_VALUES for g in self.groups or []):
            return True
        return self._normalise(self.role) in self.CLINICIAN_VALUES


class _JWKSCache:
    def __init__(self) -> None:
        self._keys: dict[str, Any] | None = None
        self._fetched_at: float = 0.0

    def get(self, settings: Settings) -> dict[str, Any]:
        now = time.time()
        if self._keys is not None and now - self._fetched_at < _JWKS_TTL_SECONDS:
            return self._keys
        url = (
            f"https://cognito-idp.{settings.cognito_region}.amazonaws.com/"
            f"{settings.cognito_user_pool_id}/.well-known/jwks.json"
        )
        resp = httpx.get(url, timeout=10.0)
        resp.raise_for_status()
        self._keys = resp.json()
        self._fetched_at = now
        return self._keys


_jwks = _JWKSCache()


def _verify(token: str, settings: Settings) -> Caller:
    try:
        from jose import jwt  # noqa: PLC0415 - only needed when auth is on
        from jose.utils import base64url_decode  # noqa: F401, PLC0415
    except ImportError as exc:  # pragma: no cover
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="python-jose is required when Cognito auth is enabled.",
        ) from exc

    try:
        jwks = _jwks.get(settings)
        header = jwt.get_unverified_header(token)
        key = next((k for k in jwks["keys"] if k["kid"] == header.get("kid")), None)
        if key is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown signing key."
            )
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=(
                f"https://cognito-idp.{settings.cognito_region}.amazonaws.com/"
                f"{settings.cognito_user_pool_id}"
            ),
            options={"verify_aud": False},
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.info("token rejected: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token."
        ) from exc

    # An access token names its client in `client_id`; an ID token puts the
    # same value in `aud`. Both are accepted, because the frontend sends the
    # ID token (the only one carrying `custom:role`).
    if settings.cognito_app_client_id:
        audience = claims.get("client_id") or claims.get("aud")
        if audience != settings.cognito_app_client_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Token audience mismatch."
            )

    return Caller(
        subject=claims.get("sub", ""),
        email=claims.get("email"),
        groups=claims.get("cognito:groups") or [],
        role=claims.get("custom:role"),
    )


def current_caller(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> Caller:
    """FastAPI dependency: the authenticated caller, or an anonymous dev caller."""
    if not settings.auth_enabled:
        return Caller(subject="dev-user", email=None, groups=[], authenticated=False)

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _verify(authorization.split(" ", 1)[1].strip(), settings)
