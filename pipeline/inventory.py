"""Tambahkan simbol unik yang belum ada ke reference/crosswalk.csv untuk dikurasi."""
import geopandas as gpd
import pandas as pd

from common import REF, out_dir, read_csv, region_arg

region = region_arg()
u = gpd.read_parquet(out_dir(region) / "02_units.parquet")
area_km2 = u.to_crs(u.estimate_utm_crs()).area / 1e6
inv = (u.assign(area_km2=area_km2).groupby(["source_id", "symbol_orig", "name_orig"], dropna=False)
         .agg(polygons=("geometry", "size"), area_km2=("area_km2", "sum")).reset_index())

cw = read_csv("crosswalk.csv")
key = lambda df: df["source_id"] + "|" + df["symbol_orig"]
missing = inv[~key(inv.astype(str)).isin(key(cw))]
if missing.empty:
    print("Semua simbol sudah ada di crosswalk.")
else:
    add = missing.assign(unit_id="", note=lambda d: d.polygons.astype(str) + " poligon, " + d.area_km2.round(1).astype(str) + " km2")
    add = add[["source_id", "symbol_orig", "name_orig", "unit_id", "note"]].astype(str)
    pd.concat([cw, add]).to_csv(REF / "crosswalk.csv", index=False)
    print(f"{len(add)} simbol baru ditambahkan ke reference/crosswalk.csv — isi kolom unit_id.")
