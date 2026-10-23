from datetime import datetime, timedelta, timezone
import json
from typing import Any, Tuple
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.idempotency.models import IdempotencyKey


def check_and_start_idempotency(
    db: Session,
    user_id: int,
    endpoint: str,
    idempotency_key: str | None,
    ttl_minutes: int = 60,
) -> Tuple[IdempotencyKey | None, Tuple[int, Any] | None]:
    """Check for existing idempotency key.

    Returns:
        (IdempotencyKey, None) if a new request is successfully started.
        (None, None) if no idempotency key is provided.
        (IdempotencyKey, (response_code, response_data)) if cached response is ready for replay.
    Raises:
        HTTPException(409) if an in-flight request is already processing with this key.
    """
    if not idempotency_key or not idempotency_key.strip():
        return None, None

    key = idempotency_key.strip()

    existing = (
        db.query(IdempotencyKey)
        .filter(
            IdempotencyKey.user_id == user_id,
            IdempotencyKey.endpoint == endpoint,
            IdempotencyKey.key == key,
        )
        .with_for_update()
        .first()
    )

    if existing:
        if existing.status == "completed":
            cached_data = json.loads(existing.response_body) if existing.response_body else None
            return existing, (existing.response_code or 200, cached_data)
        elif existing.status == "processing":
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A request with this idempotency key is currently processing. Please retry shortly.",
            )
        else:  # failed
            existing.status = "processing"
            db.commit()
            return existing, None

    now = datetime.now(timezone.utc)
    new_record = IdempotencyKey(
        key=key,
        user_id=user_id,
        endpoint=endpoint,
        status="processing",
        expires_at=now + timedelta(minutes=ttl_minutes),
    )
    db.add(new_record)
    try:
      db.commit()
      db.refresh(new_record)
      return new_record, None
    except IntegrityError:
      db.rollback()
      # Concurrent insert race condition occurred
      concurrent_record = (
          db.query(IdempotencyKey)
          .filter(
              IdempotencyKey.user_id == user_id,
              IdempotencyKey.endpoint == endpoint,
              IdempotencyKey.key == key,
          )
          .first()
      )
      if concurrent_record and concurrent_record.status == "completed":
          cached_data = (
              json.loads(concurrent_record.response_body)
              if concurrent_record.response_body
              else None
          )
          return concurrent_record, (concurrent_record.response_code or 200, cached_data)
      raise HTTPException(
          status_code=status.HTTP_409_CONFLICT,
          detail="A request with this idempotency key is currently processing. Please retry shortly.",
      )


def finish_idempotency(
    db: Session,
    record: IdempotencyKey | None,
    response_code: int,
    response_body: Any,
) -> None:
    """Commit completed response payload for safe future idempotent replay."""
    if not record:
        return
    try:
        record.status = "completed"
        record.response_code = response_code
        record.response_body = json.dumps(response_body, default=str)
        db.commit()
    except Exception:
        db.rollback()


def fail_idempotency(
    db: Session,
    record: IdempotencyKey | None,
    response_code: int = 400,
    error_detail: str = "",
) -> None:
    """Mark idempotency record as failed."""
    if not record:
        return
    try:
        record.status = "failed"
        record.response_code = response_code
        record.response_body = json.dumps({"detail": error_detail})
        db.commit()
    except Exception:
        db.rollback()
