from datetime import timedelta
import jwt
import pytest

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_hash_and_verify_password():
    """Verify that password hashing produces bcrypt hashes and validates correctly."""
    plain = "SuperSecret123!"
    hashed = hash_password(plain)

    # Must be hashed, not plaintext
    assert hashed != plain
    assert hashed.startswith("$2b$")

    # Correct password verifies
    assert verify_password(plain, hashed) is True

    # Incorrect password fails
    assert verify_password("WrongPassword!", hashed) is False


def test_jwt_create_and_decode():
    """Verify standard JWT access token generation and decoding."""
    subject = "42"
    token = create_access_token(subject=subject)

    assert isinstance(token, str)

    payload = decode_access_token(token)
    assert payload["sub"] == "42"
    assert "exp" in payload
    assert "iat" in payload


def test_jwt_expired_token():
    """Verify that expired tokens raise jwt.ExpiredSignatureError upon decoding."""
    subject = "99"
    # Token expired 10 seconds ago
    expired_token = create_access_token(
        subject=subject,
        expires_delta=timedelta(seconds=-10),
    )

    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(expired_token)


def test_jwt_tampered_token():
    """Verify that tampered tokens fail signature validation."""
    token = create_access_token(subject="100")
    # Tamper with the signature portion
    tampered_token = token[:-5] + "xxxxx"

    with pytest.raises(jwt.PyJWTError):
        decode_access_token(tampered_token)
