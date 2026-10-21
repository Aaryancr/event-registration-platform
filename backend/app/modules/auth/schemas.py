from datetime import datetime
import re
from pydantic import BaseModel, ConfigDict, Field, field_validator

# Standard RFC-compliant email regex pattern
EMAIL_REGEX = re.compile(r"^[\w\.\+\-]+@[a-zA-Z0-9\.\-]+\.[a-zA-Z]{2,}$")


class UserRegisterRequest(BaseModel):
    """Payload for registering a new user account."""

    email: str = Field(
        ...,
        max_length=255,
        description="User's email address",
    )
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Password (minimum 8 characters)",
    )
    display_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Public display name",
    )

    @field_validator("email")
    @classmethod
    def validate_and_normalize_email(cls, v: str) -> str:
        clean = v.strip().lower()
        if not EMAIL_REGEX.match(clean):
            raise ValueError("Invalid email address format")
        return clean


class UserLoginRequest(BaseModel):
    """Payload for authenticating and obtaining an access token."""

    email: str = Field(..., description="Registered email address")
    password: str = Field(..., description="Account password")

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class UserResponse(BaseModel):
    """Safe public user information returned by API endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    display_name: str
    role: str
    created_at: datetime


class TokenResponse(BaseModel):
    """OAuth2-compatible Bearer token response with authenticated user details."""

    access_token: str
    token_type: str = "bearer"
    user: UserResponse
