"""Utilitas bersama pipeline Orebit GeoAtlas."""
from __future__ import annotations

import io
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "out"
REF = ROOT / "reference"

# Kandidat nama kolom pada SHP GeoMap / layanan ESDM (berbeda antar-lembar). Tambahkan bila menemukan varian baru.
# SIMOBJ/NAMOBJ = konvensi KUGI (Katalog Unsur Geografi Indonesia) yang dipakai layanan ESDM.
SYMBOL_FIELDS = ["SIMOBJ", "SIMBOL", "SYMBOL", "SIMB", "NOTASI", "KODE", "KODE_UNIT", "UNIT", "LABEL", "SYMBOL_1"]
NAME_FIELDS = ["NAMOBJ", "NAMA_FORMASI", "FORMASI", "NAMA", "NAMA_UNIT", "NAME", "UNIT_NAME"]
# Kolom keterangan tambahan (umur, litologi, deskripsi) yang digabung ke desc_orig untuk membantu kurasi.
DESC_FIELDS = ["UMUR", "UMRBTN", "UMUR_BATUAN", "LITOLOGI", "JNSBTN", "BATUAN", "KETERANGAN", "KET", "DESKRIPSI", "REMARK"]
LINE_TYPE_FIELDS = ["JENIS", "TYPE", "KETERANGAN", "KET", "NAMA", "NAMOBJ"]
VECTOR_GLOBS = ["*.shp", "*.geojson", "*.gpkg"]


def pick_fields(columns: list[str], candidates: list[str]) -> list[str]:
    upper = {c.upper(): c for c in columns}
    return [upper[c] for c in candidates if c in upper]


def region_arg() -> str:
    if len(sys.argv) < 2:
        sys.exit(f"Pemakaian: python {Path(sys.argv[0]).name} <wilayah>  (mis. babel)")
    return sys.argv[1]


def out_dir(region: str) -> Path:
    d = OUT / region
    d.mkdir(parents=True, exist_ok=True)
    return d


def read_csv(name: str) -> pd.DataFrame:
    """Baca CSV referensi; baris yang diawali '#' adalah komentar (warna hex di dalam sel tetap aman)."""
    text = (REF / name).read_text(encoding="utf-8").splitlines()
    body = "\n".join(line for line in text if not line.startswith("#"))
    return pd.read_csv(io.StringIO(body), dtype=str).fillna("")


def pick_field(columns: list[str], candidates: list[str]) -> str | None:
    upper = {c.upper(): c for c in columns}
    for c in candidates:
        if c in upper:
            return upper[c]
    return None
