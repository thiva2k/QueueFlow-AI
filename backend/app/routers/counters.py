from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.services.prediction import recalculate_predictions


router = APIRouter(prefix="/counters", tags=["counters"])


def get_counter_or_404(db: Session, counter_id: int) -> models.Counter:
    counter = db.get(models.Counter, counter_id)
    if not counter:
        raise HTTPException(status_code=404, detail="Counter not found")
    return counter


def counter_has_open_token(db: Session, counter: models.Counter) -> bool:
    if not counter.current_token_id:
        return False
    token = db.get(models.Token, counter.current_token_id)
    return bool(token and token.status in {"called", "serving"})


@router.get("", response_model=list[schemas.CounterRead])
def list_counters(db: Session = Depends(get_db)):
    return db.query(models.Counter).order_by(models.Counter.id).all()


@router.post("", response_model=schemas.CounterRead, status_code=status.HTTP_201_CREATED)
def create_counter(payload: schemas.CounterCreate, db: Session = Depends(get_db)):
    if payload.status not in {"active", "paused"}:
        raise HTTPException(status_code=400, detail="Counter status must be active or paused")

    counter = models.Counter(name=payload.name, status=payload.status)
    db.add(counter)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Counter name already exists") from exc
    db.refresh(counter)
    recalculate_predictions(db)
    return counter


@router.patch("/{counter_id}/pause", response_model=schemas.CounterRead)
def pause_counter(counter_id: int, db: Session = Depends(get_db)):
    counter = get_counter_or_404(db, counter_id)
    if counter_has_open_token(db, counter):
        raise HTTPException(status_code=400, detail="Clear the current token before pausing this counter")
    counter.status = "paused"
    db.commit()
    db.refresh(counter)
    recalculate_predictions(db)
    return counter


@router.patch("/{counter_id}/resume", response_model=schemas.CounterRead)
def resume_counter(counter_id: int, db: Session = Depends(get_db)):
    counter = get_counter_or_404(db, counter_id)
    counter.status = "active"
    db.commit()
    db.refresh(counter)
    recalculate_predictions(db)
    return counter
