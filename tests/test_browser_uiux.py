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
