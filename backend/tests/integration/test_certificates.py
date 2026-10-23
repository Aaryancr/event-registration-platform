from datetime import datetime, timedelta, timezone
import pytest

from app.core.security import create_access_token
from app.modules.certificates.models import Certificate, CertificateStatus
from app.modules.events.models import Event, EventStatus
from app.modules.registrations.models import Registration, RegistrationStatus
from app.modules.users.models import User, UserRole


def setup_certificate_fixture(client, db_session):
    now = datetime.now(timezone.utc)
    org1 = User(email="cert_org1@example.com", display_name="Cert Org 1", role=UserRole.ORGANIZER.value)
    org2 = User(email="cert_org2@example.com", display_name="Cert Org 2", role=UserRole.ORGANIZER.value)
    att1 = User(email="cert_att1@example.com", display_name="Grace Hopper", role=UserRole.ATTENDEE.value)
    db_session.add_all([org1, org2, att1])
    db_session.flush()

    event = Event(
        organizer_id=org1.id,
        title="Distinguished Computer Science Summit",
        location="Auditorium",
        starts_at=now + timedelta(days=1),
        ends_at=now + timedelta(days=2),
        capacity=50,
        status=EventStatus.PUBLISHED.value,
    )
    db_session.add(event)
    db_session.flush()

    tok_org1 = create_access_token(subject=org1.id)
    tok_org2 = create_access_token(subject=org2.id)
    tok_att1 = create_access_token(subject=att1.id)

    h_org1 = {"Authorization": f"Bearer {tok_org1}"}
    h_org2 = {"Authorization": f"Bearer {tok_org2}"}
    h_att1 = {"Authorization": f"Bearer {tok_att1}"}

    # Register attendee
    reg_res = client.post(f"/api/v1/events/{event.id}/registrations", headers=h_att1)
    assert reg_res.status_code == 201

    return event, att1, org1, org2, h_att1, h_org1, h_org2


def test_issue_certificates_and_background_generation(client, db_session):
    """Verify background certificate generation, rendering, and public verification."""
    event, att1, _, _, h_att1, h_org1, _ = setup_certificate_fixture(client, db_session)

    # 1. Organizer triggers certificate generation -> 202 Accepted
    issue_res = client.post(f"/api/v1/events/{event.id}/certificates/issue", headers=h_org1)
    assert issue_res.status_code == 202
    issued_data = issue_res.json()
    assert len(issued_data) == 1
    cert_id = issued_data[0]["id"]
    cert_code = issued_data[0]["certificate_code"]

    # In FastAPI TestClient, BackgroundTasks run during request execution
    # Verify DB certificate state
    cert = db_session.query(Certificate).filter(Certificate.id == cert_id).first()
    assert cert.status == "generated"
    assert cert.issued_at is not None
    assert "Grace Hopper" in cert.rendered_content
    assert "Distinguished Computer Science Summit" in cert.rendered_content

    # 2. Public verification
    verify_res = client.get(f"/api/v1/certificates/verify/{cert_code}")
    assert verify_res.status_code == 200
    v_data = verify_res.json()
    assert v_data["valid"] is True
    assert v_data["attendee_name"] == "Grace Hopper"
    assert v_data["event_title"] == "Distinguished Computer Science Summit"

    # 3. Attendee views mine
    mine_res = client.get("/api/v1/certificates/mine", headers=h_att1)
    assert mine_res.status_code == 200
    assert len(mine_res.json()) == 1

    # 4. Render HTML endpoint
    render_res = client.get(f"/api/v1/certificates/{cert_id}/render")
    assert render_res.status_code == 200
    assert "text/html" in render_res.headers["content-type"]
    assert "Certificate of Attendance" in render_res.text


def test_certificate_generation_failure(client, db_session):
    """Verify renderer failure transitions certificate to FAILED with error message."""
    event, _, _, _, _, h_org1, _ = setup_certificate_fixture(client, db_session)

    # Issue with simulate_failure=True
    issue_res = client.post(
        f"/api/v1/events/{event.id}/certificates/issue",
        json={"simulate_failure": True},
        headers=h_org1,
    )
    assert issue_res.status_code == 202
    cert_id = issue_res.json()[0]["id"]
    cert_code = issue_res.json()[0]["certificate_code"]

    # Verify certificate status is failed in DB
    cert = db_session.query(Certificate).filter(Certificate.id == cert_id).first()
    assert cert.status == "failed"
    assert "failure" in cert.error_message.lower()

    # Public verification on failed certificate returns valid: False
    v_res = client.get(f"/api/v1/certificates/verify/{cert_code}")
    assert v_res.status_code == 200
    assert v_res.json()["valid"] is False


def test_issue_certificates_unauthorized(client, db_session):
    """Verify non-organizers and organizers of other events are forbidden."""
    event, _, _, _, h_att1, _, h_org2 = setup_certificate_fixture(client, db_session)

    # Attendee cannot issue
    assert client.post(f"/api/v1/events/{event.id}/certificates/issue", headers=h_att1).status_code == 403

    # Other organizer cannot issue
    assert client.post(f"/api/v1/events/{event.id}/certificates/issue", headers=h_org2).status_code == 403
