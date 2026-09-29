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
    # Timur dibatasi pas di 105.0 (batas barat babel) supaya tidak tumpang-tindih poligon.
    "sumatra": (94.0, -7.0, 110.0, 7.0),  # termasuk Kepri, Natuna, Lampung
    "jawa": (104.0, -9.5, 115.0, -5.0),
    "bali_nusra": (114.0, -12.0, 126.0, -7.0),
    "kalimantan": (108.0, -5.0, 120.0, 8.0),
    "sulawesi": (118.0, -7.0, 126.0, 3.0),
    "maluku": (124.0, -9.0, 135.0, 3.0),
    "papua": (130.0, -11.0, 142.0, 2.0),
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
    ap.add_argument("--fault-layer-url", help="URL layer ArcGIS polyline sesar yang sudah diverifikasi")
    args = ap.parse_args()

    if args.bbox:
        bbox = tuple(float(v) for v in args.bbox.split(","))
    elif args.region in REGION_BBOX or args.region == "all":
        bbox = REGION_BBOX.get(args.region)
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
    spatial = {"where": "1=1"}
    if bbox is not None:
        spatial.update({"geometry": ",".join(str(v) for v in bbox), "geometryType": "esriGeometryEnvelope",
                        "inSR": 4326, "spatialRel": "esriSpatialRelIntersects"})
    time.sleep(PAUSE_S)
    ids = request(f"{layer_url}/query", {**spatial, "returnIdsOnly": "true", "f": "json"}).get("objectIds") or []
    if len(set(ids)) != len(ids):
        raise SystemExit("Inventaris ArcGIS mengandung object ID duplikat.")
    ids = sorted(ids)
    print(f"Fitur di bbox {bbox}: {len(ids)}")
    if not ids:
        raise SystemExit("Tidak ada fitur. Periksa bbox atau URL layer.")

    # 3. Ambil per potongan objectId sebagai GeoJSON (tidak bergantung dukungan paging)
    features: dict[int, dict] = {}
    for i in range(0, len(ids), chunk):
        part = ids[i:i + chunk]
        time.sleep(PAUSE_S)
        fc = request(f"{layer_url}/query", {
            "objectIds": ",".join(map(str, part)), "outFields": "*", "outSR": 4326,
            "returnGeometry": "true", "f": "geojson",
        }, post=True)
        if fc.get("exceededTransferLimit"):
            raise SystemExit("Batas transfer ArcGIS tercapai; hasil tidak ditulis.")
        got = fc.get("features", [])
        for feature in got:
            props = feature.get("properties") or {}
            fid = props.get(oid_field, props.get(oid_field.lower(), feature.get("id")))
            if fid is None or int(fid) in features:
                raise SystemExit(f"Object ID hilang atau duplikat dalam respons: {fid}")
            features[int(fid)] = feature
        print(f"  {min(i + chunk, len(ids))}/{len(ids)} (+{len(got)})")

    missing, extra = set(ids) - features.keys(), features.keys() - set(ids)
    if missing or extra:
        raise SystemExit(f"Penarikan belum lengkap: {len(missing)} hilang, {len(extra)} tak diminta. Output tidak ditulis.")
    geo = {"type": "FeatureCollection", "features": [features[i] for i in ids]}
    target = out / "esdm_litologi.geojson"
    temporary = target.with_suffix(".geojson.tmp")
    temporary.write_text(json.dumps(geo, ensure_ascii=False), encoding="utf-8")
    temporary.replace(target)
    (out / "esdm_manifest.json").write_text(json.dumps({
        "layer_url": layer_url, "oid_field": oid_field, "count": len(ids),
        "min_id": ids[0], "max_id": ids[-1], "bbox": bbox,
    }, indent=2), encoding="utf-8")

    # 4. Laporan: kolom + nilai teratas, untuk menyusun crosswalk
    lines = [f"Sumber: {layer_url}", f"Hak cipta: Pusat Survei Geologi (status data Mei 2018)",
             f"Wilayah: {args.region} bbox={bbox}", f"Fitur: {len(features)}", "", "Kolom:"]
    for f in meta.get("fields", []):
        lines.append(f"  - {f['name']} ({f.get('type', '').replace('esriFieldType', '')}) alias={f.get('alias')}")
    lines += ["", "Nilai teratas per kolom teks (maks. 40):"]
    for f in meta.get("fields", []):
        if f.get("type") != "esriFieldTypeString":
            continue
        c = Counter(str((ft.get("properties") or {}).get(f["name"], "")).strip() for ft in features.values())
        lines.append(f"\n[{f['name']}] {len(c)} nilai unik")
        for v, n in c.most_common(40):
            lines.append(f"  {n:>5}  {v[:160]}")
    report = "\n".join(lines)
    (out / "laporan.txt").write_text(report, encoding="utf-8")
    print(f"\nTersimpan di {out}\n")
    print(report)
    if args.fault_layer_url:
        fault_url = args.fault_layer_url.rstrip("/")
        fault_meta = request(fault_url, {"f": "json"})
        if fault_meta.get("geometryType") != "esriGeometryPolyline":
            raise SystemExit("Layer patahan harus berupa esriGeometryPolyline.")
        fault_oid = fault_meta.get("objectIdField") or next(
            (f["name"] for f in fault_meta.get("fields", []) if f.get("type") == "esriFieldTypeOID"), "OBJECTID")
        fault_ids = request(f"{fault_url}/query", {**spatial, "returnIdsOnly": "true", "f": "json"}).get("objectIds") or []
        if len(set(fault_ids)) != len(fault_ids):
            raise SystemExit("Inventaris patahan berisi ID duplikat.")
        fault_features = {}
        for i in range(0, len(fault_ids), chunk):
            time.sleep(PAUSE_S)
            fc = request(f"{fault_url}/query", {"objectIds": ",".join(map(str, fault_ids[i:i+chunk])),
                "outFields": "*", "outSR": 4326, "returnGeometry": "true", "f": "geojson"}, post=True)
            for ft in fc.get("features", []):
                p = ft.get("properties") or {}
                fid = p.get(fault_oid, p.get(fault_oid.lower(), ft.get("id")))
                if fid is None or int(fid) in fault_features:
                    raise SystemExit(f"ID patahan hilang atau duplikat: {fid}")
                fault_features[int(fid)] = ft
        if set(fault_features) != set(fault_ids):
            raise SystemExit("Penarikan patahan belum lengkap.")
        tmp = out / "esdm_faults.geojson.tmp"
        tmp.write_text(json.dumps({"type": "FeatureCollection",
            "features": [fault_features[i] for i in sorted(fault_ids)]}, ensure_ascii=False), encoding="utf-8")
        tmp.replace(out / "esdm_faults.geojson")
        (out / "esdm_faults_layer.json").write_text(json.dumps(fault_meta, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"Patahan: {len(fault_ids):,} garis terverifikasi.")


if __name__ == "__main__":
    main()
