from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import require_staff
from app.database import get_db
from app.seed import reset_demo_data, seed_demo_data
from app.services.prediction import DEFAULT_SERVICE_MINUTES, recalculate_predictions


router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_staff)])


def get_counter_or_404(db: Session, counter_id: int) -> models.Counter:
    counter = db.get(models.Counter, counter_id)
    if not counter:
        raise HTTPException(status_code=404, detail="Counter not found")
    return counter


def get_token_or_404(db: Session, token_id: int) -> models.Token:
    token = db.get(models.Token, token_id)
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
    return token


def ensure_active_counter(counter: models.Counter) -> None:
    if counter.status != "active":
        raise HTTPException(status_code=400, detail="Counter is paused")


def token_is_open(token: models.Token | None) -> bool:
    return bool(token and token.status in {"called", "serving"})


def ensure_counter_owns_token(counter: models.Counter, token: models.Token) -> None:
    if counter.current_token_id != token.id:
        raise HTTPException(status_code=400, detail="Token is not assigned to this counter")


@router.post("/demo/seed", response_model=schemas.SeedSummary)
def seed_demo(db: Session = Depends(get_db)):
    return seed_demo_data(db)


@router.post("/demo/reset", response_model=schemas.SeedSummary)
def reset_demo(db: Session = Depends(get_db)):
    return reset_demo_data(db)


@router.post("/call-next/{counter_id}", response_model=schemas.TokenRead)
def call_next(counter_id: int, db: Session = Depends(get_db)):
    counter = get_counter_or_404(db, counter_id)
    ensure_active_counter(counter)

    current = db.get(models.Token, counter.current_token_id) if counter.current_token_id else None
    if token_is_open(current):
        raise HTTPException(status_code=400, detail="Counter already has an open token")

    # Atomically claim the oldest waiting token. Two counters calling next at
    # the same time must never receive the same token, so we retry until a
    # conditional UPDATE (guarded by status='waiting') actually wins a row.
    called_at = datetime.now(timezone.utc)
    claimed_id: int | None = None
    for _ in range(50):
        candidate = (
            db.query(models.Token.id)
            .filter(models.Token.status == "waiting")
            .order_by(models.Token.id)
            .first()
        )
        if candidate is None:
            raise HTTPException(status_code=404, detail="No waiting tokens")

        updated = (
            db.query(models.Token)
            .filter(models.Token.id == candidate.id, models.Token.status == "waiting")
            .update(
                {"status": "called", "called_at": called_at},
                synchronize_session=False,
            )
        )
        if updated == 1:
            claimed_id = candidate.id
            break
        # Lost the race for this token; another counter claimed it first.
        db.rollback()

    if claimed_id is None:
        raise HTTPException(status_code=409, detail="Could not claim a token, please retry")

    counter.current_token_id = claimed_id
    db.commit()
    recalculate_predictions(db)
    token = db.get(models.Token, claimed_id)
    return token


@router.post("/start-token/{counter_id}/{token_id}", response_model=schemas.TokenRead)
def start_token(counter_id: int, token_id: int, db: Session = Depends(get_db)):
    counter = get_counter_or_404(db, counter_id)
    ensure_active_counter(counter)
    token = get_token_or_404(db, token_id)
    current = db.get(models.Token, counter.current_token_id) if counter.current_token_id else None

    if token_is_open(current) and current.id != token.id:
        raise HTTPException(status_code=400, detail="Counter already has an open token")

    # Enforce waiting -> called -> serving: a token must have been called by
    # this counter first. This prevents a counter from grabbing the queue head
    # that another counter is about to call.
    if token.status != "called":
        raise HTTPException(status_code=400, detail="Token must be called before it can be started")

    ensure_counter_owns_token(counter, token)

    token.status = "serving"
    token.started_at = datetime.now(timezone.utc)
    counter.current_token_id = token.id
    db.commit()
    recalculate_predictions(db)
    db.refresh(token)
    return token


@router.post("/complete-token/{counter_id}/{token_id}", response_model=schemas.TokenRead)
def complete_token(counter_id: int, token_id: int, db: Session = Depends(get_db)):
    counter = get_counter_or_404(db, counter_id)
    token = get_token_or_404(db, token_id)

    if token.status != "serving":
        raise HTTPException(status_code=400, detail="Only serving tokens can be completed")
    ensure_counter_owns_token(counter, token)

    completed_at = datetime.now(timezone.utc)
    token.completed_at = completed_at
    token.status = "completed"
    if token.started_at:
        started_at = token.started_at if token.started_at.tzinfo else token.started_at.replace(tzinfo=timezone.utc)
        token.actual_duration_minutes = max((completed_at - started_at).total_seconds() / 60, 0.1)
    if counter.current_token_id == token.id:
        counter.current_token_id = None

    db.commit()
    recalculate_predictions(db)
    db.refresh(token)
    return token


@router.post("/miss-token/{counter_id}/{token_id}", response_model=schemas.TokenRead)
def miss_token(counter_id: int, token_id: int, db: Session = Depends(get_db)):
    counter = get_counter_or_404(db, counter_id)
    token = get_token_or_404(db, token_id)

    if token.status in {"completed", "missed"}:
        raise HTTPException(status_code=400, detail="Token is already closed")
    if token.status in {"called", "serving"}:
        ensure_counter_owns_token(counter, token)

    token.status = "missed"
    if counter.current_token_id == token.id:
        counter.current_token_id = None

    db.commit()
    recalculate_predictions(db)
    db.refresh(token)
    return token


@router.get("/analytics")
def get_analytics(
    days: int = Query(default=7, ge=1, le=365),
    db: Session = Depends(get_db),
):
    """Staff analytics over the last ``days`` of created tokens.

    Everything tolerates an empty database: aggregates fall back to zeros/nulls
    and grouped lists come back empty rather than erroring.
    """
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)

    def aware(value: datetime) -> datetime:
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    # Filter in Python on tz-aware timestamps so SQLite's timezone handling can
    # never silently drop rows from the window.
    tokens = [t for t in db.query(models.Token).all() if aware(t.created_at) >= since]

    completed = [t for t in tokens if t.status == "completed"]
    missed = [t for t in tokens if t.status == "missed"]
    cancelled = [t for t in tokens if t.status == "cancelled"]

    def avg(values: list[float]) -> float:
        return round(sum(values) / len(values), 1) if values else 0.0

    waits = [
        (aware(t.started_at) - aware(t.created_at)).total_seconds() / 60
        for t in tokens
        if t.started_at is not None
    ]
    service_minutes = [t.actual_duration_minutes for t in completed if t.actual_duration_minutes is not None]

    # No-show rate deliberately excludes cancelled tokens (voluntary self-cancel
    # is not a no-show).
    no_show_denom = len(completed) + len(missed)
    totals = {
        "completed": len(completed),
        "missed": len(missed),
        "cancelled": len(cancelled),
        "avg_wait_minutes": avg(waits),
        "avg_service_minutes": avg(service_minutes),
        "no_show_rate": round(len(missed) / no_show_denom, 3) if no_show_denom else 0.0,
    }

    hourly = []
    for hour in range(24):
        in_hour = [t for t in tokens if aware(t.created_at).hour == hour]
        hour_waits = [
            (aware(t.started_at) - aware(t.created_at)).total_seconds() / 60
            for t in in_hour
            if t.started_at is not None
        ]
        hourly.append(
            {
                "hour": hour,
                "tokens_created": len(in_hour),
                "avg_wait_minutes": avg(hour_waits),
            }
        )

    services_rows = []
    for service in db.query(models.Service).order_by(models.Service.id).all():
        svc_tokens = [t for t in tokens if t.service_id == service.id]
        svc_completed = [t for t in svc_tokens if t.status == "completed"]
        svc_durations = [t.actual_duration_minutes for t in svc_completed if t.actual_duration_minutes is not None]
        services_rows.append(
            {
                "service_id": service.id,
                "name": service.name,
                "completed": len(svc_completed),
                "missed": len([t for t in svc_tokens if t.status == "missed"]),
                "avg_duration_minutes": avg(svc_durations),
            }
        )

    day_map: dict[str, dict] = {}
    for t in tokens:
        key = aware(t.created_at).date().isoformat()
        bucket = day_map.setdefault(key, {"date": key, "completed": 0, "missed": 0, "cancelled": 0})
        if t.status in {"completed", "missed", "cancelled"}:
            bucket[t.status] += 1
    days_rows = [day_map[key] for key in sorted(day_map)]

    return {
        "totals": totals,
        "hourly": hourly,
        "services": services_rows,
        "days": days_rows,
    }


@router.post("/recalculate-predictions", response_model=schemas.Message)
def recalculate(db: Session = Depends(get_db)):
    recalculate_predictions(db)
    return schemas.Message(message="Predictions recalculated")


@router.post("/demo/simulate-delay/{token_id}", response_model=schemas.TokenRead)
def simulate_delay(
    token_id: int,
    extra_minutes: int = Query(default=15, ge=1, le=120),
    db: Session = Depends(get_db),
):
    token = get_token_or_404(db, token_id)
    if token.status != "serving":
        raise HTTPException(status_code=400, detail="Only serving tokens can be delayed")

    expected = token.service.default_duration_minutes if token.service else DEFAULT_SERVICE_MINUTES
    token.started_at = datetime.now(timezone.utc) - timedelta(minutes=expected + extra_minutes)
    db.commit()
    recalculate_predictions(db)
    db.refresh(token)
    return token
