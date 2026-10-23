import base64
import secrets
from sqlalchemy.orm import Session

import qrcode
import qrcode.image.svg

from app.modules.tickets.models import Ticket, TicketStatus


def generate_qr_code_base64(ticket_code: str) -> str:
    """Generate a base64 SVG data URI containing solely the unguessable ticket code.

    No external PIL/Pillow or C graphics libraries required.
    Zero attendee personal info or payment data is encoded.
    """
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=3,
        image_factory=qrcode.image.svg.SvgPathImage,
    )
    qr.add_data(ticket_code)
    qr.make(fit=True)
    svg_img = qr.make_image()
    svg_bytes = svg_img.to_string()
    encoded = base64.b64encode(svg_bytes).decode("utf-8")
    return f"data:image/svg+xml;base64,{encoded}"


def issue_ticket_for_registration(
    db: Session,
    registration_id: int,
    event_id: int,
    user_id: int,
) -> Ticket:
    """Issue a new ticket or reactivate existing ticket for a registration."""
    existing = db.query(Ticket).filter(Ticket.registration_id == registration_id).first()
    if existing:
        if existing.status == TicketStatus.CANCELLED.value:
            existing.status = TicketStatus.ISSUED.value
            existing.checked_in_at = None
            existing.checked_in_by = None
            db.flush()
        return existing

    ticket_code = secrets.token_urlsafe(32)
    ticket = Ticket(
        registration_id=registration_id,
        event_id=event_id,
        user_id=user_id,
        ticket_code=ticket_code,
        status=TicketStatus.ISSUED.value,
    )
    db.add(ticket)
    db.flush()
    return ticket
