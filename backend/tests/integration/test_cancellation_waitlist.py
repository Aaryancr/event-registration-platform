from datetime import datetime, timedelta, timezone
import pytest

from app.core.database import SessionLocal
from app.core.security import create_access_token
from app.modules.events.models import Event, EventStatus
from app.modules.registrations.models import Registration, RegistrationStatus
from app.modules.tickets.models import Ticket
from app.modules.users.models import User, UserRole
from app.modules.waitlist.models import WaitlistEntry, WaitlistStatus


def setup_event_with_capacity(client, db_session, capacity: int = 1):
    now = datetime.now(timezone.utc)
    org = User(email="wl_org@example.com", display_name="Org", role=UserRole.ORGANIZER.value)
    att1 = User(email="wl_att1@example.com", display_name="Att 1", role=UserRole.ATTENDEE.value)
    att2 = User(email="wl_att2@example.com", display_name="Att 2", role=UserRole.ATTENDEE.value)
    att3 = User(email="wl_att3@example.com", display_name="Att 3", role=UserRole.ATTENDEE.value)
    db_session.add_all([org, att1, att2, att3])
    db_session.flush()

    event = Event(
        organizer_id=org.id,
        title="Waitlist Summit",
        location="Hall C",
        starts_at=now + timedelta(days=5),
        ends_at=now + timedelta(days=6),
        capacity=capacity,
        status=EventStatus.PUBLISHED.value,
    )
    db_session.add(event)
    db_session.flush()

    tok1 = create_access_token(subject=att1.id)
    tok2 = create_access_token(subject=att2.id)
    tok3 = create_access_token(subject=att3.id)
    h1 = {"Authorization": f"Bearer {tok1}"}
    h2 = {"Authorization": f"Bearer {tok2}"}
    h3 = {"Authorization": f"Bearer {tok3}"}

    return event, att1, att2, att3, h1, h2, h3


def test_join_waitlist_and_queue_position(client, db_session):
    """Verify attendees can join waitlist and track FIFO line position."""
    event, _, att2, att3, _, h2, h3 = setup_event_with_capacity(client, db_session, capacity=1)

    # Att2 joins waitlist first
    r2 = client.post(f"/api/v1/events/{event.id}/waitlist", headers=h2)
    assert r2.status_code == 201
    assert r2.json()["position"] == 1
    assert r2.json()["status"] == "waiting"

    # Att3 joins waitlist second
    r3 = client.post(f"/api/v1/events/{event.id}/waitlist", headers=h3)
    assert r3.status_code == 201
    assert r3.json()["position"] == 2

    # Query mine
    mine2 = client.get(f"/api/v1/events/{event.id}/waitlist/mine", headers=h2)
    assert mine2.status_code == 200
    assert mine2.json()["position"] == 1


def test_join_waitlist_duplicate_rejected(client, db_session):
    """Verify duplicate waitlist entries and already-registered users are rejected."""
    event, att1, att2, _, h1, h2, _ = setup_event_with_capacity(client, db_session, capacity=1)

    # Att1 registers
    client.post(f"/api/v1/events/{event.id}/registrations", headers=h1)

    # Att1 tries to join waitlist -> 409 Conflict
    r1 = client.post(f"/api/v1/events/{event.id}/waitlist", headers=h1)
    assert r1.status_code == 409
    assert "already registered" in r1.json()["detail"].lower()

    # Att2 joins waitlist
    r2 = client.post(f"/api/v1/events/{event.id}/waitlist", headers=h2)
    assert r2.status_code == 201

    # Att2 tries to join again -> 409 Conflict
    r2_dup = client.post(f"/api/v1/events/{event.id}/waitlist", headers=h2)
    assert r2_dup.status_code == 409
    assert "already on the waitlist" in r2_dup.json()["detail"].lower()


def test_cancel_registration_promotes_waitlist(client, db_session):
    """Verify cancelling a registration automatically promotes the next waitlisted attendee."""
    event, att1, att2, _, h1, h2, _ = setup_event_with_capacity(client, db_session, capacity=1)

    # 1. Att1 registers
    client.post(f"/api/v1/events/{event.id}/registrations", headers=h1)

    # 2. Att2 joins waitlist
    client.post(f"/api/v1/events/{event.id}/waitlist", headers=h2)

    # 3. Att1 cancels registration
    cancel_res = client.post(f"/api/v1/events/{event.id}/registrations/cancel", headers=h1)
    assert cancel_res.status_code == 200
    assert cancel_res.json()["promoted"] is True
    assert cancel_res.json()["promoted_user_id"] == att2.id

    # 4. Confirm Att1 is cancelled in DB
    reg1 = db_session.query(Registration).filter(Registration.event_id == event.id, Registration.user_id == att1.id).first()
    assert reg1.status == "cancelled"

    # 5. Confirm Att2 is promoted and has a confirmed registration + ticket!
    wl2 = db_session.query(WaitlistEntry).filter(WaitlistEntry.event_id == event.id, WaitlistEntry.user_id == att2.id).first()
    assert wl2.status == "promoted"
    assert wl2.promoted_at is not None

    reg2 = db_session.query(Registration).filter(Registration.event_id == event.id, Registration.user_id == att2.id).first()
    assert reg2.status == "registered"

    ticket2 = db_session.query(Ticket).filter(Ticket.registration_id == reg2.id).first()
    assert ticket2 is not None
    assert ticket2.status == "issued"


def test_leave_waitlist(client, db_session):
    """Verify attendee can cancel/leave their waitlist spot."""
    event, _, att2, _, _, h2, _ = setup_event_with_capacity(client, db_session, capacity=1)

    client.post(f"/api/v1/events/{event.id}/waitlist", headers=h2)
    leave_res = client.delete(f"/api/v1/events/{event.id}/waitlist", headers=h2)
    assert leave_res.status_code == 200

    wl = db_session.query(WaitlistEntry).filter(WaitlistEntry.event_id == event.id, WaitlistEntry.user_id == att2.id).first()
    assert wl.status == "cancelled"
