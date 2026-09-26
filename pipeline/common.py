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

# Kandidat nama kolom pada SHP GeoMap (berbeda antar-lembar). Tambahkan bila menemukan varian baru.
SYMBOL_FIELDS = ["SIMBOL", "SYMBOL", "SIMB", "KODE", "KODE_UNIT", "UNIT", "LABEL", "SYMBOL_1"]
NAME_FIELDS = ["NAMA", "NAMA_UNIT", "FORMASI", "NAME", "KETERANGAN", "KET", "UNIT_NAME", "DESKRIPSI"]
LINE_TYPE_FIELDS = ["JENIS", "TYPE", "KETERANGAN", "KET", "NAMA"]


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
