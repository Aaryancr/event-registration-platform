from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_attendee
from app.modules.events.models import Event, EventStatus
from app.modules.idempotency.service import (
    check_and_start_idempotency,
    fail_idempotency,
    finish_idempotency,
)
from app.modules.payments.models import SeatHold, SeatHoldStatus
from app.modules.registrations.models import Registration, RegistrationStatus
from app.modules.registrations.schemas import (
    RegistrationCreateRequest,
    RegistrationResponse,
)
from app.modules.tickets.models import Ticket, TicketStatus
from app.modules.tickets.service import issue_ticket_for_registration
from app.modules.users.models import User
from app.modules.waitlist.models import WaitlistEntry, WaitlistStatus

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
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    current_user: User = Depends(require_attendee),
    db: Session = Depends(get_db),
):
    """Register the authenticated attendee for a published event using row-level locking."""
    endpoint_path = f"/api/v1/events/{event_id}/registrations"

    # Idempotency key handling
    idemp_rec, cached = check_and_start_idempotency(
        db,
        user_id=current_user.id,
        endpoint=endpoint_path,
        idempotency_key=idempotency_key,
    )
    if cached is not None:
        return cached[1]

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
        fail_idempotency(db, idemp_rec, 404, "Event not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # 3. Check if this attendee already has an active registration record
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
        fail_idempotency(db, idemp_rec, 409, "User is already registered for this event")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already registered for this event",
        )

    # 4. Count active registrations and active holds while holding the event lock
    active_count = (
        db.query(func.count(Registration.id))
        .filter(
            Registration.event_id == event_id,
            Registration.status == RegistrationStatus.REGISTERED.value,
        )
        .scalar()
        or 0
    )

    now = datetime.now(timezone.utc)
    active_holds = (
        db.query(func.count(SeatHold.id))
        .filter(
            SeatHold.event_id == event_id,
            SeatHold.status == SeatHoldStatus.ACTIVE.value,
            SeatHold.expires_at > now,
        )
        .scalar()
        or 0
    )

    # 5. Verify remaining capacity
    if active_count + active_holds >= event.capacity:
        db.rollback()
        fail_idempotency(db, idemp_rec, 409, "Event has reached maximum capacity")
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
    db.flush()

    # Automatically issue digital ticket
    issue_ticket_for_registration(
        db,
        registration_id=registration.id,
        event_id=event.id,
        user_id=current_user.id,
    )

    # 7. Commit transaction to release event row lock
    try:
        db.commit()
        db.refresh(registration)
    except IntegrityError:
        db.rollback()
        fail_idempotency(db, idemp_rec, 409, "User is already registered for this event")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already registered for this event",
        )
    except Exception:
        db.rollback()
        fail_idempotency(db, idemp_rec, 500, "Registration failed")
        raise

    response_model = RegistrationResponse.model_validate(registration)
    finish_idempotency(db, idemp_rec, 201, response_model.model_dump())
    return registration


@router.post(
    "/events/{event_id}/registrations/cancel",
    status_code=status.HTTP_200_OK,
    summary="Cancel a registration and promote next waitlist attendee",
)
def cancel_registration(
    event_id: int,
    current_user: User = Depends(require_attendee),
    db: Session = Depends(get_db),
):
    """Cancel confirmed registration, release ticket, and promote top waitlisted attendee."""
    # 1. Lock event row
    event = (
        db.query(Event)
        .filter(Event.id == event_id)
        .with_for_update()
        .first()
    )
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # 2. Lock caller's registration
    reg = (
        db.query(Registration)
        .filter(
            Registration.event_id == event_id,
            Registration.user_id == current_user.id,
            Registration.status == RegistrationStatus.REGISTERED.value,
        )
        .with_for_update()
        .first()
    )
    if not reg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active registration not found for this event",
        )

    # 3. Transition registration and ticket to CANCELLED
    reg.status = RegistrationStatus.CANCELLED.value
    ticket = db.query(Ticket).filter(Ticket.registration_id == reg.id).first()
    if ticket:
        ticket.status = TicketStatus.CANCELLED.value
    db.flush()

    # 4. Check waitlist for promotional candidate
    next_waiting = (
        db.query(WaitlistEntry)
        .filter(
            WaitlistEntry.event_id == event.id,
            WaitlistEntry.status == WaitlistStatus.WAITING.value,
        )
        .order_by(WaitlistEntry.created_at.asc(), WaitlistEntry.id.asc())
        .with_for_update()
        .first()
    )

    promoted_user_id = None
    if next_waiting:
        now = datetime.now(timezone.utc)
        cur_active_regs = (
            db.query(func.count(Registration.id))
            .filter(
                Registration.event_id == event.id,
                Registration.status == RegistrationStatus.REGISTERED.value,
            )
            .scalar()
            or 0
        )
        cur_active_holds = (
            db.query(func.count(SeatHold.id))
            .filter(
                SeatHold.event_id == event.id,
                SeatHold.status == SeatHoldStatus.ACTIVE.value,
                SeatHold.expires_at > now,
            )
            .scalar()
            or 0
        )

        if cur_active_regs + cur_active_holds < event.capacity:
            next_waiting.status = WaitlistStatus.PROMOTED.value
            next_waiting.promoted_at = now
            promoted_user_id = next_waiting.user_id

            # Create or reactivate registration for promoted attendee
            prom_reg = (
                db.query(Registration)
                .filter(
                    Registration.event_id == event.id,
                    Registration.user_id == next_waiting.user_id,
                )
                .first()
            )
            if prom_reg:
                prom_reg.status = RegistrationStatus.REGISTERED.value
            else:
                prom_reg = Registration(
                    event_id=event.id,
                    user_id=next_waiting.user_id,
                    status=RegistrationStatus.REGISTERED.value,
                )
                db.add(prom_reg)
            db.flush()

            # Issue ticket for promoted attendee
            issue_ticket_for_registration(
                db,
                registration_id=prom_reg.id,
                event_id=event.id,
                user_id=next_waiting.user_id,
            )

    db.commit()
    return {
        "message": "Registration successfully cancelled",
        "promoted": promoted_user_id is not None,
        "promoted_user_id": promoted_user_id,
    }


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
