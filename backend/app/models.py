from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Service(Base):
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    default_duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    tokens: Mapped[list["Token"]] = relationship("Token", back_populates="service")


class Counter(Base):
    __tablename__ = "counters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    current_token_id: Mapped[int | None] = mapped_column(ForeignKey("tokens.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Token(Base):
    __tablename__ = "tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    token_number: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    citizen_name: Mapped[str] = mapped_column(String(120), nullable=False)
    nic_or_phone: Mapped[str] = mapped_column(String(40), nullable=False)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="waiting", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    called_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    estimated_service_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recommended_arrival_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_duration_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)

    service: Mapped[Service] = relationship("Service", back_populates="tokens")
