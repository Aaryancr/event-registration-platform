from datetime import datetime, timedelta, timezone
import pytest

from app.core.security import create_access_token
from app.modules.events.models import Event, EventStatus
from app.modules.users.models import User, UserRole


def create_authenticated_user(client, db_session, email: str, role: UserRole = UserRole.ATTENDEE):
    """Helper to create a user, optionally promote to organizer, and return (user, auth_header)."""
    password = "SecurePassword123!"
    reg_res = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": f"User {email}"},
    )
    assert reg_res.status_code == 201
    user_data = reg_res.json()

    if role == UserRole.ORGANIZER:
        user = db_session.query(User).filter(User.id == user_data["id"]).first()
        user.role = UserRole.ORGANIZER.value
        db_session.flush()

    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return user_data, headers


def test_create_event_organizer_success(client, db_session):
    """Verify an organizer can create an event, defaulting to draft status with organizer_id derived from auth."""
    organizer_data, headers = create_authenticated_user(
        client, db_session, "organizer1@example.com", role=UserRole.ORGANIZER
    )

    now = datetime.now(timezone.utc)
    payload = {
        "title": "Cloud Architecture Summit",
        "description": "Deep dive into distributed systems",
        "location": "Moscone Center, San Francisco",
        "starts_at": (now + timedelta(days=10)).isoformat(),
        "ends_at": (now + timedelta(days=11)).isoformat(),
        "capacity": 500,
        "organizer_id": 99999,  # Malicious attempt to forge organizer ID
    }

    res = client.post("/api/v1/events", json=payload, headers=headers)
    assert res.status_code == 201

    data = res.json()
    assert data["id"] is not None
    assert data["title"] == "Cloud Architecture Summit"
    assert data["description"] == "Deep dive into distributed systems"
    assert data["location"] == "Moscone Center, San Francisco"
    assert data["capacity"] == 500
    assert data["status"] == "draft"  # Default status must be draft
    # Critical: organizer_id must match authenticated user, not forged value
    assert data["organizer_id"] == organizer_data["id"]
    assert data["organizer_id"] != 99999


def test_create_event_attendee_forbidden(client, db_session):
    """Verify an attendee account receives 403 Forbidden when attempting to create an event."""
    _, headers = create_authenticated_user(
        client, db_session, "attendee1@example.com", role=UserRole.ATTENDEE
    )

    now = datetime.now(timezone.utc)
    payload = {
        "title": "Unauthorized Event",
        "location": "Online",
        "starts_at": (now + timedelta(days=5)).isoformat(),
        "ends_at": (now + timedelta(days=6)).isoformat(),
        "capacity": 50,
    }

    res = client.post("/api/v1/events", json=payload, headers=headers)
    assert res.status_code == 403
    assert "organizer role required" in res.json()["detail"].lower()


def test_create_event_unauthenticated(client):
    """Verify unauthenticated requests receive 401 Unauthorized when attempting to create an event."""
    now = datetime.now(timezone.utc)
    payload = {
        "title": "Unauthenticated Event",
        "location": "Online",
        "starts_at": (now + timedelta(days=5)).isoformat(),
        "ends_at": (now + timedelta(days=6)).isoformat(),
        "capacity": 50,
    }

    res = client.post("/api/v1/events", json=payload)
    assert res.status_code == 401
    assert "not authenticated" in res.json()["detail"].lower()


def test_create_event_invalid_inputs(client, db_session):
    """Verify validation errors for capacity <= 0, starts_at >= ends_at, empty title, etc."""
    _, headers = create_authenticated_user(
        client, db_session, "val_org@example.com", role=UserRole.ORGANIZER
    )
    now = datetime.now(timezone.utc)

    # 1. Non-positive capacity
    res1 = client.post(
        "/api/v1/events",
        json={
            "title": "Zero Capacity",
            "location": "Room 101",
            "starts_at": (now + timedelta(days=1)).isoformat(),
            "ends_at": (now + timedelta(days=2)).isoformat(),
            "capacity": 0,
        },
        headers=headers,
    )
    assert res1.status_code == 422

    # 2. Start time after end time
    res2 = client.post(
        "/api/v1/events",
        json={
            "title": "Inverted Dates",
            "location": "Room 101",
            "starts_at": (now + timedelta(days=5)).isoformat(),
            "ends_at": (now + timedelta(days=2)).isoformat(),
            "capacity": 100,
        },
        headers=headers,
    )
    assert res2.status_code == 422
    assert "precede" in res2.text.lower()

    # 3. Empty title
    res3 = client.post(
        "/api/v1/events",
        json={
            "title": "",
            "location": "Room 101",
            "starts_at": (now + timedelta(days=1)).isoformat(),
            "ends_at": (now + timedelta(days=2)).isoformat(),
            "capacity": 100,
        },
        headers=headers,
    )
    assert res3.status_code == 422


def test_public_browse_published_events_only(client, db_session):
    """Verify that GET /api/v1/events exposes published events only, excluding draft and cancelled events."""
    org_data, headers = create_authenticated_user(
        client, db_session, "browse_org@example.com", role=UserRole.ORGANIZER
    )
    now = datetime.now(timezone.utc)

    # Create 3 events: 1 draft, 1 published, 1 cancelled
    # 1. Draft event
    d_res = client.post(
        "/api/v1/events",
        json={
            "title": "Draft Secret Meeting",
            "location": "Secret Hall",
            "starts_at": (now + timedelta(days=2)).isoformat(),
            "ends_at": (now + timedelta(days=3)).isoformat(),
            "capacity": 50,
        },
        headers=headers,
    )
    draft_id = d_res.json()["id"]

    # 2. Published event
    p_res = client.post(
        "/api/v1/events",
        json={
            "title": "Public Developer Keynote",
            "location": "Main Stage",
            "starts_at": (now + timedelta(days=4)).isoformat(),
            "ends_at": (now + timedelta(days=5)).isoformat(),
            "capacity": 300,
        },
        headers=headers,
    )
    published_id = p_res.json()["id"]
    client.patch(
        f"/api/v1/events/{published_id}",
        json={"status": "published"},
        headers=headers,
    )

    # 3. Cancelled event
    c_res = client.post(
        "/api/v1/events",
        json={
            "title": "Cancelled Hackathon",
            "location": "Lab 4",
            "starts_at": (now + timedelta(days=6)).isoformat(),
            "ends_at": (now + timedelta(days=7)).isoformat(),
            "capacity": 100,
        },
        headers=headers,
    )
    cancelled_id = c_res.json()["id"]
    client.patch(
        f"/api/v1/events/{cancelled_id}",
        json={"status": "cancelled"},
        headers=headers,
    )

    # Public browse without authentication
    browse_res = client.get("/api/v1/events")
    assert browse_res.status_code == 200
    events = browse_res.json()

    event_ids = [e["id"] for e in events]
    assert published_id in event_ids
    assert draft_id not in event_ids
    assert cancelled_id not in event_ids

    # All returned items must have status == published
    for e in events:
        assert e["status"] == "published"


def test_public_get_event_detail(client, db_session):
    """Verify that GET /api/v1/events/{id} returns 200 for published events, and 404 for drafts or cancelled."""
    _, headers = create_authenticated_user(
        client, db_session, "detail_org@example.com", role=UserRole.ORGANIZER
    )
    now = datetime.now(timezone.utc)

    # Create draft
    res1 = client.post(
        "/api/v1/events",
        json={
            "title": "Draft Conference",
            "location": "Room A",
            "starts_at": (now + timedelta(days=1)).isoformat(),
            "ends_at": (now + timedelta(days=2)).isoformat(),
            "capacity": 100,
        },
        headers=headers,
    )
    draft_id = res1.json()["id"]

    # Public GET for draft returns 404
    assert client.get(f"/api/v1/events/{draft_id}").status_code == 404

    # Publish the event
    client.patch(
        f"/api/v1/events/{draft_id}",
        json={"status": "published"},
        headers=headers,
    )

    # Public GET for published returns 200
    pub_res = client.get(f"/api/v1/events/{draft_id}")
    assert pub_res.status_code == 200
    assert pub_res.json()["title"] == "Draft Conference"
    assert pub_res.json()["status"] == "published"

    # Cancel the event
    client.patch(
        f"/api/v1/events/{draft_id}",
        json={"status": "cancelled"},
        headers=headers,
    )

    # Public GET for cancelled returns 404
    assert client.get(f"/api/v1/events/{draft_id}").status_code == 404

    # Nonexistent event returns 404
    assert client.get("/api/v1/events/999999").status_code == 404


def test_browse_events_pagination(client, db_session):
    """Verify bounded limit and offset pagination on GET /api/v1/events."""
    _, headers = create_authenticated_user(
        client, db_session, "page_org@example.com", role=UserRole.ORGANIZER
    )
    now = datetime.now(timezone.utc)

    created_ids = []
    for i in range(5):
        res = client.post(
            "/api/v1/events",
            json={
                "title": f"Series Event {i}",
                "location": f"Hall {i}",
                "starts_at": (now + timedelta(days=10 + i)).isoformat(),
                "ends_at": (now + timedelta(days=10 + i, hours=4)).isoformat(),
                "capacity": 50,
            },
            headers=headers,
        )
        eid = res.json()["id"]
        client.patch(f"/api/v1/events/{eid}", json={"status": "published"}, headers=headers)
        created_ids.append(eid)

    # Page 1: limit=2, offset=0
    p1 = client.get("/api/v1/events?limit=2&offset=0").json()
    assert len(p1) == 2
    assert p1[0]["id"] == created_ids[0]
    assert p1[1]["id"] == created_ids[1]

    # Page 2: limit=2, offset=2
    p2 = client.get("/api/v1/events?limit=2&offset=2").json()
    assert len(p2) == 2
    assert p2[0]["id"] == created_ids[2]
    assert p2[1]["id"] == created_ids[3]

    # Page 3: limit=2, offset=4
    p3 = client.get("/api/v1/events?limit=2&offset=4").json()
    assert len(p3) == 1
    assert p3[0]["id"] == created_ids[4]

    # Invalid pagination params
    assert client.get("/api/v1/events?limit=0").status_code == 422
    assert client.get("/api/v1/events?limit=101").status_code == 422
    assert client.get("/api/v1/events?offset=-1").status_code == 422


def test_list_organizer_mine_events(client, db_session):
    """Verify that GET /api/v1/events/mine returns all events for the authenticated organizer only."""
    org1, h1 = create_authenticated_user(
        client, db_session, "org1_mine@example.com", role=UserRole.ORGANIZER
    )
    org2, h2 = create_authenticated_user(
        client, db_session, "org2_mine@example.com", role=UserRole.ORGANIZER
    )
    now = datetime.now(timezone.utc)

    # Org1 creates 1 draft, 1 published, 1 cancelled
    r1 = client.post(
        "/api/v1/events",
        json={
            "title": "Org1 Draft",
            "location": "Room 1",
            "starts_at": (now + timedelta(days=1)).isoformat(),
            "ends_at": (now + timedelta(days=2)).isoformat(),
            "capacity": 50,
        },
        headers=h1,
    )
    r2 = client.post(
        "/api/v1/events",
        json={
            "title": "Org1 Published",
            "location": "Room 2",
            "starts_at": (now + timedelta(days=3)).isoformat(),
            "ends_at": (now + timedelta(days=4)).isoformat(),
            "capacity": 50,
        },
        headers=h1,
    )
    client.patch(f"/api/v1/events/{r2.json()['id']}", json={"status": "published"}, headers=h1)

    r3 = client.post(
        "/api/v1/events",
        json={
            "title": "Org1 Cancelled",
            "location": "Room 3",
            "starts_at": (now + timedelta(days=5)).isoformat(),
            "ends_at": (now + timedelta(days=6)).isoformat(),
            "capacity": 50,
        },
        headers=h1,
    )
    client.patch(f"/api/v1/events/{r3.json()['id']}", json={"status": "cancelled"}, headers=h1)

    # Org2 creates 1 published event
    r4 = client.post(
        "/api/v1/events",
        json={
            "title": "Org2 Event",
            "location": "Room 4",
            "starts_at": (now + timedelta(days=7)).isoformat(),
            "ends_at": (now + timedelta(days=8)).isoformat(),
            "capacity": 100,
        },
        headers=h2,
    )
    client.patch(f"/api/v1/events/{r4.json()['id']}", json={"status": "published"}, headers=h2)

    # Org1 queries /mine
    mine1_res = client.get("/api/v1/events/mine", headers=h1)
    assert mine1_res.status_code == 200
    mine1_events = mine1_res.json()
    assert len(mine1_events) == 3
    mine1_ids = [e["id"] for e in mine1_events]
    assert r1.json()["id"] in mine1_ids
    assert r2.json()["id"] in mine1_ids
    assert r3.json()["id"] in mine1_ids
    assert r4.json()["id"] not in mine1_ids

    # Org2 queries /mine
    mine2_res = client.get("/api/v1/events/mine", headers=h2)
    assert mine2_res.status_code == 200
    mine2_events = mine2_res.json()
    assert len(mine2_events) == 1
    assert mine2_events[0]["id"] == r4.json()["id"]


def test_update_event_authorization(client, db_session):
    """Verify owner can update event, while other organizers and attendees receive 403 Forbidden."""
    org1, h1 = create_authenticated_user(
        client, db_session, "owner_org@example.com", role=UserRole.ORGANIZER
    )
    org2, h2 = create_authenticated_user(
        client, db_session, "other_org@example.com", role=UserRole.ORGANIZER
    )
    att, h_att = create_authenticated_user(
        client, db_session, "att_update@example.com", role=UserRole.ATTENDEE
    )
    now = datetime.now(timezone.utc)

    # Org1 creates an event
    create_res = client.post(
        "/api/v1/events",
        json={
            "title": "Original Title",
            "location": "Original Venue",
            "starts_at": (now + timedelta(days=10)).isoformat(),
            "ends_at": (now + timedelta(days=12)).isoformat(),
            "capacity": 100,
        },
        headers=h1,
    )
    event_id = create_res.json()["id"]

    # 1. Non-owner organizer attempts update -> 403 Forbidden
    other_res = client.patch(
        f"/api/v1/events/{event_id}",
        json={"title": "Hacked Title"},
        headers=h2,
    )
    assert other_res.status_code == 403
    assert "permission" in other_res.json()["detail"].lower()

    # 2. Attendee attempts update -> 403 Forbidden (insufficient permissions / organizer role required)
    att_res = client.patch(
        f"/api/v1/events/{event_id}",
        json={"title": "Attendee Title"},
        headers=h_att,
    )
    assert att_res.status_code == 403

    # 3. Unauthenticated attempts update -> 401 Unauthorized
    anon_res = client.patch(
        f"/api/v1/events/{event_id}",
        json={"title": "Anon Title"},
    )
    assert anon_res.status_code == 401

    # 4. Nonexistent event -> 404 Not Found
    notfound_res = client.patch(
        "/api/v1/events/999999",
        json={"title": "Ghost Event"},
        headers=h1,
    )
    assert notfound_res.status_code == 404

    # 5. Owner updates title, description, and status -> 200 OK
    update_res = client.patch(
        f"/api/v1/events/{event_id}",
        json={
            "title": "Updated Title",
            "description": "Brand new description",
            "capacity": 150,
            "status": "published",
        },
        headers=h1,
    )
    assert update_res.status_code == 200
    updated_data = update_res.json()
    assert updated_data["title"] == "Updated Title"
    assert updated_data["description"] == "Brand new description"
    assert updated_data["capacity"] == 150
    assert updated_data["status"] == "published"


def test_update_event_cross_field_date_validation(client, db_session):
    """Verify that partial updates validate resulting date order against existing dates."""
    _, headers = create_authenticated_user(
        client, db_session, "date_val_org@example.com", role=UserRole.ORGANIZER
    )
    now = datetime.now(timezone.utc)

    # Event starts in 10 days, ends in 15 days
    create_res = client.post(
        "/api/v1/events",
        json={
            "title": "Date Order Test",
            "location": "Auditorium",
            "starts_at": (now + timedelta(days=10)).isoformat(),
            "ends_at": (now + timedelta(days=15)).isoformat(),
            "capacity": 100,
        },
        headers=headers,
    )
    event_id = create_res.json()["id"]

    # Attempt to update only starts_at to day 20 (which is after existing ends_at on day 15)
    bad_start_res = client.patch(
        f"/api/v1/events/{event_id}",
        json={"starts_at": (now + timedelta(days=20)).isoformat()},
        headers=headers,
    )
    assert bad_start_res.status_code == 422
    assert "precede" in bad_start_res.text.lower()

    # Attempt to update only ends_at to day 5 (which is before existing starts_at on day 10)
    bad_end_res = client.patch(
        f"/api/v1/events/{event_id}",
        json={"ends_at": (now + timedelta(days=5)).isoformat()},
        headers=headers,
    )
    assert bad_end_res.status_code == 422
    assert "precede" in bad_end_res.text.lower()

    # Attempt to update with invalid status string
    bad_status_res = client.patch(
        f"/api/v1/events/{event_id}",
        json={"status": "nonexistent_status"},
        headers=headers,
    )
    assert bad_status_res.status_code == 422
