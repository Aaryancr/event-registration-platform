import concurrent.futures
from datetime import datetime, timedelta, timezone
import threading
import uuid
import pytest
from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.core.security import create_access_token
from app.main import app
from app.modules.events.models import Event, EventStatus
from app.modules.registrations.models import Registration
from app.modules.users.models import User, UserRole


def test_idempotent_registration_retry(client, db_session):
    """Verify that retrying a registration with the same Idempotency-Key returns the cached response."""
    # 1. Setup organizer and published event
    now = datetime.now(timezone.utc)
    org = User(email="idemp_org@example.com", display_name="Org", role=UserRole.ORGANIZER.value)
    att = User(email="idemp_att@example.com", display_name="Att", role=UserRole.ATTENDEE.value)
    db_session.add_all([org, att])
    db_session.flush()

    event = Event(
        organizer_id=org.id,
        title="Idempotency Summit",
        location="Hall A",
        starts_at=now + timedelta(days=2),
        ends_at=now + timedelta(days=3),
        capacity=10,
        status=EventStatus.PUBLISHED.value,
    )
    db_session.add(event)
    db_session.flush()

    token = create_access_token(subject=att.id)
    headers = {
        "Authorization": f"Bearer {token}",
        "Idempotency-Key": f"key_{uuid.uuid4()}",
    }

    # 2. First registration request -> 201 Created
    r1 = client.post(f"/api/v1/events/{event.id}/registrations", headers=headers)
    assert r1.status_code == 201
    data1 = r1.json()

    # 3. Retry with exact same Idempotency-Key -> Returns identical response and ID
    r2 = client.post(f"/api/v1/events/{event.id}/registrations", headers=headers)
    assert r2.status_code == 201
    data2 = r2.json()

    assert data1["id"] == data2["id"]
    assert data1["user_id"] == data2["user_id"]
    assert data1["event_id"] == data2["event_id"]

    # 4. Confirm only 1 registration row was created in database
    count = db_session.query(Registration).filter(
        Registration.event_id == event.id,
        Registration.user_id == att.id,
    ).count()
    assert count == 1


def test_concurrent_idempotent_requests():
    """Verify concurrent requests with the same Idempotency-Key receive 409 or cached replay."""
    db = SessionLocal()
    now = datetime.now(timezone.utc)
    test_id = int(now.timestamp() * 1000)

    org_email = f"conc_idemp_org_{test_id}@example.com"
    att_email = f"conc_idemp_att_{test_id}@example.com"

    event_id = None
    try:
        org = User(email=org_email, display_name="Org", role=UserRole.ORGANIZER.value)
        att = User(email=att_email, display_name="Att", role=UserRole.ATTENDEE.value)
        db.add_all([org, att])
        db.commit()
        db.refresh(org)
        db.refresh(att)

        event = Event(
            organizer_id=org.id,
            title=f"Concurrent Idempotency Summit {test_id}",
            location="Room B",
            starts_at=now + timedelta(days=1),
            ends_at=now + timedelta(days=2),
            capacity=10,
            status=EventStatus.PUBLISHED.value,
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        event_id = event.id

        token = create_access_token(subject=att.id)
        idemp_key = f"shared_key_{test_id}"
        db.close()

        barrier = threading.Barrier(5)

        def worker(_):
            test_client = TestClient(app)
            barrier.wait()
            res = test_client.post(
                f"/api/v1/events/{event_id}/registrations",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Idempotency-Key": idemp_key,
                },
            )
            return res.status_code, res.json()

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            results = list(executor.map(worker, range(5)))

        status_codes = [r[0] for r in results]
        # At least one request succeeded (201) or completed replay, in-flight concurrent attempts return 409
        assert 201 in status_codes
        assert all(code in (201, 409) for code in status_codes)

        # After all finish, a subsequent request with the same key MUST return 201 replay
        verify_client = TestClient(app)
        replay_res = verify_client.post(
            f"/api/v1/events/{event_id}/registrations",
            headers={
                "Authorization": f"Bearer {token}",
                "Idempotency-Key": idemp_key,
            },
        )
        assert replay_res.status_code == 201

        # Confirm exactly 1 registration row exists
        v_db = SessionLocal()
        db_count = v_db.query(Registration).filter(
            Registration.event_id == event_id,
            Registration.user_id == att.id,
        ).count()
        assert db_count == 1
        v_db.close()

    finally:
        c_db = SessionLocal()
        if event_id:
            c_db.query(Registration).filter(Registration.event_id == event_id).delete()
            c_db.query(Event).filter(Event.id == event_id).delete()
        c_db.query(User).filter(User.email.in_([org_email, att_email])).delete()
        c_db.commit()
        c_db.close()
