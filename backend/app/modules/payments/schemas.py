from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class SeatHoldCreateRequest(BaseModel):
    """Payload to request a temporary seat hold."""

    ttl_minutes: int = Field(default=10, ge=1, le=60, description="Hold expiration TTL in minutes")


class SeatHoldResponse(BaseModel):
    """Details of a temporary seat hold."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    user_id: int
    status: str
    expires_at: datetime
    created_at: datetime


class PaymentRequest(BaseModel):
    """Mock payment execution payload."""

    amount: float = Field(default=0.00, ge=0.0, description="Payment amount")
    currency: str = Field(default="USD", min_length=3, max_length=3, description="Currency code")
    payment_method: str = Field(default="mock_card", description="Mock payment method")
    simulate_failure: bool = Field(default=False, description="Simulate processor decline for testing")


class PaymentResponse(BaseModel):
    """Payment transaction receipt confirming registration and ticket issuance."""

    payment_id: int
    provider_payment_id: str
    status: str
    amount: float
    currency: str
    hold_id: Optional[int]
    registration_id: int
    ticket_code: str
    message: str = "Payment succeeded and registration confirmed"
