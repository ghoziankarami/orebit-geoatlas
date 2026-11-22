# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Orebit (Ghozian Islam Karami)
"""Tarik poligon Peta Geologi & garis struktur dari layanan ArcGIS REST publik ESDM (Pusat Survei Geologi).

Layanan : https://geoportal.esdm.go.id/gis4/rest/services/BGS_PM/Geologi_Litologi/MapServer/0
Struktur: https://geoportal.esdm.go.id/gis4/rest/services/BGS_PM/Geologi_Struktur/MapServer/0 (opsional --include-lines)
Keluaran: data/raw/<wilayah>/esdm/esdm_litologi.geojson
          data/raw/<wilayah>/esdm/esdm_struktur.geojson (jika --include-lines)
          data/raw/<wilayah>/esdm/esdm_layer.json
          data/raw/<wilayah>/esdm/laporan.txt
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter

from common import RAW, REGION_BBOX

DEFAULT_LAYER = "https://geoportal.esdm.go.id/gis4/rest/services/BGS_PM/Geologi_Litologi/MapServer/0"
DEFAULT_LINES_LAYER = "https://geoportal.esdm.go.id/gis4/rest/services/BGS_PM/Geologi_Struktur/MapServer/0"
CHUNK = 250
PAUSE_S = 1.0
RETRIES = 3
UA = "OrebitGeoAtlas/0.2 (+https://atlas.orebit.id)"


def request(url: str, params: dict, post: bool = False) -> dict:
    data = urllib.parse.urlencode(params).encode()
    last: Exception | None = None
    for attempt in range(1, RETRIES + 1):
        try:
            req = urllib.request.Request(
                url if post else f"{url}?{data.decode()}",
                data=data if post else None,
                headers={"User-Agent": UA},
            )
            with urllib.request.urlopen(req, timeout=120) as res:
                body = json.loads(res.read().decode("utf-8"))
            if isinstance(body, dict) and "error" in body:
                raise RuntimeError(f"ArcGIS error: {body['error']}")
            return body
        except (urllib.error.URLError, TimeoutError, RuntimeError, json.JSONDecodeError) as e:
            last = e
            print(f"  percobaan {attempt}/{RETRIES} gagal: {e}")
            time.sleep(PAUSE_S * 3 * attempt)
    raise SystemExit(f"Berhenti: permintaan ke {url} gagal {RETRIES}x ({last}).")


def fetch_layer(layer_url: str, bbox: tuple[float, float, float, float]) -> tuple[dict, list[dict]]:
    layer_url = layer_url.rstrip("/")
    meta = request(layer_url, {"f": "json"})
    max_rec = int(meta.get("maxRecordCount") or 1000)
    chunk = max(1, min(CHUNK, max_rec))
    spatial = {
        "geometry": ",".join(str(v) for v in bbox),
        "geometryType": "esriGeometryEnvelope",
        "inSR": 4326,
        "spatialRel": "esriSpatialRelIntersects",
        "where": "1=1",
    }
    time.sleep(PAUSE_S)
    ids = request(f"{layer_url}/query", {**spatial, "returnIdsOnly": "true", "f": "json"}).get("objectIds") or []
    ids = sorted(ids)
    features: list[dict] = []
    for i in range(0, len(ids), chunk):
        part = ids[i : i + chunk]
        time.sleep(PAUSE_S)
        fc = request(
            f"{layer_url}/query",
            {
                "objectIds": ",".join(map(str, part)),
                "outFields": "*",
                "outSR": 4326,
                "returnGeometry": "true",
                "f": "geojson",
            },
            post=True,
        )
        features.extend(fc.get("features", []))
        print(f"  {min(i + chunk, len(ids))}/{len(ids)}")
    return meta, features


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("region")
    ap.add_argument("--bbox", help="lon_min,lat_min,lon_max,lat_max")
    ap.add_argument("--layer-url", default=DEFAULT_LAYER)
    ap.add_argument("--lines-url", default=DEFAULT_LINES_LAYER)
    ap.add_argument("--include-lines", action="store_true", help="Tarik juga layer garis struktur/sesar")
    args = ap.parse_args()

    if args.bbox:
        bbox = tuple(float(v) for v in args.bbox.split(","))  # type: ignore[assignment]
    elif args.region in REGION_BBOX:
        bbox = REGION_BBOX[args.region]
    else:
        raise SystemExit(
            f"Wilayah '{args.region}' belum punya bbox bawaan ({', '.join(sorted(REGION_BBOX))}); beri --bbox."
        )

    out = RAW / args.region / "esdm"
    out.mkdir(parents=True, exist_ok=True)
    meta, features = fetch_layer(args.layer_url, bbox)
    (out / "esdm_layer.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    if not features:
        raise SystemExit("Tidak ada fitur poligon. Periksa bbox atau URL layer.")
    (out / "esdm_litologi.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False),
        encoding="utf-8",
    )

    if args.include_lines:
        try:
            _, line_feats = fetch_layer(args.lines_url, bbox)
            if line_feats:
                (out / "esdm_struktur.geojson").write_text(
                    json.dumps({"type": "FeatureCollection", "features": line_feats}, ensure_ascii=False),
                    encoding="utf-8",
                )
                print(f"Struktur tersimpan: {len(line_feats)} garis")
        except SystemExit as exc:
            print(f"[PERINGATAN] Layer struktur dilewati: {exc}")

    lines = [
        f"Sumber: {args.layer_url}",
        "Hak cipta: Pusat Survei Geologi (status data Mei 2018)",
        f"Wilayah: {args.region} bbox={bbox}",
        f"Fitur: {len(features)}",
        "",
        "Nilai teratas per kolom teks (maks. 40):",
    ]
    for f in meta.get("fields", []):
        if f.get("type") != "esriFieldTypeString":
            continue
        c = Counter(str((ft.get("properties") or {}).get(f["name"], "")).strip() for ft in features)
        lines.append(f"\n[{f['name']}] {len(c)} nilai unik")
        for v, n in c.most_common(40):
            lines.append(f"  {n:>5}  {v[:160]}")
    (out / "laporan.txt").write_text("\n".join(lines), encoding="utf-8")
    print(f"Tersimpan di {out} ({len(features)} fitur)")


if __name__ == "__main__":
    main()
