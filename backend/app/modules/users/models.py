from datetime import datetime
import enum
from typing import TYPE_CHECKING, List
from sqlalchemy import CheckConstraint, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.modules.events.models import Event
    from app.modules.registrations.models import Registration


class UserRole(str, enum.Enum):
    """Platform user roles."""

    ATTENDEE = "attendee"
    ORGANIZER = "organizer"


class User(Base):
    """User entity representing platform accounts."""

    __tablename__ = "users"

    __table_args__ = (
        CheckConstraint(
            "role IN ('attendee', 'organizer')",
            name="role",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
    )
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        server_default="",
        default="",
    )
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="attendee",
        default=UserRole.ATTENDEE.value,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    organized_events: Mapped[List["Event"]] = relationship(
        "Event",
        back_populates="organizer",
        cascade="all, delete-orphan",
    )
    registrations: Mapped[List["Registration"]] = relationship(
        "Registration",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    @property
    def is_organizer(self) -> bool:
        """Helper to check if user has organizer role."""
        return self.role == UserRole.ORGANIZER.value

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email='{self.email}', display_name='{self.display_name}', role='{self.role}')>"
