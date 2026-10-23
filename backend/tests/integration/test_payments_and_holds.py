from datetime import datetime, timedelta, timezone
import pytest

from app.core.security import create_access_token
from app.modules.events.models import Event, EventStatus
from app.modules.payments.models import (
    Payment,
    PaymentStatus,
    SeatHold,
    SeatHoldStatus,
)
from app.modules.registrations.models import Registration, RegistrationStatus
from app.modules.tickets.models import Ticket
from app.modules.users.models import User, UserRole


def setup_event_and_attendees(client, db_session, capacity=2):
    """Helper to set up an organizer, a published event, and 2 attendees."""
    now = datetime.now(timezone.utc)
    org = User(email="pay_org@example.com", display_name="Org", role=UserRole.ORGANIZER.value)
    att1 = User(email="pay_att1@example.com", display_name="Att 1", role=UserRole.ATTENDEE.value)
    att2 = User(email="pay_att2@example.com", display_name="Att 2", role=UserRole.ATTENDEE.value)
    db_session.add_all([org, att1, att2])
    db_session.flush()

    event = Event(
        organizer_id=org.id,
        title="Payment & Hold Summit",
        location="Hall 1",
        starts_at=now + timedelta(days=5),
        ends_at=now + timedelta(days=6),
        capacity=capacity,
        status=EventStatus.PUBLISHED.value,
    )
    db_session.add(event)
    db_session.flush()

    tok1 = create_access_token(subject=att1.id)
    tok2 = create_access_token(subject=att2.id)
    h1 = {"Authorization": f"Bearer {tok1}"}
    h2 = {"Authorization": f"Bearer {tok2}"}

    return event, att1, att2, h1, h2


def test_create_seat_hold_success(client, db_session):
    """Verify attendee can create temporary seat hold reserving capacity."""
    event, att1, _, h1, _ = setup_event_and_attendees(client, db_session, capacity=5)

    res = client.post(f"/api/v1/events/{event.id}/holds", json={"ttl_minutes": 15}, headers=h1)
    assert res.status_code == 201
    data = res.json()
    assert data["id"] is not None
    assert data["event_id"] == event.id
    assert data["user_id"] == att1.id
    assert data["status"] == "active"


def test_hold_capacity_enforcement(client, db_session):
    """Verify active holds decrement available capacity and block overbooking."""
    # Capacity 1
    event, _, _, h1, h2 = setup_event_and_attendees(client, db_session, capacity=1)

    # 1. Att1 creates hold -> 201
    r1 = client.post(f"/api/v1/events/{event.id}/holds", headers=h1)
    assert r1.status_code == 201

    # 2. Att2 attempts hold -> 409 Conflict
    r2 = client.post(f"/api/v1/events/{event.id}/holds", headers=h2)
    assert r2.status_code == 409
    assert "maximum capacity" in r2.json()["detail"].lower()

    # 3. Att2 attempts direct registration -> 409 Conflict (hold holds the seat!)
    r3 = client.post(f"/api/v1/events/{event.id}/registrations", headers=h2)
    assert r3.status_code == 409
    assert "maximum capacity" in r3.json()["detail"].lower()


def test_pay_seat_hold_success(client, db_session):
    """Verify successful payment converts hold, confirms registration, and issues ticket."""
    event, att1, _, h1, _ = setup_event_and_attendees(client, db_session, capacity=2)

    hold_res = client.post(f"/api/v1/events/{event.id}/holds", headers=h1)
    assert hold_res.status_code == 201
    hold_id = hold_res.json()["id"]

    # Pay for hold
    pay_res = client.post(
        f"/api/v1/holds/{hold_id}/pay",
        json={"amount": 49.99, "currency": "USD", "simulate_failure": False},
        headers={**h1, "Idempotency-Key": "pay_test_key_1"},
    )
    assert pay_res.status_code == 200
    pay_data = pay_res.json()

    assert pay_data["status"] == "succeeded"
    assert pay_data["amount"] == 49.99
    assert pay_data["hold_id"] == hold_id
    assert pay_data["ticket_code"] is not None

    # Check DB models
    hold = db_session.query(SeatHold).filter(SeatHold.id == hold_id).first()
    assert hold.status == "converted"

    reg = db_session.query(Registration).filter(Registration.id == pay_data["registration_id"]).first()
    assert reg.status == "registered"

    ticket = db_session.query(Ticket).filter(Ticket.ticket_code == pay_data["ticket_code"]).first()
    assert ticket.status == "issued"


def test_pay_seat_hold_simulated_failure(client, db_session):
    """Verify simulated payment failure records failed attempt without consuming seat."""
    event, _, _, h1, _ = setup_event_and_attendees(client, db_session, capacity=2)

    hold_res = client.post(f"/api/v1/events/{event.id}/holds", headers=h1)
    hold_id = hold_res.json()["id"]

    fail_res = client.post(
        f"/api/v1/holds/{hold_id}/pay",
        json={"amount": 49.99, "currency": "USD", "simulate_failure": True},
        headers=h1,
    )
    assert fail_res.status_code == 402
    assert "declined" in fail_res.json()["detail"].lower()

    # Hold is still active so attendee can retry
    hold = db_session.query(SeatHold).filter(SeatHold.id == hold_id).first()
    assert hold.status == "active"


def test_expired_seat_hold_releases_capacity(client, db_session):
    """Verify expired hold cannot be paid and capacity is released for other users."""
    # Capacity 1
    event, _, _, h1, h2 = setup_event_and_attendees(client, db_session, capacity=1)

    hold_res = client.post(f"/api/v1/events/{event.id}/holds", headers=h1)
    hold_id = hold_res.json()["id"]

    # Simulate hold expiration in DB
    hold = db_session.query(SeatHold).filter(SeatHold.id == hold_id).first()
    hold.expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    db_session.flush()

    # Attempt to pay expired hold -> 400
    pay_res = client.post(f"/api/v1/holds/{hold_id}/pay", json={"amount": 25.0}, headers=h1)
    assert pay_res.status_code == 400
    assert "expired" in pay_res.json()["detail"].lower()

    # Another attendee can now take the seat!
    r2 = client.post(f"/api/v1/events/{event.id}/registrations", headers=h2)
    assert r2.status_code == 201


def test_cancel_seat_hold(client, db_session):
    """Verify attendee can explicitly cancel a hold."""
    event, _, _, h1, _ = setup_event_and_attendees(client, db_session, capacity=2)

    hold_res = client.post(f"/api/v1/events/{event.id}/holds", headers=h1)
    hold_id = hold_res.json()["id"]

    cancel_res = client.post(f"/api/v1/holds/{hold_id}/cancel", headers=h1)
    assert cancel_res.status_code == 200

    hold = db_session.query(SeatHold).filter(SeatHold.id == hold_id).first()
    assert hold.status == "cancelled"


def test_pay_other_user_hold_forbidden(client, db_session):
    """Verify attendee cannot pay for another user's hold."""
    event, _, _, h1, h2 = setup_event_and_attendees(client, db_session, capacity=2)

    hold_res = client.post(f"/api/v1/events/{event.id}/holds", headers=h1)
    hold_id = hold_res.json()["id"]

    # Att2 attempts to pay for Att1's hold
    pay_res = client.post(f"/api/v1/holds/{hold_id}/pay", json={"amount": 10.0}, headers=h2)
    assert pay_res.status_code == 403
