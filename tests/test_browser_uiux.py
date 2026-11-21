#!/usr/bin/env python3
"""Playwright E2E UI/UX verification for Orebit GeoAtlas (Desktop 1366x768 & Mobile 375x812, ID & EN)."""

from __future__ import annotations

import functools
import http.server
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

            page.goto(self.base_url, wait_until="domcontentloaded")
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

            # 5. Verify Transect tool opens below .map-ctrls without overlap
            page.locator("#transectBtn").click()
            transect_panel = page.locator("#transectPanel")
            transect_panel.wait_for(state="visible")
            box_transect = transect_panel.bounding_box()
            assert box_transect
            self.assertFalse(boxes_overlap(box_transect, box_ctrls))
            page.mouse.click(700, 350)
            page.mouse.click(820, 420)
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

    def test_mobile_bottom_sheet_3_snap_and_no_overflow(self) -> None:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(viewport={"width": 375, "height": 812}, locale="id-ID")
            page = context.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda err: errors.append(str(err)))

            page.goto(self.base_url, wait_until="domcontentloaded")
            page.wait_for_selector("#searchInput")

            # Peek state must keep search & region bar unclipped inside #panel
            panel_box = page.locator("#panel").bounding_box()
            search_box = page.locator("#searchInput").bounding_box()
            reg_box = page.locator("#regionBar").bounding_box()
            chip_box = page.locator("#regionBar .region-chip").first.bounding_box()
            assert panel_box and search_box and reg_box and chip_box
            self.assertEqual(page.locator("#panel").get_attribute("data-snap"), "peek")
            self.assertGreaterEqual(reg_box["height"], 30, f"regionBar squashed in peek: {reg_box}")
            self.assertGreaterEqual(chip_box["height"], 30, f"region-chip squashed in peek: {chip_box}")
            self.assertLessEqual(
                chip_box["y"] + chip_box["height"],
                panel_box["y"] + panel_box["height"] + 1,
                f"region-chip clipped at bottom in peek: {chip_box} vs {panel_box}",
            )

            # Snap to half & verify regionBar stays unclipped
            page.locator("#snapHalf").click()
            self.assertEqual(page.locator("#panel").get_attribute("data-snap"), "half")
            reg_half = page.locator("#regionBar").bounding_box()
            assert reg_half
            self.assertGreaterEqual(reg_half["height"], 30, f"regionBar squashed in half: {reg_half}")

            page.locator("#snapFull").click()
            self.assertEqual(page.locator("#panel").get_attribute("data-snap"), "full")
            page.locator("#snapPeek").click()

            # Open detail on mobile and verify zero overlap with .map-foot
            page.locator("#searchInput").fill("TRJkg")
            page.wait_for_selector("#searchResults .search-item")
            page.locator("#searchResults .search-item").first.click()
            detail = page.locator("#detail")
            detail.wait_for(state="visible")
            m_detail = detail.bounding_box()
            m_foot = page.locator(".map-foot").bounding_box()
            assert m_detail and m_foot
            self.assertFalse(
                boxes_overlap(m_detail, m_foot),
                f"Mobile detail overlaps map-foot: {m_detail} vs {m_foot}",
            )

            # Check no horizontal overflow
            scroll_w = page.evaluate("document.documentElement.scrollWidth")
            self.assertLessEqual(scroll_w, 375, f"Horizontal overflow on mobile: {scroll_w}")

            self.assertEqual(errors, [], f"Unexpected mobile pageerrors: {errors}")
            browser.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
