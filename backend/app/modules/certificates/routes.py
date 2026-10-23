import secrets
from typing import List, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_organizer
from app.modules.certificates.models import Certificate, CertificateStatus
from app.modules.certificates.schemas import (
    CertificateIssueRequest,
    CertificateResponse,
    CertificateVerifyResponse,
)
from app.modules.certificates.service import generate_certificate_background_task
from app.modules.events.models import Event
from app.modules.registrations.models import Registration, RegistrationStatus
from app.modules.tickets.models import Ticket, TicketStatus
from app.modules.users.models import User

router = APIRouter(tags=["Certificates"])


@router.post(
    "/events/{event_id}/certificates/issue",
    response_model=List[CertificateResponse],
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger asynchronous certificate generation for event attendees",
)
def issue_certificates(
    event_id: int,
    background_tasks: BackgroundTasks,
    payload: Optional[CertificateIssueRequest] = None,
    current_user: User = Depends(require_organizer),
    db: Session = Depends(get_db),
):
    """Enqueues asynchronous certificate rendering for checked-in attendees."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    if event.organizer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to issue certificates for this event",
        )

    # Find candidate registrations (attendees with used tickets or confirmed registrations)
    query = (
        db.query(Registration)
        .filter(
            Registration.event_id == event_id,
            Registration.status == RegistrationStatus.REGISTERED.value,
        )
    )

    if payload and payload.attendee_ids:
        query = query.filter(Registration.user_id.in_(payload.attendee_ids))

    registrations = query.all()
    if not registrations:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No eligible attendee registrations found to receive certificates",
        )

    simulate_fail = payload.simulate_failure if payload else False
    created_certs: List[Certificate] = []

    for reg in registrations:
        existing = (
            db.query(Certificate)
            .filter(
                Certificate.event_id == event_id,
                Certificate.user_id == reg.user_id,
            )
            .first()
        )
        if existing:
            cert = existing
            cert.status = CertificateStatus.PENDING.value
            cert.error_message = None
        else:
            cert = Certificate(
                event_id=event_id,
                user_id=reg.user_id,
                registration_id=reg.id,
                certificate_code=secrets.token_urlsafe(24),
                status=CertificateStatus.PENDING.value,
            )
            db.add(cert)
            db.flush()

        created_certs.append(cert)
        # Enqueue background rendering task
        background_tasks.add_task(
            generate_certificate_background_task,
            certificate_id=cert.id,
            simulate_failure=simulate_fail,
            db=db,
        )

    db.commit()
    for c in created_certs:
        db.refresh(c)

    return created_certs


@router.get(
    "/certificates/mine",
    response_model=List[CertificateResponse],
    status_code=status.HTTP_200_OK,
    summary="View authenticated attendee's certificates",
)
def list_my_certificates(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve all certificates issued to the authenticated user."""
    certs = (
        db.query(Certificate)
        .filter(Certificate.user_id == current_user.id)
        .order_by(Certificate.created_at.desc())
        .all()
    )
    return certs


@router.get(
    "/certificates/verify/{certificate_code}",
    response_model=CertificateVerifyResponse,
    status_code=status.HTTP_200_OK,
    summary="Publicly verify authenticity of an attendance certificate",
)
def verify_certificate(
    certificate_code: str,
    db: Session = Depends(get_db),
):
    """Public certificate verification endpoint requiring no authentication."""
    cert = (
        db.query(Certificate)
        .filter(Certificate.certificate_code == certificate_code.strip())
        .first()
    )

    if not cert or cert.status != CertificateStatus.GENERATED.value:
        return CertificateVerifyResponse(
            valid=False,
            certificate_code=certificate_code,
            message="Certificate is invalid, expired, or has not completed generation",
        )

    event = db.query(Event).filter(Event.id == cert.event_id).first()
    attendee = db.query(User).filter(User.id == cert.user_id).first()

    return CertificateVerifyResponse(
        valid=True,
        certificate_code=cert.certificate_code,
        event_title=event.title if event else "Event",
        attendee_name=attendee.display_name if attendee else "Attendee",
        issued_at=cert.issued_at,
        message="Certificate verified successfully",
    )


@router.get(
    "/certificates/{certificate_id}/render",
    status_code=status.HTTP_200_OK,
    summary="Render certificate HTML document",
)
def render_certificate(
    certificate_id: int,
    db: Session = Depends(get_db),
):
    """Return rendered HTML certificate representation."""
    cert = db.query(Certificate).filter(Certificate.id == certificate_id).first()
    if not cert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate not found",
        )

    if cert.status != CertificateStatus.GENERATED.value or not cert.rendered_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Certificate is in '{cert.status}' state and has not been rendered",
        )

    return Response(content=cert.rendered_content, media_type="text/html")
