from datetime import datetime
import enum
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class WaitlistStatus(str, enum.Enum):
    """Lifecycle status states for waitlist entries."""

    WAITING = "waiting"
    PROMOTED = "promoted"
    CANCELLED = "cancelled"


class WaitlistEntry(Base):
    """Waitlist record tracking attendee place in line when capacity is filled."""

    __tablename__ = "waitlist_entries"

    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_waitlist_event_user"),
        CheckConstraint(
            "status IN ('waiting', 'promoted', 'cancelled')",
            name="waitlist_status",
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
        default=WaitlistStatus.WAITING.value,
        index=True,
    )
    promoted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    event = relationship("Event")
    user = relationship("User")

    def __repr__(self) -> str:
        return f"<WaitlistEntry(id={self.id}, event_id={self.event_id}, user_id={self.user_id}, status='{self.status}')>"
