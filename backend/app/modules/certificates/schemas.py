from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class CertificateIssueRequest(BaseModel):
    """Payload to trigger background certificate issuance."""

    attendee_ids: Optional[List[int]] = Field(default=None, description="Optional specific attendee IDs to issue certificates for")
    simulate_failure: bool = Field(default=False, description="Simulate renderer failure for testing")


class CertificateResponse(BaseModel):
    """Representation of an attendance certificate."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    user_id: int
    registration_id: int
    certificate_code: str
    status: str
    issued_at: Optional[datetime] = None
    error_message: Optional[str] = None
    created_at: datetime


class CertificateVerifyResponse(BaseModel):
    """Public certificate verification result."""

    valid: bool
    certificate_code: str
    event_title: Optional[str] = None
    attendee_name: Optional[str] = None
    issued_at: Optional[datetime] = None
    message: str
