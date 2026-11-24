#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (c) 2026 Orebit (Ghozian Islam Karami)
"""Local mock/unit tests for ops/scripts/ci/prod-smoke.py (no network required)."""

from __future__ import annotations

import gzip
import http.server
import importlib.util
import json
import re
import subprocess
import sys
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SMOKE_PATH = ROOT / "ops" / "scripts" / "ci" / "prod-smoke.py"

spec = importlib.util.spec_from_file_location("prod_smoke", SMOKE_PATH)
assert spec and spec.loader
prod_smoke = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = prod_smoke
spec.loader.exec_module(prod_smoke)

REGIONS = ["sumatra", "babel", "jawa", "balinusra", "kalimantan", "sulawesi", "maluku", "papua"]


class MockProdState:
    def __init__(self) -> None:
        self.break_pmtiles_206 = False
        self.break_cors = False
        self.break_index_count = False
        self.break_permissions = False


class MockHandler(http.server.BaseHTTPRequestHandler):
    state: MockProdState

    def log_message(self, format, *args):  # noqa: A002
        pass

    def _send_gz(self, status: int, content_type: str, data: bytes, extra_headers: dict[str, str] | None = None) -> None:
        gz = gzip.compress(data)
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(gz)))
        if not self.state.break_permissions:
            self.send_header("Permissions-Policy", "geolocation=(self), microphone=(), camera=()")
        for k, v in (extra_headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(gz)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/":
            self._send_gz(200, "text/html; charset=utf-8", b"<!doctype html><html><title>Orebit GeoAtlas</title></html>", {"Cache-Control": "no-cache"})
        elif self.path == "/app/":
            html = b'<!doctype html><html><title>GeoAtlas</title><script type="module" src="/assets/app-test123.js"></script></html>'
            self._send_gz(200, "text/html; charset=utf-8", html)
        elif self.path == "/assets/app-test123.js":
            js = b'const cfg = { orebitTiles: "/tiles/all.pmtiles" };'
            self._send_gz(200, "application/javascript", js, {"Cache-Control": "public, max-age=31536000, immutable"})
        elif self.path == "/manifest.json":
            manifest = json.dumps({"name": "Orebit GeoAtlas", "start_url": "/app/?source=pwa"}).encode("utf-8")
            self._send_gz(200, "application/json", manifest)
        elif self.path == "/sw.js":
            self._send_gz(200, "application/javascript", b'const SHELL = "geoatlas-shell-v4";', {"Cache-Control": "max-age=14400"})
        elif self.path == "/data/indonesia-units-index.json":
            n = 10 if self.state.break_index_count else 2130
            payload = json.dumps({
                "schema": "orebit-geoatlas-index-v1",
                "regions": REGIONS,
                "unit_count": n,
                "units": [{"unit_id": f"U{i}"} for i in range(n)],
            }).encode("utf-8")
            self._send_gz(200, "application/json", payload)
        elif self.path == "/tiles/all.pmtiles":
            blob = b"PMTiles" + b"\x00" * 20000
            if self.state.break_pmtiles_206:
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(len(blob)))
                self.end_headers()
                self.wfile.write(blob)
                return
            rng = self.headers.get("Range", "")
            m = re.fullmatch(r"bytes=(\d+)-(\d*)", rng)
            if not m:
                self.send_response(416)
                self.end_headers()
                return
            a, b = int(m.group(1)), min(int(m.group(2) or len(blob) - 1), len(blob) - 1)
            body = blob[a : b + 1]
            self.send_response(206)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Range", f"bytes {a}-{b}/{len(blob)}")
            self.send_header("Content-Length", str(len(body)))
            if not self.state.break_cors:
                self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()


class TestProdSmoke(unittest.TestCase):
    def setUp(self) -> None:
        self.state = MockProdState()
        state = self.state

        class BoundHandler(MockHandler):
            pass

        BoundHandler.state = state
        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), BoundHandler)
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.base_url = f"http://127.0.0.1:{self.port}"

    def tearDown(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()

    def test_all_checks_pass_against_valid_mock_server(self) -> None:
        proc = subprocess.run(
            [sys.executable, str(SMOKE_PATH), self.base_url],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("7/7 checks passed", proc.stdout)

    def test_fails_when_pmtiles_returns_200_instead_of_206(self) -> None:
        self.state.break_pmtiles_206 = True
        results = dict((name, ok) for name, ok, _ in prod_smoke.run_smoke(self.base_url))
        self.assertFalse(results["pmtiles-range"])

    def test_fails_when_cors_header_missing(self) -> None:
        self.state.break_cors = True
        results = dict((name, ok) for name, ok, _ in prod_smoke.run_smoke(self.base_url))
        self.assertFalse(results["pmtiles-range"])

    def test_fails_when_index_below_threshold_or_permissions_missing(self) -> None:
        self.state.break_index_count = True
        self.state.break_permissions = True
        results = dict((name, ok) for name, ok, _ in prod_smoke.run_smoke(self.base_url))
        self.assertFalse(results["national-index"])
        self.assertFalse(results["landing-html"])
        self.assertFalse(results["app-html"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
