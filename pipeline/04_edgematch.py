# SPDX-License-Identifier: GPL-3.0-only
# Copyright (c) 2026 Orebit (Ghozian Islam Karami)
"""Gabungkan poligon bertetangga dengan unit baku sama (menghapus batas lembar),
hitung area_km2 Equal-Area (EPSG:6933), dan tandai sambungan bermasalah.

Keluaran: 04_units.parquet, edge_review.gpkg
"""
import geopandas as gpd

from common import EQUAL_AREA_CRS, out_dir, region_arg

SNAP_M = 25  # toleransi celah antar-lembar (meter)

region = region_arg()
od = out_dir(region)
u = gpd.read_parquet(od / "03_units.parquet")
u = u.to_crs(EQUAL_AREA_CRS)
u["unit_key"] = u.unit_id.fillna("").where(u.unit_id.fillna("") != "", "RAW:" + u.source_id + ":" + u.symbol_orig)

u["geometry"] = u.buffer(SNAP_M / 2).buffer(-SNAP_M / 2)

keep = [c for c in u.columns if c not in ("geometry", "source_id", "symbol_orig")]
merged = u.dissolve(by="unit_key", aggfunc={
    **{c: "first" for c in keep if c != "unit_key"},
    "source_id": lambda s: ";".join(sorted(set(s))),
    "symbol_orig": lambda s: ";".join(sorted(set(s))),
    "sheet_orig": lambda s: "; ".join(sorted({x for x in s if x})),
}).explode(index_parts=False).reset_index()

merged["area_km2"] = (merged.geometry.area / 1e6).round(2)
merged["region"] = region

review = merged.iloc[0:0]
if u.source_id.nunique() > 1:
    extents = u.dissolve(by="source_id").boundary
    seams = gpd.GeoSeries(extents.values, crs=EQUAL_AREA_CRS).union_all()
    touch = merged[merged.boundary.intersects(seams.buffer(SNAP_M))]
    review = touch[~touch.source_id.str.contains(";")]
    review.to_crs(4326).to_file(od / "edge_review.gpkg", driver="GPKG")

merged = merged.to_crs(4326)
merged["poly_id"] = [f"{region}-{i:06d}" for i in range(len(merged))]
merged.to_parquet(od / "04_units.parquet")
print(f"Poligon setelah edge-match: {len(merged):,}. Perlu ditinjau di sambungan: {len(review):,} (edge_review.gpkg)")
