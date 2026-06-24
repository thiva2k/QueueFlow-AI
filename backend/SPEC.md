# Spec: QueueFlow AI Phase 1 Backend

## Objective
Build a minimal FastAPI backend for a smart queue system that issues tokens, tracks queue state, and recalculates estimated service and recommended arrival times whenever the queue changes.

## Tech Stack
- Python
- FastAPI
- SQLite
- SQLAlchemy
- Pydantic
- Uvicorn

## Commands
- Install: `python -m pip install -r requirements.txt`
- Seed: `python -m app.seed`
- Dev: `uvicorn app.main:app --reload`
- Test: `python -m pytest`

## Project Structure
- `app/main.py`: FastAPI application setup
- `app/database.py`: SQLite engine, session dependency, table creation
- `app/models.py`: SQLAlchemy models
- `app/schemas.py`: Pydantic request/response schemas
- `app/routers/`: API route modules
- `app/services/prediction.py`: queue prediction logic
- `app/seed.py`: demo seed data
- `tests/`: API behavior tests

## Testing Strategy
Use pytest with FastAPI's TestClient against an isolated temporary SQLite database. Cover health, seed-driven listing, token creation, admin actions, counter changes, and delayed-serving recalculation behavior.

## Boundaries
- Always: keep code simple, recalculate predictions after queue state changes, return useful 404/400 errors.
- Ask first: authentication, real SMS/WhatsApp, machine learning, frontend, external services.
- Never: store secrets, add unnecessary infrastructure, build features outside Phase 1.

## Success Criteria
- API runs with `uvicorn app.main:app --reload`.
- Seed script creates 3 services, 3 counters, and 20 waiting tokens.
- Citizen token creation returns estimates and recommended arrival time.
- Admin call/start/complete/miss endpoints update queue state.
- Pausing/resuming counters and delayed serving tokens recalculate future predictions.
- `/docs` is available through FastAPI.
