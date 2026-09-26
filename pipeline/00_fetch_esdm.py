"""Tarik poligon Peta Geologi dari layanan ArcGIS REST publik ESDM (Pusat Survei Geologi) untuk satu wilayah.

Layanan : https://geoportal.esdm.go.id/gis4/rest/services/BGS_PM/Geologi_Litologi/MapServer/0
          (Query, keluaran GeoJSON, maxRecordCount 2000, © Pusat Survei Geologi, status data Mei 2018)
Keluaran: data/raw/<wilayah>/esdm/esdm_litologi.geojson
          data/raw/<wilayah>/esdm/esdm_layer.json   (metadata layer, untuk atribusi)
          data/raw/<wilayah>/esdm/laporan.txt        (kolom, jumlah fitur, nilai teratas per kolom)

Pemakaian:
    python 00_fetch_esdm.py babel
    python 00_fetch_esdm.py <wilayah> --bbox 105.0,-3.6,109.0,-1.3
    python 00_fetch_esdm.py babel --layer-url <url layer lain>

Sopan terhadap server: permintaan berurutan, jeda 1 detik, berhenti bila error berulang.
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

from common import RAW

DEFAULT_LAYER = "https://geoportal.esdm.go.id/gis4/rest/services/BGS_PM/Geologi_Litologi/MapServer/0"
REGION_BBOX = {
    # lon_min, lat_min, lon_max, lat_max (EPSG:4326)
    "babel": (105.0, -3.6, 109.0, -1.3),
}
CHUNK = 250          # objectId per permintaan (di bawah maxRecordCount, URL/POST tetap kecil)
PAUSE_S = 1.0
RETRIES = 3
UA = "OrebitGeoAtlas/0.1 (+https://atlas.orebit.id)"


def request(url: str, params: dict, post: bool = False) -> dict:
    data = urllib.parse.urlencode(params).encode()
    last: Exception | None = None
    for attempt in range(1, RETRIES + 1):
        try:
            req = urllib.request.Request(url if post else f"{url}?{data.decode()}", data=data if post else None,
                                         headers={"User-Agent": UA})
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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("region")
    ap.add_argument("--bbox", help="lon_min,lat_min,lon_max,lat_max")
    ap.add_argument("--layer-url", default=DEFAULT_LAYER)
    args = ap.parse_args()

    if args.bbox:
        bbox = tuple(float(v) for v in args.bbox.split(","))
    elif args.region in REGION_BBOX:
        bbox = REGION_BBOX[args.region]
    else:
        raise SystemExit(f"Wilayah '{args.region}' belum punya bbox bawaan; beri --bbox.")

    out = RAW / args.region / "esdm"
    out.mkdir(parents=True, exist_ok=True)
    layer_url = args.layer_url.rstrip("/")

    # 1. Metadata layer (kolom, kemampuan, atribusi)
    meta = request(layer_url, {"f": "json"})
    (out / "esdm_layer.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    oid_field = meta.get("objectIdField") or next(
        (f["name"] for f in meta.get("fields", []) if f.get("type") == "esriFieldTypeOID"), "OBJECTID")
    max_rec = int(meta.get("maxRecordCount") or 1000)
    chunk = max(1, min(CHUNK, max_rec))
    print(f"Layer: {meta.get('name')} | geometri {meta.get('geometryType')} | OID {oid_field} | maxRecordCount {max_rec}")

    # 2. Semua objectId di dalam bbox
    spatial = {
        "geometry": ",".join(str(v) for v in bbox), "geometryType": "esriGeometryEnvelope",
        "inSR": 4326, "spatialRel": "esriSpatialRelIntersects", "where": "1=1",
    }
    time.sleep(PAUSE_S)
    ids = request(f"{layer_url}/query", {**spatial, "returnIdsOnly": "true", "f": "json"}).get("objectIds") or []
    ids = sorted(ids)
    print(f"Fitur di bbox {bbox}: {len(ids)}")
    if not ids:
        raise SystemExit("Tidak ada fitur. Periksa bbox atau URL layer.")

    # 3. Ambil per potongan objectId sebagai GeoJSON (tidak bergantung dukungan paging)
    features: list[dict] = []
    for i in range(0, len(ids), chunk):
        part = ids[i:i + chunk]
        time.sleep(PAUSE_S)
        fc = request(f"{layer_url}/query", {
            "objectIds": ",".join(map(str, part)), "outFields": "*", "outSR": 4326,
            "returnGeometry": "true", "f": "geojson",
        }, post=True)
        got = fc.get("features", [])
        features.extend(got)
        print(f"  {min(i + chunk, len(ids))}/{len(ids)} (+{len(got)})")

    if len(features) != len(ids):
        print(f"[PERINGATAN] diminta {len(ids)} fitur, diterima {len(features)}.")
    geo = {"type": "FeatureCollection", "features": features}
    (out / "esdm_litologi.geojson").write_text(json.dumps(geo, ensure_ascii=False), encoding="utf-8")

    # 4. Laporan: kolom + nilai teratas, untuk menyusun crosswalk
    lines = [f"Sumber: {layer_url}", f"Hak cipta: Pusat Survei Geologi (status data Mei 2018)",
             f"Wilayah: {args.region} bbox={bbox}", f"Fitur: {len(features)}", "", "Kolom:"]
    for f in meta.get("fields", []):
        lines.append(f"  - {f['name']} ({f.get('type', '').replace('esriFieldType', '')}) alias={f.get('alias')}")
    lines += ["", "Nilai teratas per kolom teks (maks. 40):"]
    for f in meta.get("fields", []):
        if f.get("type") != "esriFieldTypeString":
            continue
        c = Counter(str((ft.get("properties") or {}).get(f["name"], "")).strip() for ft in features)
        lines.append(f"\n[{f['name']}] {len(c)} nilai unik")
        for v, n in c.most_common(40):
            lines.append(f"  {n:>5}  {v[:160]}")
    report = "\n".join(lines)
    (out / "laporan.txt").write_text(report, encoding="utf-8")
    print(f"\nTersimpan di {out}\n")
    print(report)


if __name__ == "__main__":
    main()
