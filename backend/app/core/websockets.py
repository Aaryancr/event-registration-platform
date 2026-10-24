import asyncio
from datetime import datetime, timezone
import json
import logging
from typing import Dict, Set
from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import func
from sqlalchemy.orm import Session

logger = logging.getLogger("eventflow")


class ConnectionManager:
    """Manages active WebSocket connections grouped into event rooms."""

    def __init__(self):
        # event_id -> set of active WebSockets
        self._rooms: Dict[int, Set[WebSocket]] = {}
        self.loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Capture the running event loop for scheduling broadcasts from sync threads."""
        self.loop = loop

    async def connect(self, event_id: int, websocket: WebSocket) -> None:
        """Accept an incoming connection and register it in the event's room."""
        await websocket.accept()
        if event_id not in self._rooms:
            self._rooms[event_id] = set()
        self._rooms[event_id].add(websocket)
        logger.info(
            f"WebSocket client connected to event room {event_id}. Active: {len(self._rooms[event_id])}"
        )

    def disconnect(self, event_id: int, websocket: WebSocket) -> None:
        """Remove a disconnected WebSocket from the event room."""
        if event_id in self._rooms:
            self._rooms[event_id].discard(websocket)
            if not self._rooms[event_id]:
                del self._rooms[event_id]
        logger.info(f"WebSocket client disconnected from event room {event_id}")

    async def broadcast_to_event(self, event_id: int, message: dict) -> None:
        """Send a JSON payload to all active connections for a specific event room."""
        connections = self._rooms.get(event_id, set()).copy()
        if not connections:
            return

        dead_connections = set()
        for ws in connections:
            try:
                await ws.send_json(message)
            except Exception as exc:
                logger.warning(f"Failed to send to WebSocket in event {event_id}: {exc}")
                dead_connections.add(ws)

        # Cleanup failed connections
        if dead_connections and event_id in self._rooms:
            self._rooms[event_id].difference_update(dead_connections)

    def notify_seat_update(
        self,
        event_id: int,
        capacity: int,
        occupied_seats: int,
        available_seats: int,
    ) -> None:
        """Thread-safe scheduling of a seat update broadcast from sync route handlers."""
        payload = {
            "type": "SEAT_UPDATE",
            "event_id": event_id,
            "capacity": capacity,
            "occupied_seats": occupied_seats,
            "available_seats": available_seats,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        # Try to schedule on the main event loop
        target_loop = self.loop
        if target_loop and target_loop.is_running():
            asyncio.run_coroutine_threadsafe(self.broadcast_to_event(event_id, payload), target_loop)
        else:
            try:
                current_loop = asyncio.get_running_loop()
                current_loop.create_task(self.broadcast_to_event(event_id, payload))
            except RuntimeError:
                # No active event loop available (e.g. pure synchronous script)
                pass


# Global singleton instance
connection_manager = ConnectionManager()


def broadcast_event_seats(event_id: int, db: Session) -> None:
    """Helper that queries the committed state of an event from PostgreSQL and triggers broadcast."""
    try:
        from app.modules.events.models import Event
        from app.modules.payments.models import SeatHold, SeatHoldStatus
        from app.modules.registrations.models import Registration, RegistrationStatus

        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            return

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

        connection_manager.notify_seat_update(
            event_id=event_id,
            capacity=event.capacity,
            occupied_seats=occupied,
            available_seats=available,
        )
    except Exception as exc:
        logger.warning(f"Could not broadcast seat update for event {event_id}: {exc}")
