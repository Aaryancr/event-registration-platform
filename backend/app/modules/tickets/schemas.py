from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class TicketResponse(BaseModel):
    """Safe public representation of an event ticket including QR data URI."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    registration_id: int
    event_id: int
    user_id: int
    ticket_code: str
    status: str
    checked_in_at: Optional[datetime] = None
    created_at: datetime
    qr_code_data: Optional[str] = None


class CheckInRequest(BaseModel):
    """Payload submitted by authorized event operator during attendee check-in."""

    ticket_code: str = Field(..., min_length=10, max_length=100, description="Unguessable ticket identifier")


class CheckInResponse(BaseModel):
    """Confirmation returned upon successful ticket check-in."""

    ticket_code: str
    status: str
    checked_in_at: datetime
    event_id: int
    event_title: str
    attendee_name: str
    message: str = "Attendee successfully checked in"
