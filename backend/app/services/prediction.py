from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models

QUEUE_STATUSES = ("waiting", "called", "serving")


def ensure_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def get_average_service_duration(db: Session, service_id: int | None = None) -> float:
    query = db.query(func.avg(models.Token.actual_duration_minutes)).filter(
        models.Token.status == "completed",
        models.Token.actual_duration_minutes.isnot(None),
    )
    if service_id is not None:
        query = query.filter(models.Token.service_id == service_id)

    average = query.scalar()
    if average:
        return float(average)

    service_query = db.query(func.avg(models.Service.default_duration_minutes))
    if service_id is not None:
        service_query = service_query.filter(models.Service.id == service_id)
    fallback = service_query.scalar()
    return float(fallback or 0)


# How many recent completions feed the learned estimate, and how strongly the
# newest one is weighted (higher alpha = more responsive to current conditions).
LEARNING_WINDOW = 10
LEARNING_ALPHA = 0.4


def recent_service_durations(db: Session, service: models.Service) -> list[float]:
    """Most-recent-first list of actual service durations for a service."""
    rows = (
        db.query(models.Token.actual_duration_minutes)
        .filter(
            models.Token.service_id == service.id,
            models.Token.status == "completed",
            models.Token.actual_duration_minutes.isnot(None),
        )
        .order_by(models.Token.completed_at.desc())
        .limit(LEARNING_WINDOW)
        .all()
    )
    return [float(row[0]) for row in rows]


def get_service_duration(db: Session, service: models.Service) -> float:
    """Recency-weighted (EMA) estimate of how long this service is taking.

    Instead of a flat historical average, weight recent completions more so the
    estimate adapts to how fast counters are actually working right now. Falls
    back to the configured baseline when there is no history yet.
    """
    durations = recent_service_durations(db, service)
    if not durations:
        return float(service.default_duration_minutes)

    ema = durations[-1]  # oldest in window seeds the average
    for value in reversed(durations[:-1]):  # walk newest-last so recent dominates
        ema = LEARNING_ALPHA * value + (1 - LEARNING_ALPHA) * ema
    return float(ema)


def count_active_counters(db: Session) -> int:
    return db.query(models.Counter).filter(models.Counter.status == "active").count()


def count_people_ahead(db: Session, token: models.Token) -> int:
    return db.query(models.Token).filter(
        models.Token.status.in_(QUEUE_STATUSES),
        models.Token.id < token.id,
    ).count()


def get_extra_delay_minutes(db: Session, now: datetime | None = None) -> float:
    now = now or datetime.now(timezone.utc)
    serving_tokens = db.query(models.Token).filter(models.Token.status == "serving").all()
    extra_delay = 0.0

    for token in serving_tokens:
        if not token.started_at or not token.service:
            continue
        started_at = ensure_aware(token.started_at)
        current_duration = (now - started_at).total_seconds() / 60
        expected_duration = token.service.default_duration_minutes
        if current_duration > expected_duration:
            extra_delay += current_duration - expected_duration

    return extra_delay


def get_counter_delays(db: Session, now: datetime | None = None) -> list[tuple[str, float]]:
    """(counter name, minutes over expected) for counters running late right now."""
    now = now or datetime.now(timezone.utc)
    delays: list[tuple[str, float]] = []
    counters = db.query(models.Counter).filter(models.Counter.current_token_id.isnot(None)).all()
    for counter in counters:
        token = db.get(models.Token, counter.current_token_id)
        if not token or token.status != "serving" or not token.started_at or not token.service:
            continue
        started_at = ensure_aware(token.started_at)
        elapsed = (now - started_at).total_seconds() / 60
        over = elapsed - token.service.default_duration_minutes
        if over > 1:
            delays.append((counter.name, over))
    delays.sort(key=lambda item: item[1], reverse=True)
    return delays


def explain_prediction(db: Session, token: models.Token, now: datetime | None = None) -> dict:
    """Plain-language reasons behind a token's recommended arrival time.

    Surfaces the live inputs the engine actually used — queue depth, the learned
    service time, and any counters running over — so the prediction is
    explainable instead of a black box.
    """
    now = now or datetime.now(timezone.utc)
    active = count_active_counters(db)
    active_eff = max(active, 1)
    people = count_people_ahead(db, token)
    service_duration = max(get_service_duration(db, token.service), 1.0)
    learned = min(len(recent_service_durations(db, token.service)), LEARNING_WINDOW)
    delays = get_counter_delays(db, now)
    total_delay = sum(over for _, over in delays)

    factors: list[str] = []
    factors.append(
        f"{people} {'citizen' if people == 1 else 'citizens'} ahead of you across "
        f"{active_eff} active counter{'' if active_eff == 1 else 's'}"
    )
    if learned >= 1:
        factors.append(
            f"Service time learned from the last {learned} completed "
            f"visit{'' if learned == 1 else 's'}: about {round(service_duration)} min each"
        )
    else:
        factors.append(f"Using this office's baseline service time: about {round(service_duration)} min")
    if delays:
        named = ", ".join(f"{name} (+{round(over)} min)" for name, over in delays[:2])
        factors.append(f"Live delay detected — {named} running over; we added this to your wait")
    else:
        factors.append("All active counters are on schedule")
    if active == 0:
        factors.append("No counters are open right now — your time will update when one resumes")

    return {
        "active_counters": active,
        "average_service_minutes": round(service_duration, 1),
        "current_delay_minutes": round(total_delay, 1),
        "factors": factors,
    }


def predict_token(db: Session, token: models.Token, now: datetime | None = None) -> tuple[int, datetime, datetime]:
    now = now or datetime.now(timezone.utc)
    active_counters = max(count_active_counters(db), 1)
    people_ahead = count_people_ahead(db, token)
    # Floor to 1 min so a misconfigured/zero-duration service can't zero out
    # every wait estimate.
    service_duration = max(get_service_duration(db, token.service), 1.0)
    extra_delay = get_extra_delay_minutes(db, now) if token.status in ("waiting", "called") else 0
    estimated_wait = (people_ahead / active_counters) * service_duration + extra_delay
    estimated_service_time = now + timedelta(minutes=estimated_wait)
    recommended_arrival_time = estimated_service_time - timedelta(minutes=15)
    return people_ahead, estimated_service_time, recommended_arrival_time


def recalculate_predictions(db: Session) -> None:
    now = datetime.now(timezone.utc)
    tokens = db.query(models.Token).filter(models.Token.status.in_(QUEUE_STATUSES)).order_by(models.Token.id).all()

    for token in tokens:
        _, estimated_service_time, recommended_arrival_time = predict_token(db, token, now)
        token.estimated_service_time = estimated_service_time
        token.recommended_arrival_time = recommended_arrival_time

    db.commit()
