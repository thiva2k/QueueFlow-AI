from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ServiceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    default_duration_minutes: int = Field(gt=0)


class ServiceRead(ServiceCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class CounterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    status: str = "active"


class CounterRead(CounterCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    current_token_id: int | None
    created_at: datetime


class TokenCreate(BaseModel):
    citizen_name: str = Field(min_length=1, max_length=120)
    nic_or_phone: str = Field(min_length=1, max_length=40)
    service_id: int


class TokenRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    token_number: str
    citizen_name: str
    nic_or_phone: str
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


class PredictionRead(BaseModel):
    token_id: int
    token_number: str
    people_ahead: int
    estimated_service_time: datetime | None
    recommended_arrival_time: datetime | None


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
