from datetime import datetime, timedelta, timezone
import pytest

from app.core.security import create_access_token
from app.modules.events.models import Event, EventStatus
from app.modules.registrations.models import Registration, RegistrationStatus
from app.modules.tickets.models import Ticket, TicketStatus
from app.modules.users.models import User, UserRole


def setup_ticket_fixture(client, db_session):
    now = datetime.now(timezone.utc)
    org1 = User(email="tkt_org1@example.com", display_name="Org 1", role=UserRole.ORGANIZER.value)
    org2 = User(email="tkt_org2@example.com", display_name="Org 2", role=UserRole.ORGANIZER.value)
    att1 = User(email="tkt_att1@example.com", display_name="Alice Attendee", role=UserRole.ATTENDEE.value)
    att2 = User(email="tkt_att2@example.com", display_name="Bob Attendee", role=UserRole.ATTENDEE.value)
    db_session.add_all([org1, org2, att1, att2])
    db_session.flush()

    event = Event(
        organizer_id=org1.id,
        title="Check-In Summit",
        location="Booth 1",
        starts_at=now + timedelta(days=2),
        ends_at=now + timedelta(days=3),
        capacity=20,
        status=EventStatus.PUBLISHED.value,
    )
    db_session.add(event)
    db_session.flush()

    tok_org1 = create_access_token(subject=org1.id)
    tok_org2 = create_access_token(subject=org2.id)
    tok_att1 = create_access_token(subject=att1.id)
    tok_att2 = create_access_token(subject=att2.id)

    h_org1 = {"Authorization": f"Bearer {tok_org1}"}
    h_org2 = {"Authorization": f"Bearer {tok_org2}"}
    h_att1 = {"Authorization": f"Bearer {tok_att1}"}
    h_att2 = {"Authorization": f"Bearer {tok_att2}"}

    # Att1 registers
    reg_res = client.post(f"/api/v1/events/{event.id}/registrations", headers=h_att1)
    assert reg_res.status_code == 201
    reg_id = reg_res.json()["id"]

    return event, reg_id, att1, att2, org1, org2, h_att1, h_att2, h_org1, h_org2


def test_get_ticket_with_qr_code(client, db_session):
    """Verify attendee retrieves their ticket with an unguessable code and base64 QR PNG."""
    _, reg_id, _, _, _, _, h_att1, _, _, _ = setup_ticket_fixture(client, db_session)

    res = client.get(f"/api/v1/registrations/{reg_id}/ticket", headers=h_att1)
    assert res.status_code == 200
    data = res.json()

    assert data["ticket_code"] is not None
    assert len(data["ticket_code"]) >= 32
    assert data["qr_code_data"].startswith("data:image/")


def test_ticket_ownership_authorization(client, db_session):
    """Verify other attendees cannot view tickets, but event organizers can."""
    _, reg_id, _, _, _, _, _, h_att2, h_org1, _ = setup_ticket_fixture(client, db_session)

    # Att2 cannot view Att1's ticket -> 403 Forbidden
    res_forbidden = client.get(f"/api/v1/registrations/{reg_id}/ticket", headers=h_att2)
    assert res_forbidden.status_code == 403

    # Event organizer CAN view attendee's ticket -> 200 OK
    res_organizer = client.get(f"/api/v1/registrations/{reg_id}/ticket", headers=h_org1)
    assert res_organizer.status_code == 200


def test_operator_checkin_success(client, db_session):
    """Verify authorized event organizer successfully checks in attendee."""
    _, reg_id, _, _, _, _, h_att1, _, h_org1, _ = setup_ticket_fixture(client, db_session)

    # Get ticket code
    ticket_data = client.get(f"/api/v1/registrations/{reg_id}/ticket", headers=h_att1).json()
    code = ticket_data["ticket_code"]

    # Organizer checks in attendee
    checkin_res = client.post("/api/v1/tickets/check-in", json={"ticket_code": code}, headers=h_org1)
    assert checkin_res.status_code == 200
    res_data = checkin_res.json()

    assert res_data["status"] == "used"
    assert res_data["attendee_name"] == "Alice Attendee"
    assert res_data["checked_in_at"] is not None

    # Check DB status
    ticket = db_session.query(Ticket).filter(Ticket.ticket_code == code).first()
    assert ticket.status == "used"
    assert ticket.checked_in_at is not None


def test_repeated_checkin_rejected(client, db_session):
    """Verify already-used tickets cannot be checked in again (409 Conflict)."""
    _, reg_id, _, _, _, _, h_att1, _, h_org1, _ = setup_ticket_fixture(client, db_session)

    code = client.get(f"/api/v1/registrations/{reg_id}/ticket", headers=h_att1).json()["ticket_code"]

    # First check-in succeeds
    client.post("/api/v1/tickets/check-in", json={"ticket_code": code}, headers=h_org1)

    # Second check-in returns 409 Conflict
    dup_res = client.post("/api/v1/tickets/check-in", json={"ticket_code": code}, headers=h_org1)
    assert dup_res.status_code == 409
    assert "already been checked in" in dup_res.json()["detail"].lower()


def test_unauthorized_operator_checkin_rejected(client, db_session):
    """Verify organizers of other events and attendees cannot check in tickets."""
    _, reg_id, _, _, _, _, h_att1, h_att2, _, h_org2 = setup_ticket_fixture(client, db_session)

    code = client.get(f"/api/v1/registrations/{reg_id}/ticket", headers=h_att1).json()["ticket_code"]

    # Org 2 (different organizer) cannot check in this ticket -> 403 Forbidden
    res_other_org = client.post("/api/v1/tickets/check-in", json={"ticket_code": code}, headers=h_org2)
    assert res_other_org.status_code == 403

    # Attendee cannot check in tickets -> 403 Forbidden
    res_att = client.post("/api/v1/tickets/check-in", json={"ticket_code": code}, headers=h_att2)
    assert res_att.status_code == 403
