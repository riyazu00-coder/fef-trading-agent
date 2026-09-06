"""
Unit tests for Cloud-to-Local Order Forwarding & Bearer Token HMAC Authentication.
Verifies:
1. Sensitive POST execution endpoints in backend/server.py return 401 on missing or invalid Bearer auth.
2. Sensitive POST execution endpoints succeed with valid FEF_BRIDGE_SECRET Bearer token.
3. api/index.py falls back to in-memory paper simulation when MT5_TUNNEL_URL is unset.
4. api/index.py forwards authenticated request to MT5_TUNNEL_URL when set.
"""

from dataclasses import asdict
from http.server import HTTPServer
import io
import json
import os
import unittest
from unittest.mock import patch, MagicMock

from backend.server import TradingAgentsApiHandler, FEF_BRIDGE_SECRET_DEFAULT
from api.index import handler as VercelHandler


class DummyRequest:
    def __init__(self, body_bytes: bytes):
        self._file = io.BytesIO(body_bytes)

    def makefile(self, *args, **kwargs):
        return self._file


class TestCloudTunnelSecurity(unittest.TestCase):
    def setUp(self):
        # Clean environment before each test
        if "FEF_BRIDGE_SECRET" in os.environ:
            del os.environ["FEF_BRIDGE_SECRET"]
        if "MT5_TUNNEL_URL" in os.environ:
            del os.environ["MT5_TUNNEL_URL"]

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

    def _simulate_vercel_post(self, path: str, payload: dict) -> tuple[int, dict]:
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

    def test_missing_bearer_token_returns_401(self):
        """POST execution endpoints must return 401 when Authorization header is omitted."""
        endpoints = ["/api/quick_execute", "/api/execute", "/api/close_all", "/api/break_even"]
        for ep in endpoints:
            status, res = self._simulate_server_post(ep, {"symbol": "XAUUSD", "action": "BUY"}, auth_header=None)
            self.assertEqual(status, 401, f"Failed for {ep}: got {status}")
            self.assertEqual(res.get("error"), "Unauthorized")

    def test_invalid_bearer_token_returns_401(self):
        """POST execution endpoints must return 401 when Authorization header token is wrong."""
        status, res = self._simulate_server_post(
            "/api/quick_execute",
            {"symbol": "XAUUSD", "action": "BUY"},
            auth_header="Bearer wrong_secret_token_xyz"
        )
        self.assertEqual(status, 401)
        self.assertEqual(res.get("error"), "Unauthorized")

    def test_valid_bearer_token_executes_successfully(self):
        """POST /api/quick_execute with valid Bearer token executes order."""
        secret = "test_custom_secret_key_123"
        os.environ["FEF_BRIDGE_SECRET"] = secret

        status, res = self._simulate_server_post(
            "/api/quick_execute",
            {"symbol": "XAUUSD", "action": "BUY", "lot_size": 0.50},
            auth_header=f"Bearer {secret}"
        )
        self.assertEqual(status, 200)
        self.assertEqual(res.get("status"), "EXECUTED")
        self.assertIn("ticket", res)
        self.assertEqual(res["ticket"]["action"], "BUY")

    def test_vercel_gateway_paper_fallback_when_tunnel_absent(self):
        """When MT5_TUNNEL_URL is absent, Vercel gateway executes cleanly via in-memory Paper Simulator."""
        status, res = self._simulate_vercel_post(
            "/api/quick_execute",
            {"symbol": "XAUUSD", "action": "BUY", "lot_size": 0.10}
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
            {"symbol": "XAUUSD", "action": "BUY", "lot_size": 1.00}
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
            {"symbol": "XAUUSD", "action": "BUY", "lot_size": 1.00}
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
            {"symbol": "XAUUSD", "action": "BUY", "lot_size": 1.00}
        )
        self.assertEqual(status, 503)
        self.assertEqual(res.get("status"), "TUNNEL_UNAVAILABLE_503")
        self.assertIn("raw_response", res)
        self.assertEqual(res["raw_response"], raw_503_html)


if __name__ == "__main__":
    unittest.main()
