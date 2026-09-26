"""Baca semua SHP mentah satu wilayah, seragamkan kolom, reproyeksi ke EPSG:4326.

Masukan : data/raw/<wilayah>/**/*.shp  (unduhan manual dari GeoMap PSG)
Keluaran: data/out/<wilayah>/01_units.parquet, 01_lines.parquet
          reference/sources.csv diperbarui bila ada file baru
"""
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyogrio

from common import LINE_TYPE_FIELDS, NAME_FIELDS, RAW, REF, SYMBOL_FIELDS, out_dir, pick_field, read_csv, region_arg

region = region_arg()
files = sorted((RAW / region).rglob("*.shp"))
if not files:
    raise SystemExit(f"Tidak ada SHP di {RAW / region}. Unduh dari https://geologi.esdm.go.id/geomap dulu.")

sources = read_csv("sources.csv")
known = dict(zip(sources["file_key"], sources["source_id"]))
next_id = max([int(x) for x in sources["source_id"] if x.isdigit()] + [0]) + 1
new_rows = []

units, lines = [], []
for f in files:
    key = f"{region}/{f.relative_to(RAW / region).as_posix()}"
    if key not in known:
        known[key] = str(next_id)
        new_rows.append({"source_id": str(next_id), "file_key": key, "sheet_name": f.relative_to(RAW / region).with_suffix("").as_posix(), "scale": "100000",
                         "year": "", "authors": "", "publisher": "Pusat Survei Geologi, Badan Geologi",
                         "license": "Lisensi Terbuka PSG (atribusi, non-komersial)", "url": "https://geologi.esdm.go.id/geomap"})
        next_id += 1
    sid = known[key]

    gdf = pyogrio.read_dataframe(f)
    if gdf.crs is None:
        print(f"[PERINGATAN] {key}: CRS tidak ada, diasumsikan EPSG:4326")
        gdf = gdf.set_crs(4326)
    gdf = gdf.to_crs(4326)
    geom_types = set(gdf.geom_type.dropna().unique())
    cols = list(gdf.columns)

    if geom_types & {"Polygon", "MultiPolygon"}:
        sym, name = pick_field(cols, SYMBOL_FIELDS), pick_field(cols, NAME_FIELDS)
        if not sym:
            print(f"[PERINGATAN] {key}: kolom simbol tidak dikenali, kolom tersedia: {cols}")
        units.append(gpd.GeoDataFrame({
            "source_id": sid,
            "symbol_orig": gdf[sym].astype(str).str.strip() if sym else "",
            "name_orig": gdf[name].astype(str).str.strip() if name else "",
        }, geometry=gdf.geometry, crs=4326))
    elif geom_types & {"LineString", "MultiLineString"}:
        typ = pick_field(cols, LINE_TYPE_FIELDS)
        lines.append(gpd.GeoDataFrame({
            "source_id": sid,
            "type_orig": gdf[typ].astype(str).str.strip() if typ else "",
        }, geometry=gdf.geometry, crs=4326))
    else:
        print(f"[LEWATI] {key}: tipe geometri {geom_types}")

if new_rows:
    pd.concat([sources, pd.DataFrame(new_rows)]).to_csv(REF / "sources.csv", index=False)
    print(f"{len(new_rows)} sumber baru ditambahkan ke reference/sources.csv — lengkapi tahun & penyusun.")

od = out_dir(region)
if units:
    u = pd.concat(units, ignore_index=True)
    u.to_parquet(od / "01_units.parquet")
    print(f"Poligon: {len(u):,} dari {len(units)} file")
if lines:
    ln = pd.concat(lines, ignore_index=True)
    ln.to_parquet(od / "01_lines.parquet")
    print(f"Garis: {len(ln):,} dari {len(lines)} file")
