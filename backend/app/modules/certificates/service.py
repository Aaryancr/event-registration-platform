from datetime import datetime, timezone
import hashlib
from typing import Optional
from jinja2 import Template
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.modules.certificates.models import Certificate, CertificateStatus
from app.modules.events.models import Event
from app.modules.users.models import User

CERTIFICATE_HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Certificate of Attendance</title>
    <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; text-align: center; padding: 50px; background: #fafafa; }
        .cert-container { border: 8px double #1e3a8a; padding: 40px; background: #ffffff; border-radius: 12px; max-width: 750px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        h1 { color: #1e3a8a; font-size: 32px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 2px; }
        .subtitle { font-size: 16px; color: #64748b; margin-bottom: 28px; }
        .recipient { font-size: 26px; color: #0f172a; font-weight: bold; margin: 20px 0; border-bottom: 2px solid #e2e8f0; display: inline-block; padding: 0 30px 6px; }
        .event-title { font-size: 20px; color: #2563eb; font-weight: 600; margin: 16px 0; }
        .footer { margin-top: 36px; font-size: 12px; color: #94a3b8; display: flex; justify-content: space-between; }
        .verification { font-family: monospace; font-size: 11px; color: #475569; margin-top: 15px; }
    </style>
</head>
<body>
    <div class="cert-container">
        <h1>Certificate of Attendance</h1>
        <div class="subtitle">This is proudly presented to</div>
        <div class="recipient">{{ attendee_name }}</div>
        <div>for active participation and attendance in</div>
        <div class="event-title">{{ event_title }}</div>
        <div class="footer">
            <div>Date: {{ issued_date }}</div>
            <div>Code: {{ certificate_code }}</div>
        </div>
        <div class="verification">Digital Verification Hash: {{ verification_hash }}</div>
    </div>
</body>
</html>
"""


def render_certificate_html(
    attendee_name: str,
    event_title: str,
    certificate_code: str,
    issued_date: str,
) -> str:
    """Render Jinja2 certificate HTML with cryptographic verification fingerprint."""
    template = Template(CERTIFICATE_HTML_TEMPLATE)
    raw_fingerprint = f"{attendee_name}:{event_title}:{certificate_code}:{issued_date}"
    verification_hash = hashlib.sha256(raw_fingerprint.encode("utf-8")).hexdigest()

    return template.render(
        attendee_name=attendee_name,
        event_title=event_title,
        certificate_code=certificate_code,
        issued_date=issued_date,
        verification_hash=verification_hash,
    )


def generate_certificate_background_task(
    certificate_id: int,
    simulate_failure: bool = False,
    db: Optional[Session] = None,
) -> None:
    """Asynchronous background worker execution for rendering and storing certificates.

    Note on durability vs in-process task worker:
    FastAPI BackgroundTasks run within the current ASGI process after returning the HTTP response.
    They offer low-latency execution with zero added operational cost (no external worker/queue),
    but are not durable across container restarts. For mission-critical workloads, a durable broker
    (e.g., Celery/RQ with Redis) should be introduced if multi-day durability is required.
    """
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        cert = db.query(Certificate).filter(Certificate.id == certificate_id).first()
        if not cert:
            return

        if simulate_failure:
            raise RuntimeError("Simulated certificate renderer engine failure")

        event = db.query(Event).filter(Event.id == cert.event_id).first()
        attendee = db.query(User).filter(User.id == cert.user_id).first()

        event_title = event.title if event else "Event"
        attendee_name = attendee.display_name if attendee else "Attendee"
        now = datetime.now(timezone.utc)
        issued_str = now.strftime("%B %d, %Y")

        html_content = render_certificate_html(
            attendee_name=attendee_name,
            event_title=event_title,
            certificate_code=cert.certificate_code,
            issued_date=issued_str,
        )

        cert.rendered_content = html_content
        cert.status = CertificateStatus.GENERATED.value
        cert.issued_at = now
        cert.error_message = None
        db.commit()

    except Exception as exc:
        db.rollback()
        fail_cert = db.query(Certificate).filter(Certificate.id == certificate_id).first()
        if fail_cert:
            fail_cert.status = CertificateStatus.FAILED.value
            fail_cert.error_message = str(exc)
            db.commit()
    finally:
        if close_db:
            db.close()
