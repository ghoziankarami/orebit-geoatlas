"""Utilitas bersama pipeline Orebit GeoAtlas."""
from __future__ import annotations

import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "out"
REF = ROOT / "reference"

# Pembagian 8 wilayah kepulauan Indonesia (lon_min, lat_min, lon_max, lat_max, EPSG:4326)
REGION_BBOX: dict[str, tuple[float, float, float, float]] = {
    "sumatra": (95.0, -6.5, 105.0, 6.5),
    "babel": (105.0, -3.6, 109.0, 4.8),
    "jawa": (105.0, -9.0, 114.6, -5.0),
    "balinusra": (114.4, -11.2, 125.5, -8.0),
    "kalimantan": (108.5, -4.5, 119.2, 4.6),
    "sulawesi": (118.8, -6.8, 125.8, 5.8),
    "maluku": (124.0, -9.2, 135.0, 2.8),
    "papua": (129.5, -9.5, 141.2, 1.0),
}

REGION_ORDER: tuple[str, ...] = (
    "sumatra",
    "babel",
    "jawa",
    "balinusra",
    "kalimantan",
    "sulawesi",
    "maluku",
    "papua",
)

# Proyeksi Equal-Area global (WGS 84 / NSIDC EASE-Grid 2.0 Global) untuk perhitungan luas bebas distorsi lintas zona UTM.
EQUAL_AREA_CRS = "EPSG:6933"

# Kandidat nama kolom pada SHP GeoMap / layanan ESDM (berbeda antar-lembar).
# SIMOBJ/NAMOBJ = konvensi KUGI (Katalog Unsur Geografi Indonesia) yang dipakai layanan ESDM.
SYMBOL_FIELDS = ["SIMOBJ", "SIMBOL", "SYMBOLS", "SYMBOL_FOR", "SYMBOL", "SIMB", "NOTASI", "KODE", "KODE_UNIT", "UNIT", "LABEL", "SYMBOL_1"]
NAME_FIELDS = ["NAMOBJ", "NAMA_FORMASI", "FORMASI", "NAME_BI", "NAME_E", "FORMATION_", "NAME_UNIT", "NAME_FORMA", "NAMA", "NAMA_UNIT", "NAME", "UNIT_NAME"]
DESC_FIELDS = ["UMUR", "UMRBTN", "UMUR_BATUAN", "LITOLOGI", "JNSBTN", "BATUAN", "DESCRIP", "DESKRIP", "CLASS_LITH", "B_PERIOD_E", "T_PERIOD_E", "GROUP_E", "PEMBAWA", "MINERAL", "KETERANGAN", "KET", "DESKRIPSI", "REMARK"]
LINE_TYPE_FIELDS = ["JENIS", "TYPE", "KETERANGAN", "KET", "NAMA", "NAMOBJ", "NAMA_STR", "STR_NAME", "STR_JAWA_I", "STR_KAL_ID", "STR_MAL_ID", "STR_NTG_ID", "STR_SUL_ID", "ID"]
SHEET_NAME_FIELDS = ["NM_LEMBAR", "NAME_OF_SH"]
SHEET_NO_FIELDS = ["NO_LEMBAR", "NUMBER_OF_"]
VECTOR_GLOBS = ["*.shp", "*.geojson", "*.gpkg", "*.tab", "*.TAB"]

# Pemetaan direktori/file lokal ketika data/raw/<wilayah> tidak tersedia langsung.
BABEL_SHEET_NUMBERS = {1113.0, 1114.0, 1213.0, "1113", "1114", "1213", "1113.0", "1114.0", "1213.0"}

REGION_RAW_FILES = {
    "babel": [
        RAW / "Geology-Sumatra" / "Lito Sumatera.TAB",
    ],
    "sumatra": [
        RAW / "Geology-Sumatra" / "Lito Sumatera.TAB",
        RAW / "Geology-Sumatra" / "Str Sumatera.TAB",
        RAW / "Subduction" / "Subduction.TAB",
    ],
    "jawa": [
        RAW / "Geology-Jawa" / "Lithology-Jawa.TAB",
        RAW / "Geology-Jawa" / "Structure-Jawa.TAB",
    ],
    "balinusra": [
        RAW / "Geology-Nusatenggara" / "Lito Nusatenggara.TAB",
        RAW / "Geology-Nusatenggara" / "Str Nusatenggara.TAB",
    ],
    "kalimantan": [
        RAW / "Geology-Kalimantan" / "Lito Kalimantan.TAB",
        RAW / "Geology-Kalimantan" / "Str Kalimantan.TAB",
    ],
    "sulawesi": [
        RAW / "Geology-Sulawesi" / "Lito Sulawesi.TAB",
        RAW / "Geology-Sulawesi" / "Str Sulawesi.TAB",
    ],
    "maluku": [
        RAW / "Geology-Maluku" / "Lito Maluku.TAB",
        RAW / "Geology-Maluku" / "Str Maluku.TAB",
    ],
    "papua": [
        RAW / "Geology-Papua" / "litoirian.tab",
        RAW / "Geology-Papua" / "Struktur Papua.TAB",
    ],
}


def pick_fields(columns: list[str], candidates: list[str]) -> list[str]:
    upper = {c.upper(): c for c in columns}
    return [upper[c] for c in candidates if c in upper]


def region_arg() -> str:
    if len(sys.argv) < 2:
        sys.exit(f"Pemakaian: python {Path(sys.argv[0]).name} <wilayah>  (mis. babel, jawa, kalimantan)")
    return sys.argv[1]


def out_dir(region: str) -> Path:
    d = OUT / region
    d.mkdir(parents=True, exist_ok=True)
    return d


def read_csv(name: str):
    """Baca CSV referensi; baris yang diawali '#' adalah komentar (warna hex di dalam sel tetap aman)."""
    import pandas as pd

    text = (REF / name).read_text(encoding="utf-8").splitlines()
    body = "\n".join(line for line in text if not line.startswith("#"))
    return pd.read_csv(io.StringIO(body), dtype=str).fillna("")


def pick_field(columns: list[str], candidates: list[str]) -> str | None:
    upper = {c.upper(): c for c in columns}
    for c in candidates:
        if c in upper:
            return upper[c]
    return None
