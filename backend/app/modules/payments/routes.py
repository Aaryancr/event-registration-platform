from datetime import datetime, timedelta, timezone
import secrets
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_attendee
from app.modules.events.models import Event, EventStatus
from app.modules.idempotency.service import (
    check_and_start_idempotency,
    fail_idempotency,
    finish_idempotency,
)
from app.modules.payments.models import (
    Payment,
    PaymentStatus,
    SeatHold,
    SeatHoldStatus,
)
from app.modules.payments.schemas import (
    PaymentRequest,
    PaymentResponse,
    SeatHoldCreateRequest,
    SeatHoldResponse,
)
from app.modules.registrations.models import Registration, RegistrationStatus
from app.modules.tickets.service import issue_ticket_for_registration
from app.modules.users.models import User

router = APIRouter(tags=["Payments & Holds"])


@router.post(
    "/events/{event_id}/holds",
    response_model=SeatHoldResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a temporary seat hold reserving capacity",
)
def create_seat_hold(
    event_id: int,
    payload: Optional[SeatHoldCreateRequest] = None,
    current_user: User = Depends(require_attendee),
    db: Session = Depends(get_db),
):
    """Acquire a temporary hold on event capacity. Active holds decrement available seats."""
    ttl = payload.ttl_minutes if payload else 10

    # 1. Row-lock target event to serialize capacity evaluations
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

    # 2. Check if user already holds an active seat or has registered
    now = datetime.now(timezone.utc)
    existing_hold = (
        db.query(SeatHold)
        .filter(
            SeatHold.event_id == event_id,
            SeatHold.user_id == current_user.id,
            SeatHold.status == SeatHoldStatus.ACTIVE.value,
            SeatHold.expires_at > now,
        )
        .first()
    )
    if existing_hold:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have an active hold for this event",
        )

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
            detail="User is already registered for this event",
        )

    # 3. Calculate currently consumed seats (confirmed registrations + active unexpired holds)
    active_reg_count = (
        db.query(func.count(Registration.id))
        .filter(
            Registration.event_id == event_id,
            Registration.status == RegistrationStatus.REGISTERED.value,
        )
        .scalar()
        or 0
    )

    active_hold_count = (
        db.query(func.count(SeatHold.id))
        .filter(
            SeatHold.event_id == event_id,
            SeatHold.status == SeatHoldStatus.ACTIVE.value,
            SeatHold.expires_at > now,
        )
        .scalar()
        or 0
    )

    if active_reg_count + active_hold_count >= event.capacity:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Event has reached maximum capacity. No seats available for hold.",
        )

    # 4. Insert new seat hold with expiration timestamp
    hold = SeatHold(
        event_id=event.id,
        user_id=current_user.id,
        status=SeatHoldStatus.ACTIVE.value,
        expires_at=now + timedelta(minutes=ttl),
    )
    db.add(hold)
    db.commit()
    db.refresh(hold)
    return hold


@router.post(
    "/holds/{hold_id}/pay",
    response_model=PaymentResponse,
    status_code=status.HTTP_200_OK,
    summary="Process mock payment for a held seat with idempotency support",
)
def pay_seat_hold(
    hold_id: int,
    payload: PaymentRequest,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    current_user: User = Depends(require_attendee),
    db: Session = Depends(get_db),
):
    """Execute mock payment for an active hold. Releases seat if hold has expired."""
    endpoint_path = f"/api/v1/holds/{hold_id}/pay"

    # Idempotency check
    idemp_record, cached_response = check_and_start_idempotency(
        db,
        user_id=current_user.id,
        endpoint=endpoint_path,
        idempotency_key=idempotency_key,
    )
    if cached_response is not None:
        return cached_response[1]

    # Lock the hold record
    hold = (
        db.query(SeatHold)
        .filter(SeatHold.id == hold_id)
        .with_for_update()
        .first()
    )
    if not hold:
        fail_idempotency(db, idemp_record, 404, "Seat hold not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Seat hold not found",
        )

    if hold.user_id != current_user.id:
        fail_idempotency(db, idemp_record, 403, "Permission denied")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to pay for this hold",
        )

    # Validate state transition
    if hold.status != SeatHoldStatus.ACTIVE.value:
        fail_idempotency(db, idemp_record, 400, f"Cannot pay for hold in '{hold.status}' status")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot pay for hold in '{hold.status}' status",
        )

    now = datetime.now(timezone.utc)
    if hold.expires_at <= now:
        # Hold expired! Update status and immediately release seat
        hold.status = SeatHoldStatus.EXPIRED.value
        db.commit()
        fail_idempotency(db, idemp_record, 400, "Seat hold has expired. Capacity released.")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Seat hold has expired. Capacity released.",
        )

    # Simulate payment failure if requested
    if payload.simulate_failure:
        failed_pay = Payment(
            event_id=hold.event_id,
            user_id=current_user.id,
            hold_id=hold.id,
            amount=payload.amount,
            currency=payload.currency,
            status=PaymentStatus.FAILED.value,
            idempotency_key=idempotency_key,
            provider_payment_id=f"pay_mock_failed_{secrets.token_hex(8)}",
        )
        db.add(failed_pay)
        db.commit()
        fail_idempotency(db, idemp_record, 402, "Payment declined by payment processor")
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Payment declined by payment processor. You may retry before hold expires.",
        )

    # Payment succeeded: Convert hold, create registration, and issue ticket
    hold.status = SeatHoldStatus.CONVERTED.value
    provider_id = f"pay_mock_succ_{secrets.token_hex(12)}"

    payment = Payment(
        event_id=hold.event_id,
        user_id=current_user.id,
        hold_id=hold.id,
        amount=payload.amount,
        currency=payload.currency,
        status=PaymentStatus.SUCCEEDED.value,
        idempotency_key=idempotency_key,
        provider_payment_id=provider_id,
    )
    db.add(payment)

    # Confirm registration
    reg = (
        db.query(Registration)
        .filter(
            Registration.event_id == hold.event_id,
            Registration.user_id == current_user.id,
        )
        .first()
    )
    if reg:
        reg.status = RegistrationStatus.REGISTERED.value
    else:
        reg = Registration(
            event_id=hold.event_id,
            user_id=current_user.id,
            status=RegistrationStatus.REGISTERED.value,
        )
        db.add(reg)
    db.flush()

    # Issue unguessable QR ticket
    ticket = issue_ticket_for_registration(
        db,
        registration_id=reg.id,
        event_id=hold.event_id,
        user_id=current_user.id,
    )

    db.commit()
    db.refresh(payment)
    db.refresh(reg)
    db.refresh(ticket)

    response_data = PaymentResponse(
        payment_id=payment.id,
        provider_payment_id=payment.provider_payment_id,
        status=payment.status,
        amount=float(payment.amount),
        currency=payment.currency,
        hold_id=hold.id,
        registration_id=reg.id,
        ticket_code=ticket.ticket_code,
        message="Payment succeeded and registration confirmed",
    )

    finish_idempotency(db, idemp_record, 200, response_data.model_dump())
    return response_data


@router.post(
    "/holds/{hold_id}/cancel",
    status_code=status.HTTP_200_OK,
    summary="Cancel a temporary seat hold and release capacity immediately",
)
def cancel_seat_hold(
    hold_id: int,
    current_user: User = Depends(require_attendee),
    db: Session = Depends(get_db),
):
    """Explicitly release held capacity before expiration."""
    hold = (
        db.query(SeatHold)
        .filter(SeatHold.id == hold_id)
        .with_for_update()
        .first()
    )
    if not hold:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Seat hold not found",
        )

    if hold.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to cancel this hold",
        )

    if hold.status != SeatHoldStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel hold in '{hold.status}' status",
        )

    hold.status = SeatHoldStatus.CANCELLED.value
    db.commit()
    return {"message": "Seat hold cancelled and capacity released"}


@router.get(
    "/holds/mine",
    response_model=List[SeatHoldResponse],
    status_code=status.HTTP_200_OK,
    summary="View authenticated attendee's seat holds",
)
def list_my_seat_holds(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all seat holds belonging to the authenticated attendee."""
    holds = (
        db.query(SeatHold)
        .filter(SeatHold.user_id == current_user.id)
        .order_by(SeatHold.created_at.desc(), SeatHold.id.desc())
        .all()
    )
    return holds


@router.post(
    "/holds/cleanup-expired",
    status_code=status.HTTP_200_OK,
    summary="Sweep and transition expired seat holds",
)
def cleanup_expired_holds(
    db: Session = Depends(get_db),
):
    """Maintenance endpoint to sweep and update active holds that have surpassed their TTL."""
    now = datetime.now(timezone.utc)
    count = (
        db.query(SeatHold)
        .filter(
            SeatHold.status == SeatHoldStatus.ACTIVE.value,
            SeatHold.expires_at <= now,
        )
        .update({SeatHold.status: SeatHoldStatus.EXPIRED.value}, synchronize_session=False)
    )
    db.commit()
    return {"message": f"Successfully marked {count} expired seat holds", "released_count": count}
