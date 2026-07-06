from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.services.prediction import (
    count_active_counters,
    count_people_ahead,
    explain_prediction,
    get_average_service_duration,
    get_counter_delays,
    no_show_risk,
    predict_token,
    recalculate_predictions,
)


router = APIRouter(tags=["tokens"])


def token_to_read(db: Session, token: models.Token) -> schemas.TokenRead:
    data = schemas.TokenRead.model_validate(token)
    data.people_ahead = count_people_ahead(db, token) if token.status in {"waiting", "called"} else 0
    data.no_show_risk = no_show_risk(db, token)
    return data


def get_token_or_404(db: Session, token_id: int) -> models.Token:
    token = db.get(models.Token, token_id)
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
    return token


@router.post("/tokens", response_model=schemas.TokenRead, status_code=status.HTTP_201_CREATED)
def create_token(payload: schemas.TokenCreate, db: Session = Depends(get_db)):
    service = db.get(models.Service, payload.service_id)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    # Derive the token number from the row's own primary key so it is unique by
    # construction — immune to the old count()+1 race (duplicate numbers under
    # concurrency) and to collisions after a token is deleted.
    token = models.Token(
        token_number="",
        citizen_name=payload.citizen_name,
        nic_or_phone=payload.nic_or_phone,
        service_id=payload.service_id,
        status="waiting",
    )
    db.add(token)
    try:
        db.flush()  # assigns token.id without ending the transaction
        token.token_number = f"A-{token.id:03d}"
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Could not create token, please retry") from exc

    db.refresh(token)
    recalculate_predictions(db)
    db.refresh(token)
    return token_to_read(db, token)


@router.get("/tokens", response_model=list[schemas.TokenRead])
def list_tokens(db: Session = Depends(get_db)):
    tokens = db.query(models.Token).order_by(models.Token.id).all()
    return [token_to_read(db, token) for token in tokens]


@router.get("/tokens/by-number/{token_number}", response_model=schemas.TokenRead)
def get_token_by_number(token_number: str, db: Session = Depends(get_db)):
    token = db.query(models.Token).filter(models.Token.token_number == token_number).first()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
    return token_to_read(db, token)


@router.post("/tokens/{token_id}/cancel", response_model=schemas.TokenRead)
def cancel_token(token_id: int, db: Session = Depends(get_db)):
    """Citizen self-service cancellation (ungated).

    Only a token that is still waiting or has just been called can be cancelled.
    We set status='cancelled' and deliberately leave counter assignments
    untouched — a cancelled token simply stops being 'open', so staff can call
    the next citizen normally. Predictions are recalculated as with a miss.
    """
    token = get_token_or_404(db, token_id)
    if token.status not in {"waiting", "called"}:
        raise HTTPException(
            status_code=409,
            detail="This token can no longer be cancelled",
        )

    token.status = "cancelled"
    db.commit()
    recalculate_predictions(db)
    db.refresh(token)
    return token_to_read(db, token)


@router.get("/tokens/{token_id}/prediction", response_model=schemas.PredictionRead)
def get_token_prediction(token_id: int, db: Session = Depends(get_db)):
    token = get_token_or_404(db, token_id)
    if token.status in {"completed", "missed", "cancelled"}:
        raise HTTPException(status_code=400, detail="Cannot predict a closed token")
    people_ahead, estimated_service_time, recommended_arrival_time = predict_token(db, token)
    explanation = explain_prediction(db, token)
    return schemas.PredictionRead(
        token_id=token.id,
        token_number=token.token_number,
        people_ahead=people_ahead,
        estimated_service_time=estimated_service_time,
        recommended_arrival_time=recommended_arrival_time,
        **explanation,
    )


@router.get("/tokens/{token_id}", response_model=schemas.TokenRead)
def get_token(token_id: int, db: Session = Depends(get_db)):
    return token_to_read(db, get_token_or_404(db, token_id))


@router.get("/model/info")
def get_model_info():
    """Status of the service-time prediction model (for explainability / demos)."""
    from app.services import ml

    return ml.model_info()


@router.get("/queue/status", response_model=schemas.QueueStatusRead)
def get_queue_status(db: Session = Depends(get_db)):
    tokens = db.query(models.Token).order_by(models.Token.id).all()
    now_serving = [token_to_read(db, token) for token in tokens if token.status == "serving"]
    waiting = [token_to_read(db, token) for token in tokens if token.status == "waiting"]
    called = [token_to_read(db, token) for token in tokens if token.status == "called"]
    completed_count = sum(1 for token in tokens if token.status == "completed")
    missed_count = sum(1 for token in tokens if token.status == "missed")
    last_waiting = next((token for token in reversed(tokens) if token.status in {"waiting", "called"}), None)
    estimated_wait = None
    if last_waiting and last_waiting.estimated_service_time:
        estimated_at = last_waiting.estimated_service_time
        if estimated_at.tzinfo is None:
            estimated_at = estimated_at.replace(tzinfo=timezone.utc)
        estimated_wait = max((estimated_at - datetime.now(timezone.utc)).total_seconds() / 60, 0)

    wait_estimates = []
    now = datetime.now(timezone.utc)
    for token in tokens:
        if token.status != "waiting" or not token.estimated_service_time:
            continue
        estimated_at = token.estimated_service_time
        if estimated_at.tzinfo is None:
            estimated_at = estimated_at.replace(tzinfo=timezone.utc)
        wait_estimates.append(max((estimated_at - now).total_seconds() / 60, 0))

    average_wait = sum(wait_estimates) / len(wait_estimates) if wait_estimates else None

    return schemas.QueueStatusRead(
        now_serving=now_serving,
        waiting=waiting,
        called=called,
        completed_count=completed_count,
        missed_count=missed_count,
        active_counters=count_active_counters(db),
        average_service_duration=get_average_service_duration(db),
        average_wait_minutes=average_wait,
        estimated_wait_for_last_token=estimated_wait,
    )


@router.get("/queue/sla", response_model=schemas.SlaSummary)
def get_queue_sla(db: Session = Depends(get_db)):
    """Service-level snapshot: what share of recent visits finished on time.

    On-time = actual duration within 1.15x the service's default duration.
    Measured over the last 50 completed tokens.
    """
    completed = (
        db.query(models.Token)
        .filter(
            models.Token.status == "completed",
            models.Token.actual_duration_minutes.isnot(None),
        )
        .order_by(models.Token.completed_at.desc())
        .limit(50)
        .all()
    )
    sample_size = len(completed)

    on_time = 0
    for token in completed:
        default = token.service.default_duration_minutes if token.service else 0
        if token.actual_duration_minutes <= default * 1.15:
            on_time += 1

    on_time_percent = round(on_time / sample_size * 100, 1) if sample_size else None
    counters_behind = [name for name, _ in get_counter_delays(db)]

    if sample_size == 0:
        sla_status = "unknown"
    elif on_time_percent >= 90:
        sla_status = "good"
    elif on_time_percent >= 75:
        sla_status = "warn"
    else:
        sla_status = "behind"

    return schemas.SlaSummary(
        on_time_percent=on_time_percent,
        sample_size=sample_size,
        counters_behind=counters_behind,
        status=sla_status,
    )
