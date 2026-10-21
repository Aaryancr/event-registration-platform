from datetime import timedelta
import jwt
from sqlalchemy import func

from app.core.config import get_settings
from app.core.security import create_access_token, verify_password
from app.modules.users.models import User, UserRole
from scripts.promote_user import promote_user

settings = get_settings()


def test_register_success(client, db_session):
    """Verify successful user registration returning safe user data."""
    payload = {
        "email": "carol@example.com",
        "password": "strongPassword123!",
        "display_name": "Carol Danvers",
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201

    data = response.json()
    assert data["id"] is not None
    assert data["email"] == "carol@example.com"
    assert data["display_name"] == "Carol Danvers"
    assert data["role"] == "attendee"
    assert "created_at" in data

    # Strictly verify no sensitive password information is leaked
    assert "password" not in data
    assert "password_hash" not in data


def test_register_duplicate_email(client, db_session):
    """Verify that registering with an existing email returns 409 Conflict (case-insensitive)."""
    payload = {
        "email": "duplicate@example.com",
        "password": "password123!",
        "display_name": "Original User",
    }
    first_res = client.post("/api/v1/auth/register", json=payload)
    assert first_res.status_code == 201

    # Attempt to register with uppercase and whitespace
    dup_payload = {
        "email": "  DUPLICATE@EXAMPLE.COM  ",
        "password": "anotherPassword456!",
        "display_name": "Duplicate User",
    }
    second_res = client.post("/api/v1/auth/register", json=dup_payload)
    assert second_res.status_code == 409
    assert "already exists" in second_res.json()["detail"].lower()


def test_register_role_escalation_blocked(client, db_session):
    """Ensure public registration cannot choose or escalate role to organizer."""
    payload = {
        "email": "hacker@example.com",
        "password": "secretPassword123!",
        "display_name": "Role Hacker",
        "role": "organizer",  # attempted escalation
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201

    data = response.json()
    # Must be forced to attendee
    assert data["role"] == "attendee"

    # Confirm directly in the database
    user = (
        db_session.query(User).filter(User.email == "hacker@example.com").first()
    )
    assert user is not None
    assert user.role == "attendee"


def test_password_hashing_in_database(client, db_session):
    """Verify that password is stored as a secure bcrypt hash, never plaintext."""
    plain_password = "MySecurePlainPassword123!"
    payload = {
        "email": "security_check@example.com",
        "password": plain_password,
        "display_name": "Security Tester",
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201

    user = (
        db_session.query(User)
        .filter(User.email == "security_check@example.com")
        .first()
    )
    assert user is not None
    assert user.password_hash != plain_password
    assert user.password_hash.startswith("$2b$")
    assert verify_password(plain_password, user.password_hash) is True


def test_login_success(client, db_session):
    """Verify successful login returns a valid JWT Bearer token and user details."""
    # Register first
    email = "login_success@example.com"
    password = "CorrectPassword123!"
    client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "display_name": "Login Tester",
        },
    )

    # Login
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_res.status_code == 200

    data = login_res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == email

    # Verify token payload
    decoded = jwt.decode(
        data["access_token"],
        settings.JWT_SECRET,
        algorithms=[settings.JWT_ALGORITHM],
    )
    assert decoded["sub"] == str(data["user"]["id"])
    assert "exp" in decoded


def test_login_incorrect_password(client, db_session):
    """Verify that login with incorrect password returns 401 Unauthorized."""
    email = "wrong_pass@example.com"
    client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "RealPassword123!",
            "display_name": "Wrong Pass Tester",
        },
    )

    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "WrongPassword999!"},
    )
    assert login_res.status_code == 401
    assert "invalid email or password" in login_res.json()["detail"].lower()


def test_login_nonexistent_email(client, db_session):
    """Verify that login with unknown email returns 401 Unauthorized."""
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "anyPassword123!"},
    )
    assert login_res.status_code == 401
    assert "invalid email or password" in login_res.json()["detail"].lower()


def test_me_authenticated(client, db_session):
    """Verify that /api/v1/auth/me returns the authenticated user's profile."""
    email = "me_test@example.com"
    password = "MyPassword123!"
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "display_name": "Profile Tester",
        },
    )
    user_id = reg_res.json()["id"]

    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    token = login_res.json()["access_token"]

    me_res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["id"] == user_id
    assert me_data["email"] == email
    assert me_data["display_name"] == "Profile Tester"
    assert me_data["role"] == "attendee"


def test_me_missing_token(client):
    """Verify that /me without token returns 401 Unauthorized."""
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 401
    assert "not authenticated" in res.json()["detail"].lower()


def test_me_invalid_token(client):
    """Verify that /me with invalid token returns 401 Unauthorized."""
    res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer completely_bogus_token"},
    )
    assert res.status_code == 401
    assert "invalid authentication credentials" in res.json()["detail"].lower()


def test_me_expired_token(client, db_session):
    """Verify that /me with expired token returns 401 Unauthorized."""
    email = "expired_token@example.com"
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "Password123!",
            "display_name": "Expired Tester",
        },
    )
    user_id = reg_res.json()["id"]

    expired_token = create_access_token(
        subject=user_id,
        expires_delta=timedelta(minutes=-10),
    )

    res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert res.status_code == 401
    assert "expired" in res.json()["detail"].lower()


def test_role_authorization_attendee_forbidden(client, db_session):
    """Verify that attendee role receives 403 Forbidden for organizer-only endpoints."""
    email = "attendee_auth@example.com"
    password = "Password123!"
    client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "display_name": "Regular Attendee",
        },
    )

    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    token = login_res.json()["access_token"]

    res = client.get(
        "/api/v1/auth/test-organizer-only",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403
    assert "organizer role required" in res.json()["detail"].lower()


def test_role_authorization_organizer_allowed(client, db_session):
    """Verify that organizer role receives 200 OK for organizer-only endpoints."""
    email = "organizer_auth@example.com"
    password = "Password123!"
    client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "display_name": "Authorized Organizer",
        },
    )

    # Promote to organizer in database
    user = (
        db_session.query(User)
        .filter(func.lower(User.email) == email)
        .first()
    )
    assert user is not None
    user.role = UserRole.ORGANIZER.value
    db_session.flush()

    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    token = login_res.json()["access_token"]

    res = client.get(
        "/api/v1/auth/test-organizer-only",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = response = res.json()
    assert data["role"] == "organizer"


def test_promote_user_cli(client, db_session):
    """Verify that promote_user CLI function updates the user's role safely."""
    email = "promote_me@example.com"
    client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "Password123!",
            "display_name": "To Promote",
        },
    )

    # Promote via CLI logic
    exit_code = promote_user(email, "organizer", db=db_session)
    assert exit_code == 0

    # Verify in DB
    user = (
        db_session.query(User)
        .filter(func.lower(User.email) == email)
        .first()
    )
    assert user is not None
    assert user.role == "organizer"
