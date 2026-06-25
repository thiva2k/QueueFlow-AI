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
Kiosk display:    http://127.0.0.1:5173/display?kiosk=true
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

## Split Deployment: Render Backend + Vercel Frontend

QueueFlow AI is deployment-ready as two separate services:

- Backend: FastAPI web service on Render
- Frontend: React/Vite static app on Vercel

Do not deploy the backend inside Vercel for this MVP. Vercel should host only the `frontend` app, and Render should host only the `backend` API.

### Live Demo Deployment

```text
Frontend:      https://project-0ppn4.vercel.app
Citizen:       https://project-0ppn4.vercel.app/book
Admin:         https://project-0ppn4.vercel.app/admin
Public display:https://project-0ppn4.vercel.app/display?kiosk=true
Backend:       https://queueflow-ai-backend.onrender.com
Health:        https://queueflow-ai-backend.onrender.com/health
Docs:          https://queueflow-ai-backend.onrender.com/docs
```

Current production environment variables:

```text
Vercel VITE_API_BASE_URL=https://queueflow-ai-backend.onrender.com
Render CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://project-0ppn4.vercel.app
Render PYTHON_VERSION=3.12.13
```

Before a live presentation, open the backend `/health` URL first, then open `/admin`, accept `Reset Demo Data`, and keep `/display?kiosk=true` ready in a separate tab.

### Backend on Render

Create a Render Web Service from `https://github.com/thiva2k/QueueFlow-AI`.

Render settings:

```text
Root directory: backend
Runtime: Python
Build command: pip install -r requirements.txt
Start command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health check path: /health
```

Required Render environment variable:

```text
CORS_ORIGINS=<Vercel frontend URL>,http://localhost:5173,http://127.0.0.1:5173
```

Optional backend environment variable:

```text
QUEUEFLOW_DATABASE_URL=sqlite:///./queueflow.db
```

The root `render.yaml` contains the same backend service settings and can be used as a Render Blueprint. After Render gives you the backend URL, verify:

```text
https://<your-render-service>.onrender.com/health
```

Expected response:

```json
{"status":"ok"}
```

### Frontend on Vercel

Create a Vercel project from the same GitHub repository.

Vercel settings:

```text
Root directory: frontend
Install command: npm install
Build command: npm run build
Output directory: dist
```

Required Vercel environment variable:

```text
VITE_API_BASE_URL=<Render backend URL>
```

Example:

```text
VITE_API_BASE_URL=https://queueflow-ai-backend.onrender.com
```

The frontend falls back to `http://127.0.0.1:8000` for local development when `VITE_API_BASE_URL` is not set.

The `frontend/vercel.json` rewrite keeps direct links such as `/admin`, `/book`, `/display`, and `/token/{tokenNumber}` working after refresh.

### Deployment Order

1. Deploy the backend to Render first.
2. Open `<Render backend URL>/health` and confirm it returns `{"status":"ok"}`.
3. Deploy the frontend to Vercel with `VITE_API_BASE_URL` set to the Render backend URL.
4. Copy the final Vercel frontend URL.
5. Update Render `CORS_ORIGINS` to include the final Vercel URL plus the local origins.
6. Redeploy or restart the Render backend after changing CORS.
7. Run the public smoke test below.

### Public Smoke Test

After both services are deployed, test:

1. Open `<Vercel URL>/book`.
2. Create a citizen token.
3. Open the generated token status page.
4. Open `<Vercel URL>/admin`.
5. Click `Reset Demo Data`.
6. Click `Simulate +10 Delay`.
7. Confirm the citizen token status page updates its Estimated Service Time and Recommended Arrival Time.
8. Open `<Vercel URL>/display?kiosk=true`.
9. Confirm now-serving, called counters, next tokens, average wait, and lobby message are visible.

### Demo Warm-Up Checklist

Before presenting:

1. Open `<Render backend URL>/health` so the free-tier backend is awake.
2. Open `<Vercel URL>/admin`.
3. Click `Reset Demo Data`.
4. Open `<Vercel URL>/book` and create one citizen token.
5. Open `<Vercel URL>/display?kiosk=true`.
6. Keep the Render backend active before the demo starts.

### SQLite Persistence Note

SQLite is acceptable for this competition demo because QueueFlow AI can recreate demo state with `Reset Demo Data`. It is not production-grade persistence on Render free-tier style filesystems, where local disk state may be temporary or reset across deployments and restarts. For production, move the backend to PostgreSQL and set `QUEUEFLOW_DATABASE_URL` to the production database URL.

## Competition Demo Flow

1. Start the backend and frontend.
2. Open `/admin`, `/book`, and `/display` in separate tabs.
3. In `/admin`, click `Reset Demo Data`.
4. In `/book`, create a citizen token.
5. Show the booking receipt with token number, estimated service time, recommended arrival time, real QR code, and Copy Link.
6. Click `Open Status` to view `/token/{tokenNumber}`.
7. In `/admin`, use Counter 3: `Call Next`, `Start Serving`, then `Simulate +10 Delay`.
8. Confirm the admin Prediction Engine and citizen status page show the delay impact, for example `Arrival moved +10 min`.
9. Confirm `/display?kiosk=true` shows now-serving/called counters, next tokens, average wait, current time, and the message `Please proceed only when your token is called.`

## Prediction Engine

QueueFlow AI recalculates future service estimates from:

- people ahead in `waiting`, `called`, and `serving` states
- active counter count
- service duration defaults and completed-token averages
- delay from currently serving tokens that exceed expected duration

The recommended arrival time is calculated 15 minutes before the predicted service time, so citizens arrive based on the live queue, not a fixed appointment guess.

When the demo simulates a service delay, QueueFlow AI highlights the visible prediction movement:

- `Estimated service moved +10 min`
- `Arrival moved +10 min`

This is the core demo moment: judges can immediately see the citizen's arrival recommendation move later after an officer simulates a counter delay.

## Citizen QR Sharing

After a citizen books a token, the receipt shows a real QR code generated from the current frontend origin:

```text
http://127.0.0.1:5173/token/{tokenNumber}
```

The `Copy Link` button remains available for demos where scanning is not convenient.

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
- QR codes are generated in the browser for local demo sharing.

## Future Improvements

- Role-based officer login.
- Real notification integrations.
- Department/branch configuration.
- Historical wait-time analytics.
- WebSocket updates for public display and citizen pages.
- Production kiosk hardening for locked-down lobby devices.
