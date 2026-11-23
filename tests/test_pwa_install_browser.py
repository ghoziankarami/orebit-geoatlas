#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (c) 2026 Orebit (Ghozian Islam Karami)
"""Playwright check for PWA install affordances on a 412x839 phone viewport (WP-28)."""

from __future__ import annotations

import contextlib
import functools
import http.server
import socketserver
import threading
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "app" / "dist"

PHONE = {"width": 412, "height": 839}
IPHONE_SAFARI = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
)
LINKEDIN_APP = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Mobile/15E148 LinkedInApp"
)
ANDROID_CHROME = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Mobile Safari/537.36"
)
# Pura-pura display-mode: standalone (mode layar utama) tanpa mengubah UA.
STANDALONE_INIT = """
(() => {
  const real = window.matchMedia.bind(window);
  window.matchMedia = (query) => {
    if (query.includes("display-mode: standalone")) {
      return { matches: true, media: query, onchange: null,
        addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } };
    }
    return real(query);
  };
})();
"""
# Event beforeinstallprompt sintetis, seperti yang dikirim Chrome Android.
FIRE_PROMPT_JS = """() => {
  const e = new Event("beforeinstallprompt", { cancelable: true });
  e.prompt = async () => {};
  e.userChoice = Promise.resolve({ outcome: "dismissed" });
  window.dispatchEvent(e);
}"""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002
        pass


@contextlib.contextmanager
def open_app(p, *, user_agent: str, standalone: bool = False):
    browser = p.chromium.launch()
    try:
        context = browser.new_context(viewport=PHONE, user_agent=user_agent, locale="id-ID")
        if standalone:
            context.add_init_script(STANDALONE_INIT)
        page = context.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda err: errors.append(str(err)))
        yield page, errors
    finally:
        browser.close()


class TestPwaInstallBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        assert DIST.is_dir(), f"Missing {DIST}; run npm run build first"
        handler = functools.partial(QuietHandler, directory=str(DIST))
        cls.httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.app_url = f"http://127.0.0.1:{cls.port}/app/"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def load(self, page) -> None:
        page.goto(self.app_url, wait_until="load")

    def test_android_prompt_chip_inside_viewport_and_peek_height_unchanged(self) -> None:
        with sync_playwright() as p, open_app(p, user_agent=ANDROID_CHROME) as (page, errors):
            self.load(page)
            self.assertFalse(page.locator("#installChip").is_visible(), "chip must stay hidden before the prompt event")
            peek_before = page.locator("#panel").bounding_box()["height"]
            page.evaluate(FIRE_PROMPT_JS)
            page.wait_for_selector("#installChip:not([hidden])", state="visible")
            chip = page.locator("#installChip").bounding_box()
            panel = page.locator("#panel").bounding_box()
            self.assertGreaterEqual(chip["x"], 0)
            self.assertGreaterEqual(chip["y"], 0)
            self.assertLessEqual(chip["x"] + chip["width"], PHONE["width"])
            self.assertLessEqual(chip["y"] + chip["height"], PHONE["height"])
            self.assertGreaterEqual(chip["y"], panel["y"])
            self.assertLessEqual(chip["y"] + chip["height"], panel["y"] + panel["height"])
            peek_after = panel["height"]
            self.assertAlmostEqual(peek_before, peek_after, delta=0.5, msg="peek sheet height must not change")
            self.assertEqual(errors, [])

    def test_iphone_safari_shows_ios_steps(self) -> None:
        with sync_playwright() as p, open_app(p, user_agent=IPHONE_SAFARI) as (page, errors):
            self.load(page)
            page.wait_for_selector("#installChip:not([hidden])", state="visible")
            page.locator("#installChip").click()
            self.assertTrue(page.locator("#installSheet").is_visible())
            steps = page.locator("#installSteps li")
            self.assertEqual(steps.count(), 3)
            self.assertIn("Bagikan", steps.nth(0).inner_text())
            self.assertIn("Tambahkan ke Layar Utama", steps.nth(1).inner_text())
            self.assertEqual(errors, [])

    def test_linkedin_in_app_shows_banner_with_copy(self) -> None:
        with sync_playwright() as p, open_app(p, user_agent=LINKEDIN_APP) as (page, errors):
            self.load(page)
            page.wait_for_selector("#inAppBanner", state="visible")
            self.assertIn("Chrome/Safari", page.locator("#inAppText").inner_text())
            self.assertTrue(page.locator("#inAppCopy").is_visible())
            self.assertFalse(page.locator("#installChip").is_visible())
            self.assertEqual(errors, [])

    def test_standalone_hides_chip_and_banner(self) -> None:
        for ua in (IPHONE_SAFARI, LINKEDIN_APP, ANDROID_CHROME):
            with self.subTest(ua=ua), sync_playwright() as p, open_app(p, user_agent=ua, standalone=True) as (page, errors):
                self.load(page)
                if ua == ANDROID_CHROME:
                    page.evaluate(FIRE_PROMPT_JS)
                page.wait_for_timeout(200)
                self.assertFalse(page.locator("#installChip").is_visible())
                self.assertFalse(page.locator("#inAppBanner").is_visible())
                self.assertFalse(page.locator("#installBtn").is_visible())
                self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
