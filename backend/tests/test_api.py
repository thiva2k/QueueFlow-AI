import os
import sys
from datetime import datetime, timezone
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

    assert seeded == {"services": 3, "counters": 3, "tokens": 20}
    assert len(client.get("/services").json()) == 3
    assert len(client.get("/counters").json()) == 3
    assert len(client.get("/tokens").json()) == 20
    status = client.get("/queue/status").json()
    assert status["active_counters"] == 2
    assert status["estimated_wait_for_last_token"] is not None


def test_demo_reset_creates_realistic_counter_state(tmp_path):
    client = make_client(tmp_path)
    reset = reset_demo(client)

    assert reset == {"services": 3, "counters": 3, "tokens": 20}

    counters = client.get("/counters").json()
    assert [counter["status"] for counter in counters] == ["active", "active", "active"]
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
    counter = client.get("/counters").json()[0]

    called = client.post(f"/admin/call-next/{counter['id']}").json()
    assert called["status"] == "called"

    started = client.post(f"/admin/start-token/{counter['id']}/{called['id']}").json()
    assert started["status"] == "serving"

    before = client.get("/tokens/by-number/A-020").json()["estimated_service_time"]
    pause_response = client.patch(f"/counters/{counter['id']}/pause")
    assert pause_response.status_code == 200
    after = client.get("/tokens/by-number/A-020").json()["estimated_service_time"]

    assert before != after

    completed = client.post(f"/admin/complete-token/{counter['id']}/{called['id']}").json()
    assert completed["status"] == "completed"
    assert completed["actual_duration_minutes"] is not None


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
