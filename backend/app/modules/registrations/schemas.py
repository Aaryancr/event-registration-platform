from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

from app.modules.events.schemas import EventResponse


class RegistrationCreateRequest(BaseModel):
    """Optional payload for event registration requests."""

    model_config = ConfigDict(extra="ignore")


class RegistrationResponse(BaseModel):
    """Safe public representation of an event registration."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    user_id: int
    status: str
    created_at: datetime
    event: Optional[EventResponse] = None
