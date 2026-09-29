"""Audit the generated national tile inputs against verified ESDM inventories."""
import csv
import json
from pathlib import Path

from common import OUT, RAW

raw = RAW / "all" / "esdm"
out = OUT / "all"


def manifest(name):
    return json.loads((raw / name).read_text(encoding="utf-8"))


def features(path):
    with path.open(encoding="utf-8") as stream:
        for line in stream:
            if line.strip():
                yield json.loads(line.lstrip("\x1e"))


polygons = manifest("esdm_manifest.json")["count"]
faults = {scale: manifest(f"esdm_faults_{scale}_manifest.json")["count"]
          for scale in ("overview", "detail")}
with (out / "qa_report.csv").open(encoding="utf-8") as report_file:
    qa = sum(int(row["polygons"]) for row in csv.DictReader(report_file))
unit_count, unmapped, unknown_age = 0, 0, 0
ids = set()
duplicate_ids = False
for feature in features(out / "units.geojsonl"):
    unit_count += 1
    props = feature["properties"]
    poly_id = str(props.get("poly_id") or "")
    duplicate_ids |= not poly_id or poly_id in ids
    ids.add(poly_id)
    unmapped += not props.get("unit_id")
    unknown_age += props.get("age_top_ma") in ("", None) or props.get("age_base_ma") in ("", None)
line_count = 0
line_scales = dict.fromkeys(faults, 0)
for feature in features(out / "lines.geojsonl"):
    line_count += 1
    scale = feature["properties"].get("fault_scale")
    if scale in line_scales:
        line_scales[scale] += 1
tile = out / "all.pmtiles"
errors = []
if unit_count != polygons or qa != polygons:
    errors.append(f"Poligon: manifest={polygons}, QA={qa}, export={unit_count}")
if duplicate_ids:
    errors.append("poly_id kosong atau duplikat")
if unmapped:
    errors.append(f"{unmapped} poligon tidak punya unit_id")
if line_count != sum(faults.values()) or line_scales != faults:
    errors.append(f"Patahan: manifest={faults}, export={line_scales}")
tile_magic = b""
if tile.exists():
    with tile.open("rb") as stream:
        tile_magic = stream.read(7)
if tile_magic != b"PMTiles":
    errors.append("Header PMTiles tidak ada/invalid")

report = {
    "polygons_source": polygons, "polygons_qa": qa, "polygons_export": unit_count,
    "unmapped_polygons": unmapped, "polygons_without_age": unknown_age,
    "faults_source": faults, "faults_export": line_scales,
    "tile_bytes": tile.stat().st_size if tile.exists() else 0,
    "errors": errors,
}
(out / "build_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
if errors:
    raise SystemExit("Verifikasi nasional gagal; lihat build_report.json")
