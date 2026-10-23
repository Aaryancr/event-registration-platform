from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_attendee
from app.modules.events.models import Event, EventStatus
from app.modules.registrations.models import Registration, RegistrationStatus
from app.modules.registrations.schemas import (
    RegistrationCreateRequest,
    RegistrationResponse,
)
from app.modules.users.models import User

router = APIRouter()


@router.post(
    "/events/{event_id}/registrations",
    response_model=RegistrationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register for a published event",
)
def register_for_event(
    event_id: int,
    payload: Optional[RegistrationCreateRequest] = None,
    current_user: User = Depends(require_attendee),
    db: Session = Depends(get_db),
):
    """Register the authenticated attendee for a published event using row-level locking."""
    # 1. Acquire row-level exclusive lock on target event
    event = (
        db.query(Event)
        .filter(Event.id == event_id)
        .with_for_update()
        .first()
    )

    # 2. Verify event exists and is currently published
    if not event or event.status != EventStatus.PUBLISHED.value:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # 3. Check if this attendee already has a registration record
    existing_reg = (
        db.query(Registration)
        .filter(
            Registration.event_id == event_id,
            Registration.user_id == current_user.id,
        )
        .first()
    )

    if existing_reg and existing_reg.status == RegistrationStatus.REGISTERED.value:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already registered for this event",
        )

    # 4. Count active registrations while holding the event lock
    active_count = (
        db.query(func.count(Registration.id))
        .filter(
            Registration.event_id == event_id,
            Registration.status == RegistrationStatus.REGISTERED.value,
        )
        .scalar()
    )

    # 5. Verify remaining capacity
    if active_count >= event.capacity:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Event has reached maximum capacity",
        )

    # 6. Create new registration or reactivate previously cancelled registration
    if existing_reg:
        existing_reg.status = RegistrationStatus.REGISTERED.value
        registration = existing_reg
    else:
        registration = Registration(
            event_id=event.id,
            user_id=current_user.id,
            status=RegistrationStatus.REGISTERED.value,
        )
        db.add(registration)

    # 7. Commit transaction to release event row lock
    try:
        db.commit()
        db.refresh(registration)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already registered for this event",
        )
    except Exception:
        db.rollback()
        raise

    return registration


@router.get(
    "/registrations/mine",
    response_model=List[RegistrationResponse],
    status_code=status.HTTP_200_OK,
    summary="View authenticated user's registrations",
)
def list_my_registrations(
    limit: int = Query(
        default=20,
        ge=1,
        le=100,
        description="Maximum number of registrations to return (1-100)",
    ),
    offset: int = Query(
        default=0,
        ge=0,
        description="Number of registrations to skip for pagination",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all registrations belonging exclusively to the authenticated user."""
    registrations = (
        db.query(Registration)
        .options(joinedload(Registration.event))
        .filter(Registration.user_id == current_user.id)
        .order_by(Registration.created_at.desc(), Registration.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return registrations
