"""Staff authentication for privileged queue-control endpoints.

``STAFF_API_KEY`` set: protected routes require a matching ``X-API-Key``
header. Unset: those routes reject every request (fail closed). Citizen
read/booking endpoints are never gated.
"""

import hmac
import logging
import os

from fastapi import Header, HTTPException, status

logger = logging.getLogger("queueflow.auth")


def get_staff_api_key() -> str | None:
    key = os.getenv("STAFF_API_KEY", "").strip()
    return key or None


def auth_enabled() -> bool:
    return get_staff_api_key() is not None


def require_staff(x_api_key: str | None = Header(default=None)) -> None:
    """FastAPI dependency that guards staff-only routes."""
    expected = get_staff_api_key()
    if not expected or not x_api_key or not hmac.compare_digest(x_api_key, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid staff API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )


def log_auth_mode() -> None:
    if auth_enabled():
        logger.info("Staff authentication ENABLED (STAFF_API_KEY is set).")
    else:
        logger.warning(
            "STAFF_API_KEY is unset — staff endpoints are locked. "
            "Set STAFF_API_KEY before using admin or counter controls."
        )
