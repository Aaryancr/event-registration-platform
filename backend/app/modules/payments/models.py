from datetime import datetime
import enum
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SeatHoldStatus(str, enum.Enum):
    """Lifecycle status states for temporary seat holds."""

    ACTIVE = "active"
    CONVERTED = "converted"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class SeatHold(Base):
    """Temporary seat hold reserving event capacity pending checkout completion."""

    __tablename__ = "seat_holds"

    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'converted', 'expired', 'cancelled')",
            name="seat_hold_status",
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
        default=SeatHoldStatus.ACTIVE.value,
        index=True,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    event = relationship("Event")
    user = relationship("User")

    def __repr__(self) -> str:
        return f"<SeatHold(id={self.id}, event_id={self.event_id}, user_id={self.user_id}, status='{self.status}')>"


class PaymentStatus(str, enum.Enum):
    """Lifecycle status states for mock payments."""

    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    REFUNDED = "refunded"


class Payment(Base):
    """Payment record tracking transaction results and associated seat hold."""

    __tablename__ = "payments"

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'succeeded', 'failed', 'refunded')",
            name="payment_status",
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
    hold_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("seat_holds.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    amount: Mapped[float] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        default=0.00,
    )
    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="USD",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=PaymentStatus.SUCCEEDED.value,
        index=True,
    )
    idempotency_key: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )
    provider_payment_id: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    event = relationship("Event")
    user = relationship("User")
    hold = relationship("SeatHold")

    def __repr__(self) -> str:
        return f"<Payment(id={self.id}, amount={self.amount}, status='{self.status}')>"
