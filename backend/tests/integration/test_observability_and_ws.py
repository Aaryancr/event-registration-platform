from datetime import datetime, timedelta, timezone
import pytest
from app.core.config import get_settings
from app.core.security import create_access_token
from app.core.websockets import connection_manager
from app.modules.events.models import Event, EventStatus
from app.modules.users.models import User, UserRole

settings = get_settings()


def test_readiness_probe_healthy(client, db_session):
    """Test /ready endpoint successfully verifies both PostgreSQL and Redis connectivity."""
    response = client.get("/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["checks"]["database"] == "healthy"
    assert data["checks"]["redis"] == "healthy"

    # Also test mounted under API prefix
    api_resp = client.get(f"{settings.API_V1_PREFIX}/ready")
    assert api_resp.status_code == 200
    assert api_resp.json()["status"] == "ready"


def test_metrics_endpoint_unauthorized_rejected(client):
    """Test that metrics endpoint rejects requests without valid token or credentials."""
    # No header
    resp = client.get("/metrics")
    assert resp.status_code == 401

    # Invalid header
    resp_invalid = client.get(
        "/metrics",
        headers={"Authorization": "Bearer invalid_secret_token"},
    )
    assert resp_invalid.status_code == 401


def test_metrics_endpoint_authorized_bearer_token(client):
    """Test that metrics endpoint allows access with the valid METRICS_TOKEN."""
    resp = client.get(
        "/metrics",
        headers={"Authorization": f"Bearer {settings.METRICS_TOKEN}"},
    )
    assert resp.status_code == 200
    assert "text/plain" in resp.headers["content-type"]
    body = resp.text
    assert "# HELP http_requests_total" in body
    assert "eventflow_registrations_total" in body


def test_metrics_summary_authorized_organizer(client, db_session):
    """Test that an organizer user can view the JSON metrics summary."""
    organizer = User(
        email="metrics_org@example.com",
        display_name="Metrics Organizer",
        role=UserRole.ORGANIZER.value,
        password_hash="mockhash",
    )
    db_session.add(organizer)
    db_session.flush()

    token = create_access_token(organizer.id, extra_claims={"role": organizer.role})
    resp = client.get(
        f"{settings.API_V1_PREFIX}/metrics/summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "http_requests_total" in data
    assert "registration_outcomes" in data
    assert "seat_hold_outcomes" in data


def test_websocket_connection_and_initial_state(client, db_session):
    """Test connecting to the WebSocket endpoint for an event and receiving initial state."""
    organizer = User(
        email="ws_org@example.com",
        display_name="WS Organizer",
        role=UserRole.ORGANIZER.value,
        password_hash="mockhash",
    )
    db_session.add(organizer)
    db_session.flush()

    event = Event(
        organizer_id=organizer.id,
        title="Live WS Event",
        location="Auditorium A",
        capacity=50,
        status=EventStatus.PUBLISHED.value,
        starts_at=datetime.now(timezone.utc) + timedelta(days=1),
        ends_at=datetime.now(timezone.utc) + timedelta(days=1, hours=2),
    )
    db_session.add(event)
    db_session.commit()

    # Connect to WebSocket
    with client.websocket_connect(f"/api/v1/events/{event.id}/ws") as websocket:
        initial_msg = websocket.receive_json()
        assert initial_msg["type"] == "CONNECTED"
        assert initial_msg["event_id"] == event.id
        assert initial_msg["capacity"] == 50
        assert initial_msg["occupied_seats"] == 0
        assert initial_msg["available_seats"] == 50

        # Send heartbeat ping
        websocket.send_text("PING")
        pong_msg = websocket.receive_json()
        assert pong_msg["type"] == "PONG"


def test_websocket_seat_update_broadcast(client, db_session):
    """Test that active WebSocket clients receive real-time SEAT_UPDATE broadcasts."""
    organizer = User(
        email="ws_broadcast_org@example.com",
        display_name="Broadcast Organizer",
        role=UserRole.ORGANIZER.value,
        password_hash="mockhash",
    )
    db_session.add(organizer)
    db_session.flush()

    event = Event(
        organizer_id=organizer.id,
        title="Live Broadcast Event",
        location="Hall B",
        capacity=20,
        status=EventStatus.PUBLISHED.value,
        starts_at=datetime.now(timezone.utc) + timedelta(days=1),
        ends_at=datetime.now(timezone.utc) + timedelta(days=1, hours=2),
    )
    db_session.add(event)
    db_session.commit()

    with client.websocket_connect(f"/api/v1/events/{event.id}/ws") as websocket:
        init_msg = websocket.receive_json()
        assert init_msg["type"] == "CONNECTED"

        # Trigger seat update notification
        connection_manager.notify_seat_update(
            event_id=event.id,
            capacity=20,
            occupied_seats=5,
            available_seats=15,
        )

        update_msg = websocket.receive_json()
        assert update_msg["type"] == "SEAT_UPDATE"
        assert update_msg["event_id"] == event.id
        assert update_msg["capacity"] == 20
        assert update_msg["occupied_seats"] == 5
        assert update_msg["available_seats"] == 15


def test_websocket_missing_event_closed(client):
    """Test that connecting to a non-existent event closes the WebSocket with error."""
    with pytest.raises(Exception):
        with client.websocket_connect("/api/v1/events/999999/ws") as websocket:
            websocket.receive_json()
