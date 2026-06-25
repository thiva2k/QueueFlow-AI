"""Staff authentication for privileged queue-control endpoints.

Behaviour is intentionally environment-driven so the same build can run as a
frictionless demo or a locked-down deployment:

* ``STAFF_API_KEY`` **set**  -> every protected route requires a matching
  ``X-API-Key`` header (401 otherwise). Use this in production.
* ``STAFF_API_KEY`` **unset** -> "demo mode": routes stay open so judges can
  click through the dashboard, and a warning is logged at startup.

Citizen-facing read/booking endpoints are never gated; only counter/admin
mutations and configuration writes are.
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
    if expected is None:
        # Demo mode: no key configured, allow through.
        return
    if not x_api_key or not hmac.compare_digest(x_api_key, expected):
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
            "Staff authentication DISABLED — running in demo mode. "
            "Set STAFF_API_KEY to protect admin/counter endpoints in production."
        )
