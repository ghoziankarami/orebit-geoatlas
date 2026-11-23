#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (c) 2026 Orebit (Ghozian Islam Karami)
"""Playwright E2E UI/UX verification for Orebit GeoAtlas (Desktop 1366x768 & Mobile 375x812, ID & EN)."""

from __future__ import annotations

import functools
import http.server
import re
import socketserver
import threading
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "app" / "dist"

# Membaca seluruh isi IndexedDB foto + localStorage waypoint/lintasan; foto dibandingkan lewat SHA-256 bytenya.
SNAPSHOT_JS = """async () => {
  const wps = JSON.parse(localStorage.getItem('geoatlas.waypoints.v1') || '[]');
  const transect = (JSON.parse(localStorage.getItem('geoatlas.session.v1') || '{}')).transect ?? null;
  const db = await new Promise((res, rej) => { const r = indexedDB.open('geoatlas-photos'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  let rows = [];
  if (db.objectStoreNames.contains('photos')) {
    rows = await new Promise((res, rej) => { const q = db.transaction('photos').objectStore('photos').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  }
  db.close();
  const photos = [];
  for (const r of rows) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', await r.blob.arrayBuffer()));
    photos.push({ id: r.id, wpId: r.wpId, caption: r.caption, azimuth: r.azimuth, takenAt: r.takenAt, w: r.w, h: r.h, bytes: r.bytes, sha256: Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('') });
  }
  photos.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { wps, transect, photos };
}"""


THUMBS_OK_JS = "[...document.querySelectorAll('#wpPhotoGrid img')].every(i => i.complete && i.naturalWidth > 0)"


def add_wp(page, x: int, y: int, name: str, kind: str = "outcrop", note: str = "", strike: str = "", dip: str = "", photos: list[Path] | None = None) -> None:
    """Menambah satu waypoint lewat UI: tempatkan di peta, isi panel, lalu simpan."""
    page.locator("#wpBtn").click()
    page.mouse.click(x, y)
    page.locator("#wpPanel").wait_for(state="visible")
    page.locator("#wpName").fill(name)
    page.locator(f'#wpKind button[data-kind="{kind}"]').click()
    if kind == "structure":
        page.locator("#wpStrike").fill(strike)
        page.locator("#wpDip").fill(dip)
    if note:
        page.locator("#wpNote").fill(note)
    for i, f in enumerate(photos or [], start=1):
        page.locator("#wpPhotoGal").set_input_files([str(f)])
        page.wait_for_function(f"document.querySelectorAll('#wpPhotoGrid li.wp-photo').length === {i}")
    page.wait_for_function(THUMBS_OK_JS)
    page.locator("#wpSave").click()
    page.locator("#wpPanel").wait_for(state="hidden")


def write_png(path: Path, w: int, h: int, rgb: tuple[int, int, int]) -> None:
    import struct
    import zlib

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = (b"\x00" + bytes(rgb) * w) * h
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 1)) + chunk(b"IEND", b""))


def boxes_overlap(a: dict, b: dict, margin: float = 0.0) -> bool:
    return not (
        a["x"] + a["width"] <= b["x"] + margin
        or b["x"] + b["width"] <= a["x"] + margin
        or a["y"] + a["height"] <= b["y"] + margin
        or b["y"] + b["height"] <= a["y"] + margin
    )


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002
        pass


class TestBrowserUIUX(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        assert DIST.is_dir(), f"Missing {DIST}; run npm run build first"
        handler = functools.partial(QuietHandler, directory=str(DIST))
        cls.httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.port}/"
        cls.app_url = cls.base_url + "app/"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def test_desktop_zero_overlap_and_interactions(self) -> None:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(viewport={"width": 1366, "height": 768}, locale="id-ID")
            page = context.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda err: errors.append(str(err)))

            page.goto(self.app_url, wait_until="domcontentloaded")
            page.wait_for_selector("#regionBar .region-chip")

            # 1. Verify 9 region chips (Nasional + 8 regions)
            chips = page.locator("#regionBar .region-chip")
            self.assertEqual(chips.count(), 9)
            chips.filter(has_text="Papua").click()
            self.assertEqual(chips.filter(has_text="Papua").get_attribute("aria-pressed"), "true")

            # 2. Verify live national search from zoom 4.2 -> opens detail without overlapping .map-ctrls
            search = page.locator("#searchInput")
            search.fill("TRJkg")
            page.wait_for_selector("#searchResults .search-item")
            page.locator("#searchResults .search-item").first.click()

            detail = page.locator("#detail")
            detail.wait_for(state="visible")
            self.assertIn("Granit Klabat", detail.inner_text())
            self.assertIn("Trias", detail.inner_text())

            box_detail = detail.bounding_box()
            box_ctrls = page.locator("#mapControls").bounding_box()
            box_panel = page.locator("#panel").bounding_box()
            box_foot = page.locator(".map-foot").bounding_box()
            assert box_detail and box_ctrls and box_panel and box_foot
            self.assertFalse(
                boxes_overlap(box_detail, box_ctrls),
                f"Detail overlaps mapControls: {box_detail} vs {box_ctrls}",
            )
            self.assertFalse(
                boxes_overlap(box_detail, box_panel),
                f"Detail overlaps left panel: {box_detail} vs {box_panel}",
            )
            self.assertFalse(
                boxes_overlap(box_detail, box_foot),
                f"Detail overlaps map-foot: {box_detail} vs {box_foot}",
            )

            # Close detail with Escape
            page.keyboard.press("Escape")
            self.assertTrue(detail.is_hidden())

            # 3. Verify Era Preset Chips & Reset Filter
            page.locator("#eraBar .era-chip[data-era='cenozoic']").click()
            self.assertFalse(page.locator("#activeFilterBar").is_hidden())
            self.assertIn("0–66", page.locator("#ageReadout").inner_text())
            page.locator("#resetFiltersBtn").click()
            self.assertTrue(page.locator("#activeFilterBar").is_hidden())

            # 4. Verify Interactive Stratigraphic Column & Lithology Legend
            page.locator("#legend .timescale .legend-btn").first.click()
            self.assertEqual(
                page.locator("#legend .timescale .legend-btn").first.get_attribute("aria-pressed"),
                "true",
            )
            page.locator("#resetFiltersBtn").click()

            page.locator("#t-modeLith").click()
            page.locator("#legend .liths .legend-btn").first.click()
            self.assertEqual(
                page.locator("#legend .liths .legend-btn").first.get_attribute("aria-pressed"),
                "true",
            )
            page.locator("#resetFiltersBtn").click()

            # 5. Transect: drawing keeps the map free (compact bar only), section docks after "View section"
            page.locator("#transectBtn").click()
            transect_panel = page.locator("#transectPanel")
            self.assertTrue(transect_panel.is_hidden(), "section panel must not cover the map while drawing")
            draw_bar = page.locator("#drawBar")
            self.assertTrue(draw_bar.is_visible())
            self.assertTrue(page.locator("#drawDone").is_disabled())
            page.mouse.click(700, 250)
            page.mouse.click(820, 320)
            page.mouse.click(900, 280)
            self.assertIn("3", page.locator("#drawMeta").inner_text())
            page.locator("#drawUndo").click()
            self.assertIn("2", page.locator("#drawMeta").inner_text())
            page.locator("#drawDone").click()
            transect_panel.wait_for(state="visible")
            box_transect = transect_panel.bounding_box()
            assert box_transect
            self.assertFalse(boxes_overlap(box_transect, box_ctrls))
            self.assertFalse(boxes_overlap(box_transect, page.locator("#panel").bounding_box()))
            self.assertIn("km", transect_panel.inner_text())
            page.locator("#transectClose").click()

            # 6. Verify 3D mode (#terrainView) also keeps zero overlap between #detail and #mapControls
            page.locator("#terrainView").click()
            page.locator("#searchInput").fill("TRJkg")
            page.wait_for_selector("#searchResults .search-item")
            page.locator("#searchResults .search-item").first.click()
            detail.wait_for(state="visible")
            box_detail_3d = detail.bounding_box()
            box_ctrls_3d = page.locator("#mapControls").bounding_box()
            assert box_detail_3d and box_ctrls_3d
            self.assertFalse(
                boxes_overlap(box_detail_3d, box_ctrls_3d),
                f"3D Detail overlaps mapControls: {box_detail_3d} vs {box_ctrls_3d}",
            )
            page.keyboard.press("Escape")
            page.locator("#planView").click()

            # 7. Verify Live UTM Coordinate bar & Language toggle ID <-> EN
            self.assertIn("mE", page.locator("#coordBar").inner_text())
            page.locator("#langBtn").click()
            self.assertEqual(page.locator("html").get_attribute("lang"), "en")
            self.assertIn("All", page.locator("#eraBar").inner_text())

            self.assertEqual(errors, [], f"Unexpected pageerrors: {errors}")
            browser.close()

    def test_navigation_transect_import_and_about_contracts(self) -> None:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(viewport={"width": 1366, "height": 768}, locale="en-US")
            page = context.new_page()
            page.goto(self.app_url, wait_until="domcontentloaded")
            page.wait_for_selector("#regionBar .region-chip")
            # Tombol navigasi kamera & kompas, impor SHP
            for sel in ("#navBack", "#compassNorthBtn", "#shpImportBtn"):
                self.assertEqual(page.locator(sel).count(), 1, sel)
            # Penampang: pemilih VE 1×/2×/5×/10× dan unduh SVG
            self.assertEqual(page.locator("#transectVe option").count(), 4)
            self.assertEqual(page.locator("#transectExportSvg").count(), 1)
            # Dialog Tentang bebas jargon internal
            page.locator("#aboutBtn").click()
            about_text = page.locator("#aboutDialog").inner_text()
            self.assertNotIn("auto_crosswalk", about_text)
            self.assertNotIn("[AUTO]", about_text)
            browser.close()

    def test_waypoints_and_session_persist(self) -> None:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(viewport={"width": 1366, "height": 768}, locale="id-ID")
            page = context.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda err: errors.append(str(err)))
            page.goto(self.app_url + "#map=9/-0.95/119.9", wait_until="domcontentloaded")
            page.wait_for_selector("#regionBar .region-chip")
            # Tanpa GPS: tombol masuk mode tempatkan, ketukan peta membuat WP-001 dan membuka editor
            page.locator("#wpBtn").click()
            self.assertEqual(page.locator("#wpBtn").get_attribute("aria-pressed"), "true")
            page.mouse.click(800, 400)
            panel = page.locator("#wpPanel")
            panel.wait_for(state="visible")
            self.assertEqual(page.locator("#wpName").input_value(), "WP-001")
            page.locator("#wpName").fill("Singkapan 1")
            page.locator("#wpNote").fill("andesit")
            # Jenis Struktur memunculkan isian strike/dip
            self.assertTrue(page.locator("#wpStruct").is_hidden())
            page.locator('#wpKind button[data-kind="structure"]').click()
            self.assertTrue(page.locator("#wpStruct").is_visible())
            page.locator("#wpStructType").select_option("bedding")
            page.locator("#wpStrike").fill("30")
            page.locator("#wpDip").fill("45")
            page.locator("#wpSave").click()
            self.assertTrue(panel.is_hidden())
            self.assertEqual(page.locator("#wpCount").inner_text(), "1")
            self.assertIn("030/45", page.locator("#wpList").inner_text())
            with page.expect_download() as dl:
                page.locator("#wpExportGpx").click()
            self.assertTrue(dl.value.suggested_filename.endswith(".gpx"))
            # Lintasan tersimpan juga
            page.locator("#transectBtn").click()
            page.mouse.click(700, 396)
            page.mouse.click(900, 404)
            page.locator("#drawDone").click()
            page.locator("#transectPanel").wait_for(state="visible")
            # Waypoint dekat lintasan terproyeksi ke penampang (tabel + label di SVG)
            wp_list = page.locator(".transect-wp-list")
            wp_list.wait_for(state="visible")
            self.assertIn("Singkapan 1", wp_list.inner_text())
            self.assertIn("030/45", wp_list.inner_text())
            self.assertIn("Singkapan 1", page.locator(".transect-section svg").inner_html())
            with page.expect_download() as dl2:
                page.locator("#transectExport").click()
            self.assertTrue(dl2.value.suggested_filename.endswith(".png"))
            page.evaluate("window.dispatchEvent(new Event('pagehide'))")
            # Buka ulang tanpa hash: sesi (tampilan) dan waypoint pulih
            page.goto(self.app_url, wait_until="domcontentloaded")
            page.wait_for_selector("#regionBar .region-chip")
            self.assertIn("map=", page.evaluate("location.hash"))
            self.assertEqual(page.locator("#wpCount").inner_text(), "1")
            self.assertIn("Singkapan 1", page.locator("#wpList").inner_text())
            session = page.evaluate("JSON.parse(localStorage.getItem('geoatlas.session.v1'))")
            self.assertEqual(len(session["transect"]), 2)
            self.assertEqual(errors, [], f"Unexpected pageerrors: {errors}")
            browser.close()

    def test_waypoint_field_photos(self) -> None:
        """FLD-01: foto per waypoint dikompres (<=1600 px), tetap ada setelah reload, hapus butuh konfirmasi, dip 0-90 divalidasi."""
        import tempfile

        tmp = Path(tempfile.mkdtemp(prefix="geoatlas-photo-"))
        big = tmp / "big-4000x3000.png"
        small = tmp / "small-300x200.png"
        write_png(big, 4000, 3000, (255, 128, 0))
        write_png(small, 300, 200, (0, 128, 255))
        stored_js = (
            "new Promise((res, rej) => { const r = indexedDB.open('geoatlas-photos');"
            " r.onerror = () => rej(r.error);"
            " r.onsuccess = () => { const db = r.result; const q = db.transaction('photos').objectStore('photos').getAll();"
            " q.onsuccess = () => { db.close(); res(q.result.map(x => ({ id: x.id, wpId: x.wpId, w: x.w, h: x.h, caption: x.caption, azimuth: x.azimuth }))); };"
            " q.onerror = () => rej(q.error); }; })"
        )
        thumbs_loaded_js = "[...document.querySelectorAll('#wpPhotoGrid img')].every(i => i.complete && i.naturalWidth > 0)"

        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(viewport={"width": 1366, "height": 768}, locale="id-ID")
            page = context.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda err: errors.append(str(err)))
            page.goto(self.app_url + "#map=9/-0.95/119.9", wait_until="domcontentloaded")
            page.wait_for_selector("#regionBar .region-chip")
            page.locator("#wpBtn").click()
            page.mouse.click(800, 400)
            page.locator("#wpPanel").wait_for(state="visible")
            page.locator("#wpName").fill("Foto 1")

            # Dua foto (satu 4000x3000) dari galeri
            page.locator("#wpPhotoGal").set_input_files([str(big), str(small)])
            page.wait_for_function("document.querySelectorAll('#wpPhotoGrid li.wp-photo').length === 2")
            page.wait_for_function(thumbs_loaded_js)
            records = page.evaluate(stored_js)
            self.assertEqual(len(records), 2)
            self.assertTrue(all(max(r["w"], r["h"]) <= 1600 for r in records), records)
            self.assertIn((1600, 1200), [(r["w"], r["h"]) for r in records])

            # M2: batch kedua tidak merender ulang grid; keterangan yang sedang diketik tetap ada
            first = page.locator("#wpPhotoGrid li.wp-photo").nth(0)
            first.locator('input[data-k="caption"]').fill("Sedang diketik")
            page.locator("#wpPhotoGal").set_input_files([str(small)])
            page.wait_for_function("document.querySelectorAll('#wpPhotoGrid li.wp-photo').length === 3")
            self.assertEqual(page.locator("#wpPhotoGrid li.wp-photo").nth(0).locator('input[data-k="caption"]').input_value(), "Sedang diketik")
            page.wait_for_function(thumbs_loaded_js)
            # Keterangan dan arah foto disimpan saat isian kehilangan fokus
            first.locator('input[data-k="caption"]').fill("Singkapan utara")
            first.locator('input[data-k="az"]').fill("90")
            first.locator('input[data-k="az"]').press("Tab")
            page.locator("#wpSave").click()
            page.locator("#wpPanel").wait_for(state="hidden")
            self.assertEqual(page.locator("#wpCount").inner_text(), "1")
            self.assertGreaterEqual(page.locator("#wpList .wp-cam").count(), 1)

            # Reload: tiga thumbnail, keterangan, dan arah tetap ada
            page.goto(self.app_url, wait_until="domcontentloaded")
            page.wait_for_selector("#regionBar .region-chip")
            page.locator("#wpList .wp-item").first.click()
            page.locator("#wpPanel").wait_for(state="visible")
            page.wait_for_function("document.querySelectorAll('#wpPhotoGrid li.wp-photo').length === 3")
            page.wait_for_function(thumbs_loaded_js)
            self.assertEqual(page.locator("#wpPhotoGrid li.wp-photo").nth(0).locator('input[data-k="caption"]').input_value(), "Singkapan utara")
            self.assertEqual(page.locator("#wpPhotoGrid li.wp-photo").nth(0).locator('input[data-k="az"]').input_value(), "90")

            # Dip 120 ditolak dengan pesan; setelah diperbaiki baru tersimpan
            page.locator('#wpKind button[data-kind="structure"]').click()
            page.locator("#wpStrike").fill("30")
            page.locator("#wpDip").fill("120")
            page.locator("#wpSave").click()
            self.assertTrue(page.locator("#wpPanel").is_visible())
            self.assertTrue(page.locator("#wpDipErr").is_visible())
            self.assertIn("0–90", page.locator("#wpDipErr").inner_text())
            page.locator("#wpDip").fill("45")
            page.locator("#wpSave").click()
            page.locator("#wpPanel").wait_for(state="hidden")
            self.assertIn("030/45", page.locator("#wpList").inner_text())

            # L1: strike 400 ditolak dengan pesan; M1: isian tak terbaca (badInput) ditolak dan nilai lama tidak tertimpa
            page.locator("#wpList .wp-item").first.click()
            page.locator("#wpPanel").wait_for(state="visible")
            page.locator("#wpStrike").fill("400")
            page.locator("#wpDip").fill("45")
            page.locator("#wpSave").click()
            self.assertTrue(page.locator("#wpPanel").is_visible())
            self.assertTrue(page.locator("#wpStrikeErr").is_visible())
            self.assertIn("0–360", page.locator("#wpStrikeErr").inner_text())
            page.locator("#wpStrike").fill("")
            page.locator("#wpStrike").press_sequentially("e")
            page.locator("#wpSave").click()
            self.assertTrue(page.locator("#wpPanel").is_visible())
            self.assertTrue(page.locator("#wpStrikeErr").is_visible())
            page.locator("#wpStrike").fill("30")
            page.locator("#wpDip").fill("")
            page.locator("#wpDip").press_sequentially("e")
            page.locator("#wpSave").click()
            self.assertTrue(page.locator("#wpPanel").is_visible())
            self.assertTrue(page.locator("#wpDipErr").is_visible())
            # Tutup tanpa simpan lalu buka lagi: nilai lama 030/45 harus masih ada
            page.locator("#wpClose").click()
            page.locator("#wpList .wp-item").first.click()
            page.locator("#wpPanel").wait_for(state="visible")
            self.assertEqual(page.locator("#wpStrike").input_value(), "30")
            self.assertEqual(page.locator("#wpDip").input_value(), "45")
            self.assertIn("030/45", page.locator("#wpList").inner_text())

            # Hapus waypoint: dibatalkan di dialog -> data tetap; dikonfirmasi -> foto ikut terhapus
            page.locator("#wpClose").click()
            page.locator("#wpList .wp-item").first.click()
            page.locator("#wpPanel").wait_for(state="visible")
            page.once("dialog", lambda d: d.dismiss())
            page.locator("#wpDelete").click()
            page.wait_for_timeout(300)
            self.assertTrue(page.locator("#wpPanel").is_visible())
            self.assertEqual(len(page.evaluate(stored_js)), 3)
            page.once("dialog", lambda d: d.accept())
            page.locator("#wpDelete").click()
            page.locator("#wpPanel").wait_for(state="hidden")
            self.assertEqual(page.locator("#wpCount").inner_text(), "0")
            self.assertEqual(page.evaluate(stored_js), [])
            self.assertEqual(errors, [], f"Unexpected pageerrors: {errors}")
            browser.close()

    def test_field_package_round_trip(self) -> None:
        """FLD-02/FLD-03: ekspor paket -> hapus semua -> impor memulihkan waypoint, foto (byte sama), dan lintasan identik;
        impor ulang tidak menggandakan; GPX/CSV pihak ketiga terbaca; berkas rusak dan skema asing ditolak tanpa mengubah data."""
        import json
        import subprocess
        import tempfile
        import xml.etree.ElementTree as ET
        import zipfile

        tmp = Path(tempfile.mkdtemp(prefix="geoatlas-pkg-"))
        big = tmp / "big-4000x3000.png"
        small = tmp / "small-300x200.png"
        write_png(big, 4000, 3000, (255, 128, 0))
        write_png(small, 300, 200, (0, 128, 255))
        fixtures = ROOT / "tests" / "fixtures"

        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(viewport={"width": 1366, "height": 768}, locale="id-ID", accept_downloads=True)
            page = context.new_page()
            errors: list[str] = []
            dialogs: list[str] = []
            page.on("pageerror", lambda err: errors.append(str(err)))
            def on_dialog(dlg) -> None:
                # Konfirmasi "Hapus semua" disetujui dan tidak dihitung; dialog lain dicatat sebagai tidak diharapkan.
                if "Hapus semua" in dlg.message:
                    dlg.accept()
                    return
                dialogs.append(dlg.message)
                dlg.dismiss()

            page.on("dialog", on_dialog)

            page.goto(self.app_url + "#map=9/-0.95/119.9", wait_until="domcontentloaded")
            page.wait_for_selector("#regionBar .region-chip")
            add_wp(page, 800, 400, "S-1", kind="structure", strike="30", dip="45", photos=[big, small])
            add_wp(page, 600, 300, "O-2", note="Catatan, dengan koma")
            add_wp(page, 700, 500, "P-3", kind="sample")
            self.assertEqual(page.locator("#wpCount").inner_text(), "3")

            # Lintasan dipasang lewat sesi lalu app dibuka ulang, supaya ikut terekspor
            page.evaluate("localStorage.setItem('geoatlas.session.v1', JSON.stringify({transect:[{lng:119.8,lat:-0.9},{lng:119.9,lat:-0.95}]}))")
            page.goto(self.app_url, wait_until="domcontentloaded")
            page.wait_for_selector("#regionBar .region-chip")
            # Lintasan dipulihkan di style.load bersama toast "sesi dipulihkan"; tunggu toast agar ekspor tidak mendahului pemulihan
            page.wait_for_function("!document.getElementById('toast').hidden")
            snap1 = page.evaluate(SNAPSHOT_JS)
            self.assertEqual(len(snap1["wps"]), 3)
            self.assertEqual(len(snap1["photos"]), 2)
            self.assertIsNotNone(snap1["transect"])

            # Ekspor: zip valid, GeoJSON/GPX terbaca, lalu tanda cadangan hilang
            self.assertIn("wp-due", page.locator("#wpExportPkg").get_attribute("class") or "")
            with page.expect_download() as dl:
                page.locator("#wpExportPkg").click()
            self.assertRegex(dl.value.suggested_filename, r"^orebit-lapangan-\d{4}-\d{2}-\d{2}\.zip$")
            pkg = tmp / "pkg.zip"
            dl.value.save_as(str(pkg))
            unzip = subprocess.run(["unzip", "-t", str(pkg)], capture_output=True, text=True)
            self.assertEqual(unzip.returncode, 0, unzip.stdout + unzip.stderr)
            with zipfile.ZipFile(pkg) as zf:
                gj = json.loads(zf.read("waypoints.geojson"))
                self.assertEqual(len(gj["features"]), 3)
                self.assertTrue(all(f["geometry"]["type"] == "Point" for f in gj["features"]))
                gpx = ET.fromstring(zf.read("waypoints.gpx"))
                ns = {"g": "http://www.topografix.com/GPX/1/1"}
                self.assertEqual(len(gpx.findall("g:wpt", ns)), 3)
                links = [ln.get("href") for ln in gpx.iter("{http://www.topografix.com/GPX/1/1}link")]
                self.assertEqual(sorted(links), ["photos/S-1_1.jpg", "photos/S-1_2.jpg"])
            self.assertNotIn("wp-due", page.locator("#wpExportPkg").get_attribute("class") or "")

            with page.expect_download() as kdl:
                page.locator("#wpExportKmz").click()
            kmz = tmp / "pkg.kmz"
            kdl.value.save_as(str(kmz))
            self.assertEqual(subprocess.run(["unzip", "-t", str(kmz)], capture_output=True).returncode, 0)

            # Hapus semua (dikonfirmasi), lalu impor paket: data harus kembali identik
            page.locator("#wpClearAll").click()
            page.wait_for_function("document.getElementById('wpCount').textContent === '0'")
            page.evaluate("localStorage.removeItem('geoatlas.session.v1')")
            page.goto(self.app_url, wait_until="domcontentloaded")
            page.wait_for_selector("#regionBar .region-chip")
            self.assertEqual(page.evaluate(SNAPSHOT_JS)["photos"], [])

            page.locator("#wpImportFile").set_input_files(str(pkg))
            page.wait_for_function("document.getElementById('wpCount').textContent === '3'")
            snap2 = page.evaluate(SNAPSHOT_JS)
            self.assertEqual(snap2["wps"], snap1["wps"], "waypoints differ after round-trip")
            self.assertEqual(snap2["photos"], snap1["photos"], "photo metadata or bytes differ after round-trip")
            self.assertEqual(snap2["transect"], snap1["transect"], "transect differs after round-trip")

            # Impor kedua: tidak menggandakan dan tidak meminta konfirmasi (tidak ada yang diganti)
            page.locator("#wpImportFile").set_input_files(str(pkg))
            page.wait_for_function("document.getElementById('toast').textContent.includes('0 ditambah')")
            self.assertEqual(page.locator("#wpCount").inner_text(), "3")
            self.assertEqual(page.evaluate(SNAPSHOT_JS), snap1)
            self.assertEqual(dialogs, [], "re-import must not ask to overwrite anything")

            # GPX gaya Garmin dan CSV gaya Avenza: 3 + 2 titik; impor ulang tidak menggandakan
            page.locator("#wpImportFile").set_input_files(str(fixtures / "garmin-style-waypoints.gpx"))
            page.wait_for_function("document.getElementById('wpCount').textContent === '6'")
            page.locator("#wpImportFile").set_input_files(str(fixtures / "avenza-style-points.csv"))
            page.wait_for_function("document.getElementById('wpCount').textContent === '8'")
            page.locator("#wpImportFile").set_input_files(str(fixtures / "garmin-style-waypoints.gpx"))
            page.wait_for_function("document.getElementById('toast').textContent.includes('0 ditambah')")
            self.assertEqual(page.locator("#wpCount").inner_text(), "8", "re-importing GPX must not duplicate points")

            # Berkas rusak (satu byte foto diubah): pesan, data tidak berubah
            before_bad = page.evaluate(SNAPSHOT_JS)
            raw = bytearray(pkg.read_bytes())
            jpeg_at = raw.find(b"\xff\xd8\xff")
            self.assertGreater(jpeg_at, 0)
            raw[jpeg_at + 40] ^= 0xFF
            bad = tmp / "rusak.zip"
            bad.write_bytes(bytes(raw))
            page.locator("#wpImportFile").set_input_files(str(bad))
            page.wait_for_function("document.getElementById('toast').textContent.includes('rusak')")
            self.assertEqual(page.evaluate(SNAPSHOT_JS), before_bad, "corrupt package must not change data")

            # Skema tidak dikenal: ditolak dengan pesan, data tidak berubah
            alien = tmp / "skema-lain.zip"
            with zipfile.ZipFile(pkg) as src, zipfile.ZipFile(alien, "w", zipfile.ZIP_STORED) as dst:
                for info in src.infolist():
                    data = src.read(info.filename)
                    if info.filename == "project.json":
                        data = data.replace(b"orebit-geoatlas-field-v1", b"orebit-geoatlas-field-v0")
                    dst.writestr(info.filename, data)
            page.locator("#wpImportFile").set_input_files(str(alien))
            page.wait_for_function("document.getElementById('toast').textContent.includes('tidak dikenali')")
            self.assertEqual(page.evaluate(SNAPSHOT_JS), before_bad)

            self.assertEqual(dialogs, [], f"unexpected dialogs: {dialogs}")
            self.assertEqual(errors, [], f"Unexpected pageerrors: {errors}")
            browser.close()

    def test_field_package_conflicts(self) -> None:
        """Revisi WP-30 (H1/T1): edit keterangan/foto menaikkan updatedAt dan ikut ekspor; paket lama dengan isi berbeda
        menjadi konflik yang harus dikonfirmasi (dan konfirmasi ditolak tidak mengubah apa pun); lintasan berbeda meminta konfirmasi."""
        import json
        import tempfile
        import zipfile

        tmp = Path(tempfile.mkdtemp(prefix="geoatlas-conflict-"))
        photo = tmp / "foto.png"
        write_png(photo, 800, 600, (200, 60, 20))

        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(viewport={"width": 1366, "height": 768}, locale="id-ID", accept_downloads=True)
            page = context.new_page()
            errors: list[str] = []
            dialogs: list[str] = []
            policy = {"accept": False}
            page.on("pageerror", lambda err: errors.append(str(err)))

            def on_dialog(dlg) -> None:
                if "Hapus semua" in dlg.message:
                    dlg.accept()
                    return
                dialogs.append(dlg.message)
                if policy["accept"]:
                    dlg.accept()
                else:
                    dlg.dismiss()

            page.on("dialog", on_dialog)

            def export(name: str) -> Path:
                with page.expect_download() as dl:
                    page.locator("#wpExportPkg").click()
                out = tmp / name
                dl.value.save_as(str(out))
                return out

            def package_updated_at(path: Path) -> dict[str, str]:
                project = json.loads(zipfile.ZipFile(path).read("project.json"))
                return {w["name"]: w["updatedAt"] for w in project["waypoints"]}

            def import_file(path: Path, expect_dialogs: int, marker: str) -> None:
                """Penanda selesai = toast yang memuat `marker`. Toast dikosongkan dulu agar tidak terbaca dari langkah sebelumnya.
                Dialog dicatat saat konfirmasi muncul (sebelum toast), jadi jumlahnya dicek setelah toast."""
                page.evaluate("document.getElementById('toast').textContent = ''")
                page.locator("#wpImportFile").set_input_files(str(path))
                page.wait_for_function(f"document.getElementById('toast').textContent.includes({json.dumps(marker)})")
                self.assertEqual(len(dialogs), expect_dialogs, f"dialogs after toast {marker!r}: {dialogs}")

            page.goto(self.app_url + "#map=9/-0.95/119.9", wait_until="domcontentloaded")
            page.wait_for_selector("#regionBar .region-chip")
            add_wp(page, 800, 400, "S-1", kind="structure", strike="30", dip="45", photos=[photo])
            add_wp(page, 600, 300, "O-2", note="Awal")
            page.evaluate("localStorage.setItem('geoatlas.session.v1', JSON.stringify({transect:[{lng:119.8,lat:-0.9},{lng:119.9,lat:-0.95}]}))")
            page.goto(self.app_url, wait_until="domcontentloaded")
            page.wait_for_selector("#regionBar .region-chip")
            page.wait_for_function("!document.getElementById('toast').hidden")  # lintasan sudah dipulihkan

            pkg_a = export("a.zip")  # paket lama

            # Edit keterangan O-2 dan keterangan foto S-1 (tanpa mengubah teks waypoint lain)
            page.locator("#wpList .wp-item", has_text="O-2").click()
            page.locator("#wpPanel").wait_for(state="visible")
            page.locator("#wpNote").fill("Diubah")
            page.locator("#wpSave").click()
            page.locator("#wpPanel").wait_for(state="hidden")
            page.locator("#wpList .wp-item", has_text="S-1").click()
            page.locator("#wpPanel").wait_for(state="visible")
            page.wait_for_function("document.querySelectorAll('#wpPhotoGrid li.wp-photo').length === 1")
            caption = page.locator('#wpPhotoGrid li.wp-photo input[data-k="caption"]').first
            caption.fill("Keterangan baru")
            caption.press("Tab")
            page.wait_for_timeout(300)
            page.locator("#wpSave").click()
            page.locator("#wpPanel").wait_for(state="hidden")

            pkg_b = export("b.zip")  # paket setelah edit
            old = package_updated_at(pkg_a)
            new = package_updated_at(pkg_b)
            self.assertGreater(new["O-2"], old["O-2"], "editing a note must raise updatedAt")
            self.assertGreater(new["S-1"], old["S-1"], "editing a photo caption must raise updatedAt")

            # Paket lama (isi berbeda, updatedAt lebih tua) = konflik. Konfirmasi ditolak: tidak ada yang berubah.
            before = page.evaluate(SNAPSHOT_JS)
            import_file(pkg_a, expect_dialogs=1, marker="dibatalkan")
            self.assertIn("berbeda", dialogs[-1])
            self.assertIn("akan dihapus", dialogs[-1], "confirmation must say local photos not in the file are deleted")
            self.assertEqual(page.evaluate(SNAPSHOT_JS), before, "declined confirmation must not apply anything")

            # Paket yang sama dengan isi lokal: dilewati tanpa konfirmasi
            policy["accept"] = True
            import_file(pkg_b, expect_dialogs=1, marker="0 ditambah")
            self.assertEqual(page.evaluate(SNAPSHOT_JS), before)

            # Lintasan berbeda meminta konfirmasi (waypoint tidak berubah)
            project_zip = zipfile.ZipFile(pkg_b)
            pkg_c = tmp / "c.zip"
            with zipfile.ZipFile(pkg_c, "w", zipfile.ZIP_STORED) as dst:
                for info in project_zip.infolist():
                    data = project_zip.read(info.filename)
                    if info.filename == "project.json":
                        project = json.loads(data)
                        project["transect"] = [{"lng": 120.0, "lat": -1.0}]
                        data = json.dumps(project).encode("utf-8")
                    dst.writestr(info.filename, data)
            policy["accept"] = False
            before_tr = page.evaluate(SNAPSHOT_JS)
            import_file(pkg_c, expect_dialogs=2, marker="dibatalkan")
            self.assertIn("Lintasan", dialogs[-1])
            self.assertEqual(page.evaluate(SNAPSHOT_JS), before_tr, "declined transect confirmation must keep the transect")
            policy["accept"] = True
            import_file(pkg_c, expect_dialogs=3, marker="Impor selesai")
            self.assertEqual(page.evaluate(SNAPSHOT_JS)["transect"], [{"lng": 120.0, "lat": -1.0}])

            self.assertEqual(errors, [], f"Unexpected pageerrors: {errors}")
            browser.close()

    def test_landing_page_and_legacy_redirects(self) -> None:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for vp in ({"width": 375, "height": 812}, {"width": 1366, "height": 768}):
                page = browser.new_context(viewport=vp, locale="id-ID").new_page()
                errors: list[str] = []
                page.on("pageerror", lambda err: errors.append(str(err)))
                page.goto(self.base_url, wait_until="domcontentloaded")
                self.assertIn("Peta geologi Indonesia", page.locator("h1").inner_text())
                self.assertEqual(page.locator('a.btn.primary[href="/app/"]').count() >= 2, True)
                self.assertEqual(page.locator('video source[src="/media/geoatlas-howto.mp4"]').count(), 1)
                self.assertGreaterEqual(page.locator('a[href^="https://github.com/ghoziankarami/orebit-geoatlas"]').count(), 1)
                scroll_w = page.evaluate("document.documentElement.scrollWidth")
                self.assertLessEqual(scroll_w, vp["width"], f"landing overflows at {vp}: {scroll_w}")
                page.locator("#langBtn").click()
                self.assertIn("in your pocket", page.locator("h1").inner_text())
                self.assertEqual(errors, [], f"landing pageerrors: {errors}")
                page.context.close()
            # Old shared links and the installed app icon land on the map, keeping the view
            page = browser.new_page()
            page.goto(self.base_url + "#map=9/-0.95/119.9", wait_until="domcontentloaded")
            page.wait_for_url(re.compile(r"/app/#map=9/-0\.95/119\.9$"), wait_until="commit")
            page.goto(self.base_url + "?source=pwa", wait_until="domcontentloaded")
            page.wait_for_url(re.compile(r"/app/\?source=pwa"), wait_until="commit")
            page.wait_for_selector("#searchInput")
            browser.close()

    def test_mobile_bottom_sheet_3_snap_and_no_overflow(self) -> None:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(viewport={"width": 375, "height": 812}, locale="id-ID")
            page = context.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda err: errors.append(str(err)))

            page.goto(self.app_url, wait_until="domcontentloaded")
            page.wait_for_selector("#searchInput")

            # Peek state must keep search unclipped inside #panel
            panel_box = page.locator("#panel").bounding_box()
            search_box = page.locator("#searchInput").bounding_box()
            assert panel_box and search_box
            self.assertEqual(page.locator("#panel").get_attribute("data-snap"), "peek")
            self.assertGreaterEqual(search_box["height"], 44, f"search below touch target: {search_box}")
            self.assertLessEqual(
                search_box["y"] + search_box["height"],
                panel_box["y"] + panel_box["height"] + 1,
                f"search clipped at bottom in peek: {search_box} vs {panel_box}",
            )

            # Peek = handle + search only (map-app pattern); region chips live in half/full
            self.assertFalse(page.locator("#regionBar").is_visible(), "regionBar should be hidden in peek")
            self.assertFalse(page.locator("#zoomIn").is_visible(), "zoom buttons hidden on mobile (pinch)")
            fab = page.locator("#locateBtn").bounding_box()
            assert fab
            self.assertGreaterEqual(fab["width"], 48, f"GPS FAB below 48px touch target: {fab}")
            self.assertLessEqual(fab["y"] + fab["height"], panel_box["y"], f"GPS FAB overlaps sheet: {fab}")

            # Handle tap cycles peek -> half -> full -> peek
            page.locator("#sheetHandle").click()
            self.assertEqual(page.locator("#panel").get_attribute("data-snap"), "half")
            reg_half = page.locator("#regionBar").bounding_box()
            assert reg_half
            self.assertGreaterEqual(reg_half["height"], 30, f"regionBar squashed in half: {reg_half}")

            page.locator("#sheetHandle").click()
            self.assertEqual(page.locator("#panel").get_attribute("data-snap"), "full")
            page.locator("#sheetHandle").click()
            self.assertEqual(page.locator("#panel").get_attribute("data-snap"), "peek")

            # Transect draw mode: compact bar only, panel opens after "View section"
            page.wait_for_function("document.getElementById('panel').getBoundingClientRect().height < 160")
            page.locator("#transectBtn").click()
            self.assertTrue(page.locator("#drawBar").is_visible())
            self.assertTrue(page.locator("#drawGps").is_visible(), "GPS point button must be visible while drawing")
            self.assertTrue(page.locator("#transectPanel").is_hidden())
            page.mouse.click(120, 200)
            page.mouse.click(260, 330)
            page.locator("#drawDone").click()
            page.locator("#transectPanel").wait_for(state="visible")
            self.assertTrue(page.locator("#drawBar").is_hidden())
            self.assertIn("km", page.locator("#transectPanel").inner_text())
            page.locator("#transectClose").click()

            # Open detail on mobile and verify zero overlap with .map-foot
            page.locator("#searchInput").fill("TRJkg")
            page.wait_for_selector("#searchResults .search-item")
            page.locator("#searchResults .search-item").first.click()
            detail = page.locator("#detail")
            detail.wait_for(state="visible")
            m_detail = detail.bounding_box()
            m_foot = page.locator(".map-foot").bounding_box()
            assert m_detail
            # Footer (koordinat/GPS) disembunyikan selama detail terbuka; bila tampil, tidak boleh bertumpuk.
            self.assertTrue(
                m_foot is None or not boxes_overlap(m_detail, m_foot),
                f"Mobile detail overlaps map-foot: {m_detail} vs {m_foot}",
            )

            # Check no horizontal overflow
            scroll_w = page.evaluate("document.documentElement.scrollWidth")
            self.assertLessEqual(scroll_w, 375, f"Horizontal overflow on mobile: {scroll_w}")

            self.assertEqual(errors, [], f"Unexpected mobile pageerrors: {errors}")
            browser.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
