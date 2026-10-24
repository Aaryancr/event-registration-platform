from datetime import datetime, timezone
import json
import logging
from typing import Optional
from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Response,
    WebSocket,
    WebSocketDisconnect,
    status,
)
import redis
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.metrics import metrics
from app.core.security import decode_access_token
from app.core.websockets import connection_manager
from app.modules.events.models import Event, EventStatus
from app.modules.payments.models import SeatHold, SeatHoldStatus
from app.modules.registrations.models import Registration, RegistrationStatus
from app.modules.users.models import User, UserRole

logger = logging.getLogger("eventflow")
settings = get_settings()

router = APIRouter(tags=["Observability & WebSockets"])


def verify_metrics_access(
    authorization: Optional[str] = Header(None),
    x_metrics_token: Optional[str] = Header(None, alias="X-Metrics-Token"),
    db: Session = Depends(get_db),
) -> bool:
    """Verify metrics access via secret token header or valid organizer JWT."""
    # 1. Check direct metrics secret token
    if x_metrics_token and x_metrics_token == settings.METRICS_TOKEN:
        return True

    if authorization:
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]
            if token == settings.METRICS_TOKEN:
                return True
            # Try decoding as organizer JWT
            try:
                payload = decode_access_token(token)
                user_id = int(payload.get("sub", 0))
                user = db.query(User).filter(User.id == user_id).first()
                if user and (user.role == UserRole.ORGANIZER.value or user.role == UserRole.ORGANIZER):
                    return True
            except Exception:
                pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized: Valid metrics token or organizer credentials required",
        headers={"WWW-Authenticate": "Bearer"},
    )


@router.get("/ready", summary="Readiness probe checking database and redis health")
def readiness_check(db: Session = Depends(get_db)):
    """Readiness probe that actively validates PostgreSQL and Redis upstream connections."""
    checks = {}
    is_ready = True

    # Check PostgreSQL connection
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "healthy"
    except Exception as exc:
        is_ready = False
        checks["database"] = f"unhealthy: {str(exc)}"

    # Check Redis connection
    try:
        r = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        r.ping()
        checks["redis"] = "healthy"
    except Exception as exc:
        is_ready = False
        checks["redis"] = f"unhealthy: {str(exc)}"

    resp_payload = {
        "status": "ready" if is_ready else "unready",
        "service": "backend",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": checks,
    }

    if not is_ready:
        return Response(
            content=json.dumps(resp_payload),
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            media_type="application/json",
        )

    return resp_payload


@router.get("/metrics", summary="Prometheus metrics exposition endpoint (protected)")
def prometheus_metrics(_: bool = Depends(verify_metrics_access)):
    """Expose Prometheus-formatted metrics (protected via token or organizer JWT)."""
    return Response(
        content=metrics.generate_prometheus(),
        media_type="text/plain; version=0.0.4",
    )


@router.get("/metrics/summary", summary="Structured metrics summary for dashboard (protected)")
def metrics_summary(_: bool = Depends(verify_metrics_access)):
    """Return JSON metrics summary for web observability dashboard."""
    return metrics.get_summary()


@router.websocket("/events/{event_id}/ws")
async def event_websocket_endpoint(
    websocket: WebSocket,
    event_id: int,
    db: Session = Depends(get_db),
):
    """Real-time WebSocket endpoint streaming committed seat updates for an event."""
    # Check if event exists
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        await websocket.close(code=4004, reason="Event not found")
        return

    await connection_manager.connect(event_id, websocket)

    # Send initial state immediately upon connection
    try:
        now = datetime.now(timezone.utc)
        active_regs = (
            db.query(func.count(Registration.id))
            .filter(
                Registration.event_id == event_id,
                Registration.status == RegistrationStatus.REGISTERED.value,
            )
            .scalar()
            or 0
        )
        active_holds = (
            db.query(func.count(SeatHold.id))
            .filter(
                SeatHold.event_id == event_id,
                SeatHold.status == SeatHoldStatus.ACTIVE.value,
                SeatHold.expires_at > now,
            )
            .scalar()
            or 0
        )
        occupied = active_regs + active_holds
        available = max(0, event.capacity - occupied)

        await websocket.send_json({
            "type": "CONNECTED",
            "event_id": event_id,
            "capacity": event.capacity,
            "occupied_seats": occupied,
            "available_seats": available,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # Keep connection open and respond to client heartbeats
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "PING":
                    await websocket.send_json({
                        "type": "PONG",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
            except Exception:
                # If plain text "ping"
                if data.strip().upper() == "PING":
                    await websocket.send_json({
                        "type": "PONG",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
    except WebSocketDisconnect:
        connection_manager.disconnect(event_id, websocket)
    except Exception as exc:
        logger.warning(f"WebSocket error on event {event_id}: {exc}")
        connection_manager.disconnect(event_id, websocket)
