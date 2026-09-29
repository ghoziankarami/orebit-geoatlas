"""Gabungkan poligon dengan crosswalk → unit baku, umur (Ma), litologi, warna.

Keluaran: 03_units.parquet
"""
import geopandas as gpd
import pandas as pd

from common import out_dir, read_csv, region_arg

region = region_arg()
od = out_dir(region)
u = gpd.read_parquet(od / "02_units.parquet")
cw = read_csv("crosswalk.csv")[["source_id", "symbol_orig", "name_orig", "unit_id"]]
units = read_csv("units.csv")
ics = read_csv("ics_intervals.csv")
ics["top_ma"] = ics.top_ma.astype(float)
ics["base_ma"] = ics.base_ma.astype(float)
ics["width"] = ics.base_ma - ics.top_ma
ics_coarse = ics[ics["rank"] != "epoch"]  # hanya period/eon-group: warna umur "besar" untuk zoom jauh
lith = read_csv("lithology.csv")[["lith_class", "parent"]]


def ics_color(age_top: float, age_base: float, coarse: bool = False) -> str:
    """Prefer the narrowest interval containing the full age range.

    Coloring by base alone assigns a Holocene/Pleistocene boundary to the wrong
    epoch and mislabels units spanning several epochs.
    """
    table = ics_coarse if coarse else ics
    hit = table[(table.top_ma <= age_top) & (table.base_ma >= age_base)]
    if hit.empty:
        # Composite ages can span periods; choose a period at the midpoint.
        midpoint = (age_top + age_base) / 2
        hit = ics_coarse[(ics_coarse.top_ma <= midpoint) & (ics_coarse.base_ma > midpoint)]
        if hit.empty:
            return ""
    return hit.sort_values("width").iloc[0].color_hex


u = u.merge(cw, on=["source_id", "symbol_orig", "name_orig"], how="left", validate="many_to_one").merge(
    units, on="unit_id", how="left", validate="many_to_one")
u["age_top_ma"] = pd.to_numeric(u.age_top_ma, errors="coerce")
u["age_base_ma"] = pd.to_numeric(u.age_base_ma, errors="coerce")
u["color_hex"] = [c if isinstance(c, str) and c else
                  (ics_color(a, b) if pd.notna(a) and pd.notna(b) else "")
                  for c, a, b in zip(u.color_hex, u.age_top_ma, u.age_base_ma)]
u["color_hex_coarse"] = [ics_color(a, b, coarse=True) if pd.notna(a) and pd.notna(b) else ""
                          for a, b in zip(u.age_top_ma, u.age_base_ma)]
u = u.merge(lith, on="lith_class", how="left").rename(columns={"parent": "lith_parent"})
u["lith_parent"] = u.lith_parent.fillna("")

unmapped = u.unit_id.isna() | (u.unit_id == "")
print(f"Terpetakan: {(~unmapped).sum():,} / {len(u):,} poligon ({(~unmapped).mean():.1%}).")
if unmapped.any():
    print("Belum dikurasi (tampil abu-abu):", u.loc[unmapped, ["source_id", "symbol_orig"]].drop_duplicates().head(20).to_string(index=False))

u.to_parquet(od / "03_units.parquet")
