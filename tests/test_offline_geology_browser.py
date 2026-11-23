#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (c) 2026 Orebit (Ghozian Islam Karami)
"""Playwright check for offline geology (WP-31 / PWA-02): service worker Range cache + "Simpan area".

Hermetic: builds the app into a temp dir with VITE_TILES_URL pointing at a tiny PMTiles made by tippecanoe from a
synthetic polygon near Bangka-Belitung, and serves it from a local server that supports HTTP Range. External hosts
are aborted (the basemap style is replaced by a minimal one). Skips when tippecanoe or app/node_modules is missing.
"""

from __future__ import annotations

import http.server
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
TILES_URL = "/tiles/test-v1.pmtiles"
VIEW = "#map=8/-2.2/106.0"  # Babel; poligon uji mengelilingi titik tengah ini
ZOOM_VIEW = "#map=10/-2.2/106.0"  # zoom +2: tile-nya hanya ada di cache bila "Simpan area" benar-benar menyimpannya
FAR_VIEW = "#map=8/-7.5/110.5"  # Jawa: di luar area yang disimpan
MIN_STYLE = {"version": 8, "sources": {}, "layers": [{"id": "bg", "type": "background", "paint": {"background-color": "#e8edf0"}}]}


class RangeHandler(http.server.SimpleHTTPRequestHandler):
    log: list[tuple[str, str, int]] = []
    etag = '"test-v1"'
    head_mode = ""  # "" | "500" | "hang": perilaku untuk permintaan header (bytes=0-...)

    def log_message(self, format, *args):  # noqa: A002
        pass

    def do_GET(self) -> None:  # noqa: N802
        rng = self.headers.get("Range")
        path = Path(self.translate_path(self.path))
        if not rng or not path.is_file():
            return super().do_GET()
        if path.suffix == ".pmtiles" and rng.startswith("bytes=0-"):
            if type(self).head_mode == "500":
                self.send_response(500)
                self.end_headers()
                return
            if type(self).head_mode == "hang":
                time.sleep(6)
        data = path.read_bytes()
        m = re.fullmatch(r"bytes=(\d+)-(\d*)", rng)
        if not m or int(m.group(1)) >= len(data):
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{len(data)}")
            self.end_headers()
            return
        a = int(m.group(1))
        b = min(int(m.group(2)) if m.group(2) else len(data) - 1, len(data) - 1)
        body = data[a : b + 1]
        if path.suffix == ".pmtiles":
            type(self).log.append((self.path, rng, 206))
        self.send_response(206)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Range", f"bytes {a}-{b}/{len(data)}")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("ETag", type(self).etag)
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        self.wfile.write(body)


def make_geojson(path: Path) -> None:
    ring = [[105.0, -3.2], [107.0, -3.2], [107.0, -1.2], [105.0, -1.2], [105.0, -3.2]]
    props = {
        "poly_id": "T1", "unit_id": "TEST_UNIT", "region": "babel", "formation": "Formasi Uji Offline", "symbol": "Tuo",
        "lith_class": "sedimentary", "lith_parent": "sedimentary", "lith_detail": "batupasir", "age_top_ma": 0.0, "age_base_ma": 100.0,
        "interval_top": "Holosen", "interval_base": "Kapur", "color_hex": "#E6B800", "color_hex_coarse": "#E6B800",
        "confidence": "curated", "area_km2": 1000.0, "description": "uji", "sheet_name": "Uji", "source_url": "", "source_id": "t",
    }
    path.write_text(json.dumps({"type": "FeatureCollection", "features": [{"type": "Feature", "properties": props, "geometry": {"type": "Polygon", "coordinates": [ring]}}]}))


@unittest.skipUnless(shutil.which("tippecanoe") and (APP / "node_modules").is_dir(), "needs tippecanoe and app/node_modules")
class TestOfflineGeology(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = Path(tempfile.mkdtemp(prefix="geoatlas-offline-"))
        dist = cls.tmp / "dist"
        gj = cls.tmp / "t.geojson"
        make_geojson(gj)
        subprocess.run(["tippecanoe", "-q", "-o", str(cls.tmp / "t.pmtiles"), "-l", "units", "-Z4", "-z10", "--force", str(gj)], check=True)
        env = {**os.environ, "VITE_TILES_URL": TILES_URL}
        subprocess.run(["npx", "vite", "build", "--outDir", str(dist), "--emptyOutDir"], cwd=APP, env=env, check=True, capture_output=True)
        (dist / "tiles").mkdir(exist_ok=True)
        shutil.copy(cls.tmp / "t.pmtiles", dist / "tiles" / "test-v1.pmtiles")
        RangeHandler.log = []
        handler = lambda *a, **k: RangeHandler(*a, directory=str(dist), **k)  # noqa: E731
        cls.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.origin = f"http://127.0.0.1:{cls.port}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.httpd.shutdown()
        cls.httpd.server_close()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def new_page(self, p):
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1366, "height": 768}, locale="en-US")
        origin = self.origin

        def route(r):
            url = r.request.url
            if url.startswith(origin):
                return r.continue_()
            if "tiles.openfreemap.org/styles/" in url:
                return r.fulfill(status=200, content_type="application/json", body=json.dumps(MIN_STYLE))
            return r.abort()

        ctx.route("**/*", route)
        page = ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("dialog", lambda d: d.accept())
        return browser, ctx, page, errors

    @staticmethod
    def geology_hit(page, tries: int = 25) -> bool:
        """True bila klik di tengah peta mengenai poligon geologi (panel detail terbuka)."""
        box = page.locator("#map").bounding_box()
        for _ in range(tries):
            page.mouse.click(box["x"] + box["width"] / 2 + 150, box["y"] + box["height"] / 2)
            try:
                page.wait_for_selector("#detail:not([hidden])", timeout=800)
                page.click("#detailClose")
                return True
            except Exception:
                page.wait_for_timeout(300)
        return False

    def setUp(self) -> None:
        RangeHandler.etag = '"test-v1"'
        RangeHandler.head_mode = ""

    def saved_session(self, p):
        """Kunjungan pertama di tampilan lain, lalu tampilan z8 yang belum pernah dilihat: klik Simpan (online)."""
        browser, ctx, page, errors = self.new_page(p)
        page.goto(f"{self.origin}/app/#map=5/-7.5/110.5", wait_until="load")
        page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller", timeout=20000)
        page.reload(wait_until="load")
        page.evaluate("location.hash = '%s'" % VIEW)
        page.wait_for_function("document.querySelector('.maplibregl-canvas') && location.hash.startsWith('#map=8/-2.2/106')")
        page.wait_for_timeout(1500)  # biarkan peta berpindah ke tampilan baru sebelum bounds dibaca
        page.click("#offSave")
        page.wait_for_function("document.getElementById('offStatus').textContent.includes('Area saved for offline')", timeout=60000)
        # Buang cache penjelajahan: yang tersisa hanya apa yang disimpan "Simpan area".
        page.evaluate("caches.delete('geoatlas-pmtiles-browse-v1')")
        return browser, ctx, page, errors

    def test_save_area_unvisited_view_offline_and_clear(self) -> None:
        with sync_playwright() as p:
            browser, ctx, page, errors = self.new_page(p)
            try:
                page.goto(f"{self.origin}/app/{VIEW}", wait_until="load")
                page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller", timeout=20000)
                page.reload(wait_until="load")  # kunjungan kedua: dikendalikan SW
                self.assertTrue(self.geology_hit(page), "online: poligon geologi harus bisa diklik")

                # Online: Range lewat SW tetap 206 benar, tiap rentang punya isi sendiri (tidak ada tabrakan kunci), tanpa tile rusak.
                probe = """async () => {
                  const get = async (r) => { const x = await fetch('%s', { headers: { Range: r } }); return { s: x.status, cr: x.headers.get('content-range'), b: new Uint8Array(await x.arrayBuffer()) }; };
                  const a = await get('bytes=0-6'); const b = await get('bytes=100-109'); const c = await get('bytes=100-109');
                  return { a: [a.s, a.cr, String.fromCharCode(...a.b)], b: [b.s, b.cr, b.b.length], same: b.b.join() === c.b.join(), differs: a.b.join() !== b.b.slice(0, 7).join() };
                }""" % TILES_URL
                r = page.evaluate(probe)
                self.assertEqual(r["a"][0], 206)
                self.assertTrue(r["a"][1].startswith("bytes 0-6/"), r["a"][1])
                self.assertEqual(r["a"][2], "PMTiles")
                self.assertEqual(r["b"][:1] + [r["b"][2]], [206, 10])
                self.assertTrue(r["same"] and r["differs"])
                self.assertTrue(all(s == 206 for _, _, s in RangeHandler.log))
            finally:
                browser.close()
            browser, ctx, page, errors = self.saved_session(p)
            try:
                self.assertGreater(page.evaluate("caches.open('geoatlas-pmtiles-v1').then(c => c.keys()).then(k => k.length)"), 3)
                self.assertFalse(page.evaluate("caches.has('geoatlas-pmtiles-browse-v1')"))
                self.assertIn("MB", page.inner_text("#offStatus"))
                ctx.set_offline(True)
                # z10 belum pernah dirender online: hanya ada karena Simpan area mengunduh zoom +2.
                page.goto(f"{self.origin}/app/{ZOOM_VIEW}", wait_until="load")
                page.reload(wait_until="load")
                self.assertTrue(self.geology_hit(page, 40), "offline: poligon geologi area tersimpan harus tampil")

                # Di luar area tersimpan: tidak crash, peta kosong, pesan offline.
                page.goto(f"{self.origin}/app/{FAR_VIEW}", wait_until="load")
                page.wait_for_timeout(1500)
                self.assertFalse(self.geology_hit(page, 3), "area di luar yang disimpan tidak punya geologi offline")
                self.assertIn("Offline", page.inner_text("#offStatus"))

                # Hapus data offline mengosongkan kedua cache.
                page.click("#offClear")
                page.wait_for_function("document.getElementById('offStatus').textContent.includes('Offline data deleted')", timeout=10000)
                self.assertFalse(page.evaluate("caches.has('geoatlas-pmtiles-v1')"))
                self.assertFalse(page.evaluate("caches.has('geoatlas-pmtiles-browse-v1')"))
                self.assertEqual(errors, [])
            finally:
                browser.close()

    def test_head_request_falls_back_to_cache(self) -> None:
        with sync_playwright() as p:
            browser, ctx, page, errors = self.saved_session(p)
            try:
                for mode in ("500", "hang"):
                    RangeHandler.head_mode = mode
                    t0 = time.time()
                    page.goto(f"{self.origin}/app/{ZOOM_VIEW}", wait_until="load")
                    page.reload(wait_until="load")
                    self.assertTrue(self.geology_hit(page, 40), f"permintaan header {mode}: geologi tersimpan tetap tampil")
                    self.assertLess(time.time() - t0, 30, f"mode {mode}: tidak boleh menunggu server yang menggantung")
                self.assertEqual(errors, [])
            finally:
                browser.close()

    def test_replaced_file_purges_saved_area_and_tells_user(self) -> None:
        with sync_playwright() as p:
            browser, ctx, page, errors = self.saved_session(p)
            try:
                self.assertIsNotNone(page.evaluate("localStorage.getItem('geoatlas.offline.v1')"))
                RangeHandler.etag = '"test-v2"'  # redeploy: berkas sama, ETag baru
                page.goto(f"{self.origin}/app/{VIEW}", wait_until="load")
                page.reload(wait_until="load")
                page.wait_for_function("localStorage.getItem('geoatlas.offline.v1') === null", timeout=20000)
                page.wait_for_function("document.getElementById('offStatus').textContent.includes('updated')", timeout=20000)
                self.assertEqual(page.evaluate("caches.open('geoatlas-pmtiles-v1').then(c => c.keys()).then(k => k.length)"), 0)
                self.assertEqual(errors, [])
            finally:
                browser.close()

    def test_etag_unchanged_keeps_saved_area(self) -> None:
        with sync_playwright() as p:
            browser, ctx, page, errors = self.saved_session(p)
            try:
                n = page.evaluate("caches.open('geoatlas-pmtiles-v1').then(c => c.keys()).then(k => k.length)")
                page.goto(f"{self.origin}/app/{VIEW}", wait_until="load")
                page.reload(wait_until="load")
                page.wait_for_timeout(2500)
                self.assertEqual(page.evaluate("caches.open('geoatlas-pmtiles-v1').then(c => c.keys()).then(k => k.length)"), n)
                self.assertIsNotNone(page.evaluate("localStorage.getItem('geoatlas.offline.v1')"))
            finally:
                browser.close()

    def test_sw_upgrade_keeps_basemap_cache_and_drops_old_shell(self) -> None:
        with sync_playwright() as p:
            browser, ctx, page, errors = self.new_page(p)
            try:
                page.goto(f"{self.origin}/favicon.svg", wait_until="load")  # origin sama, SW belum terdaftar
                page.evaluate("""async () => {
                  await (await caches.open('geoatlas-tiles-v3')).put('/basemap-marker', new Response('ok'));
                  await (await caches.open('geoatlas-shell-v3')).put('/old', new Response('old'));
                }""")
                page.goto(f"{self.origin}/app/", wait_until="load")
                page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller", timeout=20000)
                self.assertTrue(page.evaluate("caches.open('geoatlas-tiles-v3').then(c => c.match('/basemap-marker')).then(r => !!r)"))
                self.assertFalse(page.evaluate("caches.has('geoatlas-shell-v3')"))
            finally:
                browser.close()

    def test_precache_assets_and_version(self) -> None:
        with sync_playwright() as p:
            browser, ctx, page, errors = self.new_page(p)
            try:
                page.goto(f"{self.origin}/app/", wait_until="load")
                page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller", timeout=20000)
                keys = page.evaluate("caches.keys()")
                self.assertIn("geoatlas-shell-v4", keys)
                assets = page.evaluate("caches.open('geoatlas-shell-v4').then(c => c.keys()).then(k => k.map(r => new URL(r.url).pathname).filter(p => p.startsWith('/assets/')))")
                self.assertTrue(any(a.endswith(".js") for a in assets) and any(a.endswith(".css") for a in assets), assets)
                self.assertEqual(errors, [])
            finally:
                browser.close()


if __name__ == "__main__":
    unittest.main()
