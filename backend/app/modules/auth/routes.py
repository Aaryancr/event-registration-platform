from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_organizer
from app.core.security import create_access_token, hash_password, verify_password
from app.modules.auth.schemas import (
    TokenResponse,
    UserLoginRequest,
    UserRegisterRequest,
    UserResponse,
)
from app.modules.users.models import User, UserRole

router = APIRouter()


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
def register(payload: UserRegisterRequest, db: Session = Depends(get_db)):
    """Register a new attendee account. Email is normalized to lowercase."""
    normalized_email = payload.email.strip().lower()

    # Check for existing account with the same email
    existing_user = (
        db.query(User).filter(func.lower(User.email) == normalized_email).first()
    )
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists",
        )

    # Public registration strictly defaults to ATTENDEE role
    hashed_pwd = hash_password(payload.password)
    user = User(
        email=normalized_email,
        display_name=payload.display_name.strip(),
        password_hash=hashed_pwd,
        role=UserRole.ATTENDEE.value,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return user


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate and obtain JWT access token",
)
def login(payload: UserLoginRequest, db: Session = Depends(get_db)):
    """Verify credentials and return a signed JWT Bearer access token."""
    normalized_email = payload.email.strip().lower()

    user = db.query(User).filter(func.lower(User.email) == normalized_email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(subject=str(user.id))

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.get(
    "/me",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve current authenticated user profile",
)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the profile of the authenticated user identified by the Bearer token."""
    return current_user


@router.get(
    "/test-organizer-only",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify organizer role authorization",
)
def test_organizer_only(current_user: User = Depends(require_organizer)):
    """Demonstration / verification endpoint accessible only by organizers."""
    return current_user
