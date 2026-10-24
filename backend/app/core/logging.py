import json
import logging
import re
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Callable
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.metrics import metrics

# Sensitive patterns and keys that must never appear in structured logs
REDACTED_TEXT = "[REDACTED]"
SENSITIVE_FIELD_PATTERNS = re.compile(
    r'(password|token|secret|jwt|authorization|cookie|bearer)',
    re.IGNORECASE,
)


class JsonFormatter(logging.Formatter):
    """Custom logging formatter that outputs structured JSON lines."""

    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Include custom extra attributes if supplied
        if hasattr(record, "request_id"):
            log_obj["request_id"] = record.request_id
        if hasattr(record, "method"):
            log_obj["method"] = record.method
        if hasattr(record, "path"):
            log_obj["path"] = record.path
        if hasattr(record, "status_code"):
            log_obj["status_code"] = record.status_code
        if hasattr(record, "latency_ms"):
            log_obj["latency_ms"] = record.latency_ms
        if hasattr(record, "client_ip"):
            log_obj["client_ip"] = record.client_ip

        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_obj)


def setup_structured_logging(level: int = logging.INFO) -> logging.Logger:
    """Configure the root logger to output structured JSON."""
    logger = logging.getLogger("eventflow")
    logger.setLevel(level)

    # Avoid duplicate handlers if already attached
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)

    logger.propagate = False
    return logger


logger = setup_structured_logging()


class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    """HTTP middleware tracking request latency, request_id, and emitting structured logs."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Extract or generate a correlation request ID
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id

        # Redact sensitive headers for logging
        client_ip = request.client.host if request.client else "unknown"
        method = request.method
        path = request.url.path

        start_time = time.perf_counter()
        status_code = 500

        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-ID"] = request_id
            return response
        except Exception as exc:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            duration_s = duration_ms / 1000.0
            metrics.record_request(method, path, 500, duration_s)

            logger.error(
                f"Unhandled server error on {method} {path}: {str(exc)}",
                extra={
                    "request_id": request_id,
                    "method": method,
                    "path": path,
                    "status_code": 500,
                    "latency_ms": duration_ms,
                    "client_ip": client_ip,
                },
                exc_info=True,
            )
            raise
        finally:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            duration_s = duration_ms / 1000.0

            # Record in Prometheus metrics
            metrics.record_request(method, path, status_code, duration_s)

            # Skip high-frequency health ping clutter in logs unless in debug
            if path not in ("/health", "/api/v1/health"):
                logger.info(
                    f"HTTP {method} {path} returned {status_code} in {duration_ms}ms",
                    extra={
                        "request_id": request_id,
                        "method": method,
                        "path": path,
                        "status_code": status_code,
                        "latency_ms": duration_ms,
                        "client_ip": client_ip,
                    },
                )
