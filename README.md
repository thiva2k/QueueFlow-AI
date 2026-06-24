# QueueFlow AI

QueueFlow AI is a competition-ready smart queue management MVP for service offices. The current build includes a FastAPI backend, prediction-based queue engine, officer admin dashboard, citizen booking and token status pages, and a public display screen for counters or lobby projectors.

## Working URLs

```text
Backend API:      http://127.0.0.1:8000
API docs:         http://127.0.0.1:8000/docs
Citizen booking:  http://127.0.0.1:5173/book
Token status:     http://127.0.0.1:5173/token/A-021
Admin dashboard:  http://127.0.0.1:5173/admin
Public display:   http://127.0.0.1:5173/display
```

## Project Structure

```text
backend/   FastAPI API, SQLite models, prediction logic, seed/reset data, tests
frontend/  React + Vite citizen portal, admin control center, public display, browser smokes
```

## Backend Setup

```powershell
cd A:\EXITO\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m app.seed
uvicorn app.main:app --reload
```

## Frontend Setup

```powershell
cd A:\EXITO\frontend
npm.cmd install
npm.cmd run dev
```

Open `http://127.0.0.1:5173/book`.

## Competition Demo Flow

1. Start the backend and frontend.
2. Open `/admin`, `/book`, and `/display` in separate tabs.
3. In `/admin`, click `Reset Demo Data`.
4. In `/book`, create a citizen token.
5. Show the booking receipt with token number, estimated service time, recommended arrival time, QR code, and Copy Link.
6. Click `Open Status` to view `/token/{tokenNumber}`.
7. In `/admin`, use Counter 3: `Call Next`, `Start Serving`, then `Simulate +10 Delay`.
8. Confirm the citizen status page updates both estimated service time and recommended arrival time.
9. Confirm `/display` shows now-serving/called counters, next tokens, average wait, current time, and the message `Please proceed only when your token is called.`

## Prediction Engine

QueueFlow AI recalculates future service estimates from:

- people ahead in `waiting`, `called`, and `serving` states
- active counter count
- service duration defaults and completed-token averages
- delay from currently serving tokens that exceed expected duration

The recommended arrival time is calculated 15 minutes before the predicted service time, so citizens arrive based on the live queue, not a fixed appointment guess.

## UI/UX Direction

The demo uses a premium civic-tech SaaS style:

- deep navy/slate base with white surfaces
- teal/cyan accents for live prediction states
- amber only for warnings or delays
- red only for no-show/errors
- green only for completed/success states
- compact cards, readable tables, restrained shadows, and clear hierarchy

The intended 10-second story is simple: citizen books a token, QueueFlow predicts service time, admin simulates a delay, the citizen sees their recommended arrival move later.

## Tests

Backend:

```powershell
cd A:\EXITO\backend
.\.venv\Scripts\Activate.ps1
python -m pytest
python test_flow.py
```

Frontend:

```powershell
cd A:\EXITO\frontend
npm.cmd run build
npm.cmd run smoke
npm.cmd run smoke:e2e
```

Browser smoke prerequisites: backend venv installed, frontend dependencies installed, and Chrome/Playwright available. The smoke scripts start their own backend on `8010` or `8011` and Vite on `5173`.

## Known Limitations

- Demo data is synthetic.
- No login/authentication.
- No real SMS, WhatsApp, payment, or ML model.
- Updates use polling instead of WebSockets.
- QR visual is generated locally for demo sharing; the copyable link is the authoritative status URL.

## Future Improvements

- Role-based officer login.
- Real notification integrations.
- Department/branch configuration.
- Historical wait-time analytics.
- WebSocket updates for public display and citizen pages.
- Kiosk/fullscreen hardening for production displays.
