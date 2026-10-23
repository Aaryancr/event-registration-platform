from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.events.models import EventStatus


class EventCreateRequest(BaseModel):
    """Payload for creating a new event."""

    title: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Event title",
    )
    description: Optional[str] = Field(
        None,
        max_length=10000,
        description="Optional detailed description of the event",
    )
    location: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Event location or virtual platform URL",
    )
    starts_at: datetime = Field(
        ...,
        description="Event start timestamp (timezone-aware)",
    )
    ends_at: datetime = Field(
        ...,
        description="Event end timestamp (timezone-aware)",
    )
    capacity: int = Field(
        ...,
        gt=0,
        description="Maximum attendee capacity, must be a positive integer",
    )

    @model_validator(mode="after")
    def validate_time_order(self) -> "EventCreateRequest":
        if self.starts_at >= self.ends_at:
            raise ValueError("Event start time must precede end time.")
        return self


class EventUpdateRequest(BaseModel):
    """Payload for partially updating an existing event."""

    title: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255,
        description="Updated event title",
    )
    description: Optional[str] = Field(
        None,
        max_length=10000,
        description="Updated event description",
    )
    location: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255,
        description="Updated event location",
    )
    starts_at: Optional[datetime] = Field(
        None,
        description="Updated start timestamp (timezone-aware)",
    )
    ends_at: Optional[datetime] = Field(
        None,
        description="Updated end timestamp (timezone-aware)",
    )
    capacity: Optional[int] = Field(
        None,
        gt=0,
        description="Updated capacity, must be positive",
    )
    status: Optional[EventStatus] = Field(
        None,
        description="Updated lifecycle status (draft, published, cancelled)",
    )

    @model_validator(mode="after")
    def validate_time_order(self) -> "EventUpdateRequest":
        if self.starts_at is not None and self.ends_at is not None:
            if self.starts_at >= self.ends_at:
                raise ValueError("Event start time must precede end time.")
        return self


class EventResponse(BaseModel):
    """Safe public representation of an event."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    organizer_id: int
    title: str
    description: Optional[str]
    location: str
    starts_at: datetime
    ends_at: datetime
    capacity: int
    status: str
    created_at: datetime
