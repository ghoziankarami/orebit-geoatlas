"""Validasi CSV referensi. Dipakai CI: gagal bila ada unit tanpa umur/litologi atau crosswalk menunjuk unit yang tidak ada."""
import sys

from common import read_csv

errors = []
units = read_csv("units.csv")
liths = set(read_csv("lithology.csv").lith_class)
cw = read_csv("crosswalk.csv")

if units.unit_id.duplicated().any():
    errors.append(f"unit_id ganda: {units.unit_id[units.unit_id.duplicated()].tolist()}")
for _, r in units.iterrows():
    if not r.age_top_ma or not r.age_base_ma:
        errors.append(f"{r.unit_id}: umur belum diisi")
    elif float(r.age_top_ma) > float(r.age_base_ma):
        errors.append(f"{r.unit_id}: age_top_ma > age_base_ma")
    if r.lith_class not in liths:
        errors.append(f"{r.unit_id}: lith_class '{r.lith_class}' tidak ada di lithology.csv")

bad = cw[(cw.unit_id != "") & ~cw.unit_id.isin(units.unit_id)]
for _, r in bad.iterrows():
    errors.append(f"crosswalk {r.source_id}/{r.symbol_orig}: unit_id '{r.unit_id}' tidak ada di units.csv")

todo = (cw.unit_id == "").sum()
print(f"units: {len(units)}, crosswalk: {len(cw)} baris ({todo} belum dikurasi)")
if errors:
    print("\n".join(f"✗ {e}" for e in errors))
    sys.exit(1)
print("✓ referensi valid")
