from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy.exc import IntegrityError

from app.modules.events.models import Event, EventStatus
from app.modules.registrations.models import Registration, RegistrationStatus
from app.modules.users.models import User


def test_create_user(db_session):
    """Verify user creation with required fields and server defaults."""
    user = User(email="alice@example.com", display_name="Alice")
    db_session.add(user)
    db_session.flush()

    assert user.id is not None
    assert user.email == "alice@example.com"
    assert user.display_name == "Alice"
    assert user.created_at is not None


def test_user_unique_email(db_session):
    """Enforce unique email constraint on users."""
    user1 = User(email="bob@example.com", display_name="Bob 1")
    db_session.add(user1)
    db_session.flush()

    user2 = User(email="bob@example.com", display_name="Bob 2")
    db_session.add(user2)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_user_default_role(db_session):
    """Verify that a new user defaults to attendee role."""
    user = User(email="default_role@example.com", display_name="Default Role User")
    db_session.add(user)
    db_session.flush()

    assert user.role == "attendee"
    assert user.is_organizer is False


def test_user_invalid_role_constraint(db_session):
    """Enforce database-level check constraint for valid roles."""
    user = User(
        email="invalid_role@example.com",
        display_name="Invalid Role User",
        role="superadmin",  # invalid role
    )
    db_session.add(user)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_create_event_with_defaults(db_session):
    """Verify event creation and default draft status."""
    organizer = User(email="organizer@example.com", display_name="Organizer")
    db_session.add(organizer)
    db_session.flush()

    now = datetime.now(timezone.utc)
    event = Event(
        organizer_id=organizer.id,
        title="Tech Summit 2026",
        description="Annual tech conference",
        location="Convention Center",
        starts_at=now + timedelta(days=7),
        ends_at=now + timedelta(days=8),
        capacity=200,
    )
    db_session.add(event)
    db_session.flush()

    assert event.id is not None
    assert event.status == "draft"
    assert event.created_at is not None
    assert event.organizer.id == organizer.id


def test_event_capacity_must_be_positive(db_session):
    """Enforce positive capacity constraint on events."""
    organizer = User(email="org_cap@example.com", display_name="Organizer")
    db_session.add(organizer)
    db_session.flush()

    now = datetime.now(timezone.utc)
    event = Event(
        organizer_id=organizer.id,
        title="Zero Capacity Meetup",
        location="Online",
        starts_at=now + timedelta(days=1),
        ends_at=now + timedelta(days=2),
        capacity=0,
    )
    db_session.add(event)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_event_time_order_constraint(db_session):
    """Enforce starts_at precedes ends_at constraint."""
    organizer = User(email="org_time@example.com", display_name="Organizer")
    db_session.add(organizer)
    db_session.flush()

    now = datetime.now(timezone.utc)
    event = Event(
        organizer_id=organizer.id,
        title="Time Inverted Event",
        location="Online",
        starts_at=now + timedelta(days=5),
        ends_at=now + timedelta(days=2),  # invalid: ends before starts
        capacity=50,
    )
    db_session.add(event)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_event_invalid_status_constraint(db_session):
    """Enforce valid event status enum values."""
    organizer = User(email="org_status@example.com", display_name="Organizer")
    db_session.add(organizer)
    db_session.flush()

    now = datetime.now(timezone.utc)
    event = Event(
        organizer_id=organizer.id,
        title="Invalid Status Event",
        location="Online",
        starts_at=now + timedelta(days=1),
        ends_at=now + timedelta(days=2),
        capacity=50,
        status="archived",  # invalid status
    )
    db_session.add(event)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_create_registration_with_defaults(db_session):
    """Verify registration creation and default registered status."""
    organizer = User(email="org_reg@example.com", display_name="Organizer")
    attendee = User(email="attendee@example.com", display_name="Attendee")
    db_session.add_all([organizer, attendee])
    db_session.flush()

    now = datetime.now(timezone.utc)
    event = Event(
        organizer_id=organizer.id,
        title="Design Workshop",
        location="Studio B",
        starts_at=now + timedelta(days=3),
        ends_at=now + timedelta(days=4),
        capacity=30,
    )
    db_session.add(event)
    db_session.flush()

    registration = Registration(event_id=event.id, user_id=attendee.id)
    db_session.add(registration)
    db_session.flush()

    assert registration.id is not None
    assert registration.status == "registered"
    assert registration.created_at is not None
    assert registration.event.id == event.id
    assert registration.user.id == attendee.id


def test_unique_registration_per_user_per_event(db_session):
    """Enforce one registration record per user per event."""
    organizer = User(email="org_dup@example.com", display_name="Organizer")
    attendee = User(email="attendee_dup@example.com", display_name="Attendee")
    db_session.add_all([organizer, attendee])
    db_session.flush()

    now = datetime.now(timezone.utc)
    event = Event(
        organizer_id=organizer.id,
        title="Exclusive Workshop",
        location="Room 1",
        starts_at=now + timedelta(days=1),
        ends_at=now + timedelta(days=2),
        capacity=10,
    )
    db_session.add(event)
    db_session.flush()

    reg1 = Registration(event_id=event.id, user_id=attendee.id)
    db_session.add(reg1)
    db_session.flush()

    reg2 = Registration(event_id=event.id, user_id=attendee.id)
    db_session.add(reg2)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_registration_invalid_status_constraint(db_session):
    """Enforce valid registration status values."""
    organizer = User(email="org_rstat@example.com", display_name="Organizer")
    attendee = User(email="attendee_rstat@example.com", display_name="Attendee")
    db_session.add_all([organizer, attendee])
    db_session.flush()

    now = datetime.now(timezone.utc)
    event = Event(
        organizer_id=organizer.id,
        title="Workshop",
        location="Online",
        starts_at=now + timedelta(days=1),
        ends_at=now + timedelta(days=2),
        capacity=10,
    )
    db_session.add(event)
    db_session.flush()

    reg = Registration(
        event_id=event.id,
        user_id=attendee.id,
        status="pending",  # invalid status
    )
    db_session.add(reg)
    with pytest.raises(IntegrityError):
        db_session.flush()
