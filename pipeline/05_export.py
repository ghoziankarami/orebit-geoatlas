# SPDX-License-Identifier: GPL-3.0-only
# Copyright (c) 2026 Orebit (Ghozian Islam Karami)
"""Ekspor GeoJSONSeq ramping untuk tippecanoe dan perbarui indeks pencarian nasional."""
import geopandas as gpd
import pandas as pd

from common import out_dir, read_csv, region_arg

region = region_arg()
od = out_dir(region)
src = read_csv("sources.csv").set_index("source_id")

u = gpd.read_parquet(od / "04_units.parquet")
first_src = u.source_id.str.split(";").str[0]
src_sheet = first_src.map(src.sheet_name).fillna("")
sheet_orig = u.sheet_orig.fillna("") if "sheet_orig" in u.columns else pd.Series("", index=u.index)
def sheet_label(raw: str) -> str:
    """Ringkas daftar lembar gabungan (poligon hasil edge-match) menjadi 2 lembar pertama + jumlah sisa."""
    parts = list(dict.fromkeys(p.strip() for p in raw.split(";") if p.strip()))
    if not parts:
        return ""
    more = len(parts) - 2
    return ", ".join(parts[:2]) + (f" dan {more} lembar lain" if more > 0 else "")


u["sheet_name"] = [f"Peta Geologi Lembar {lbl}, Skala 1:250.000 — P3G" if (lbl := sheet_label(s)) else ss
                   for s, ss in zip(sheet_orig, src_sheet)]
u["source_url"] = first_src.map(src.url).fillna("")
cols = [
    "poly_id", "unit_id", "region", "formation", "symbol_std", "lith_class", "lith_parent",
    "lith_detail", "age_top_ma", "age_base_ma", "interval_top", "interval_base",
    "color_hex", "color_hex_coarse", "confidence", "area_km2",
    "description", "sheet_name", "source_url", "source_id",
]
for c in cols + ["symbol_orig", "name_orig", "desc_orig"]:
    if c not in u.columns:
        u[c] = ""
blank = lambda s: s.isna() | (s.astype(str).str.strip() == "")
u["symbol_std"] = u.symbol_std.mask(blank(u.symbol_std), u.symbol_orig.astype(str).str.split(";").str[0])
u["formation"] = u.formation.mask(blank(u.formation), u.name_orig)
u["description"] = u.description.mask(blank(u.description), u.desc_orig)
u["region"] = u["region"].mask(blank(u["region"]), region)
u["confidence"] = u["confidence"].mask(blank(u["confidence"]), "auto")
u = u.rename(columns={"symbol_std": "symbol"})
cols = [("symbol" if c == "symbol_std" else c) for c in cols]
u[cols + ["geometry"]].to_file(od / "units.geojsonl", driver="GeoJSONSeq")
print(f"units.geojsonl: {len(u):,} fitur")

try:
    ln = gpd.read_parquet(od / "02_lines.parquet")
    t = ln.type_orig.fillna("").astype(str).str.lower()
    ln["type"] = (
        pd.Series("contact", index=ln.index)
        .mask(t.str.contains("sesar|fault|subduksi|kelurusan|lineament|intrusi"), "fault")
        .mask(t.str.contains("antiklin|anticline|lipatan|fold"), "anticline")
        .mask(t.str.contains("sinklin|syncline"), "syncline")
    )
    ln["line_type"] = ln.type_orig.fillna("").astype(str).replace("", "Kontak Geologi")
    ln["certainty"] = t.str.contains("duga|inferred|diperkirakan|kelurusan").map({True: "inferred", False: "certain"})
    ln["region"] = region
    ln[["source_id", "region", "type", "line_type", "certainty", "geometry"]].to_file(od / "lines.geojsonl", driver="GeoJSONSeq")
    print(f"lines.geojsonl: {len(ln):,} fitur")
except FileNotFoundError:
    pass
