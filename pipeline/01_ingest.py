"""Baca semua vektor mentah satu wilayah, seragamkan kolom, reproyeksi ke EPSG:4326.

Masukan : data/raw/<wilayah>/**/*.shp|*.geojson|*.gpkg
          (SHP GeoMap PSG, atau GeoJSON hasil 00_fetch_esdm.py di subfolder esdm/)
Keluaran: data/out/<wilayah>/01_units.parquet, 01_lines.parquet
          reference/sources.csv diperbarui bila ada file baru
"""
import geopandas as gpd
import pandas as pd
import pyogrio

from common import (DESC_FIELDS, LINE_TYPE_FIELDS, NAME_FIELDS, RAW, REF, REGION_RAW_FILES, SYMBOL_FIELDS,
                    VECTOR_GLOBS, out_dir, pick_field, pick_fields, read_csv, region_arg)

ESDM_URL = "https://geoportal.esdm.go.id/gis4/rest/services/BGS_PM/Geologi_Litologi/MapServer"
EXCLUDE_SYMBOLS = {"air", "danau", "laut", "water", "lake", "sea"}
STR_ID_MAP = {
    "5002": "Sesar naik",
    "5003": "Sesar naik",
    "5004": "Sesar mendatar",
    "5005": "Sesar mendatar",
    "5006": "Sesar",
    "5007": "Sesar diperkirakan",
    "5008": "Sesar turun",
    "5009": "Sesar turun",
    "5013": "Lipatan",
    "5014": "Lipatan",
    "5015": "Lipatan",
    "5017": "Lipatan",
    "5018": "Lipatan",
    "5021": "Kelurusan",
    "6000": "Kelurusan",
}

region = region_arg()
if (RAW / region).exists():
    files = sorted({p for g in VECTOR_GLOBS for p in (RAW / region).rglob(g)})
else:
    files = [p for p in REGION_RAW_FILES.get(region, []) if p.exists()]
if not files:
    raise SystemExit(f"Tidak ada data di {RAW / region}. Jalankan 00_fetch_esdm.py {region}, "
                     "atau unduh SHP dari https://geologi.esdm.go.id/geomap.")

sources = read_csv("sources.csv")
known = dict(zip(sources["file_key"], sources["source_id"]))
next_id = max([int(x) for x in sources["source_id"] if x.isdigit()] + [0]) + 1
new_rows = []

units, lines = [], []
for f in files:
    rel = f.relative_to(RAW / region) if (RAW / region) in f.parents else f.relative_to(RAW)
    key = f"{region}/{rel.as_posix()}" if (RAW / region) in f.parents else f"{region}/{f.name}"
    if key not in known:
        known[key] = str(next_id)
        is_esdm = f.parent.name == "esdm"
        new_rows.append({
            "source_id": str(next_id), "file_key": key,
            "sheet_name": "Peta Geologi (layanan Geologi Litologi ESDM, status Mei 2018)" if is_esdm
                          else rel.with_suffix("").as_posix(),
            "scale": "" if is_esdm else "250000",
            "year": "2018" if is_esdm else "", "authors": "",
            "publisher": "Pusat Survei Geologi, Badan Geologi",
            "license": "Lisensi Terbuka PSG (atribusi, tidak diperjualbelikan)",
            "url": ESDM_URL if is_esdm else "https://geologi.esdm.go.id/geomap"})
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
        descs = [c for c in pick_fields(cols, DESC_FIELDS) if c not in (sym, name)]
        print(f"{key}: simbol={sym} nama={name} keterangan={descs}")
        if not sym:
            print(f"[PERINGATAN] {key}: kolom simbol tidak dikenali, kolom tersedia: {cols}")
        clean = lambda s: s.fillna("").astype(str).str.strip().replace({"None": "", "nan": ""})
        sym_series = clean(gdf[sym]) if sym else pd.Series("", index=gdf.index)
        keep_mask = ~sym_series.str.lower().isin(EXCLUDE_SYMBOLS) & (sym_series != "")
        gdf_u = gdf.loc[keep_mask]
        if gdf_u.empty:
            continue
        desc = (gdf_u[descs].apply(lambda r: " | ".join(v for v in clean(r) if v), axis=1) if descs
                else pd.Series("", index=gdf_u.index))
        units.append(gpd.GeoDataFrame({
            "source_id": sid,
            "symbol_orig": sym_series.loc[keep_mask],
            "name_orig": clean(gdf_u[name]) if name else "",
            "desc_orig": desc,
        }, geometry=gdf_u.geometry, crs=4326))
    elif geom_types & {"LineString", "MultiLineString"}:
        typ = pick_field(cols, LINE_TYPE_FIELDS)
        if typ:
            raw_typ = gdf[typ].fillna("").astype(str).str.strip().str.replace(r"\.0$", "", regex=True)
            mapped_typ = raw_typ.map(lambda v: "Subduksi" if "subduction" in f.stem.lower() else STR_ID_MAP.get(v, v))
        else:
            mapped_typ = pd.Series("Subduksi" if "subduction" in f.stem.lower() else "", index=gdf.index)
        lines.append(gpd.GeoDataFrame({
            "source_id": sid,
            "type_orig": mapped_typ,
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
