from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, field_serializer


def serialize_utc_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


class UTCDateTimeModel(BaseModel):
    @field_serializer(
        "created_at",
        "called_at",
        "started_at",
        "completed_at",
        "estimated_service_time",
        "recommended_arrival_time",
        check_fields=False,
    )
    def serialize_datetimes(self, value: datetime | None) -> str | None:
        return serialize_utc_datetime(value)


class ServiceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    default_duration_minutes: int = Field(gt=0)


class ServiceRead(ServiceCreate, UTCDateTimeModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class CounterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    status: str = "active"


class CounterRead(CounterCreate, UTCDateTimeModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    current_token_id: int | None
    created_at: datetime


class TokenCreate(BaseModel):
    citizen_name: str = Field(min_length=1, max_length=120)
    nic_or_phone: str = Field(min_length=1, max_length=40)
    service_id: int


class TokenRead(UTCDateTimeModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    token_number: str
    citizen_name: str
    # nic_or_phone is intentionally NOT exposed in read responses: it is
    # national-ID / phone PII and the UI never displays it. It is accepted on
    # create (TokenCreate) and stored, but never returned, preventing bulk PII
    # harvesting via token enumeration.
    service_id: int
    status: str
    created_at: datetime
    called_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    estimated_service_time: datetime | None
    recommended_arrival_time: datetime | None
    actual_duration_minutes: float | None
    people_ahead: int | None = None
    no_show_risk: int | None = None


class PredictionRead(UTCDateTimeModel):
    token_id: int
    token_number: str
    people_ahead: int
    estimated_service_time: datetime | None
    recommended_arrival_time: datetime | None
    # Explainability — the live inputs behind this recommendation.
    active_counters: int = 0
    average_service_minutes: float = 0
    current_delay_minutes: float = 0
    confidence_minutes: float = 0
    factors: list[str] = Field(default_factory=list)


class QueueStatusRead(BaseModel):
    now_serving: list[TokenRead]
    waiting: list[TokenRead]
    called: list[TokenRead]
    completed_count: int
    missed_count: int
    active_counters: int
    average_service_duration: float
    average_wait_minutes: float | None
    estimated_wait_for_last_token: float | None


class SeedSummary(BaseModel):
    services: int
    counters: int
    tokens: int


class Message(BaseModel):
    message: str
