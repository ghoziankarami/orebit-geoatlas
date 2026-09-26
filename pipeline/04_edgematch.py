"""Gabungkan poligon bertetangga dengan unit baku sama (menghapus batas lembar),
lalu tandai poligon di sambungan lembar yang bertemu unit berbeda untuk ditinjau.

Keluaran: 04_units.parquet, edge_review.gpkg
"""
import geopandas as gpd
import pandas as pd

from common import out_dir, region_arg

SNAP_M = 25  # toleransi celah antar-lembar (meter)

region = region_arg()
od = out_dir(region)
u = gpd.read_parquet(od / "03_units.parquet")
utm = u.estimate_utm_crs()
u = u.to_crs(utm)
u["unit_key"] = u.unit_id.fillna("").where(u.unit_id.fillna("") != "", "RAW:" + u.source_id + ":" + u.symbol_orig)

# Tutup celah kecil di sambungan lembar dengan buffer +/-
u["geometry"] = u.buffer(SNAP_M / 2).buffer(-SNAP_M / 2)

keep = [c for c in u.columns if c not in ("geometry", "source_id", "symbol_orig", "name_orig")]
merged = u.dissolve(by="unit_key", aggfunc={
    **{c: "first" for c in keep if c != "unit_key"},
    "source_id": lambda s: ";".join(sorted(set(s))),
    "symbol_orig": lambda s: ";".join(sorted(set(s))),
}).explode(index_parts=False).reset_index()

# Sambungan lembar = batas cakupan tiap sumber
extents = u.dissolve(by="source_id").boundary
seams = gpd.GeoSeries(extents.values, crs=utm).union_all()
touch = merged[merged.boundary.intersects(seams.buffer(SNAP_M))]
review = touch[~touch.source_id.str.contains(";")]  # poligon di sambungan yang tidak menyatu dengan lembar tetangga
review.to_crs(4326).to_file(od / "edge_review.gpkg", driver="GPKG")

merged = merged.to_crs(4326)
merged["poly_id"] = [f"{region}-{i:06d}" for i in range(len(merged))]
merged.to_parquet(od / "04_units.parquet")
print(f"Poligon setelah edge-match: {len(merged):,}. Perlu ditinjau di sambungan: {len(review):,} (edge_review.gpkg)")
