"""Perbaiki geometri dan buat laporan QA per sumber.

Keluaran: 02_units.parquet, 02_lines.parquet, qa_report.csv
"""
import geopandas as gpd
import pandas as pd
from shapely import make_valid

from common import out_dir, region_arg

MIN_AREA_M2 = 2_000  # serpihan di bawah ini dibuang (artefak digitasi)

region = region_arg()
od = out_dir(region)
u = gpd.read_parquet(od / "01_units.parquet")
n0 = len(u)

u["geometry"] = u.geometry.apply(lambda g: make_valid(g) if g is not None else None)
u = u[~u.geometry.is_empty & u.geometry.notna()]
u = u.explode(index_parts=False)
u = u[u.geom_type == "Polygon"]
area = u.to_crs(u.estimate_utm_crs()).area
u = u[area >= MIN_AREA_M2].copy()

qa = u.assign(no_symbol=u.symbol_orig.isin(["", "None", "nan"])).groupby("source_id").agg(
    polygons=("geometry", "size"), no_symbol=("no_symbol", "sum"))
qa.to_csv(od / "qa_report.csv")
u.to_parquet(od / "02_units.parquet")
print(f"Poligon {n0:,} → {len(u):,} setelah validasi. Laporan: {od / 'qa_report.csv'}")

try:
    ln = gpd.read_parquet(od / "01_lines.parquet")
    ln = ln[ln.geometry.notna() & ~ln.geometry.is_empty].explode(index_parts=False)
    ln.to_parquet(od / "02_lines.parquet")
    print(f"Garis: {len(ln):,}")
except FileNotFoundError:
    pass
