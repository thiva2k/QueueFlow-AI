# QueueFlow AI

QueueFlow AI is a smart queue management MVP for service offices. Phase 1 delivers a FastAPI backend with queue tokens, counters, admin queue actions, prediction recalculation, and demo seeding. Phase 2 adds a React + Vite officer dashboard. Phase 3 adds the citizen portal for booking tokens and tracking live arrival guidance.

## Project Structure

```text
backend/   FastAPI API, SQLite models, seed data, tests, smoke test
frontend/  React + Vite citizen portal, admin dashboard, browser smoke tests
```

## Backend

```powershell
cd A:\EXITO\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m app.seed
uvicorn app.main:app --reload
```

API docs:

```text
http://127.0.0.1:8000/docs
```

Backend tests:

```powershell
cd A:\EXITO\backend
.\.venv\Scripts\Activate.ps1
python -m pytest
python test_flow.py
```

## Frontend

```powershell
cd A:\EXITO\frontend
npm.cmd install
npm.cmd run dev
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

Build and smoke test:

```powershell
cd A:\EXITO\frontend
npm.cmd run build
npm.cmd run smoke
npm.cmd run smoke:citizen
npm.cmd run smoke:e2e
```

## Citizen Demo Flow

1. Open `http://127.0.0.1:5173/book`.
2. Enter full name, NIC or phone number, and service type.
3. Click `Book Token`.
4. The app opens `/token/{tokenNumber}`.
5. Confirm token number, people ahead, estimated service time, recommended arrival time, queue position, status, and last updated time.
6. Open `http://127.0.0.1:5173/admin` in another tab.
7. In a counter card, click `Call Next`, then `Start Serving`.
8. Click `Simulate +5 Delay` or `Simulate +10 Delay` from that same counter card.
9. Return to the citizen token status tab and watch the estimated service and recommended arrival times update automatically.
10. Open `http://127.0.0.1:5173/display` to show the lobby screen with now-serving counters and next waiting tokens.

## Admin Demo Flow

1. Open `http://127.0.0.1:5173/admin`.
2. Click `Reset Demo Data` to create a clean live demo with realistic serving elapsed times.
3. Confirm Counter 1 and Counter 2 are `Being Served`, and Counter 3 is ready with `No citizen at this counter`.
4. Click `Call Next` on Counter 3.
5. The called token appears only inside Counter 3 as `Called to Counter`.
6. Click `Start Serving` inside Counter 3.
7. Click `Simulate +10 Delay`; the Prediction Engine and Waiting Citizens recommended arrival times update.
8. Click `Complete`; Counter 3 becomes free again.

Officer action rule: the Waiting Citizens table is informational only. `Start Serving`, `Mark No-show`, `Complete`, and delay simulation appear only inside the relevant counter card.

## Full Judge Demo

1. Start the backend at `http://127.0.0.1:8000`.
2. Start the frontend at `http://127.0.0.1:5173`.
3. Open `/admin`, `/book`, and `/display` in separate tabs.
4. In `/admin`, click `Reset Demo Data`.
5. In `/book`, create a citizen token and keep the `/token/{tokenNumber}` page open.
6. In `/admin`, use Counter 3: `Call Next`, `Start Serving`, then `Simulate +10 Delay`.
7. Confirm `/token/{tokenNumber}` updates both estimated service time and recommended arrival time.
8. Confirm `/display` shows now-serving counters, next waiting tokens, average wait, and the message `Please proceed only when your token is called.`

## Version Control Setup

This repo should commit source, docs, and lockfiles only. Generated data, local virtual environments, Node modules, build output, screenshots, and local agent state are ignored in `.gitignore`.

Recommended first commit:

```powershell
cd A:\EXITO
git init -b main
git add README.md .gitignore backend frontend
git status --short
git commit -m "feat: add QueueFlow AI MVP backend and admin dashboard"
```

GitHub repository:

```text
https://github.com/thiva2k/QueueFlow-AI
```
