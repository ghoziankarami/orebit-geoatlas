#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (c) 2026 Orebit (Ghozian Islam Karami)
"""Post-deploy production smoke check for Orebit GeoAtlas (stdlib-only, cross-platform).

Usage:
  python3 ops/scripts/ci/prod-smoke.py https://atlas.orebit.id
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import zlib
from dataclasses import dataclass

EXPECTED_REGIONS = {
    "sumatra",
    "babel",
    "jawa",
    "balinusra",
    "kalimantan",
    "sulawesi",
    "maluku",
    "papua",
}
USER_AGENT = "OrebitGeoAtlasSmoke/1.0 (+https://atlas.orebit.id)"
ASSET_JS_RE = re.compile(r"""(?:src|href)=["'](/assets/[^"']+\.js)["']""")
PMTILES_RE = re.compile(
    r"""["'`]((?:https?://[^"'`\s]+)?/tiles/[^"'`\s]+\.pmtiles|https?://[^"'`\s]+\.pmtiles)["'`]"""
)


@dataclass
class HttpResp:
    status: int
    headers: dict[str, str]
    body: bytes
    url: str

    def header(self, name: str) -> str:
        return self.headers.get(name.lower(), "")


class _NoErrorRedirect(urllib.request.HTTPErrorProcessor):
    def http_response(self, request, response):
        return response

    https_response = http_response


def fetch(
    url: str,
    *,
    timeout: int = 60,
    headers: dict[str, str] | None = None,
) -> HttpResp:
    req_headers = {
        "User-Agent": USER_AGENT,
        "Accept-Encoding": "gzip",
    }
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, headers=req_headers, method="GET")
    opener = urllib.request.build_opener(_NoErrorRedirect)
    with opener.open(req, timeout=timeout) as resp:
        raw = resp.read()
        hdrs = {k.lower(): v for k, v in resp.headers.items()}
        enc = hdrs.get("content-encoding", "").lower().strip()
        if enc == "gzip":
            raw = gzip.decompress(raw)
        elif enc == "deflate":
            raw = zlib.decompress(raw)
        return HttpResp(
            status=resp.status,
            headers=hdrs,
            body=raw,
            url=resp.geturl(),
        )


def check_compressed(resp: HttpResp) -> str | None:
    enc = resp.header("content-encoding").lower()
    if enc not in ("gzip", "br"):
        return f"expected gzip/br Content-Encoding, got {enc!r}"
    return None


def check_permissions_policy(resp: HttpResp) -> str | None:
    pp = resp.header("permissions-policy").lower()
    if "geolocation=(self)" not in pp:
        return f"Permissions-Policy missing geolocation=(self): {pp!r}"
    return None


def run_smoke(base_url: str, *, timeout: int = 60, pmtiles_override: str = "") -> list[tuple[str, bool, str]]:
    base = base_url.strip().rstrip("/")
    parsed = urllib.parse.urlparse(base)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError(f"Invalid base URL: {base_url!r}")
    origin = f"{parsed.scheme}://{parsed.netloc}"

    results: list[tuple[str, bool, str]] = []

    def record(name: str, ok: bool, detail: str) -> None:
        results.append((name, ok, detail))

    # 1. Landing page "/"
    try:
        r = fetch(f"{base}/", timeout=timeout)
        errs = []
        if r.status != 200:
            errs.append(f"status {r.status} != 200")
        ct = r.header("content-type").lower()
        if "text/html" not in ct:
            errs.append(f"Content-Type {ct!r} not text/html")
        if msg := check_compressed(r):
            errs.append(msg)
        if msg := check_permissions_policy(r):
            errs.append(msg)
        text = r.body.decode("utf-8", errors="replace")
        if "<html" not in text.lower() or "geoatlas" not in text.lower():
            errs.append("unexpected landing HTML body")
        record("landing-html", not errs, "; ".join(errs) if errs else f"200 text/html ({r.header('content-encoding')}, Permissions-Policy OK)")
    except Exception as exc:
        record("landing-html", False, str(exc))

    # 2. Map app "/app/" + extract /assets/*.js
    js_assets: list[str] = []
    try:
        r = fetch(f"{base}/app/", timeout=timeout)
        errs = []
        if r.status != 200:
            errs.append(f"status {r.status} != 200")
        ct = r.header("content-type").lower()
        if "text/html" not in ct:
            errs.append(f"Content-Type {ct!r} not text/html")
        if msg := check_compressed(r):
            errs.append(msg)
        if msg := check_permissions_policy(r):
            errs.append(msg)
        html = r.body.decode("utf-8", errors="replace")
        js_assets = list(dict.fromkeys(ASSET_JS_RE.findall(html)))
        if not js_assets:
            errs.append("no /assets/*.js referenced in /app/ HTML")
        record("app-html", not errs, "; ".join(errs) if errs else f"200 text/html ({r.header('content-encoding')}, {len(js_assets)} JS assets)")
    except Exception as exc:
        record("app-html", False, str(exc))

    # 3. Hashed JS bundle (/assets/*.js) -> immutable + discover PMTiles URL
    discovered_pmtiles = ""
    if not js_assets:
        record("app-asset-js", False, "skipped: no /assets/*.js found in /app/ HTML")
    else:
        first_checked = False
        asset_errs: list[str] = []
        first_detail = ""
        for asset in js_assets:
            try:
                ar = fetch(urllib.parse.urljoin(f"{base}/", asset), timeout=timeout)
                if not first_checked:
                    first_checked = True
                    if ar.status != 200:
                        asset_errs.append(f"{asset}: status {ar.status} != 200")
                    ct = ar.header("content-type").lower()
                    if "javascript" not in ct:
                        asset_errs.append(f"{asset}: Content-Type {ct!r} not JavaScript")
                    cc = ar.header("cache-control").lower()
                    if "immutable" not in cc:
                        asset_errs.append(f"{asset}: Cache-Control {cc!r} missing immutable")
                    if msg := check_compressed(ar):
                        asset_errs.append(f"{asset}: {msg}")
                    first_detail = f"{asset} -> 200 {ct} ({ar.header('content-encoding')}, {ar.header('cache-control')})"
                js_text = ar.body.decode("utf-8", errors="replace")
                matches = PMTILES_RE.findall(js_text)
                if matches and not discovered_pmtiles:
                    discovered_pmtiles = matches[0]
                if discovered_pmtiles and first_checked:
                    break
            except Exception as exc:
                if not first_checked:
                    first_checked = True
                    asset_errs.append(f"{asset}: {exc}")
        record("app-asset-js", not asset_errs, "; ".join(asset_errs) if asset_errs else first_detail)

    # 4. /manifest.json
    try:
        r = fetch(f"{base}/manifest.json", timeout=timeout)
        errs = []
        if r.status != 200:
            errs.append(f"status {r.status} != 200")
        ct = r.header("content-type").lower()
        if "json" not in ct:
            errs.append(f"Content-Type {ct!r} not JSON")
        data = json.loads(r.body.decode("utf-8"))
        if not isinstance(data, dict) or not isinstance(data.get("start_url"), str) or not data["start_url"].strip():
            errs.append("manifest JSON missing non-empty start_url")
        record("manifest", not errs, "; ".join(errs) if errs else f"200 JSON valid (start_url={data['start_url']!r})")
    except Exception as exc:
        record("manifest", False, str(exc))

    # 5. /sw.js
    try:
        r = fetch(f"{base}/sw.js", timeout=timeout)
        errs = []
        if r.status != 200:
            errs.append(f"status {r.status} != 200")
        ct = r.header("content-type").lower()
        if "javascript" not in ct:
            errs.append(f"Content-Type {ct!r} not JavaScript")
        sw_text = r.body.decode("utf-8", errors="replace")
        if "geoatlas" not in sw_text.lower():
            errs.append("sw.js body missing geoatlas marker")
        record("service-worker", not errs, "; ".join(errs) if errs else f"200 {ct} ({len(r.body)} B)")
    except Exception as exc:
        record("service-worker", False, str(exc))

    # 6. /data/indonesia-units-index.json
    try:
        r = fetch(f"{base}/data/indonesia-units-index.json", timeout=timeout)
        errs = []
        if r.status != 200:
            errs.append(f"status {r.status} != 200")
        ct = r.header("content-type").lower()
        if "json" not in ct:
            errs.append(f"Content-Type {ct!r} not JSON")
        if msg := check_compressed(r):
            errs.append(msg)
        idx = json.loads(r.body.decode("utf-8"))
        regions = set(idx.get("regions", [])) if isinstance(idx, dict) else set()
        units = idx.get("units", []) if isinstance(idx, dict) else []
        if regions != EXPECTED_REGIONS:
            errs.append(f"regions mismatch: {sorted(regions)} != {sorted(EXPECTED_REGIONS)}")
        if not isinstance(units, list) or len(units) < 2000:
            errs.append(f"expected >= 2000 units, got {len(units) if isinstance(units, list) else type(units).__name__}")
        record(
            "national-index",
            not errs,
            "; ".join(errs) if errs else f"200 JSON ({r.header('content-encoding')}, {len(regions)} regions, {len(units)} units)",
        )
    except Exception as exc:
        record("national-index", False, str(exc))

    # 7. PMTiles Range request (bytes=0-16383 -> HTTP 206 + Accept-Ranges + CORS)
    pmtiles_target = pmtiles_override or discovered_pmtiles
    if not pmtiles_target:
        record("pmtiles-range", False, "no .pmtiles URL discovered from /assets/*.js config")
    else:
        pmtiles_url = urllib.parse.urljoin(f"{base}/", pmtiles_target)
        try:
            r = fetch(
                pmtiles_url,
                timeout=timeout,
                headers={
                    "Range": "bytes=0-16383",
                    "Origin": origin,
                    "Accept-Encoding": "identity",
                },
            )
            errs = []
            if r.status != 206:
                errs.append(f"status {r.status} != 206")
            ar_hdr = r.header("accept-ranges").lower()
            if "bytes" not in ar_hdr:
                errs.append(f"Accept-Ranges {ar_hdr!r} missing 'bytes'")
            cr = r.header("content-range")
            if not re.match(r"^bytes\s+0-\d+/\d+$", cr):
                errs.append(f"unexpected Content-Range {cr!r}")
            acao = r.header("access-control-allow-origin")
            if not acao:
                errs.append("missing Access-Control-Allow-Origin header")
            if not r.body.startswith(b"PMTiles"):
                errs.append(f"unexpected PMTiles magic {r.body[:7]!r}")
            record(
                "pmtiles-range",
                not errs,
                "; ".join(errs) if errs else f"206 {pmtiles_url} ({cr}, Accept-Ranges: {ar_hdr}, CORS: {acao})",
            )
        except Exception as exc:
            record("pmtiles-range", False, f"{pmtiles_url}: {exc}")

    return results


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Post-deploy production smoke check for Orebit GeoAtlas")
    ap.add_argument("base_url", help="Target base URL, e.g. https://atlas.orebit.id")
    ap.add_argument("--timeout", type=int, default=60, help="Per-request timeout in seconds (default: 60)")
    ap.add_argument("--pmtiles-url", default="", help="Optional explicit PMTiles URL override")
    args = ap.parse_args(argv)

    try:
        results = run_smoke(args.base_url, timeout=args.timeout, pmtiles_override=args.pmtiles_url)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    passed = 0
    for name, ok, detail in results:
        tag = "PASS" if ok else "FAIL"
        print(f"{tag} [{name}] {detail}")
        if ok:
            passed += 1
    total = len(results)
    print(f"prod-smoke: {passed}/{total} checks passed")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
