from datetime import datetime
import enum
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CertificateStatus(str, enum.Enum):
    """Lifecycle status states for attendee completion certificates."""

    PENDING = "pending"
    GENERATED = "generated"
    FAILED = "failed"


class Certificate(Base):
    """Event attendance/completion certificate generated asynchronously."""

    __tablename__ = "certificates"

    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_certificates_event_user"),
        CheckConstraint(
            "status IN ('pending', 'generated', 'failed')",
            name="certificate_status",
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
    registration_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("registrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    certificate_code: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=CertificateStatus.PENDING.value,
        index=True,
    )
    rendered_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    issued_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    event = relationship("Event")
    user = relationship("User")
    registration = relationship("Registration")

    def __repr__(self) -> str:
        return f"<Certificate(id={self.id}, code='{self.certificate_code}', status='{self.status}')>"
