from datetime import datetime, timedelta, timezone
import json
import os
import subprocess
import sys
import time
import requests

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.modules.events.models import Event, EventStatus
from app.modules.payments.models import SeatHold, SeatHoldStatus
from app.modules.registrations.models import Registration, RegistrationStatus
from app.modules.users.models import User, UserRole

settings = get_settings()
BASE_URL = os.environ.get("TARGET_HOST", "http://127.0.0.1:8000")


def setup_load_test_event(capacity: int = 25) -> tuple[int, int]:
    """Create an isolated organizer and event specifically for the load test."""
    db = SessionLocal()
    try:
        # 1. Create Load Test Organizer
        org_email = f"load_organizer_{int(time.time())}@loadtest.com"
        organizer = User(
            email=org_email,
            display_name="Load Test Organizer",
            role=UserRole.ORGANIZER.value,
            password_hash="mock_hash",
        )
        db.add(organizer)
        db.flush()

        # 2. Create Event with controlled capacity
        now = datetime.now(timezone.utc)
        event = Event(
            organizer_id=organizer.id,
            title=f"High-Concurrency Load Test Event ({capacity} seats)",
            description="Automated concurrency benchmark verifying zero overselling under load.",
            location="Load Benchmark Arena",
            starts_at=now + timedelta(days=2),
            ends_at=now + timedelta(days=2, hours=4),
            capacity=capacity,
            status=EventStatus.PUBLISHED.value,
        )
        db.add(event)
        db.commit()
        db.refresh(event)

        print(f"[*] Created Load Test Event #{event.id} (Capacity: {event.capacity}) by Organizer #{organizer.id}")
        return event.id, organizer.id
    finally:
        db.close()


def run_locust_benchmark(event_id: int, users: int = 25, spawn_rate: int = 5, duration: str = "15s"):
    """Execute Locust in headless mode against the target event."""
    csv_prefix = f"/tmp/locust_run_{int(time.time())}"
    html_report = f"{csv_prefix}_report.html"

    cmd = [
        "locust",
        "-f",
        "load_tests/locustfile.py",
        "--headless",
        "-u",
        str(users),
        "-r",
        str(spawn_rate),
        "--run-time",
        duration,
        "--host",
        BASE_URL,
        "--csv",
        csv_prefix,
        "--html",
        html_report,
    ]

    # Update event_id in locustfile
    with open("load_tests/locustfile.py", "r") as f:
        content = f.read()

    updated_content = content.replace("event_id: int = 1", f"event_id: int = {event_id}")
    with open("load_tests/locustfile.py", "w") as f:
        f.write(updated_content)

    print(f"[*] Starting Locust benchmark: {users} users, spawn-rate={spawn_rate}, duration={duration}...")
    start_time = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True)
    elapsed = round(time.time() - start_time, 2)
    print(f"[*] Benchmark completed in {elapsed}s.")

    # Revert locustfile
    with open("load_tests/locustfile.py", "w") as f:
        f.write(content)

    # Read stats CSV
    stats_file = f"{csv_prefix}_stats.csv"
    stats_data = []
    if os.path.exists(stats_file):
        import csv
        with open(stats_file, mode="r") as f:
            reader = csv.DictReader(f)
            stats_data = list(reader)

    return stats_data, result.stdout


def verify_capacity_invariant(event_id: int, expected_capacity: int):
    """Verify in PostgreSQL that active registrations + active holds strictly <= capacity."""
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        active_regs = (
            db.query(Registration)
            .filter(
                Registration.event_id == event_id,
                Registration.status == RegistrationStatus.REGISTERED.value,
            )
            .count()
        )

        active_holds = (
            db.query(SeatHold)
            .filter(
                SeatHold.event_id == event_id,
                SeatHold.status == SeatHoldStatus.ACTIVE.value,
                SeatHold.expires_at > now,
            )
            .count()
        )

        total_occupied = active_regs + active_holds

        print("\n" + "=" * 60)
        print("CAPACITY INVARIANT VERIFICATION (POSTGRESQL SINGLE SOURCE OF TRUTH)")
        print("=" * 60)
        print(f"Target Event ID:             #{event_id}")
        print(f"Configured Max Capacity:     {expected_capacity} seats")
        print(f"Confirmed Registrations:     {active_regs}")
        print(f"Active Non-Expired Holds:    {active_holds}")
        print(f"Total Occupied Seats:        {total_occupied}")
        print(f"Capacity Remaining:          {expected_capacity - total_occupied}")

        assert total_occupied <= expected_capacity, (
            f"INVARIANT VIOLATION: Occupied seats ({total_occupied}) exceeded capacity ({expected_capacity})!"
        )

        print("[+] PASS: Capacity invariant holds! Zero overselling detected.")
        print("=" * 60 + "\n")
        return {
            "capacity": expected_capacity,
            "active_registrations": active_regs,
            "active_holds": active_holds,
            "total_occupied": total_occupied,
            "invariant_passed": True,
        }
    finally:
        db.close()


def cleanup_load_test(event_id: int, organizer_id: int):
    """Remove test event and associated records from the database."""
    db = SessionLocal()
    try:
        db.query(SeatHold).filter(SeatHold.event_id == event_id).delete(synchronize_session=False)
        db.query(Registration).filter(Registration.event_id == event_id).delete(synchronize_session=False)
        db.query(Event).filter(Event.id == event_id).delete(synchronize_session=False)
        db.query(User).filter(User.id == organizer_id).delete(synchronize_session=False)
        db.commit()
        print(f"[*] Cleaned up Load Test Event #{event_id} and Organizer #{organizer_id}")
    finally:
        db.close()


def main():
    capacity = 25
    event_id, organizer_id = setup_load_test_event(capacity=capacity)
    try:
        stats, output = run_locust_benchmark(event_id=event_id, users=20, spawn_rate=5, duration="15s")
        invariant = verify_capacity_invariant(event_id=event_id, expected_capacity=capacity)

        print("\n--- LOCUST DETAILED ENDPOINT METRICS ---")
        for row in stats:
            name = row.get("Name", "")
            req_count = row.get("Request Count", 0)
            fail_count = row.get("Failure Count", 0)
            median = row.get("50%", "N/A")
            p95 = row.get("95%", "N/A")
            rps = row.get("Requests/s", "N/A")
            print(f"- {name:40s} | Requests: {req_count:5s} | Failures: {fail_count:3s} | RPS: {rps:5s} | p50: {median:4s}ms | p95: {p95:4s}ms")

    finally:
        cleanup_load_test(event_id=event_id, organizer_id=organizer_id)


if __name__ == "__main__":
    main()
