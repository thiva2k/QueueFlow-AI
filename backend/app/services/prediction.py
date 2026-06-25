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


def get_service_duration(db: Session, service: models.Service) -> float:
    average = db.query(func.avg(models.Token.actual_duration_minutes)).filter(
        models.Token.service_id == service.id,
        models.Token.status == "completed",
        models.Token.actual_duration_minutes.isnot(None),
    ).scalar()
    return float(average or service.default_duration_minutes)


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
