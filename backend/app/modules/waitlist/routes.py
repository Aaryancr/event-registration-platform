from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_attendee
from app.modules.events.models import Event, EventStatus
from app.modules.registrations.models import Registration, RegistrationStatus
from app.modules.waitlist.models import WaitlistEntry, WaitlistStatus
from app.modules.waitlist.schemas import WaitlistEntryResponse
from app.modules.users.models import User

router = APIRouter(tags=["Waitlist"])


def get_waitlist_position(db: Session, event_id: int, entry_created_at, entry_id: int) -> int:
    """Calculate 1-indexed deterministic FIFO position among currently waiting entries."""
    count = (
        db.query(func.count(WaitlistEntry.id))
        .filter(
            WaitlistEntry.event_id == event_id,
            WaitlistEntry.status == WaitlistStatus.WAITING.value,
            or_(
                WaitlistEntry.created_at < entry_created_at,
                and_(
                    WaitlistEntry.created_at == entry_created_at,
                    WaitlistEntry.id <= entry_id,
                ),
            ),
        )
        .scalar()
    )
    return count or 1


@router.post(
    "/events/{event_id}/waitlist",
    response_model=WaitlistEntryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Join the waitlist for an event",
)
def join_waitlist(
    event_id: int,
    current_user: User = Depends(require_attendee),
    db: Session = Depends(get_db),
):
    """Place the authenticated attendee on the waitlist for an event."""
    event = (
        db.query(Event)
        .filter(Event.id == event_id)
        .with_for_update()
        .first()
    )
    if not event or event.status != EventStatus.PUBLISHED.value:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # Cannot join waitlist if already registered
    existing_reg = (
        db.query(Registration)
        .filter(
            Registration.event_id == event_id,
            Registration.user_id == current_user.id,
            Registration.status == RegistrationStatus.REGISTERED.value,
        )
        .first()
    )
    if existing_reg:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already registered for this event",
        )

    # Check existing waitlist entry
    existing_entry = (
        db.query(WaitlistEntry)
        .filter(
            WaitlistEntry.event_id == event_id,
            WaitlistEntry.user_id == current_user.id,
        )
        .first()
    )

    if existing_entry and existing_entry.status == WaitlistStatus.WAITING.value:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already on the waitlist for this event",
        )

    now = func.now()
    if existing_entry:
        existing_entry.status = WaitlistStatus.WAITING.value
        existing_entry.promoted_at = None
        existing_entry.created_at = now
        entry = existing_entry
    else:
        entry = WaitlistEntry(
            event_id=event.id,
            user_id=current_user.id,
            status=WaitlistStatus.WAITING.value,
            created_at=now,
        )
        db.add(entry)

    db.commit()
    db.refresh(entry)

    pos = get_waitlist_position(db, event.id, entry.created_at, entry.id)
    res = WaitlistEntryResponse.model_validate(entry)
    res.position = pos
    return res


@router.get(
    "/events/{event_id}/waitlist/mine",
    response_model=WaitlistEntryResponse,
    status_code=status.HTTP_200_OK,
    summary="View authenticated attendee's waitlist position",
)
def get_my_waitlist_entry(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve the caller's waitlist status and FIFO line position."""
    entry = (
        db.query(WaitlistEntry)
        .filter(
            WaitlistEntry.event_id == event_id,
            WaitlistEntry.user_id == current_user.id,
        )
        .first()
    )
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No waitlist entry found for this event",
        )

    pos = None
    if entry.status == WaitlistStatus.WAITING.value:
        pos = get_waitlist_position(db, event_id, entry.created_at, entry.id)

    res = WaitlistEntryResponse.model_validate(entry)
    res.position = pos
    return res


@router.delete(
    "/events/{event_id}/waitlist",
    status_code=status.HTTP_200_OK,
    summary="Leave the waitlist for an event",
)
def leave_waitlist(
    event_id: int,
    current_user: User = Depends(require_attendee),
    db: Session = Depends(get_db),
):
    """Remove caller from the waitlist."""
    entry = (
        db.query(WaitlistEntry)
        .filter(
            WaitlistEntry.event_id == event_id,
            WaitlistEntry.user_id == current_user.id,
            WaitlistEntry.status == WaitlistStatus.WAITING.value,
        )
        .with_for_update()
        .first()
    )
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active waitlist entry not found",
        )

    entry.status = WaitlistStatus.CANCELLED.value
    db.commit()
    return {"message": "Successfully left the waitlist"}
