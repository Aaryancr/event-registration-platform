import concurrent.futures
from datetime import datetime, timedelta, timezone
import threading
import pytest
from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.core.security import create_access_token
from app.main import app
from app.modules.events.models import Event, EventStatus
from app.modules.registrations.models import Registration, RegistrationStatus
from app.modules.users.models import User, UserRole


def create_user_with_role(client, db_session, email: str, role: UserRole = UserRole.ATTENDEE):
    """Helper creating a user, assigning the specified role, and returning (user_data, auth_headers)."""
    password = "SecurePassword123!"
    reg_res = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": f"User {email}"},
    )
    assert reg_res.status_code == 201
    user_data = reg_res.json()

    if role != UserRole.ATTENDEE:
        user = db_session.query(User).filter(User.id == user_data["id"]).first()
        user.role = role.value
        db_session.flush()

    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return user_data, headers


def create_published_event(client, headers, capacity: int = 100):
    """Helper creating and publishing an event."""
    now = datetime.now(timezone.utc)
    create_res = client.post(
        "/api/v1/events",
        json={
            "title": "Published Summit",
            "description": "Tech conference event",
            "location": "Convention Center",
            "starts_at": (now + timedelta(days=5)).isoformat(),
            "ends_at": (now + timedelta(days=6)).isoformat(),
            "capacity": capacity,
        },
        headers=headers,
    )
    assert create_res.status_code == 201
    event_id = create_res.json()["id"]

    patch_res = client.patch(
        f"/api/v1/events/{event_id}",
        json={"status": "published"},
        headers=headers,
    )
    assert patch_res.status_code == 200
    return patch_res.json()


def test_register_attendee_success(client, db_session):
    """Verify an authenticated attendee successfully registers for a published event."""
    _, org_headers = create_user_with_role(client, db_session, "org_reg1@example.com", UserRole.ORGANIZER)
    att_data, att_headers = create_user_with_role(client, db_session, "att_reg1@example.com", UserRole.ATTENDEE)
    event = create_published_event(client, org_headers, capacity=50)

    res = client.post(f"/api/v1/events/{event['id']}/registrations", headers=att_headers)
    assert res.status_code == 201

    data = res.json()
    assert data["id"] is not None
    assert data["event_id"] == event["id"]
    assert data["user_id"] == att_data["id"]
    assert data["status"] == "registered"
    assert data["created_at"] is not None
    assert data["event"]["title"] == "Published Summit"


def test_register_unauthenticated_rejected(client, db_session):
    """Verify unauthenticated requests are rejected with 401 Unauthorized."""
    _, org_headers = create_user_with_role(client, db_session, "org_reg2@example.com", UserRole.ORGANIZER)
    event = create_published_event(client, org_headers, capacity=50)

    res = client.post(f"/api/v1/events/{event['id']}/registrations")
    assert res.status_code == 401
    assert "not authenticated" in res.json()["detail"].lower()


def test_register_non_attendee_forbidden(client, db_session):
    """Verify organizers cannot register as attendees (403 Forbidden)."""
    _, org_headers = create_user_with_role(client, db_session, "org_reg3@example.com", UserRole.ORGANIZER)
    _, other_org_headers = create_user_with_role(client, db_session, "org_reg3b@example.com", UserRole.ORGANIZER)
    event = create_published_event(client, org_headers, capacity=50)

    res = client.post(f"/api/v1/events/{event['id']}/registrations", headers=other_org_headers)
    assert res.status_code == 403
    assert "attendee role required" in res.json()["detail"].lower()


def test_register_missing_or_unpublished_event(client, db_session):
    """Verify missing, draft, or cancelled events return 404 Not Found."""
    _, org_headers = create_user_with_role(client, db_session, "org_reg4@example.com", UserRole.ORGANIZER)
    _, att_headers = create_user_with_role(client, db_session, "att_reg4@example.com", UserRole.ATTENDEE)

    # 1. Nonexistent event
    res1 = client.post("/api/v1/events/999999/registrations", headers=att_headers)
    assert res1.status_code == 404

    # 2. Draft event
    now = datetime.now(timezone.utc)
    draft_res = client.post(
        "/api/v1/events",
        json={
            "title": "Draft Event",
            "location": "Online",
            "starts_at": (now + timedelta(days=1)).isoformat(),
            "ends_at": (now + timedelta(days=2)).isoformat(),
            "capacity": 20,
        },
        headers=org_headers,
    )
    draft_id = draft_res.json()["id"]

    res2 = client.post(f"/api/v1/events/{draft_id}/registrations", headers=att_headers)
    assert res2.status_code == 404

    # 3. Cancelled event
    client.patch(f"/api/v1/events/{draft_id}", json={"status": "cancelled"}, headers=org_headers)
    res3 = client.post(f"/api/v1/events/{draft_id}/registrations", headers=att_headers)
    assert res3.status_code == 404


def test_register_duplicate_active_rejected(client, db_session):
    """Verify duplicate active registrations return 409 Conflict."""
    _, org_headers = create_user_with_role(client, db_session, "org_reg5@example.com", UserRole.ORGANIZER)
    _, att_headers = create_user_with_role(client, db_session, "att_reg5@example.com", UserRole.ATTENDEE)
    event = create_published_event(client, org_headers, capacity=10)

    # First registration -> 201
    res1 = client.post(f"/api/v1/events/{event['id']}/registrations", headers=att_headers)
    assert res1.status_code == 201

    # Second registration -> 409 Conflict
    res2 = client.post(f"/api/v1/events/{event['id']}/registrations", headers=att_headers)
    assert res2.status_code == 409
    assert "already registered" in res2.json()["detail"].lower()


def test_register_capacity_full_rejected(client, db_session):
    """Verify registering for a full event returns 409 Conflict."""
    _, org_headers = create_user_with_role(client, db_session, "org_reg6@example.com", UserRole.ORGANIZER)
    _, att1_headers = create_user_with_role(client, db_session, "att_reg6a@example.com", UserRole.ATTENDEE)
    _, att2_headers = create_user_with_role(client, db_session, "att_reg6b@example.com", UserRole.ATTENDEE)

    # Event with capacity 1
    event = create_published_event(client, org_headers, capacity=1)

    # First attendee takes the only seat
    res1 = client.post(f"/api/v1/events/{event['id']}/registrations", headers=att1_headers)
    assert res1.status_code == 201

    # Second attendee is rejected due to capacity
    res2 = client.post(f"/api/v1/events/{event['id']}/registrations", headers=att2_headers)
    assert res2.status_code == 409
    assert "maximum capacity" in res2.json()["detail"].lower()


def test_register_client_cannot_forge_user_id(client, db_session):
    """Verify user_id is derived strictly from authentication and client user_id is ignored."""
    _, org_headers = create_user_with_role(client, db_session, "org_reg7@example.com", UserRole.ORGANIZER)
    att1_data, att1_headers = create_user_with_role(client, db_session, "att_reg7a@example.com", UserRole.ATTENDEE)
    att2_data, _ = create_user_with_role(client, db_session, "att_reg7b@example.com", UserRole.ATTENDEE)

    event = create_published_event(client, org_headers, capacity=10)

    # Malicious payload attempting to register attendee 2
    res = client.post(
        f"/api/v1/events/{event['id']}/registrations",
        json={"user_id": att2_data["id"]},
        headers=att1_headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["user_id"] == att1_data["id"]
    assert data["user_id"] != att2_data["id"]


def test_get_my_registrations(client, db_session):
    """Verify GET /api/v1/registrations/mine returns only authenticated user's registrations."""
    _, org_headers = create_user_with_role(client, db_session, "org_reg8@example.com", UserRole.ORGANIZER)
    _, att1_headers = create_user_with_role(client, db_session, "att_reg8a@example.com", UserRole.ATTENDEE)
    _, att2_headers = create_user_with_role(client, db_session, "att_reg8b@example.com", UserRole.ATTENDEE)

    event1 = create_published_event(client, org_headers, capacity=50)
    event2 = create_published_event(client, org_headers, capacity=50)

    # Att1 registers for Event 1 and Event 2
    client.post(f"/api/v1/events/{event1['id']}/registrations", headers=att1_headers)
    client.post(f"/api/v1/events/{event2['id']}/registrations", headers=att1_headers)

    # Att2 registers for Event 1 only
    client.post(f"/api/v1/events/{event1['id']}/registrations", headers=att2_headers)

    # Att1 gets mine
    mine1 = client.get("/api/v1/registrations/mine", headers=att1_headers)
    assert mine1.status_code == 200
    mine1_data = mine1.json()
    assert len(mine1_data) == 2
    event_ids = [r["event_id"] for r in mine1_data]
    assert event1["id"] in event_ids
    assert event2["id"] in event_ids
    # Event metadata is included
    assert mine1_data[0]["event"]["title"] is not None

    # Att2 gets mine
    mine2 = client.get("/api/v1/registrations/mine", headers=att2_headers)
    assert mine2.status_code == 200
    mine2_data = mine2.json()
    assert len(mine2_data) == 1
    assert mine2_data[0]["event_id"] == event1["id"]

    # Pagination test
    paged = client.get("/api/v1/registrations/mine?limit=1&offset=0", headers=att1_headers)
    assert paged.status_code == 200
    assert len(paged.json()) == 1

    # Unauthenticated rejected
    assert client.get("/api/v1/registrations/mine").status_code == 401


def test_reactivate_cancelled_registration(client, db_session):
    """Verify a cancelled registration is reactivated safely without inserting a duplicate row."""
    _, org_headers = create_user_with_role(client, db_session, "org_reg9@example.com", UserRole.ORGANIZER)
    att_data, att_headers = create_user_with_role(client, db_session, "att_reg9@example.com", UserRole.ATTENDEE)
    event = create_published_event(client, org_headers, capacity=5)

    # 1. Register attendee -> 201
    r1 = client.post(f"/api/v1/events/{event['id']}/registrations", headers=att_headers)
    assert r1.status_code == 201
    original_reg_id = r1.json()["id"]

    # 2. Simulate cancellation in DB
    reg_record = db_session.query(Registration).filter(Registration.id == original_reg_id).first()
    reg_record.status = RegistrationStatus.CANCELLED.value
    db_session.flush()

    # 3. Attendee registers again -> 201 (reactivated)
    r2 = client.post(f"/api/v1/events/{event['id']}/registrations", headers=att_headers)
    assert r2.status_code == 201
    assert r2.json()["id"] == original_reg_id
    assert r2.json()["status"] == "registered"

    # 4. Verify only one registration row exists in DB
    count = db_session.query(Registration).filter(
        Registration.event_id == event["id"],
        Registration.user_id == att_data["id"],
    ).count()
    assert count == 1


def test_reactivate_cancelled_registration_rejected_when_full(client, db_session):
    """Verify reactivating a cancelled registration is rejected with 409 if capacity was taken."""
    _, org_headers = create_user_with_role(client, db_session, "org_reg10@example.com", UserRole.ORGANIZER)
    _, att1_headers = create_user_with_role(client, db_session, "att_reg10a@example.com", UserRole.ATTENDEE)
    _, att2_headers = create_user_with_role(client, db_session, "att_reg10b@example.com", UserRole.ATTENDEE)

    # Capacity 1
    event = create_published_event(client, org_headers, capacity=1)

    # 1. Attendee 1 registers
    r1 = client.post(f"/api/v1/events/{event['id']}/registrations", headers=att1_headers)
    assert r1.status_code == 201
    reg1_id = r1.json()["id"]

    # 2. Attendee 1 cancelled
    reg1 = db_session.query(Registration).filter(Registration.id == reg1_id).first()
    reg1.status = RegistrationStatus.CANCELLED.value
    db_session.flush()

    # 3. Attendee 2 claims the 1 seat
    r2 = client.post(f"/api/v1/events/{event['id']}/registrations", headers=att2_headers)
    assert r2.status_code == 201

    # 4. Attendee 1 tries to reactivate registration, but event is full -> 409
    r3 = client.post(f"/api/v1/events/{event['id']}/registrations", headers=att1_headers)
    assert r3.status_code == 409
    assert "maximum capacity" in r3.json()["detail"].lower()

    # Verify Attendee 1 remains cancelled
    db_session.refresh(reg1)
    assert reg1.status == "cancelled"


def test_concurrency_capacity_allocation():
    """Genuine PostgreSQL concurrency test with independent database connections.

    Simulates 10 concurrent attendees competing for 3 seats. Verifies that
    exactly 3 succeed, exactly 7 receive 409 Conflict, active DB registrations == 3,
    and no duplicate rows exist.
    """
    db = SessionLocal()
    now = datetime.now(timezone.utc)

    # Unique test emails to prevent any conflict with other tests
    test_run_id = int(now.timestamp() * 1000)
    org_email = f"concur_org_{test_run_id}@example.com"
    att_emails = [f"concur_att_{test_run_id}_{i}@example.com" for i in range(10)]

    event_id = None
    try:
        # Create organizer and event in DB
        org = User(
            email=org_email,
            display_name="Concurrency Organizer",
            role=UserRole.ORGANIZER.value,
            password_hash="mock_hash",
        )
        db.add(org)
        db.commit()
        db.refresh(org)

        event = Event(
            organizer_id=org.id,
            title=f"Concurrent High Demand Summit {test_run_id}",
            location="Room 101",
            starts_at=now + timedelta(days=2),
            ends_at=now + timedelta(days=3),
            capacity=3,  # Only 3 seats
            status=EventStatus.PUBLISHED.value,
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        event_id = event.id

        # Create 10 distinct attendees
        attendees = []
        tokens = []
        for email in att_emails:
            u = User(
                email=email,
                display_name="Attendee",
                role=UserRole.ATTENDEE.value,
                password_hash="mock_hash",
            )
            db.add(u)
            attendees.append(u)
        db.commit()

        for u in attendees:
            db.refresh(u)
            tokens.append(create_access_token(subject=u.id))

        db.close()

        # Synchronize 10 concurrent requests to hit the server at the exact same moment
        barrier = threading.Barrier(10)

        def worker(token):
            # TestClient using independent session via real get_db (no overrides)
            test_client = TestClient(app)
            barrier.wait()
            res = test_client.post(
                f"/api/v1/events/{event_id}/registrations",
                headers={"Authorization": f"Bearer {token}"},
            )
            return res.status_code, res.json()

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            results = list(executor.map(worker, tokens))

        status_codes = [r[0] for r in results]
        assert status_codes.count(201) == 3, f"Expected exactly 3 successes, got {status_codes.count(201)}"
        assert status_codes.count(409) == 7, f"Expected exactly 7 conflicts, got {status_codes.count(409)}"

        # Verify in DB with a separate session
        verify_db = SessionLocal()
        db_regs = verify_db.query(Registration).filter(Registration.event_id == event_id).all()

        assert len(db_regs) == 3, f"Expected 3 DB registration records, found {len(db_regs)}"
        active_regs = [r for r in db_regs if r.status == RegistrationStatus.REGISTERED.value]
        assert len(active_regs) == 3, f"Expected 3 active registrations, found {len(active_regs)}"

        # Verify no duplicate user registrations
        registered_user_ids = [r.user_id for r in db_regs]
        assert len(registered_user_ids) == len(set(registered_user_ids)), "Duplicate user_ids found in registrations"

        verify_db.close()

    finally:
        # Isolated teardown: clean up all records created during this test
        cleanup_db = SessionLocal()
        if event_id:
            cleanup_db.query(Registration).filter(Registration.event_id == event_id).delete()
            cleanup_db.query(Event).filter(Event.id == event_id).delete()
        cleanup_db.query(User).filter(User.email.in_([org_email] + att_emails)).delete()
        cleanup_db.commit()
        cleanup_db.close()
