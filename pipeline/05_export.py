"""Ekspor GeoJSONSeq ramping untuk tippecanoe. Hanya atribut yang dibutuhkan popup."""
import geopandas as gpd
import pandas as pd

from common import out_dir, read_csv, region_arg

region = region_arg()
od = out_dir(region)
src = read_csv("sources.csv").set_index("source_id")

u = gpd.read_parquet(od / "04_units.parquet")
first_src = u.source_id.str.split(";").str[0]
u["sheet_name"] = first_src.map(src.sheet_name).fillna("")
u["source_url"] = first_src.map(src.url).fillna("")
cols = ["poly_id", "unit_id", "formation", "symbol_std", "lith_class", "lith_detail", "age_top_ma", "age_base_ma",
        "interval_top", "interval_base", "color_hex", "description", "sheet_name", "source_url", "source_id"]
for c in cols:
    if c not in u.columns:
        u[c] = ""
u = u.rename(columns={"symbol_std": "symbol"})
cols = [("symbol" if c == "symbol_std" else c) for c in cols]
u[cols + ["geometry"]].to_file(od / "units.geojsonl", driver="GeoJSONSeq")
print(f"units.geojsonl: {len(u):,} fitur")

try:
    ln = gpd.read_parquet(od / "02_lines.parquet")
    t = ln.type_orig.str.lower()
    ln["type"] = pd.Series("contact", index=ln.index).mask(t.str.contains("sesar|fault"), "fault").mask(
        t.str.contains("antiklin|anticline"), "anticline").mask(t.str.contains("sinklin|syncline"), "syncline")
    ln["certainty"] = t.str.contains("duga|inferred|diperkirakan").map({True: "inferred", False: "certain"})
    ln[["source_id", "type", "certainty", "geometry"]].to_file(od / "lines.geojsonl", driver="GeoJSONSeq")
    print(f"lines.geojsonl: {len(ln):,} fitur")
except FileNotFoundError:
    pass
