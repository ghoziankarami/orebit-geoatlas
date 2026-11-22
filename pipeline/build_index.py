# SPDX-License-Identifier: GPL-3.0-only
# Copyright (c) 2026 Orebit (Ghozian Islam Karami)
"""Bangun katalog indeks pencarian nasional deterministik (app/public/data/indonesia-units-index.json).

Membaca `reference/*.csv` (dan `data/out/*/units.geojsonl` bila tersedia untuk bbox poligon aktual),
lalu menghasilkan JSON terstruktur skema `orebit-geoatlas-index-v1` untuk pencarian instan di seluruh
Indonesia pada tingkat zoom berapapun.
"""
from __future__ import annotations

import csv
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from common import OUT, REF, REGION_BBOX, REGION_ORDER, ROOT

INDEX_PATH = ROOT / "app" / "public" / "data" / "indonesia-units-index.json"


def _read_csv(name: str) -> list[dict[str, str]]:
    lines = (REF / name).read_text(encoding="utf-8").splitlines()
    body = "\n".join(line for line in lines if not line.startswith("#"))
    return [
        {k: (v or "").strip() for k, v in row.items()}
        for row in csv.DictReader(io.StringIO(body))
    ]


def _ics_color(age_base: float, ics_rows: list[dict[str, str]]) -> str:
    hits = []
    for r in ics_rows:
        top, base = float(r["top_ma"]), float(r["base_ma"])
        if top < age_base <= base:
            hits.append((base - top, r["color_hex"]))
    if not hits:
        return "#D9DEE1"
    hits.sort(key=lambda item: item[0])
    return hits[0][1]


def _parse_note_stats(note: str) -> tuple[int, float]:
    poly_m = re.search(r"(\d+)\s+poligon", note)
    area_m = re.search(r"([\d.]+)\s+km2", note)
    return (
        int(poly_m.group(1)) if poly_m else 1,
        round(float(area_m.group(1)), 2) if area_m else 0.0,
    )


def _parse_note_bbox(note: str) -> list[float] | None:
    m = re.search(r"bbox=([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)", note)
    if not m:
        return None
    return [round(float(m.group(i)), 4) for i in range(1, 5)]


def _extend_bbox(b: list[float] | None, coords) -> list[float] | None:
    if not isinstance(coords, list):
        return b
    if coords and isinstance(coords[0], (int, float)):
        x, y = float(coords[0]), float(coords[1])
        if b is None:
            return [x, y, x, y]
        return [min(b[0], x), min(b[1], y), max(b[2], x), max(b[3], y)]
    for item in coords:
        b = _extend_bbox(b, item)
    return b


def _load_geojsonl_bboxes() -> dict[tuple[str, str], list[float]]:
    bboxes: dict[tuple[str, str], list[float]] = {}
    if not OUT.is_dir():
        return bboxes
    for region_dir in sorted(OUT.iterdir()):
        if not region_dir.is_dir() or region_dir.name == "all":
            continue
        gj = region_dir / "units.geojsonl"
        if not gj.is_file():
            continue
        region = region_dir.name
        for line in gj.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            feat = json.loads(line)
            uid = (feat.get("properties") or {}).get("unit_id", "")
            if not uid:
                continue
            key = (region, uid)
            bboxes[key] = _extend_bbox(bboxes.get(key), (feat.get("geometry") or {}).get("coordinates")) or []
    return bboxes


def build_index() -> dict:
    sources = {r["source_id"]: r for r in _read_csv("sources.csv")}
    units_by_id = {r["unit_id"]: r for r in _read_csv("units.csv")}
    ics_rows = _read_csv("ics_intervals.csv")
    crosswalk = _read_csv("crosswalk.csv")
    geom_bboxes = _load_geojsonl_bboxes()

    grouped: dict[tuple[str, str], dict] = {}
    regions_seen: set[str] = set()

    for cw in crosswalk:
        uid = cw.get("unit_id", "")
        if not uid or uid not in units_by_id:
            continue
        src = sources.get(cw["source_id"], {})
        file_key = src.get("file_key", "")
        region = file_key.split("/", 1)[0] if "/" in file_key else "unknown"
        if region not in REGION_BBOX:
            continue
        regions_seen.add(region)
        u = units_by_id[uid]
        polys, area_km2 = _parse_note_stats(cw.get("note", ""))
        note_bbox = _parse_note_bbox(cw.get("note", ""))
        fallback_bbox = list(REGION_BBOX[region])
        bbox = geom_bboxes.get((region, uid)) or note_bbox or fallback_bbox
        bbox = [round(float(v), 4) for v in bbox]

        key = (region, uid)
        if key not in grouped:
            age_top = float(u["age_top_ma"])
            age_base = float(u["age_base_ma"])
            color = u.get("color_hex") or _ics_color(age_base, ics_rows)
            grouped[key] = {
                "unit_id": uid,
                "symbol": u.get("symbol_std") or cw.get("symbol_orig", ""),
                "formation": u.get("formation") or cw.get("name_orig", ""),
                "region": region,
                "lith_class": u.get("lith_class", ""),
                "lith_detail": u.get("lith_detail", ""),
                "age_top_ma": age_top,
                "age_base_ma": age_base,
                "interval_top": u.get("interval_top", ""),
                "interval_base": u.get("interval_base", ""),
                "color_hex": color,
                "confidence": u.get("confidence") or "auto",
                "polygons": polys,
                "area_km2": area_km2,
                "bbox": bbox,
                "sheet_name": src.get("sheet_name", ""),
                "source_url": src.get("url", ""),
                "description": u.get("description", ""),
            }
        else:
            existing = grouped[key]
            existing["polygons"] += polys
            existing["area_km2"] = round(existing["area_km2"] + area_km2, 2)
            eb = existing["bbox"]
            existing["bbox"] = [
                round(min(eb[0], bbox[0]), 4),
                round(min(eb[1], bbox[1]), 4),
                round(max(eb[2], bbox[2]), 4),
                round(max(eb[3], bbox[3]), 4),
            ]

    ordered_regions = [r for r in REGION_ORDER if r in regions_seen]
    items = sorted(grouped.values(), key=lambda x: (-x["area_km2"], x["region"], x["formation"]))
    return {
        "schema": "orebit-geoatlas-index-v1",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "regions": ordered_regions,
        "unit_count": len(items),
        "units": items,
    }


def main() -> None:
    payload = build_index()
    INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    INDEX_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Indeks nasional tersimpan: {INDEX_PATH} ({payload['unit_count']} entri, {len(payload['regions'])} wilayah)")


if __name__ == "__main__":
    main()
