# QueueFlow AI Backend

Backend plus React frontend for QueueFlow AI, an AI-powered smart queue management MVP for service offices. The current build includes queue tokens, counter state, prediction-based arrival guidance, an officer-facing admin dashboard, and a citizen portal for booking and tracking tokens.

## Setup

```powershell
cd A:\EXITO\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## Seed Demo Data

```powershell
python -m app.seed
```

The seed creates:
- 3 services
- 3 counters
- 20 waiting tokens

There are also demo API endpoints:

```powershell
curl -X POST http://127.0.0.1:8000/admin/demo/seed
curl -X POST http://127.0.0.1:8000/admin/demo/reset
```

Use `/admin/demo/reset` for the admin dashboard competition demo. It clears old queue data, recreates services, counters, and demo tokens, assigns realistic currently-serving tokens to counters, and keeps serving elapsed times within a few minutes instead of showing stale timestamps.

## Run

```powershell
uvicorn app.main:app --reload
```

Open the API docs at:

```text
http://127.0.0.1:8000/docs
```

## Test

```powershell
python -m pytest
```

## Backend Smoke Test

Start the backend in one terminal:

```powershell
cd A:\EXITO\backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

Then run the smoke test in a second terminal:

```powershell
cd A:\EXITO\backend
.\.venv\Scripts\Activate.ps1
python test_flow.py
```

The backend smoke test seeds baseline data through `POST /admin/demo/seed`, creates a citizen token, runs admin queue actions, pauses/resumes a counter, simulates a delayed serving token, and verifies future predictions change. Use `POST /admin/demo/reset` for the officer dashboard demo because it creates realistic currently-serving timestamps.

Expected successful output:

```text
QueueFlow AI backend smoke test
Base URL: http://127.0.0.1:8000
PASS 01: Health check works
PASS 02: Services are available (3)
PASS 03: Counters are available (3), using Counter 1
PASS 04: Demo tokens are seeded and visible (20)
PASS 05: Citizen token created (A-021)
PASS 06: New token has token number, people ahead, estimated service time, and recommended arrival time
PASS 07: Admin called next token (A-001)
PASS 08: Admin started serving token (A-001)
PASS 09: Admin completed token (A-001)
PASS 10: Predictions recalculated after completion
PASS 11: Counter paused (Counter 1)
PASS 12: Counter resumed (Counter 1)
PASS 13: Simulate delay endpoint works (A-002)
PASS 14: Future waiting token predictions changed after delay
SUCCESS: QueueFlow AI backend smoke test passed.
```

## Frontend

Start the backend:

```powershell
cd A:\EXITO\backend
.\.venv\Scripts\Activate.ps1
python -m app.seed
uvicorn app.main:app --reload
```

Start the frontend in a second terminal:

```powershell
cd A:\EXITO\frontend
npm.cmd install
npm.cmd run dev
```

Build the frontend:

```powershell
cd A:\EXITO\frontend
npm.cmd run build
```

Open the citizen portal:

```text
http://127.0.0.1:5173/book
```

Token status URL format:

```text
http://127.0.0.1:5173/token/A-021
```

Open the admin dashboard:

```text
http://127.0.0.1:5173/admin
```

Open the public display:

```text
http://127.0.0.1:5173/display
```

Optional browser smoke check:

```powershell
cd A:\EXITO\frontend
npm.cmd run smoke
npm.cmd run smoke:citizen
npm.cmd run smoke:e2e
```

The admin smoke check starts its own backend on `http://127.0.0.1:8010`, starts Vite on `http://127.0.0.1:5173`, clicks through the main admin demo actions in Chrome, captures `admin-dashboard-smoke.png`, and exits.

The citizen/full e2e smoke check starts its own backend on `http://127.0.0.1:8011`, starts Vite on `http://127.0.0.1:5173`, books a citizen token, opens the admin dashboard, simulates a +10 minute delay, verifies the citizen estimated service time and recommended arrival time change, checks the public display, captures `citizen-portal-smoke.png`, and exits.

Citizen demo flow:
- Open `http://127.0.0.1:5173/book`.
- Enter full name, NIC or phone number, and service type.
- Click `Book Token`.
- On `/token/{tokenNumber}`, confirm estimated service time and recommended arrival time.
- Open `http://127.0.0.1:5173/admin` in another tab.
- In a counter card, click `Call Next`, `Start Serving`, then `Simulate +5 Delay` or `Simulate +10 Delay`.
- Return to the citizen status page and watch estimated service/recommended arrival update automatically.
- Open `http://127.0.0.1:5173/display` to show now-serving counters and next waiting tokens.

Admin demo flow:
- Click `Reset Demo Data` for a clean queue with realistic current timestamps.
- Counter cards are the only action area. The Waiting Citizens table is informational only.
- Click `Call Next` on an empty active counter.
- The token appears only in that counter as `Called to Counter`.
- Click `Start Serving` inside the same counter card.
- Click `Simulate +5 Delay` or `Simulate +10 Delay` while the token is `Being Served`.
- Watch the Prediction Engine and Waiting Citizens estimated service/recommended arrival times update.
- Click `Complete`; the counter becomes free again.

Public display demo:
- Open `http://127.0.0.1:5173/display`.
- Confirm the lobby screen shows now-serving/called tokens by counter, next waiting tokens, average wait, and `Please proceed only when your token is called.`

## Key Endpoints

- `GET /health`
- `GET /services`
- `POST /services`
- `GET /counters`
- `POST /counters`
- `PATCH /counters/{counter_id}/pause`
- `PATCH /counters/{counter_id}/resume`
- `POST /tokens`
- `GET /tokens`
- `GET /tokens/{token_id}`
- `GET /tokens/by-number/{token_number}`
- `GET /queue/status`
- `POST /admin/call-next/{counter_id}`
- `POST /admin/start-token/{counter_id}/{token_id}`
- `POST /admin/complete-token/{counter_id}/{token_id}`
- `POST /admin/miss-token/{counter_id}/{token_id}`
- `POST /admin/recalculate-predictions`
- `GET /tokens/{token_id}/prediction`
- `POST /admin/demo/simulate-delay/{token_id}`
- `POST /admin/demo/reset`

## Prediction Logic

Prediction is implemented in `app/services/prediction.py`.

The estimate uses:
- people ahead in `waiting`, `called`, or `serving`
- active counter count
- average completed duration for the selected service, or the service default
- extra delay from currently serving tokens that have exceeded their default service duration

Recommended arrival time is 15 minutes before the estimated service time.
