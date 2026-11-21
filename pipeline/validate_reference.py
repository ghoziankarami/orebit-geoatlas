"""Validasi CSV referensi. Dipakai CI: gagal bila ada unit tanpa umur/litologi atau crosswalk menunjuk unit yang tidak ada."""
from __future__ import annotations

import csv
import io
import sys
from pathlib import Path

REF = Path(__file__).resolve().parents[1] / "reference"
VALID_CONFIDENCE = {"curated", "auto", "flagged"}


def read_rows(name: str) -> list[dict[str, str]]:
    lines = (REF / name).read_text(encoding="utf-8").splitlines()
    body = "\n".join(line for line in lines if not line.startswith("#"))
    return [
        {k: (v or "").strip() for k, v in row.items()}
        for row in csv.DictReader(io.StringIO(body))
    ]


errors: list[str] = []
units = read_rows("units.csv")
liths = {r["lith_class"] for r in read_rows("lithology.csv")}
cw = read_rows("crosswalk.csv")

seen_ids: set[str] = set()
dups: list[str] = []
if not units or "confidence" not in units[0]:
    errors.append("units.csv: kolom wajib 'confidence' tidak ditemukan")

for r in units:
    uid = r["unit_id"]
    if uid in seen_ids and uid not in dups:
        dups.append(uid)
    seen_ids.add(uid)
    if not r["age_top_ma"] or not r["age_base_ma"]:
        errors.append(f"{uid}: umur belum diisi")
    elif float(r["age_top_ma"]) > float(r["age_base_ma"]):
        errors.append(f"{uid}: age_top_ma > age_base_ma")
    if r["lith_class"] not in liths:
        errors.append(f"{uid}: lith_class '{r['lith_class']}' tidak ada di lithology.csv")
    if r.get("confidence", "") not in VALID_CONFIDENCE:
        errors.append(
            f"{uid}: confidence '{r.get('confidence', '')}' wajib salah satu dari {sorted(VALID_CONFIDENCE)}"
        )

if dups:
    errors.append(f"unit_id ganda: {dups}")

for r in cw:
    uid = r["unit_id"]
    if uid and uid not in seen_ids:
        errors.append(
            f"crosswalk {r['source_id']}/{r['symbol_orig']}: unit_id '{uid}' tidak ada di units.csv"
        )

todo = sum(1 for r in cw if not r["unit_id"])
print(f"units: {len(units)}, crosswalk: {len(cw)} baris ({todo} belum dikurasi)")
if errors:
    print("\n".join(f"✗ {e}" for e in errors))
    sys.exit(1)
print("✓ referensi valid")
