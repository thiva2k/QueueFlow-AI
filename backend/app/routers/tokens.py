from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.services.prediction import (
    count_active_counters,
    count_people_ahead,
    get_average_service_duration,
    predict_token,
    recalculate_predictions,
)


router = APIRouter(tags=["tokens"])


def token_to_read(db: Session, token: models.Token) -> schemas.TokenRead:
    data = schemas.TokenRead.model_validate(token)
    data.people_ahead = count_people_ahead(db, token) if token.status in {"waiting", "called"} else 0
    return data


def get_token_or_404(db: Session, token_id: int) -> models.Token:
    token = db.get(models.Token, token_id)
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
    return token


def next_token_number(db: Session) -> str:
    next_number = db.query(models.Token).count() + 1
    return f"A-{next_number:03d}"


@router.post("/tokens", response_model=schemas.TokenRead, status_code=status.HTTP_201_CREATED)
def create_token(payload: schemas.TokenCreate, db: Session = Depends(get_db)):
    service = db.get(models.Service, payload.service_id)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    token = models.Token(
        token_number=next_token_number(db),
        citizen_name=payload.citizen_name,
        nic_or_phone=payload.nic_or_phone,
        service_id=payload.service_id,
        status="waiting",
    )
    db.add(token)
    db.commit()
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


@router.get("/tokens/{token_id}/prediction", response_model=schemas.PredictionRead)
def get_token_prediction(token_id: int, db: Session = Depends(get_db)):
    token = get_token_or_404(db, token_id)
    if token.status in {"completed", "missed"}:
        raise HTTPException(status_code=400, detail="Cannot predict a closed token")
    people_ahead, estimated_service_time, recommended_arrival_time = predict_token(db, token)
    return schemas.PredictionRead(
        token_id=token.id,
        token_number=token.token_number,
        people_ahead=people_ahead,
        estimated_service_time=estimated_service_time,
        recommended_arrival_time=recommended_arrival_time,
    )


@router.get("/tokens/{token_id}", response_model=schemas.TokenRead)
def get_token(token_id: int, db: Session = Depends(get_db)):
    return token_to_read(db, get_token_or_404(db, token_id))


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
