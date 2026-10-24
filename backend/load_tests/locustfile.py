from datetime import datetime, timezone
import json
import random
import uuid
from locust import HttpUser, task, between, events


class EventRegistrationUser(HttpUser):
    """Simulates realistic concurrent attendees interacting with high-throughput ticketing endpoints."""

    wait_time = between(0.05, 0.2)  # High concurrency burst
    event_id: int = 1
    user_token: str = ""
    user_email: str = ""

    def on_start(self):
        """Register and log in an isolated test attendee before issuing load requests."""
        unique_id = uuid.uuid4().hex[:8]
        self.user_email = f"load_{unique_id}@test.com"
        password = "loadtestpassword123"

        # Register
        reg_resp = self.client.post(
            "/api/v1/auth/register",
            json={
                "email": self.user_email,
                "password": password,
                "display_name": f"LoadUser {unique_id}",
                "role": "attendee",
            },
            name="Auth: Register Attendee",
        )

        if reg_resp.status_code == 201:
            # Login
            login_resp = self.client.post(
                "/api/v1/auth/login",
                json={"email": self.user_email, "password": password},
                name="Auth: Login",
            )
            if login_resp.status_code == 200:
                self.user_token = login_resp.json().get("access_token", "")

    def get_auth_headers(self, idempotency_key: str | None = None) -> dict:
        headers = {"Authorization": f"Bearer {self.user_token}"}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        return headers

    @task(4)
    def attempt_registration(self):
        """Simulate concurrent seat registration with row-level locking capacity checks."""
        if not self.user_token or not self.event_id:
            return

        idemp_key = str(uuid.uuid4())
        headers = self.get_auth_headers(idempotency_key=idemp_key)

        with self.client.post(
            f"/api/v1/events/{self.event_id}/registrations",
            headers=headers,
            json={},
            catch_response=True,
            name="Registrations: Register for Event",
        ) as response:
            # Expected outcomes:
            # 201: Successfully reserved and registered
            # 409: Capacity full or user already registered (expected under concurrency limit)
            if response.status_code in (201, 409):
                response.success()
            else:
                response.failure(f"Unexpected status code: {response.status_code} - {response.text}")

    @task(3)
    def idempotent_retry_simulation(self):
        """Verify that duplicate requests with identical Idempotency-Key are safely replayed."""
        if not self.user_token or not self.event_id:
            return

        reusable_key = f"idemp-retry-{self.user_email}"
        headers = self.get_auth_headers(idempotency_key=reusable_key)

        # First request
        self.client.post(
            f"/api/v1/events/{self.event_id}/registrations",
            headers=headers,
            json={},
            name="Idempotency: Initial Request",
        )

        # Immediate retry with same key
        with self.client.post(
            f"/api/v1/events/{self.event_id}/registrations",
            headers=headers,
            json={},
            catch_response=True,
            name="Idempotency: Replay Duplicate Key",
        ) as retry_resp:
            # Must return the same cached response (201 or 409) without 500 error
            if retry_resp.status_code in (200, 201, 409):
                retry_resp.success()
            else:
                retry_resp.failure(f"Idempotency retry failed with {retry_resp.status_code}")

    @task(2)
    def seat_hold_and_pay_flow(self):
        """Simulate temporary hold reservation followed by mock payment conversion."""
        if not self.user_token or not self.event_id:
            return

        headers = self.get_auth_headers()
        with self.client.post(
            f"/api/v1/events/{self.event_id}/holds",
            headers=headers,
            json={"ttl_minutes": 5},
            catch_response=True,
            name="Holds: Acquire Temporary Hold",
        ) as hold_resp:
            if hold_resp.status_code == 201:
                hold_resp.success()
                hold_id = hold_resp.json().get("id")

                # Mock Payment
                pay_resp = self.client.post(
                    f"/api/v1/holds/{hold_id}/pay",
                    headers=self.get_auth_headers(idempotency_key=str(uuid.uuid4())),
                    json={"amount": 10.0, "currency": "USD", "simulate_failure": False},
                    name="Payments: Process Mock Payment",
                )
            elif hold_resp.status_code == 409:
                # Capacity exhausted or active hold exists - valid under concurrency
                hold_resp.success()
            else:
                hold_resp.failure(f"Hold acquisition failed: {hold_resp.status_code}")

    @task(1)
    def browse_event_details(self):
        """Simulate read traffic browsing the event."""
        self.client.get(
            f"/api/v1/events/{self.event_id}",
            name="Events: Public Get Detail",
        )
