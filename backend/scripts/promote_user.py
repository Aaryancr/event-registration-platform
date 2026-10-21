#!/usr/bin/env python3
"""CLI utility to promote or update user roles for local development and operations."""

import argparse
import os
import sys
from typing import Optional

# Ensure /app or backend directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.modules.users.models import User, UserRole


def promote_user(email: str, role: str, db: Optional[Session] = None) -> int:
    """Promote a user to a new role (e.g., organizer) safely."""
    normalized_email = email.strip().lower()
    role_lower = role.strip().lower()

    valid_roles = [r.value for r in UserRole]
    if role_lower not in valid_roles:
        print(
            f"Error: Invalid role '{role}'. Valid roles are: {', '.join(valid_roles)}",
            file=sys.stderr,
        )
        return 1

    session = db if db is not None else SessionLocal()
    try:
        user = (
            session.query(User)
            .filter(func.lower(User.email) == normalized_email)
            .first()
        )
        if not user:
            print(
                f"Error: User with email '{normalized_email}' not found.",
                file=sys.stderr,
            )
            return 1

        previous_role = user.role
        if previous_role == role_lower:
            print(
                f"Notice: User '{user.email}' already holds the role '{role_lower}'."
            )
            return 0

        user.role = role_lower
        session.commit()
        print(
            f"Success: Updated user '{user.email}' (ID: {user.id}) role from '{previous_role}' to '{role_lower}'."
        )
        return 0
    finally:
        if db is None:
            session.close()


def main():
    parser = argparse.ArgumentParser(
        description="Safely promote or update user roles for development and administrative workflows."
    )
    parser.add_argument(
        "email",
        type=str,
        help="The email address of the account to promote/update.",
    )
    parser.add_argument(
        "--role",
        type=str,
        default=UserRole.ORGANIZER.value,
        choices=[r.value for r in UserRole],
        help="Target role (default: organizer).",
    )

    args = parser.parse_args()
    sys.exit(promote_user(args.email, args.role))


if __name__ == "__main__":
    main()
