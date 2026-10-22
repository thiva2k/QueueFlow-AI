"""Postgres compatibility smoke test.

Runs ONLY when QUEUEFLOW_DATABASE_URL points at a Postgres database (set in the
`backend-postgres` CI job against a service container). Locally and in the
default CI job — where the suite uses SQLite — this module is skipped.

It proves the things most likely to differ between SQLite and Postgres:
the atomic token claim under concurrency, id-based token numbering, PII
redaction, and staff auth.
"""

import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Make the backend package importable regardless of which test files run in
# this session (CI runs this module in isolation, so we can't rely on another
# test having already extended sys.path).
_BACKEND_PATH = Path(__file__).resolve().parents[1]
if str(_BACKEND_PATH) not in sys.path:
    sys.path.insert(0, str(_BACKEND_PATH))

_PG = os.getenv("QUEUEFLOW_DATABASE_URL", "")
pytestmark = pytest.mark.skipif(
    not _PG.startswith(("postgres://", "postgresql://", "postgresql+")),
    reason="QUEUEFLOW_DATABASE_URL is not Postgres; skipping Postgres smoke test.",
)


@pytest.fixture
def client():
    backend_path = Path(__file__).resolve().parents[1]
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))

    import app.database as database
    import app.main as main

    # Fresh schema for an isolated run.
    os.environ["STAFF_API_KEY"] = "test-staff-key"
    database.Base.metadata.drop_all(bind=database.get_engine())
    database.init_db()
    with TestClient(main.app, headers={"X-API-Key": "test-staff-key"}) as c:
        yield c
    database.Base.metadata.drop_all(bind=database.get_engine())


def test_url_is_normalized_to_psycopg():
    import app.database as database

    assert database.get_database_url().startswith("postgresql+psycopg://")


def test_id_based_numbering_and_pii_redaction_on_postgres(client):
    assert client.post("/admin/demo/reset").status_code == 200
    service_id = client.get("/services").json()[0]["id"]
    created = client.post(
        "/tokens",
        json={"citizen_name": "Asha", "nic_or_phone": "991234567V", "service_id": service_id},
    )
    assert created.status_code == 201
    body = created.json()
    # Token number is derived from the row id (unique by construction), not a
    # count()+1 that could collide. On Postgres the id sequence keeps climbing
    # across the reset, so assert the invariant rather than a fixed value.
    assert body["token_number"] == f"A-{body['id']:03d}"
    numbers = [t["token_number"] for t in client.get("/tokens").json()]
    assert len(numbers) == len(set(numbers))  # all unique
    assert "nic_or_phone" not in body
    assert "citizen_name" not in body
    listed = client.get("/tokens").json()
    assert all("nic_or_phone" not in t and "citizen_name" not in t for t in listed)


def test_concurrent_call_next_is_unique_on_postgres(client):
    client.post("/admin/demo/seed")
    active = [c for c in client.get("/counters").json() if c["status"] == "active"]
    assert len(active) >= 2

    all_claimed = []
    for _ in range(15):
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(
                pool.map(
                    lambda cid: client.post(f"/admin/call-next/{cid}"),
                    [active[0]["id"], active[1]["id"]],
                )
            )
        claimed = [r.json()["id"] for r in results if r.status_code == 200]
        assert len(set(claimed)) == len(claimed)
        all_claimed.extend(claimed)
        current = client.get("/counters").json()
        for c in active:
            cur_id = next(x["current_token_id"] for x in current if x["id"] == c["id"])
            if cur_id:
                client.post(f"/admin/miss-token/{c['id']}/{cur_id}")

    assert len(set(all_claimed)) == len(all_claimed)


def test_staff_auth_enforced_on_postgres(client):
    client.post("/admin/demo/seed")
    os.environ["STAFF_API_KEY"] = "k"
    try:
        assert client.post("/admin/recalculate-predictions").status_code == 401
        assert (
            client.post("/admin/recalculate-predictions", headers={"X-API-Key": "k"}).status_code
            == 200
        )
        assert client.get("/queue/status").status_code == 200
    finally:
        os.environ.pop("STAFF_API_KEY", None)
