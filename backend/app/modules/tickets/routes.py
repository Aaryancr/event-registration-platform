from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_organizer
from app.modules.events.models import Event
from app.modules.registrations.models import Registration, RegistrationStatus
from app.modules.tickets.models import Ticket, TicketStatus
from app.modules.tickets.schemas import CheckInRequest, CheckInResponse, TicketResponse
from app.modules.tickets.service import (
    generate_qr_code_base64,
    issue_ticket_for_registration,
)
from app.modules.users.models import User

router = APIRouter(tags=["Tickets"])


@router.get(
    "/registrations/{registration_id}/ticket",
    response_model=TicketResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve digital QR ticket for a registration",
)
def get_registration_ticket(
    registration_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return digital ticket with QR code for the authenticated attendee or event organizer."""
    registration = db.query(Registration).filter(Registration.id == registration_id).first()
    if not registration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration not found",
        )

    event = db.query(Event).filter(Event.id == registration.event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # Authorization check: Caller must be the registered attendee or the event organizer
    is_owner = registration.user_id == current_user.id
    is_organizer = event.organizer_id == current_user.id
    if not (is_owner or is_organizer):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this ticket",
        )

    if registration.status != RegistrationStatus.REGISTERED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot view ticket for registration in '{registration.status}' status",
        )

    ticket = issue_ticket_for_registration(
        db,
        registration_id=registration.id,
        event_id=event.id,
        user_id=registration.user_id,
    )
    db.commit()
    db.refresh(ticket)

    qr_b64 = generate_qr_code_base64(ticket.ticket_code)
    resp = TicketResponse.model_validate(ticket)
    resp.qr_code_data = qr_b64
    return resp


@router.post(
    "/tickets/check-in",
    response_model=CheckInResponse,
    status_code=status.HTTP_200_OK,
    summary="Check in an attendee using a scanned ticket code",
)
def check_in_ticket(
    payload: CheckInRequest,
    current_user: User = Depends(require_organizer),
    db: Session = Depends(get_db),
):
    """Authenticate and check in an attendee ticket with row-level locking to prevent duplicate use."""
    ticket = (
        db.query(Ticket)
        .filter(Ticket.ticket_code == payload.ticket_code.strip())
        .with_for_update()
        .first()
    )

    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )

    event = db.query(Event).filter(Event.id == ticket.event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Associated event not found",
        )

    # Verification: Organizer must own the event they are operating check-in for
    if event.organizer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to check in tickets for this event",
        )

    # State transition checks
    if ticket.status == TicketStatus.USED.value:
        checked_time = ticket.checked_in_at.isoformat() if ticket.checked_in_at else "previously"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ticket has already been checked in ({checked_time})",
        )

    if ticket.status == TicketStatus.CANCELLED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot check in a cancelled ticket",
        )

    # Transition to USED
    now = func.now()
    ticket.status = TicketStatus.USED.value
    ticket.checked_in_at = now
    ticket.checked_in_by = current_user.id

    db.commit()
    db.refresh(ticket)

    attendee = db.query(User).filter(User.id == ticket.user_id).first()
    attendee_name = attendee.display_name if attendee else "Attendee"

    return CheckInResponse(
        ticket_code=ticket.ticket_code,
        status=ticket.status,
        checked_in_at=ticket.checked_in_at,
        event_id=event.id,
        event_title=event.title,
        attendee_name=attendee_name,
        message="Attendee successfully checked in",
    )
