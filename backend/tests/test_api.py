import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient


def parse_iso(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def make_client(tmp_path):
    db_path = tmp_path / "queueflow_test.db"
    os.environ["QUEUEFLOW_DATABASE_URL"] = f"sqlite:///{db_path}"

    backend_path = Path(__file__).resolve().parents[1]
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))

    import app.database as database
    import app.main as main

    database.init_db()
    return TestClient(main.app)


def seed_demo(client):
    response = client.post("/admin/demo/seed")
    assert response.status_code == 200
    return response.json()


def reset_demo(client):
    response = client.post("/admin/demo/reset")
    assert response.status_code == 200
    return response.json()


def test_health_and_seeded_demo_data(tmp_path):
    client = make_client(tmp_path)

    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/docs").status_code == 200
    seeded = seed_demo(client)

    assert seeded == {"services": 3, "counters": 4, "tokens": 20}
    assert len(client.get("/services").json()) == 3
    assert len(client.get("/counters").json()) == 4
    assert len(client.get("/tokens").json()) == 20
    status = client.get("/queue/status").json()
    assert status["active_counters"] == 3
    assert status["estimated_wait_for_last_token"] is not None


def test_demo_reset_creates_realistic_counter_state(tmp_path):
    client = make_client(tmp_path)
    reset = reset_demo(client)

    assert reset == {"services": 3, "counters": 4, "tokens": 20}

    counters = client.get("/counters").json()
    assert [counter["status"] for counter in counters] == ["active", "active", "active", "active"]
    assert counters[0]["current_token_id"] is not None
    assert counters[1]["current_token_id"] is not None
    assert counters[2]["current_token_id"] is None

    queue = client.get("/queue/status").json()
    assert len(queue["now_serving"]) == 2
    assert len(queue["called"]) == 0
    assert len(queue["waiting"]) == 18

    now = datetime.now(timezone.utc)
    elapsed_minutes = [
        (now - parse_iso(token["started_at"])).total_seconds() / 60
        for token in queue["now_serving"]
    ]
    assert all(1 <= elapsed <= 7 for elapsed in elapsed_minutes)

    called = client.post(f"/admin/call-next/{counters[2]['id']}").json()
    assert called["status"] == "called"
    assert called["token_number"] == "A-003"


def test_api_serializes_datetimes_as_explicit_utc(tmp_path):
    client = make_client(tmp_path)
    reset_demo(client)

    token = client.get("/tokens/by-number/A-001").json()
    assert token["created_at"].endswith("Z")
    assert token["called_at"].endswith("Z")
    assert token["started_at"].endswith("Z")
    assert token["estimated_service_time"].endswith("Z")
    assert token["recommended_arrival_time"].endswith("Z")

    service = client.get("/services").json()[0]
    counter = client.get("/counters").json()[0]
    assert service["created_at"].endswith("Z")
    assert counter["created_at"].endswith("Z")


def test_vite_frontend_origin_is_allowed(tmp_path):
    client = make_client(tmp_path)

    response = client.options(
        "/health",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"


def test_create_token_returns_prediction_fields(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    service_id = client.get("/services").json()[0]["id"]

    response = client.post(
        "/tokens",
        json={
            "citizen_name": "Asha Perera",
            "nic_or_phone": "0771234567",
            "service_id": service_id,
        },
    )

    assert response.status_code == 201
    token = response.json()
    assert token["token_number"] == "A-021"
    assert token["status"] == "waiting"
    assert token["people_ahead"] == 20
    assert token["estimated_service_time"] is not None
    assert token["recommended_arrival_time"] is not None


def test_admin_queue_actions_and_counter_pause_recalculate_predictions(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    counters = client.get("/counters").json()
    counter = counters[0]
    idle_counter = counters[1]

    called = client.post(f"/admin/call-next/{counter['id']}").json()
    assert called["status"] == "called"

    started = client.post(f"/admin/start-token/{counter['id']}/{called['id']}").json()
    assert started["status"] == "serving"

    before = client.get("/tokens/by-number/A-020").json()["estimated_service_time"]
    pause_response = client.patch(f"/counters/{idle_counter['id']}/pause")
    assert pause_response.status_code == 200
    after = client.get("/tokens/by-number/A-020").json()["estimated_service_time"]

    assert before != after

    completed = client.post(f"/admin/complete-token/{counter['id']}/{called['id']}").json()
    assert completed["status"] == "completed"
    assert completed["actual_duration_minutes"] is not None


def test_pause_counter_rejects_open_token(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    counter = client.get("/counters").json()[0]

    called = client.post(f"/admin/call-next/{counter['id']}").json()
    called_pause = client.patch(f"/counters/{counter['id']}/pause")
    assert called_pause.status_code == 400
    assert "Clear the current token" in called_pause.json()["detail"]

    client.post(f"/admin/start-token/{counter['id']}/{called['id']}")
    serving_pause = client.patch(f"/counters/{counter['id']}/pause")
    assert serving_pause.status_code == 400
    assert "Clear the current token" in serving_pause.json()["detail"]


def test_call_next_with_empty_queue_returns_clear_error(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    counter = client.get("/counters").json()[0]
    tokens = client.get("/tokens").json()

    for token in tokens:
        token_id = token["id"]
        db_token = client.get(f"/tokens/{token_id}").json()
        if db_token["status"] == "waiting":
            client.post(f"/admin/miss-token/{counter['id']}/{token_id}")

    response = client.post(f"/admin/call-next/{counter['id']}")
    assert response.status_code == 404
    assert response.json()["detail"] == "No waiting tokens"


def test_delayed_serving_token_pushes_future_predictions_later(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    counter = client.get("/counters").json()[0]
    called = client.post(f"/admin/call-next/{counter['id']}").json()
    client.post(f"/admin/start-token/{counter['id']}/{called['id']}")

    waiting_token_id = client.get("/tokens/by-number/A-020").json()["id"]
    before = client.get(f"/tokens/{waiting_token_id}/prediction").json()

    response = client.post(f"/admin/demo/simulate-delay/{called['id']}")
    assert response.status_code == 200

    after = client.get(f"/tokens/{waiting_token_id}/prediction").json()
    assert after["estimated_service_time"] > before["estimated_service_time"]


def test_simulate_delay_accepts_extra_minutes(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    counter = client.get("/counters").json()[0]
    called = client.post(f"/admin/call-next/{counter['id']}").json()
    client.post(f"/admin/start-token/{counter['id']}/{called['id']}")

    waiting_token_id = client.get("/tokens/by-number/A-020").json()["id"]
    before = client.get(f"/tokens/{waiting_token_id}/prediction").json()

    five_minute_delay = client.post(f"/admin/demo/simulate-delay/{called['id']}?extra_minutes=5")
    assert five_minute_delay.status_code == 200
    after_five = client.get(f"/tokens/{waiting_token_id}/prediction").json()

    ten_minute_delay = client.post(f"/admin/demo/simulate-delay/{called['id']}?extra_minutes=10")
    assert ten_minute_delay.status_code == 200
    after_ten = client.get(f"/tokens/{waiting_token_id}/prediction").json()

    assert after_five["estimated_service_time"] > before["estimated_service_time"]
    delay_gap = parse_iso(after_ten["estimated_service_time"]) - parse_iso(after_five["estimated_service_time"])
    assert delay_gap.total_seconds() >= 4 * 60


def test_simulate_delay_rejects_non_serving_and_invalid_minutes(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    counter = client.get("/counters").json()[0]
    called = client.post(f"/admin/call-next/{counter['id']}").json()

    non_serving_delay = client.post(f"/admin/demo/simulate-delay/{called['id']}?extra_minutes=10")
    assert non_serving_delay.status_code == 400
    assert "Only serving tokens" in non_serving_delay.json()["detail"]

    client.post(f"/admin/start-token/{counter['id']}/{called['id']}")

    too_low = client.post(f"/admin/demo/simulate-delay/{called['id']}?extra_minutes=0")
    too_high = client.post(f"/admin/demo/simulate-delay/{called['id']}?extra_minutes=121")

    assert too_low.status_code == 422
    assert too_high.status_code == 422


def test_admin_rejects_busy_counter_and_wrong_counter_completion(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    counters = client.get("/counters").json()

    called = client.post(f"/admin/call-next/{counters[0]['id']}").json()

    busy_start = client.post(f"/admin/start-token/{counters[0]['id']}/2")
    assert busy_start.status_code == 400
    assert "open token" in busy_start.json()["detail"]

    started = client.post(f"/admin/start-token/{counters[0]['id']}/{called['id']}").json()
    assert started["status"] == "serving"

    wrong_counter_complete = client.post(f"/admin/complete-token/{counters[1]['id']}/{called['id']}")
    assert wrong_counter_complete.status_code == 400
    assert "not assigned" in wrong_counter_complete.json()["detail"]


def test_miss_token_updates_queue_status_and_rejects_wrong_counter(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    counters = client.get("/counters").json()

    called = client.post(f"/admin/call-next/{counters[0]['id']}").json()

    wrong_counter_miss = client.post(f"/admin/miss-token/{counters[1]['id']}/{called['id']}")
    assert wrong_counter_miss.status_code == 400
    assert "not assigned" in wrong_counter_miss.json()["detail"]

    missed = client.post(f"/admin/miss-token/{counters[0]['id']}/{called['id']}").json()
    assert missed["status"] == "missed"

    status = client.get("/queue/status").json()
    assert status["missed_count"] == 1
    assert all(token["id"] != called["id"] for token in status["called"])


def test_closed_tokens_do_not_return_live_predictions(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    counter = client.get("/counters").json()[0]
    called = client.post(f"/admin/call-next/{counter['id']}").json()
    client.post(f"/admin/miss-token/{counter['id']}/{called['id']}")

    response = client.get(f"/tokens/{called['id']}/prediction")

    assert response.status_code == 400
    assert "closed token" in response.json()["detail"]


def test_serving_tokens_report_zero_people_ahead(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    counters = client.get("/counters").json()

    first = client.post(f"/admin/call-next/{counters[0]['id']}").json()
    second = client.post(f"/admin/call-next/{counters[1]['id']}").json()
    client.post(f"/admin/start-token/{counters[0]['id']}/{first['id']}")
    client.post(f"/admin/start-token/{counters[1]['id']}/{second['id']}")

    first_read = client.get(f"/tokens/{first['id']}").json()
    second_read = client.get(f"/tokens/{second['id']}").json()

    assert first_read["people_ahead"] == 0
    assert second_read["people_ahead"] == 0


def test_counter_resume_recalculates_predictions(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    counter = client.get("/counters").json()[0]

    client.patch(f"/counters/{counter['id']}/pause")
    paused_estimate = client.get("/tokens/by-number/A-020").json()["estimated_service_time"]

    resume_response = client.patch(f"/counters/{counter['id']}/resume")
    resumed_estimate = client.get("/tokens/by-number/A-020").json()["estimated_service_time"]

    assert resume_response.status_code == 200
    assert resumed_estimate != paused_estimate


# --- Concurrency -----------------------------------------------------------

def test_concurrent_call_next_never_assigns_same_token_twice(tmp_path):
    """Two counters calling next at the same instant must get distinct tokens.

    This is the headline race for a queue system: without atomic claiming the
    same citizen could be sent to two windows. We run several contended rounds.
    """
    client = make_client(tmp_path)
    seed_demo(client)
    counters = client.get("/counters").json()
    active = [c for c in counters if c["status"] == "active"]
    assert len(active) >= 2

    all_claimed = []
    for _ in range(10):
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(
                pool.map(
                    lambda cid: client.post(f"/admin/call-next/{cid}"),
                    [active[0]["id"], active[1]["id"]],
                )
            )
        claimed = [r.json()["id"] for r in results if r.status_code == 200]
        # The two counters in this round must never share a token id.
        assert len(set(claimed)) == len(claimed)
        all_claimed.extend(claimed)
        # Free both counters for the next round.
        for c in active:
            current = client.get(f"/counters").json()
            cur_id = next(x["current_token_id"] for x in current if x["id"] == c["id"])
            if cur_id:
                client.post(f"/admin/miss-token/{c['id']}/{cur_id}")

    # Across all rounds, every claimed token id is unique — nobody served twice.
    assert len(set(all_claimed)) == len(all_claimed)


# --- State machine ---------------------------------------------------------

def test_start_token_requires_called_state(tmp_path):
    """A raw waiting token cannot jump straight to serving (must be called first)."""
    client = make_client(tmp_path)
    seed_demo(client)
    counter = client.get("/counters").json()[0]
    waiting = next(t for t in client.get("/tokens").json() if t["status"] == "waiting")

    response = client.post(f"/admin/start-token/{counter['id']}/{waiting['id']}")
    assert response.status_code == 400
    assert "called" in response.json()["detail"]


def test_start_token_rejected_on_paused_counter(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    counter = client.get("/counters").json()[0]
    called = client.post(f"/admin/call-next/{counter['id']}").json()
    # Counter cannot be paused while holding an open token, so miss it first,
    # then pause, then a fresh call/start attempt must be blocked.
    client.post(f"/admin/miss-token/{counter['id']}/{called['id']}")
    client.patch(f"/counters/{counter['id']}/pause")

    response = client.post(f"/admin/call-next/{counter['id']}")
    assert response.status_code == 400
    assert "paused" in response.json()["detail"]


# --- Not-found / validation branches --------------------------------------

def test_admin_actions_return_404_for_unknown_ids(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)

    assert client.post("/admin/call-next/999999").status_code == 404
    assert client.post("/admin/start-token/999999/1").status_code == 404
    assert client.post("/admin/complete-token/1/999999").status_code == 404
    assert client.post("/admin/miss-token/1/999999").status_code == 404


def test_create_token_with_unknown_service_returns_404(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)

    response = client.post(
        "/tokens",
        json={"citizen_name": "Nimal", "nic_or_phone": "0770000000", "service_id": 999999},
    )
    assert response.status_code == 404
    assert "Service not found" in response.json()["detail"]


def test_duplicate_service_and_counter_names_return_400(tmp_path):
    client = make_client(tmp_path)
    client.post("/services", json={"name": "Passports", "default_duration_minutes": 5})
    dup_service = client.post("/services", json={"name": "Passports", "default_duration_minutes": 5})
    assert dup_service.status_code == 400

    client.post("/counters", json={"name": "Window 9", "status": "active"})
    dup_counter = client.post("/counters", json={"name": "Window 9", "status": "active"})
    assert dup_counter.status_code == 400


def test_create_counter_rejects_invalid_status(tmp_path):
    client = make_client(tmp_path)
    response = client.post("/counters", json={"name": "Bad", "status": "banana"})
    assert response.status_code == 400


# --- Prediction edge cases -------------------------------------------------

def test_prediction_with_all_counters_paused_does_not_crash(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    for counter in client.get("/counters").json():
        client.patch(f"/counters/{counter['id']}/pause")

    token_id = client.get("/tokens/by-number/A-010").json()["id"]
    prediction = client.get(f"/tokens/{token_id}/prediction")
    assert prediction.status_code == 200
    assert prediction.json()["estimated_service_time"] is not None

    status = client.get("/queue/status")
    assert status.status_code == 200
    assert status.json()["active_counters"] == 0


# --- Privacy / PII ---------------------------------------------------------

def test_pii_is_never_returned_in_read_responses(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    service_id = client.get("/services").json()[0]["id"]
    client.post(
        "/tokens",
        json={"citizen_name": "Asha", "nic_or_phone": "991234567V", "service_id": service_id},
    )

    by_number = client.get("/tokens/by-number/A-001").json()
    one = client.get("/tokens/1").json()
    listed = client.get("/tokens").json()
    queue = client.get("/queue/status").json()

    assert "nic_or_phone" not in by_number
    assert "nic_or_phone" not in one
    assert all("nic_or_phone" not in t for t in listed)
    for bucket in ("now_serving", "waiting", "called"):
        assert all("nic_or_phone" not in t for t in queue[bucket])


# --- Authentication --------------------------------------------------------

def test_prediction_is_explainable(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    waiting_id = client.get("/tokens/by-number/A-010").json()["id"]

    pred = client.get(f"/tokens/{waiting_id}/prediction").json()
    assert isinstance(pred["factors"], list)
    assert len(pred["factors"]) >= 2
    assert pred["active_counters"] >= 1
    assert pred["average_service_minutes"] > 0
    # Nothing is overrunning right after a clean seed.
    assert pred["current_delay_minutes"] == 0
    assert any("on schedule" in factor.lower() for factor in pred["factors"])


def test_prediction_explains_live_delay(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    counter = client.get("/counters").json()[0]
    called = client.post(f"/admin/call-next/{counter['id']}").json()
    client.post(f"/admin/start-token/{counter['id']}/{called['id']}")
    client.post(f"/admin/demo/simulate-delay/{called['id']}?extra_minutes=10")

    waiting_id = client.get("/tokens/by-number/A-020").json()["id"]
    pred = client.get(f"/tokens/{waiting_id}/prediction").json()

    assert pred["current_delay_minutes"] > 0
    assert any("delay detected" in factor.lower() for factor in pred["factors"])


def test_service_time_learns_from_recent_completions(tmp_path):
    """A burst of slow completions should pull the learned estimate above baseline."""
    client = make_client(tmp_path)
    seed_demo(client)
    counters = client.get("/counters").json()
    service_id = client.get("/services").json()[0]["id"]
    waiting_id = client.get("/tokens/by-number/A-010").json()["id"]
    baseline = client.get(f"/tokens/{waiting_id}/prediction").json()["average_service_minutes"]

    # Complete several visits that each overran by a lot, then read the estimate.
    counter = counters[0]
    for _ in range(3):
        called = client.post(f"/admin/call-next/{counter['id']}").json()
        client.post(f"/admin/start-token/{counter['id']}/{called['id']}")
        client.post(f"/admin/demo/simulate-delay/{called['id']}?extra_minutes=30")
        client.post(f"/admin/complete-token/{counter['id']}/{called['id']}")

    learned = client.get(f"/tokens/{waiting_id}/prediction").json()
    assert learned["average_service_minutes"] > baseline
    assert any("learned from" in factor.lower() for factor in learned["factors"])


def test_recommended_arrival_is_never_in_the_past(tmp_path):
    """A short wait must not push the recommended arrival before now."""
    client = make_client(tmp_path)
    seed_demo(client)
    # The very first waiting token has ~0 people ahead, so the naive
    # "service time minus 15 min buffer" would land 15 minutes in the past.
    token_id = client.get("/tokens/by-number/A-001").json()["id"]
    pred = client.get(f"/tokens/{token_id}/prediction").json()

    arrival = parse_iso(pred["recommended_arrival_time"])
    estimated = parse_iso(pred["estimated_service_time"])
    now = datetime.now(timezone.utc)
    assert arrival >= now - timedelta(seconds=5)
    # And it never sits after the time you'd actually be served.
    assert arrival <= estimated + timedelta(seconds=5)


def test_prediction_has_no_confidence_band_without_history(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    waiting_id = client.get("/tokens/by-number/A-010").json()["id"]

    pred = client.get(f"/tokens/{waiting_id}/prediction").json()
    assert "confidence_minutes" in pred
    assert pred["confidence_minutes"] == 0


def test_prediction_reports_confidence_band_from_variance(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    counter = client.get("/counters").json()[0]

    # Complete several visits with very different durations to create variance.
    for extra in (2, 30, 4, 28):
        called = client.post(f"/admin/call-next/{counter['id']}").json()
        client.post(f"/admin/start-token/{counter['id']}/{called['id']}")
        client.post(f"/admin/demo/simulate-delay/{called['id']}?extra_minutes={extra}")
        client.post(f"/admin/complete-token/{counter['id']}/{called['id']}")

    waiting_id = client.get("/tokens/by-number/A-010").json()["id"]
    pred = client.get(f"/tokens/{waiting_id}/prediction").json()

    assert pred["confidence_minutes"] > 0
    assert any("consistent" in factor.lower() for factor in pred["factors"])


def test_called_token_carries_no_show_risk(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    counter = client.get("/counters").json()[0]
    called = client.post(f"/admin/call-next/{counter['id']}").json()

    waiting = client.get("/tokens/by-number/A-020").json()
    assert waiting["no_show_risk"] is None

    called_read = client.get(f"/tokens/{called['id']}").json()
    assert isinstance(called_read["no_show_risk"], int)
    assert 0 <= called_read["no_show_risk"] <= 100


def test_staff_endpoints_require_api_key_when_configured(tmp_path):
    client = make_client(tmp_path)
    seed_demo(client)
    counter = client.get("/counters").json()[0]

    os.environ["STAFF_API_KEY"] = "s3cret-demo-key"
    try:
        # Without the key -> 401.
        unauth = client.post(f"/admin/call-next/{counter['id']}")
        assert unauth.status_code == 401

        # Citizen reads stay open even with auth enabled.
        assert client.get("/queue/status").status_code == 200
        assert client.get("/tokens").status_code == 200

        # With the correct key -> allowed.
        ok = client.post(
            f"/admin/call-next/{counter['id']}",
            headers={"X-API-Key": "s3cret-demo-key"},
        )
        assert ok.status_code == 200

        # Wrong key -> 401.
        wrong = client.post(
            f"/admin/start-token/{counter['id']}/{ok.json()['id']}",
            headers={"X-API-Key": "nope"},
        )
        assert wrong.status_code == 401
    finally:
        os.environ.pop("STAFF_API_KEY", None)
