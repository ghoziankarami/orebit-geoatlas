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
if u.empty:
    raise SystemExit("Tidak ada poligon untuk edge-match.")
u["unit_key"] = u.unit_id.fillna("").where(u.unit_id.fillna("") != "", "RAW:" + u.source_id + ":" + u.symbol_orig)

# A national ESDM layer is already seamless. Keep its original polygons and
# object IDs: a global dissolve would erase 36k individual click targets.
if u.source_id.nunique() == 1:
    if "object_id" in u and u.object_id.ne("").all():
        if u.object_id.duplicated().any():
            raise SystemExit("Object ID duplikat pada satu sumber; build dihentikan.")
        u["poly_id"] = u.source_id.astype(str) + "-" + u.object_id.astype(str)
    else:
        u["poly_id"] = [f"{region}-{i:06d}" for i in range(len(u))]
    u.to_parquet(od / "04_units.parquet")
    print(f"Poligon sumber seamless dipertahankan: {len(u):,}.")
    raise SystemExit(0)

# Equal-area metre CRS spans the archipelago; one estimated UTM zone does not.
utm = "EPSG:6933"
u = u.to_crs(utm)
# Tutup celah kecil di sambungan lembar dengan buffer +/-
u["geometry"] = u.buffer(SNAP_M / 2).buffer(-SNAP_M / 2)

keep = [c for c in u.columns if c not in ("geometry", "source_id", "symbol_orig")]
merged = u.dissolve(by="unit_key", aggfunc={
    **{c: "first" for c in keep if c != "unit_key"},
    "source_id": lambda s: ";".join(sorted(set(s))),
    "symbol_orig": lambda s: ";".join(sorted(set(s))),
}).explode(index_parts=False).reset_index()

# Sambungan lembar = batas cakupan tiap sumber. Hanya relevan bila ada lebih dari satu sumber;
# dengan satu sumber (mis. layanan ESDM yang sudah seamless) tidak ada sambungan untuk ditinjau.
review = merged.iloc[0:0]
if u.source_id.nunique() > 1:
    extents = u.dissolve(by="source_id").boundary
    seams = gpd.GeoSeries(extents.values, crs=utm).union_all()
    touch = merged[merged.boundary.intersects(seams.buffer(SNAP_M))]
    review = touch[~touch.source_id.str.contains(";")]  # poligon di sambungan yang tidak menyatu dengan lembar tetangga
    review.to_crs(4326).to_file(od / "edge_review.gpkg", driver="GPKG")

merged = merged.to_crs(4326)
merged["poly_id"] = [f"{region}-{i:06d}" for i in range(len(merged))]
merged.to_parquet(od / "04_units.parquet")
print(f"Poligon setelah edge-match: {len(merged):,}. Perlu ditinjau di sambungan: {len(review):,} (edge_review.gpkg)")
