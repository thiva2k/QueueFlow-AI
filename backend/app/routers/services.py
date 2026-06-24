from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.services.prediction import recalculate_predictions


router = APIRouter(prefix="/services", tags=["services"])


@router.get("", response_model=list[schemas.ServiceRead])
def list_services(db: Session = Depends(get_db)):
    return db.query(models.Service).order_by(models.Service.id).all()


@router.post("", response_model=schemas.ServiceRead, status_code=status.HTTP_201_CREATED)
def create_service(payload: schemas.ServiceCreate, db: Session = Depends(get_db)):
    service = models.Service(
        name=payload.name,
        default_duration_minutes=payload.default_duration_minutes,
    )
    db.add(service)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Service name already exists") from exc
    db.refresh(service)
    recalculate_predictions(db)
    return service
