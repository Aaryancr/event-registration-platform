from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class WaitlistEntryResponse(BaseModel):
    """Details of an attendee waitlist placement."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    user_id: int
    status: str
    position: Optional[int] = None
    promoted_at: Optional[datetime] = None
    created_at: datetime
