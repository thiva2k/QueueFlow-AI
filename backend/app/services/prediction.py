import os
import statistics
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models

QUEUE_STATUSES = ("waiting", "called", "serving")

# Recommend citizens arrive this many minutes before their estimated service.
ARRIVAL_BUFFER = 15

# The model's time-of-day signal is trained on local office hours, so the
# current hour must be read in the office's timezone, not UTC.
try:
    OFFICE_TZ = ZoneInfo(os.getenv("OFFICE_TIMEZONE", "Asia/Colombo"))
except Exception:  # pragma: no cover - missing tz database
    OFFICE_TZ = timezone.utc


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


def get_service_duration(db: Session, service: models.Service, now: datetime | None = None) -> float:
    """Best estimate of how long this service is taking right now.

    1. If there is real recent history, use a recency-weighted EMA so the
       estimate adapts to how fast counters are actually working today.
    2. Otherwise (cold start) ask the trained service-time model for a
       prediction at the current hour and load — far better than a static
       default, since it knows time-of-day and queue-load patterns.
    3. If the model is unavailable, fall back to the configured baseline.
    """
    durations = recent_service_durations(db, service)
    if durations:
        ema = durations[-1]  # oldest in window seeds the average
        for value in reversed(durations[:-1]):  # walk newest-last so recent dominates
            ema = LEARNING_ALPHA * value + (1 - LEARNING_ALPHA) * ema
        return float(ema)

    from app.services import ml

    now = now or datetime.now(timezone.utc)
    queue_length = db.query(models.Token).filter(models.Token.status == "waiting").count()
    local_hour = ensure_aware(now).astimezone(OFFICE_TZ).hour
    predicted = ml.predict_duration(service.default_duration_minutes, local_hour, queue_length)
    if predicted is not None:
        return predicted
    return float(service.default_duration_minutes)


def count_active_counters(db: Session) -> int:
    return db.query(models.Counter).filter(models.Counter.status == "active").count()


def count_people_ahead(db: Session, token: models.Token) -> int:
    return db.query(models.Token).filter(
        models.Token.status.in_(QUEUE_STATUSES),
        models.Token.id < token.id,
    ).count()


def counter_overruns(db: Session, now: datetime | None = None) -> list[tuple[str, float]]:
    """Single source of truth for live delay: (counter name, minutes over expected)
    for every actively-serving counter currently running past its expected time.

    Both the ETA math and the human-facing delay display derive from this so the
    number a citizen sees can never diverge from the number the engine uses.
    """
    now = now or datetime.now(timezone.utc)
    overruns: list[tuple[str, float]] = []
    counters = db.query(models.Counter).filter(models.Counter.current_token_id.isnot(None)).all()
    for counter in counters:
        token = db.get(models.Token, counter.current_token_id)
        if not token or token.status != "serving" or not token.started_at or not token.service:
            continue
        started_at = ensure_aware(token.started_at)
        elapsed = (now - started_at).total_seconds() / 60
        over = elapsed - token.service.default_duration_minutes
        if over > 0:
            overruns.append((counter.name, over))
    overruns.sort(key=lambda item: item[1], reverse=True)
    return overruns


def get_extra_delay_minutes(db: Session, now: datetime | None = None) -> float:
    """Aggregate live overrun across all serving counters (shared computation)."""
    return sum(over for _, over in counter_overruns(db, now))


def get_confidence_minutes(db: Session, token: models.Token) -> float:
    """± uncertainty band on the arrival time.

    Built from how much recent service times for this service have varied: a
    consistent counter gives a tight band, an erratic one a wider band. The
    band grows with the number of people ahead (independent errors add in
    quadrature) and shrinks with more counters working in parallel.
    """
    durations = recent_service_durations(db, token.service)
    if len(durations) < 2:
        return 0.0
    spread = statistics.pstdev(durations)
    people = max(count_people_ahead(db, token), 1)
    active = max(count_active_counters(db), 1)
    return round(spread * (people ** 0.5) / active, 1)


def no_show_risk(db: Session, token: models.Token, now: datetime | None = None) -> int | None:
    """Likelihood (0-100) that a CALLED citizen will not show at the counter.

    Combines this office's historical no-show rate with how long the citizen has
    been called without arriving. Only meaningful while a token is `called`.
    """
    if not token or token.status != "called":
        return None
    now = now or datetime.now(timezone.utc)
    # Base rate is built only from missed vs completed visits. Voluntarily
    # cancelled tokens are a distinct status and are deliberately excluded here
    # so a citizen self-cancelling never inflates anyone's no-show risk.
    missed = db.query(models.Token).filter(models.Token.status == "missed").count()
    completed = db.query(models.Token).filter(models.Token.status == "completed").count()
    history = missed + completed
    base_rate = (missed / history) if history else 0.12  # mild prior before any history
    dwell_minutes = 0.0
    if token.called_at:
        dwell_minutes = max((now - ensure_aware(token.called_at)).total_seconds() / 60, 0.0)
    dwell_factor = min(dwell_minutes / 10, 1.0) * 0.5  # up to +50 points after ~10 min waiting
    return round(min(base_rate + dwell_factor, 0.95) * 100)


def get_counter_delays(db: Session, now: datetime | None = None) -> list[tuple[str, float]]:
    """Counters running meaningfully late (>1 min over) for display, derived from
    the same shared overrun computation the ETA math uses."""
    return [(name, over) for name, over in counter_overruns(db, now) if over > 1]


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
    service_duration = max(get_service_duration(db, token.service, now), 1.0)
    learned = min(len(recent_service_durations(db, token.service)), LEARNING_WINDOW)
    delays = get_counter_delays(db, now)
    # Displayed delay derives from the same shared overrun computation the ETA
    # math uses, so the two can never diverge.
    total_delay = get_extra_delay_minutes(db, now)

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
        from app.services import ml

        info = ml.model_info()
        if info.get("trained"):
            top = ml.top_factor() or "time of day"
            factors.append(
                f"Estimated by our service-time model (trained on {info['samples']} synthetic records that "
                f"model time-of-day and queue-load patterns, weighting {top} most): "
                f"about {round(service_duration)} min at this hour"
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

    confidence = get_confidence_minutes(db, token)
    if confidence > 0:
        factors.append(
            f"Confidence ±{round(confidence)} min, from how consistent recent service times have been"
        )

    return {
        "active_counters": active,
        "average_service_minutes": round(service_duration, 1),
        "current_delay_minutes": round(total_delay, 1),
        "confidence_minutes": confidence,
        "factors": factors,
    }


def tokens_ahead(db: Session, token: models.Token) -> list[models.Token]:
    return (
        db.query(models.Token)
        .filter(models.Token.status.in_(QUEUE_STATUSES), models.Token.id < token.id)
        .order_by(models.Token.id)
        .all()
    )


def ahead_service_duration(db: Session, token: models.Token, now: datetime | None = None) -> float:
    """Average learned service time of the tokens actually ahead in the queue.

    Time-to-clear depends on what the people in front of you are here for, not
    on your own service — a queue of quick verifications clears faster than a
    queue of licence renewals. Falls back to this token's own duration when the
    queue ahead is empty.
    """
    now = now or datetime.now(timezone.utc)
    ahead = tokens_ahead(db, token)
    durations = [
        max(get_service_duration(db, t.service, now), 1.0)
        for t in ahead
        if t.service is not None
    ]
    if durations:
        return sum(durations) / len(durations)
    # Floor to 1 min so a misconfigured/zero-duration service can't zero out
    # every wait estimate.
    return max(get_service_duration(db, token.service, now), 1.0)


def predict_token(
    db: Session, token: models.Token, now: datetime | None = None
) -> tuple[int, datetime | None, datetime | None]:
    now = now or datetime.now(timezone.utc)
    active_counters = count_active_counters(db)
    people_ahead = count_people_ahead(db, token)
    # With no counters open there is no throughput to estimate against; hand the
    # UI a paused state (null ETAs) instead of inventing a number.
    if active_counters == 0:
        return people_ahead, None, None

    # Time-to-clear uses the actual services of the tokens ahead, not just this
    # token's own duration.
    service_duration = ahead_service_duration(db, token, now)
    # Live overrun is attributed PER active counter (divided, not summed across
    # counters) so extra delay scales the same way throughput does.
    extra_delay = get_extra_delay_minutes(db, now) if token.status in ("waiting", "called") else 0
    estimated_wait = (people_ahead * service_duration + extra_delay) / active_counters
    estimated_service_time = now + timedelta(minutes=estimated_wait)
    # Recommend arriving ARRIVAL_BUFFER minutes early, but never a time in the
    # past — if the turn is sooner than the buffer, the right advice is "now".
    recommended_arrival_time = max(estimated_service_time - timedelta(minutes=ARRIVAL_BUFFER), now)
    return people_ahead, estimated_service_time, recommended_arrival_time


def recalculate_predictions(db: Session) -> None:
    now = datetime.now(timezone.utc)
    tokens = db.query(models.Token).filter(models.Token.status.in_(QUEUE_STATUSES)).order_by(models.Token.id).all()

    for token in tokens:
        _, estimated_service_time, recommended_arrival_time = predict_token(db, token, now)
        token.estimated_service_time = estimated_service_time
        token.recommended_arrival_time = recommended_arrival_time

    db.commit()
