"""Cloud Run kill-switch that unlinks project billing when a Cloud Billing budget hits 100%."""

import base64
import json
import logging
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("billing-kill-switch")

PROJECT_ID = os.environ.get("PROJECT_ID", "livingplus-515211")
METADATA_TOKEN_URL = (
    "http://metadata.google.internal/computeMetadata/v1/"
    "instance/service-accounts/default/token"
)
BILLING_URL = f"https://cloudbilling.googleapis.com/v1/projects/{PROJECT_ID}/billingInfo"


def get_access_token() -> str:
    """Fetch a short-lived OAuth2 access token from the Cloud Run metadata server."""
    req = urllib.request.Request(
        METADATA_TOKEN_URL,
        headers={"Metadata-Flavor": "Google"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return payload["access_token"]


def get_billing_info(token: str) -> dict:
    """Read current billing status for PROJECT_ID."""
    req = urllib.request.Request(
        BILLING_URL,
        headers={"Authorization": f"Bearer {token}"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def disable_billing(token: str) -> dict:
    """Unlink the billing account from PROJECT_ID to halt billable charges."""
    body = json.dumps({"billingAccountName": ""}).encode("utf-8")
    req = urllib.request.Request(
        BILLING_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="PUT",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


class KillSwitchHandler(BaseHTTPRequestHandler):
    """Handles health checks and Cloud Billing Pub/Sub push notifications."""

    def _send_json(self, code: int, payload: dict) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        if self.path == "/healthz":
            self._send_json(200, {"status": "ok", "project": PROJECT_ID})
            return
        self._send_json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length) if length > 0 else b"{}"
        try:
            envelope = json.loads(raw_body.decode("utf-8"))
            encoded = envelope.get("message", {}).get("data", "")
            if not encoded:
                log.warning("Received Pub/Sub request with empty message.data")
                self._send_json(200, {"action": "ignored_empty"})
                return
            data = json.loads(base64.b64decode(encoded).decode("utf-8"))
        except Exception as exc:
            log.error("Failed to decode Pub/Sub envelope: %s", exc)
            self._send_json(400, {"error": "invalid_payload"})
            return

        budget_name = data.get("budgetDisplayName", "unknown")
        cost = float(data.get("costAmount", 0))
        budget = float(data.get("budgetAmount", 0))
        currency = data.get("currencyCode", "INR")
        health_check = bool(data.get("_healthCheck", False))

        log.info(
            "Budget=%s cost=%.2f %s / budget=%.2f %s",
            budget_name,
            cost,
            currency,
            budget,
            currency,
        )

        if budget <= 0:
            log.warning("Non-positive budgetAmount=%.2f; ignoring", budget)
            self._send_json(200, {"action": "ignored_nonpositive_budget"})
            return

        if cost < budget:
            if health_check:
                try:
                    token = get_access_token()
                    info = get_billing_info(token)
                    log.info(
                        "HealthCheck verified billingInfo: billingEnabled=%s account=%s",
                        info.get("billingEnabled"),
                        info.get("billingAccountName"),
                    )
                    self._send_json(
                        200,
                        {
                            "action": "noop_verified",
                            "billingEnabled": info.get("billingEnabled"),
                        },
                    )
                except urllib.error.HTTPError as err:
                    err_body = err.read().decode("utf-8", errors="replace")
                    log.error("HealthCheck billing API error %s: %s", err.code, err_body)
                    self._send_json(500, {"error": "billing_api_error", "status": err.code})
                return

            self._send_json(200, {"action": "noop", "cost": cost, "budget": budget})
            return

        # Threshold reached (cost >= budget): unlink billing immediately
        try:
            token = get_access_token()
            info = get_billing_info(token)
            if not info.get("billingEnabled", False):
                log.info("Billing already disabled for %s", PROJECT_ID)
                self._send_json(200, {"action": "already_disabled"})
                return

            result = disable_billing(token)
            log.critical(
                "CRITICAL: Billing disabled for %s due to budget=%s (cost=%.2f >= %.2f %s). Result=%s",
                PROJECT_ID,
                budget_name,
                cost,
                budget,
                currency,
                result,
            )
            self._send_json(200, {"action": "billing_disabled", "project": PROJECT_ID})
        except urllib.error.HTTPError as err:
            err_body = err.read().decode("utf-8", errors="replace")
            log.error("Failed to disable billing (%s): %s", err.code, err_body)
            self._send_json(500, {"error": "disable_billing_failed", "status": err.code})

    def log_message(self, format: str, *args) -> None:
        return


def main() -> None:
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), KillSwitchHandler)
    log.info("billing-kill-switch listening on port %d for project %s", port, PROJECT_ID)
    server.serve_forever()


if __name__ == "__main__":
    main()
