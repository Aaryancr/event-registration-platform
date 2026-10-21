from datetime import datetime
import enum
from typing import TYPE_CHECKING
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.modules.events.models import Event
    from app.modules.users.models import User


class RegistrationStatus(str, enum.Enum):
    """Lifecycle status states for a registration."""

    REGISTERED = "registered"
    CANCELLED = "cancelled"


class Registration(Base):
    """Registration entity linking an attendee to an event."""

    __tablename__ = "registrations"

    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_registrations_event_user"),
        CheckConstraint(
            "status IN ('registered', 'cancelled')",
            name="status",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="registered",
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    event: Mapped["Event"] = relationship("Event", back_populates="registrations")
    user: Mapped["User"] = relationship("User", back_populates="registrations")

    def __repr__(self) -> str:
        return f"<Registration(id={self.id}, event_id={self.event_id}, user_id={self.user_id}, status='{self.status}')>"
