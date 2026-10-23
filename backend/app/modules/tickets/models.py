from datetime import datetime
import enum
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TicketStatus(str, enum.Enum):
    """Lifecycle status states for event tickets."""

    ISSUED = "issued"
    USED = "used"
    CANCELLED = "cancelled"


class Ticket(Base):
    """Digital ticket linked to confirmed event registration with unguessable ticket code."""

    __tablename__ = "tickets"

    __table_args__ = (
        CheckConstraint(
            "status IN ('issued', 'used', 'cancelled')",
            name="ticket_status",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    registration_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("registrations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
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
    ticket_code: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=TicketStatus.ISSUED.value,
        index=True,
    )
    checked_in_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    checked_in_by: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    registration = relationship("Registration", backref="ticket")
    event = relationship("Event")
    user = relationship("User", foreign_keys=[user_id])
    checked_in_by_user = relationship("User", foreign_keys=[checked_in_by])

    def __repr__(self) -> str:
        return f"<Ticket(id={self.id}, ticket_code='{self.ticket_code}', status='{self.status}')>"
