import time
from collections import defaultdict
from threading import Lock
from typing import Dict, Tuple


class MetricsCollector:
    """Thread-safe in-memory metrics registry for Prometheus exposition."""

    def __init__(self):
        self._lock = Lock()
        # (method, path, status_code) -> count
        self._http_requests_total: Dict[Tuple[str, str, int], int] = defaultdict(int)
        # (method, path) -> (count, total_seconds)
        self._http_request_duration: Dict[Tuple[str, str], Tuple[int, float]] = defaultdict(lambda: (0, 0.0))
        # outcome -> count ("success", "capacity_full", "duplicate", "error")
        self._registration_outcomes: Dict[str, int] = defaultdict(int)
        # outcome -> count ("created", "paid", "cancelled", "expired", "failed")
        self._seat_hold_outcomes: Dict[str, int] = defaultdict(int)
        # event_id -> count
        self._capacity_conflicts: Dict[int, int] = defaultdict(int)
        # outcome -> count ("success", "already_used", "unauthorized", "invalid")
        self._checkin_outcomes: Dict[str, int] = defaultdict(int)
        # (task_name, status) -> count
        self._background_tasks: Dict[Tuple[str, str], int] = defaultdict(int)

    def record_request(self, method: str, path: str, status_code: int, duration_seconds: float) -> None:
        """Record an incoming HTTP request and its duration."""
        with self._lock:
            # Normalize path template to avoid high cardinality
            norm_path = self._normalize_path(path)
            self._http_requests_total[(method.upper(), norm_path, status_code)] += 1
            count, total = self._http_request_duration[(method.upper(), norm_path)]
            self._http_request_duration[(method.upper(), norm_path)] = (count + 1, total + duration_seconds)

    def record_registration(self, outcome: str) -> None:
        """Record a registration attempt outcome."""
        with self._lock:
            self._registration_outcomes[outcome] += 1

    def record_seat_hold(self, outcome: str) -> None:
        """Record a seat hold lifecycle transition."""
        with self._lock:
            self._seat_hold_outcomes[outcome] += 1

    def record_capacity_conflict(self, event_id: int) -> None:
        """Record a rejection due to capacity exhaustion."""
        with self._lock:
            self._capacity_conflicts[event_id] += 1

    def record_checkin(self, outcome: str) -> None:
        """Record a ticket check-in attempt outcome."""
        with self._lock:
            self._checkin_outcomes[outcome] += 1

    def record_background_task(self, task: str, status: str) -> None:
        """Record the outcome of an asynchronous background task."""
        with self._lock:
            self._background_tasks[(task, status)] += 1

    def get_summary(self) -> dict:
        """Return a structured summary of metrics for dashboard views."""
        with self._lock:
            total_requests = sum(self._http_requests_total.values())
            total_errors = sum(
                count for (_, _, status), count in self._http_requests_total.items() if status >= 400
            )
            return {
                "http_requests_total": total_requests,
                "http_errors_total": total_errors,
                "registration_outcomes": dict(self._registration_outcomes),
                "seat_hold_outcomes": dict(self._seat_hold_outcomes),
                "capacity_conflicts_total": sum(self._capacity_conflicts.values()),
                "checkin_outcomes": dict(self._checkin_outcomes),
                "background_tasks": {f"{task}:{st}": count for (task, st), count in self._background_tasks.items()},
            }

    def generate_prometheus(self) -> str:
        """Generate standard Prometheus text exposition format (version 0.0.4)."""
        lines = []

        with self._lock:
            # 1. HTTP requests total
            lines.append("# HELP http_requests_total Total number of HTTP requests processed.")
            lines.append("# TYPE http_requests_total counter")
            for (method, path, status), count in sorted(self._http_requests_total.items()):
                lines.append(f'http_requests_total{{method="{method}",path="{path}",status="{status}"}} {count}')

            # 2. HTTP request duration
            lines.append("# HELP http_request_duration_seconds Total HTTP request processing duration in seconds.")
            lines.append("# TYPE http_request_duration_seconds summary")
            for (method, path), (count, total) in sorted(self._http_request_duration.items()):
                lines.append(f'http_request_duration_seconds_count{{method="{method}",path="{path}"}} {count}')
                lines.append(f'http_request_duration_seconds_sum{{method="{method}",path="{path}"}} {total:.6f}')

            # 3. Registration outcomes
            lines.append("# HELP eventflow_registrations_total Total number of registration attempts by outcome.")
            lines.append("# TYPE eventflow_registrations_total counter")
            for outcome, count in sorted(self._registration_outcomes.items()):
                lines.append(f'eventflow_registrations_total{{outcome="{outcome}"}} {count}')

            # 4. Seat hold outcomes
            lines.append("# HELP eventflow_seat_holds_total Total seat hold operations by outcome.")
            lines.append("# TYPE eventflow_seat_holds_total counter")
            for outcome, count in sorted(self._seat_hold_outcomes.items()):
                lines.append(f'eventflow_seat_holds_total{{outcome="{outcome}"}} {count}')

            # 5. Capacity conflicts
            lines.append("# HELP eventflow_capacity_conflicts_total Total capacity exhaustion rejection events.")
            lines.append("# TYPE eventflow_capacity_conflicts_total counter")
            for event_id, count in sorted(self._capacity_conflicts.items()):
                lines.append(f'eventflow_capacity_conflicts_total{{event_id="{event_id}"}} {count}')

            # 6. Ticket check-in outcomes
            lines.append("# HELP eventflow_checkins_total Total attendee check-in attempts by outcome.")
            lines.append("# TYPE eventflow_checkins_total counter")
            for outcome, count in sorted(self._checkin_outcomes.items()):
                lines.append(f'eventflow_checkins_total{{outcome="{outcome}"}} {count}')

            # 7. Background tasks
            lines.append("# HELP eventflow_background_tasks_total Total background asynchronous jobs by status.")
            lines.append("# TYPE eventflow_background_tasks_total counter")
            for (task, st), count in sorted(self._background_tasks.items()):
                lines.append(f'eventflow_background_tasks_total{{task="{task}",status="{st}"}} {count}')

        lines.append("")
        return "\n".join(lines)

    @staticmethod
    def _normalize_path(path: str) -> str:
        """Collapse dynamic numeric IDs in URLs into route templates."""
        parts = path.strip("/").split("/")
        normalized = []
        for part in parts:
            if part.isdigit():
                normalized.append("{id}")
            else:
                normalized.append(part)
        return "/" + "/".join(normalized) if normalized else "/"


# Global singleton instance
metrics = MetricsCollector()
