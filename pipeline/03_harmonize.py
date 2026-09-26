"""Gabungkan poligon dengan crosswalk → unit baku, umur (Ma), litologi, warna.

Keluaran: 03_units.parquet
"""
import geopandas as gpd
import pandas as pd

from common import out_dir, read_csv, region_arg

region = region_arg()
od = out_dir(region)
u = gpd.read_parquet(od / "02_units.parquet")
cw = read_csv("crosswalk.csv")[["source_id", "symbol_orig", "unit_id"]]
units = read_csv("units.csv")
ics = read_csv("ics_intervals.csv")
ics["top_ma"] = ics.top_ma.astype(float)
ics["base_ma"] = ics.base_ma.astype(float)
ics["width"] = ics.base_ma - ics.top_ma


def ics_color(age_base: float) -> str:
    """Warna ICS dari interval terkecil (rank tertinggi) yang memuat umur base."""
    hit = ics[(ics.top_ma < age_base) & (ics.base_ma >= age_base)]
    if hit.empty:
        return ""
    return hit.sort_values("width").iloc[0].color_hex


u = u.merge(cw, on=["source_id", "symbol_orig"], how="left").merge(units, on="unit_id", how="left")
u["age_top_ma"] = pd.to_numeric(u.age_top_ma, errors="coerce")
u["age_base_ma"] = pd.to_numeric(u.age_base_ma, errors="coerce")
u["color_hex"] = [c if isinstance(c, str) and c else (ics_color(b) if pd.notna(b) else "")
                  for c, b in zip(u.color_hex, u.age_base_ma)]

unmapped = u.unit_id.isna() | (u.unit_id == "")
print(f"Terpetakan: {(~unmapped).sum():,} / {len(u):,} poligon ({(~unmapped).mean():.1%}).")
if unmapped.any():
    print("Belum dikurasi (tampil abu-abu):", u.loc[unmapped, ["source_id", "symbol_orig"]].drop_duplicates().head(20).to_string(index=False))

u.to_parquet(od / "03_units.parquet")
