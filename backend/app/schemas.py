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


class TokenPublic(UTCDateTimeModel):
    """Citizen/public token shape.

    nic_or_phone is never returned. citizen_name is staff-only (TokenRead)
    so a public list cannot be enumerated for names.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    token_number: str
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


class TokenRead(TokenPublic):
    citizen_name: str


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


class QueueStatusPublic(BaseModel):
    now_serving: list[TokenPublic]
    waiting: list[TokenPublic]
    called: list[TokenPublic]
    completed_count: int
    missed_count: int
    active_counters: int
    average_service_duration: float
    average_wait_minutes: float | None
    estimated_wait_for_last_token: float | None


class QueueStatusRead(QueueStatusPublic):
    now_serving: list[TokenRead]
    waiting: list[TokenRead]
    called: list[TokenRead]


class SlaSummary(BaseModel):
    on_time_percent: float | None
    sample_size: int
    counters_behind: list[str]
    status: str  # good | warn | behind | unknown


class SeedSummary(BaseModel):
    services: int
    counters: int
    tokens: int


class Message(BaseModel):
    message: str
