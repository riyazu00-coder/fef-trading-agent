"""
Unit tests for Cloud-to-Local Order Forwarding & Bearer Token HMAC Authentication.
Verifies all mutating local and Vercel endpoints share fail-closed Bearer auth.
"""

from dataclasses import asdict
from http.server import HTTPServer
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch, MagicMock

# Prevent the production MT5 socket listener from starting as an import side
# effect. This flag is scoped to the test process and does not alter runtime code.
os.environ.setdefault("VERCEL", "1")

from backend.auth import MUTATING_ENDPOINTS
from backend.server import TradingAgentsApiHandler
from api.index import handler as VercelHandler


TEST_SECRET = "test_custom_secret_key_123"


class DummyRequest:
    def __init__(self, body_bytes: bytes):
        self._file = io.BytesIO(body_bytes)

    def makefile(self, *args, **kwargs):
        return self._file


class TestCloudTunnelSecurity(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {"FEF_BRIDGE_SECRET": TEST_SECRET})
        environment.start()
        self.addCleanup(environment.stop)
        os.environ.pop("MT5_TUNNEL_URL", None)

    def _simulate_server_post(self, path: str, payload: dict, auth_header: str = None) -> tuple[int, dict]:
        """Helper to invoke TradingAgentsApiHandler do_POST in-memory."""
        raw_body = json.dumps(payload).encode("utf-8")
        handler = TradingAgentsApiHandler.__new__(TradingAgentsApiHandler)
        handler.path = path
        handler.rfile = io.BytesIO(raw_body)
        handler.wfile = io.BytesIO()
        
        headers = {
            "Content-Length": str(len(raw_body)),
            "Content-Type": "application/json"
        }
        if auth_header is not None:
            headers["Authorization"] = auth_header
        handler.headers = headers

        captured_status = [200]
        def fake_send_response(code):
            captured_status[0] = code
        handler.send_response = fake_send_response
        handler.send_header = lambda k, v: None
        handler.end_headers = lambda: None

        handler.do_POST()
        res_bytes = handler.wfile.getvalue()
        res_json = json.loads(res_bytes.decode("utf-8")) if res_bytes else {}
        return captured_status[0], res_json

    def _simulate_vercel_post(self, path: str, payload: dict, auth_header: str = None) -> tuple[int, dict]:
        """Helper to invoke Vercel handler do_POST in-memory."""
        raw_body = json.dumps(payload).encode("utf-8")
        handler = VercelHandler.__new__(VercelHandler)
        handler.path = path
        handler.rfile = io.BytesIO(raw_body)
        handler.wfile = io.BytesIO()
        handler.headers = {
            "Content-Length": str(len(raw_body)),
            "Content-Type": "application/json"
        }
        if auth_header is not None:
            handler.headers["Authorization"] = auth_header

        captured_status = [200]
        def fake_send_response(code):
            captured_status[0] = code
        handler.send_response = fake_send_response
        handler.send_header = lambda k, v: None
        handler.end_headers = lambda: None

        handler.do_POST()
        res_bytes = handler.wfile.getvalue()
        res_json = json.loads(res_bytes.decode("utf-8")) if res_bytes else {}
        return captured_status[0], res_json

    def _assert_auth_rejected(self, auth_header):
        for endpoint in sorted(MUTATING_ENDPOINTS):
            for name, simulate in (
                ("local", self._simulate_server_post),
                ("vercel", self._simulate_vercel_post),
            ):
                with self.subTest(handler=name, endpoint=endpoint, auth=auth_header):
                    status, response = simulate(
                        endpoint,
                        {"symbol": "XAUUSD", "action": "BUY", "ticket": 999999},
                        auth_header=auth_header,
                    )
                    self.assertEqual(status, 401)
                    self.assertEqual(response.get("status"), "UNAUTHORIZED")

    def test_all_mutating_endpoints_reject_missing_bearer_token(self):
        self._assert_auth_rejected(None)

    def test_all_mutating_endpoints_reject_malformed_authorization(self):
        for malformed in ("", "Bearer", "Basic abc", "Token abc", "Bearer   "):
            self._assert_auth_rejected(malformed)

    def test_all_mutating_endpoints_reject_wrong_bearer_token(self):
        self._assert_auth_rejected("Bearer wrong_secret_token_xyz")

    def test_authentication_fails_closed_without_configured_secret(self):
        del os.environ["FEF_BRIDGE_SECRET"]
        self._assert_auth_rejected(f"Bearer {TEST_SECRET}")

    def test_frontend_contains_no_default_or_persisted_execution_secret(self):
        source = (Path(__file__).resolve().parents[1] / "frontend" / "index.html").read_text(
            encoding="utf-8"
        )
        self.assertNotIn("fef_institutional_secure_bridge_default_key_2026", source)
        self.assertNotIn('localStorage.getItem("FEF_BRIDGE_SECRET")', source)
        self.assertIn("window.FEF_BRIDGE_TOKEN", source)
        self.assertIn("headers: getAuthHeaders()", source)

    def test_all_mutating_endpoints_accept_valid_bearer_token(self):
        payloads = {
            "/api/execute": {"symbol": "INVALID"},
            "/api/quick_execute": {"symbol": "INVALID", "action": "BUY"},
            "/api/close_position": {},
            "/api/close_all": {"symbol": "INVALID"},
            "/api/break_even": {"symbol": "INVALID"},
        }
        for endpoint, payload in payloads.items():
            for name, simulate in (
                ("local", self._simulate_server_post),
                ("vercel", self._simulate_vercel_post),
            ):
                with self.subTest(handler=name, endpoint=endpoint):
                    status, response = simulate(
                        endpoint,
                        payload,
                        auth_header=f"Bearer {TEST_SECRET}",
                    )
                    self.assertIn(status, (200, 400, 404), response)

    def test_valid_bearer_token_executes_successfully(self):
        """POST /api/quick_execute with valid Bearer token executes order."""
        # This test characterizes the paper response and must not depend on a
        # real Common Files quote that happens to be fresh on the test host.
        with patch(
            "backend.server.mt5_bridge.get_status",
            return_value={"connected": False},
        ):
            status, res = self._simulate_server_post(
                "/api/quick_execute",
                {"symbol": "XAUUSD", "action": "BUY", "lot_size": 0.50},
                auth_header=f"Bearer {TEST_SECRET}"
            )
        self.assertEqual(status, 200)
        self.assertEqual(res.get("status"), "PAPER_EXECUTED")
        self.assertIn("ticket", res)
        self.assertEqual(res["ticket"]["action"], "BUY")

    def test_vercel_gateway_paper_fallback_when_tunnel_absent(self):
        """When MT5_TUNNEL_URL is absent, Vercel gateway executes cleanly via in-memory Paper Simulator."""
        status, res = self._simulate_vercel_post(
            "/api/quick_execute",
            {"symbol": "XAUUSD", "action": "BUY", "lot_size": 0.10},
            auth_header=f"Bearer {TEST_SECRET}",
        )
        self.assertEqual(status, 200)
        self.assertEqual(res.get("status"), "FILLED")
        self.assertEqual(res.get("execution_mode"), "IN_MEMORY_SIMULATION")
        self.assertFalse(res.get("tunnel_active"))
        self.assertIn("order", res)

    @patch("urllib.request.urlopen")
    def test_vercel_gateway_forwards_to_tunnel_when_configured(self, mock_urlopen):
        """When MT5_TUNNEL_URL is present, Vercel gateway forwards order with Bearer token."""
        tunnel_url = "https://fef-local-tunnel.ngrok-free.app"
        secret = "super_secure_tunnel_secret_999"
        os.environ["MT5_TUNNEL_URL"] = tunnel_url
        os.environ["FEF_BRIDGE_SECRET"] = secret

        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = json.dumps({
            "status": "EXECUTED",
            "forwarded": True,
            "message": "Executed through local MT5 Bridge"
        }).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        status, res = self._simulate_vercel_post(
            "/api/quick_execute",
            {"symbol": "XAUUSD", "action": "BUY", "lot_size": 1.00},
            auth_header=f"Bearer {secret}",
        )

        self.assertEqual(status, 200)
        self.assertEqual(res.get("status"), "EXECUTED")
        self.assertTrue(res.get("forwarded"))

        # Verify urllib.request was called with proper URL, Auth, Bypass, and User-Agent headers
        mock_urlopen.assert_called_once()
        req_arg = mock_urlopen.call_args[0][0]
        self.assertEqual(req_arg.full_url, f"{tunnel_url}/api/quick_execute")
        self.assertEqual(req_arg.headers["Authorization"], f"Bearer {secret}")
        self.assertEqual(req_arg.headers["Bypass-tunnel-reminder"], "true")
        self.assertEqual(req_arg.headers["User-agent"], "FEF-Institutional-Bridge/2.4.0")

    @patch("urllib.request.urlopen")
    def test_tunnel_url_sanitization(self, mock_urlopen):
        """Verify markdown links, brackets, and trailing slashes in MT5_TUNNEL_URL are cleanly sanitized."""
        # Simulated markdown link as pasted by user
        os.environ["MT5_TUNNEL_URL"] = "[https://three-women-give.loca.lt](https://three-women-give.loca.lt)/"
        os.environ["FEF_BRIDGE_SECRET"] = "secret_abc"

        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = b'{"status": "EXECUTED"}'
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        status, res = self._simulate_vercel_post(
            "/api/quick_execute",
            {"symbol": "XAUUSD", "action": "BUY", "lot_size": 1.00},
            auth_header="Bearer secret_abc",
        )
        self.assertEqual(status, 200)
        req_arg = mock_urlopen.call_args[0][0]
        self.assertEqual(req_arg.full_url, "https://three-women-give.loca.lt/api/quick_execute")

    @patch("urllib.request.urlopen")
    def test_tunnel_503_returns_raw_body_response(self, mock_urlopen):
        """When tunnel returns HTTP 503, raw body response is logged and returned for debugging."""
        os.environ["MT5_TUNNEL_URL"] = "https://three-women-give.loca.lt"
        os.environ["FEF_BRIDGE_SECRET"] = "secret_abc"

        raw_503_html = "<html><body>503 Service Unavailable: No active tunnel client</body></html>"
        import urllib.error
        http_error = urllib.error.HTTPError(
            url="https://three-women-give.loca.lt/api/quick_execute",
            code=503,
            msg="Service Unavailable",
            hdrs={},
            fp=io.BytesIO(raw_503_html.encode("utf-8"))
        )
        mock_urlopen.side_effect = http_error

        status, res = self._simulate_vercel_post(
            "/api/quick_execute",
            {"symbol": "XAUUSD", "action": "BUY", "lot_size": 1.00},
            auth_header="Bearer secret_abc",
        )
        self.assertEqual(status, 503)
        self.assertEqual(res.get("status"), "TUNNEL_UNAVAILABLE_503")
        self.assertIn("raw_response", res)
        self.assertEqual(res["raw_response"], raw_503_html)


if __name__ == "__main__":
    unittest.main()
