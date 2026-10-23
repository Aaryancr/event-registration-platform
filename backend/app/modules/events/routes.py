from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_organizer
from app.modules.events.models import Event, EventStatus
from app.modules.events.schemas import (
    EventCreateRequest,
    EventResponse,
    EventUpdateRequest,
)
from app.modules.users.models import User

router = APIRouter()


@router.post(
    "",
    response_model=EventResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new event",
)
def create_event(
    payload: EventCreateRequest,
    current_user: User = Depends(require_organizer),
    db: Session = Depends(get_db),
):
    """Create a new event in draft status owned by the authenticated organizer."""
    event = Event(
        organizer_id=current_user.id,
        title=payload.title.strip(),
        description=payload.description.strip() if payload.description else None,
        location=payload.location.strip(),
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        capacity=payload.capacity,
        status=EventStatus.DRAFT.value,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get(
    "",
    response_model=List[EventResponse],
    status_code=status.HTTP_200_OK,
    summary="Browse published events",
)
def list_published_events(
    limit: int = Query(
        default=20,
        ge=1,
        le=100,
        description="Maximum number of events to return (1-100)",
    ),
    offset: int = Query(
        default=0,
        ge=0,
        description="Number of events to skip for pagination",
    ),
    db: Session = Depends(get_db),
):
    """Public endpoint returning published events sorted deterministically by start time and ID."""
    events = (
        db.query(Event)
        .filter(Event.status == EventStatus.PUBLISHED.value)
        .order_by(Event.starts_at.asc(), Event.id.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return events


@router.get(
    "/mine",
    response_model=List[EventResponse],
    status_code=status.HTTP_200_OK,
    summary="View authenticated organizer's events",
)
def list_my_events(
    limit: int = Query(
        default=20,
        ge=1,
        le=100,
        description="Maximum number of events to return (1-100)",
    ),
    offset: int = Query(
        default=0,
        ge=0,
        description="Number of events to skip for pagination",
    ),
    current_user: User = Depends(require_organizer),
    db: Session = Depends(get_db),
):
    """Return all events (draft, published, cancelled) owned by the authenticated organizer."""
    events = (
        db.query(Event)
        .filter(Event.organizer_id == current_user.id)
        .order_by(Event.starts_at.asc(), Event.id.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return events


@router.get(
    "/{event_id}",
    response_model=EventResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve published event details",
)
def get_event(
    event_id: int,
    db: Session = Depends(get_db),
):
    """Public endpoint retrieving a single published event by ID. Drafts/cancelled return 404."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event or event.status != EventStatus.PUBLISHED.value:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )
    return event


@router.patch(
    "/{event_id}",
    response_model=EventResponse,
    status_code=status.HTTP_200_OK,
    summary="Update an existing event",
)
def update_event(
    event_id: int,
    payload: EventUpdateRequest,
    current_user: User = Depends(require_organizer),
    db: Session = Depends(get_db),
):
    """Partially update an event. Only the owning organizer can update their event."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    if event.organizer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this event",
        )

    # Cross-field validation: Verify resulting start/end date ordering
    new_starts_at = payload.starts_at if payload.starts_at is not None else event.starts_at
    new_ends_at = payload.ends_at if payload.ends_at is not None else event.ends_at
    if new_starts_at >= new_ends_at:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Event start time must precede end time.",
        )

    update_data = payload.model_dump(exclude_unset=True)

    if "title" in update_data and update_data["title"] is not None:
        event.title = update_data["title"].strip()
    if "description" in update_data:
        event.description = update_data["description"].strip() if update_data["description"] else None
    if "location" in update_data and update_data["location"] is not None:
        event.location = update_data["location"].strip()
    if "starts_at" in update_data and update_data["starts_at"] is not None:
        event.starts_at = update_data["starts_at"]
    if "ends_at" in update_data and update_data["ends_at"] is not None:
        event.ends_at = update_data["ends_at"]
    if "capacity" in update_data and update_data["capacity"] is not None:
        event.capacity = update_data["capacity"]
    if "status" in update_data and update_data["status"] is not None:
        status_val = update_data["status"]
        event.status = status_val.value if isinstance(status_val, EventStatus) else status_val

    db.commit()
    db.refresh(event)
    return event
