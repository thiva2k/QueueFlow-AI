import argparse
import json
import os
import sys
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "http://127.0.0.1:8000"


class SmokeFailure(Exception):
    pass


def parse_time(value):
    if not value:
        raise SmokeFailure("Expected a timestamp, got empty value")
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def request_json(method, base_url, path, payload=None):
    data = None
    headers = {"Accept": "application/json"}
    staff_key = os.environ.get("STAFF_API_KEY", "").strip()
    if staff_key:
        headers["X-API-Key"] = staff_key
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = Request(f"{base_url}{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=10) as response:
            body = response.read().decode("utf-8")
            return response.status, json.loads(body) if body else None
    except HTTPError as exc:
        body = exc.read().decode("utf-8")
        detail = body or exc.reason
        raise SmokeFailure(f"{method} {path} returned {exc.code}: {detail}") from exc
    except URLError as exc:
        raise SmokeFailure(f"Cannot reach backend at {base_url}: {exc.reason}") from exc


def expect(condition, message):
    if not condition:
        raise SmokeFailure(message)


def pass_step(number, message):
    print(f"PASS {number:02d}: {message}")


def first_active_counter(counters):
    for counter in counters:
        if counter["status"] == "active":
            return counter
    raise SmokeFailure("Expected at least one active counter")


def run_smoke_test(base_url):
    print("QueueFlow AI backend smoke test")
    print(f"Base URL: {base_url}")

    status, health = request_json("GET", base_url, "/health")
    expect(status == 200 and health == {"status": "ok"}, "Health check did not return {'status': 'ok'}")
    pass_step(1, "Health check works")

    status, seeded = request_json("POST", base_url, "/admin/demo/seed")
    expect(status == 200 and seeded["tokens"] == 20, "Demo seed did not create 20 tokens")

    status, services = request_json("GET", base_url, "/services")
    expect(status == 200 and len(services) >= 3, "Expected at least 3 services")
    pass_step(2, f"Services are available ({len(services)})")

    status, counters = request_json("GET", base_url, "/counters")
    expect(status == 200 and len(counters) >= 3, "Expected at least 3 counters")
    counter = first_active_counter(counters)
    pass_step(3, f"Counters are available ({len(counters)}), using {counter['name']}")

    status, tokens = request_json("GET", base_url, "/tokens")
    expect(status == 200 and len(tokens) >= 20, "Expected seeded demo tokens")
    pass_step(4, f"Demo tokens are seeded and visible ({len(tokens)})")

    status, citizen_token = request_json(
        "POST",
        base_url,
        "/tokens",
        {
            "citizen_name": "Smoke Test Citizen",
            "nic_or_phone": "0779990000",
            "service_id": services[0]["id"],
        },
    )
    expect(status == 201, "Citizen token was not created")
    pass_step(5, f"Citizen token created ({citizen_token['token_number']})")
    expect(citizen_token["token_number"], "Created token is missing token number")
    expect(isinstance(citizen_token["people_ahead"], int), "Created token is missing people_ahead")
    expect(citizen_token["estimated_service_time"], "Created token is missing estimated service time")
    expect(citizen_token["recommended_arrival_time"], "Created token is missing recommended arrival time")
    pass_step(6, "New token has token number, people ahead, estimated service time, and recommended arrival time")

    status, called = request_json("POST", base_url, f"/admin/call-next/{counter['id']}")
    expect(status == 200 and called["status"] == "called", "Admin could not call next token")
    pass_step(7, f"Admin called next token ({called['token_number']})")

    status, serving = request_json("POST", base_url, f"/admin/start-token/{counter['id']}/{called['id']}")
    expect(status == 200 and serving["status"] == "serving", "Admin could not start serving token")
    pass_step(8, f"Admin started serving token ({serving['token_number']})")

    _, before_completion = request_json("GET", base_url, "/tokens/by-number/A-019")
    before_completion_time = parse_time(before_completion["estimated_service_time"])

    status, completed = request_json("POST", base_url, f"/admin/complete-token/{counter['id']}/{serving['id']}")
    expect(status == 200 and completed["status"] == "completed", "Admin could not complete token")
    pass_step(9, f"Admin completed token ({completed['token_number']})")

    _, after_completion = request_json("GET", base_url, "/tokens/by-number/A-019")
    after_completion_time = parse_time(after_completion["estimated_service_time"])
    expect(
        after_completion_time != before_completion_time,
        "Future prediction did not change after completion",
    )
    pass_step(10, "Predictions recalculated after completion")

    status, paused = request_json("PATCH", base_url, f"/counters/{counter['id']}/pause")
    expect(status == 200 and paused["status"] == "paused", "Counter was not paused")
    pass_step(11, f"Counter paused ({paused['name']})")

    status, resumed = request_json("PATCH", base_url, f"/counters/{counter['id']}/resume")
    expect(status == 200 and resumed["status"] == "active", "Counter was not resumed")
    pass_step(12, f"Counter resumed ({resumed['name']})")

    status, delay_called = request_json("POST", base_url, f"/admin/call-next/{counter['id']}")
    expect(status == 200 and delay_called["status"] == "called", "Could not call token for delay simulation")
    status, delay_serving = request_json("POST", base_url, f"/admin/start-token/{counter['id']}/{delay_called['id']}")
    expect(status == 200 and delay_serving["status"] == "serving", "Could not start token for delay simulation")

    _, before_delay = request_json("GET", base_url, "/tokens/by-number/A-020")
    before_delay_time = parse_time(before_delay["estimated_service_time"])

    status, delayed = request_json("POST", base_url, f"/admin/demo/simulate-delay/{delay_serving['id']}")
    expect(status == 200 and delayed["status"] == "serving", "Simulate delay endpoint did not return serving token")
    pass_step(13, f"Simulate delay endpoint works ({delayed['token_number']})")

    _, after_delay = request_json("GET", base_url, "/tokens/by-number/A-020")
    after_delay_time = parse_time(after_delay["estimated_service_time"])
    expect(after_delay_time > before_delay_time, "Future waiting token prediction did not move later after delay")
    pass_step(14, "Future waiting token predictions changed after delay")

    print("SUCCESS: QueueFlow AI Phase 1 backend smoke test passed.")


def main():
    parser = argparse.ArgumentParser(description="Run QueueFlow AI Phase 1 backend smoke test.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"Backend base URL. Default: {DEFAULT_BASE_URL}")
    args = parser.parse_args()

    try:
        run_smoke_test(args.base_url.rstrip("/"))
    except SmokeFailure as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
