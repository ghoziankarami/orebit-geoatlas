"""Klasifikasi OTOMATIS crosswalk untuk baris yang unit_id-nya masih kosong.

BUKAN pengganti kurasi manual (lihat docs/kurasi-crosswalk.md) — ini best-effort mekanis untuk
region berskala besar (mis. Sumatra: 479 simbol baru) di mana kurasi tangan per-formasi tidak
realistis dalam satu sesi. Setiap unit yang dibuat lewat skrip ini ditandai "[AUTO]" di kolom
description supaya gampang dicari untuk review geolog lebih lanjut.

Metodologi (transparan & deterministik, bukan tebakan ad-hoc):
1. age_top_ma/age_base_ma: DIAMBIL dari kolom `umurobj` asli di geojson sumber (modus per simbol,
   bukan ditebak), dikonversi lewat reference/ics_intervals.csv. Istilah era gabungan/kabur di
   sumber (Permo Karbon, Mesozoikum, Paleozoikum, "Meso - Paleo", "Pra Tersier") direntang selebar
   cakupan aslinya — jujur terhadap ketidakpastian sumber, bukan dipersempit sepihak.
2. lith_class: pola kata kunci di name_orig+remark (granit->plutonik felsik, vulkanik->volcanic,
   dst). Urutan pengecekan dari paling spesifik ke paling umum; default jatuh ke siliciclastic
   (jenis formasi tersedimen paling umum di data ESDM) bila tak ada sinyal jelas.
3. unit_id: dipakai ULANG bila (symbol_orig, name_orig) PERSIS sama dengan unit yang sudah
   dikurasi di region lain (formasi lintas-region yang genuin sama, mis. Formasi Muara Enim
   Babel & Sumatra). Simbol SAMA tapi nama BEDA antar-region (coincidental collision, mis.
   PCks1 = "Kelapa Kampit Formation" di Babel vs "Kuantan Formation" di Sumatra) dapat unit_id
   baru dengan suffix region — TIDAK PERNAH digabung paksa.

Pemakaian:
    python3 auto_crosswalk.py <wilayah>
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

from common import RAW, REF, read_csv, region_arg

# --- 1. Umur: istilah umurobj sumber -> (top_ma, base_ma) ------------------------------------
# Baris tunggal dari ics_intervals.csv dipetakan langsung; istilah era/gabungan dipetakan ke
# rentang gabungan eksplisit (top dari yang termuda, base dari yang tertua dalam cakupannya).
AGE_MAP: dict[str, tuple[float, float]] = {
    "kuarter": (0, 2.58),
    "neogen": (2.58, 23.03),
    "paleogen": (23.03, 66.0),
    "kapur": (66.0, 143.1),
    "jura": (143.1, 201.4),
    "trias": (201.4, 251.902),
    "triassic": (201.4, 251.902),
    "perm": (251.902, 298.9),
    "permian": (251.902, 298.9),
    "karbon": (298.9, 358.9),
    "devon": (358.9, 419.62),
    "silur": (419.62, 443.1),
    "ordovisium": (443.1, 486.85),
    "kambrium": (486.85, 538.8),
    "holosen": (0, 0.0117),
    "plistosen": (0.0117, 2.58),
    "pleistosen": (0.0117, 2.58),
    "pliosen": (2.58, 5.333),
    "miosen": (5.333, 23.03),
    "oligosen": (23.03, 33.9),
    "eosen": (33.9, 56.0),
    "paleosen": (56.0, 66.0),
    "tersier": (2.58, 66.0),
    "prakambrium": (538.8, 4567),
    "permo karbon": (251.902, 358.9),
    "mesozoikum": (66.0, 251.902),          # Trias-Kapur
    "paleozoikum": (251.902, 538.8),        # Kambrium-Perm
    "meso - paleo": (66.0, 538.8),          # Mesozoikum + Paleozoikum
    "pra tersier": (66.0, 538.8),           # kabur di sumber; direntang selebar mungkin
}

# Prefix notasi dipakai hanya bila umur eksplisit sumber tidak dikenal.
# Kode campuran mempertahankan rentang lebar agar tidak memberi presisi palsu.
CODE_AGES = {
    "Qh": (0, 0.0117), "Qp": (0.0117, 2.58), "Q": (0, 2.58),
    "Tmp": (2.58, 23.03), "Tm": (5.333, 23.03),
    "Tom": (5.333, 33.9), "To": (23.03, 33.9),
    "Te": (33.9, 56), "Tp": (56, 66), "T": (2.58, 66),
    "K": (66, 143.1), "J": (143.1, 201.4), "Tr": (201.4, 251.902),
}


def age_from_symbol(symbol: str) -> tuple[float | None, float | None]:
    for code in sorted(CODE_AGES, key=len, reverse=True):
        if symbol.startswith(code):
            return CODE_AGES[code]
    return None, None


def age_for(term: str | None) -> tuple[float | None, float | None]:
    if not term:
        return None, None
    hit = AGE_MAP.get(term.strip().lower())
    return hit if hit else (None, None)


# --- 2. Litologi: kata kunci -> lith_class (urutan spesifik -> umum) --------------------------
LITH_RULES: list[tuple[str, str]] = [
    (r"vulkanik|volcanic|\blava\b|\btuf|andesit|dasit|basal|breksi.*gunungapi|piroklastik|gunungapi|centre|center\b", "volcanic"),
    (r"batugamping|limestone|karbonat|terumbu|koral|coral", "carbonate"),
    (r"bancuh|melange|m[eé]lange|campuran", "melange"),
    (r"komplek|malihan|metamorf|sekis|filit|milonit|gneiss|kuarsit", "metamorphic"),
    (r"gabbro|gabro|peridotit|ultrabasa|ultramafik|serpentin|piroksenit|mikrogabro", "plutonic_mafic"),
    (r"granit|adamelit|monzonit|diorit|granodiorit|porfir|porphyry|intrusi|\bstok\b|\bretas\b|dyke|\bsill\b|mikrodiorit", "plutonic_felsic"),
    (r"aluvium|alluvium|endapan|\brawa\b|pantai|\bsungai\b|koluvium|residu|pasir kuarsa", "unconsolidated"),
]
DEFAULT_LITH = "siliciclastic"


def lith_for(text: str) -> str:
    t = text.lower()
    for pattern, lith in LITH_RULES:
        if re.search(pattern, t):
            return lith
    return DEFAULT_LITH


def sanitize_id(s: str) -> str:
    return re.sub(r"[^A-Z0-9_]", "", s.upper().replace(" ", "_").replace("-", "_")) or "UNIT"


def clean_formation(name: str, remark: str, symbol: str) -> str:
    for candidate in (name, remark):
        candidate = re.sub(r"\s+", " ", str(candidate)).strip(" .;,-")
        if candidate and candidate.lower() not in {"-", "none", "null", "tidak diketahui", symbol.lower()}:
            match = re.search(r"(?:formasi|formation|kompleks|complex)\s+[\w .-]+", candidate, re.I)
            if match:
                return match.group().strip(" .;,-")
            if candidate == name and len(candidate) < 90:
                return candidate
    return f"Unit {symbol}"


def lith_detail_for(remark: str) -> str:
    return re.sub(r"\s+", " ", remark).strip(" .;,-")[:240]


def main() -> None:
    region = region_arg()
    geojson_path = RAW / region / "esdm" / "esdm_litologi.geojson"
    if not geojson_path.exists():
        sys.exit(f"Tidak ada {geojson_path}. Jalankan 00_fetch_esdm.py {region} dulu.")

    feats = json.loads(geojson_path.read_text())["features"]
    by_symbol_age: dict[str, Counter] = {}
    for f in feats:
        p = f["properties"]
        sym = p.get("simobj")
        by_symbol_age.setdefault(sym, Counter())[p.get("umurobj")] += 1

    crosswalk = read_csv("crosswalk.csv")
    units = read_csv("units.csv")
    existing_ids = set(units.unit_id)
    # (symbol_orig, name_orig) -> unit_id yang SUDAH dikurasi (region lain), untuk deteksi
    # formasi lintas-region yang genuin sama.
    curated_lookup = {
        (r.symbol_orig, r.name_orig): r.unit_id
        for r in crosswalk.itertuples()
        if r.unit_id
    }

    sources = read_csv("sources.csv")
    region_source_ids = set(sources[sources.file_key.str.startswith(f"{region}/")].source_id)
    todo = crosswalk[(crosswalk.source_id.isin(region_source_ids)) & (crosswalk.unit_id.fillna("") == "")]

    print(f"{len(todo)} baris crosswalk region {region!r} belum ada unit_id.")

    new_unit_rows = []
    assigned = 0
    reused = 0
    for idx, row in todo.iterrows():
        sym, name, note = row.symbol_orig, row.name_orig, row.note
        remark = note.split("|")[-1].strip() if "|" in str(note) else ""
        key = (sym, name)

        if key in curated_lookup:
            uid = curated_lookup[key]
            reused += 1
        else:
            base_id = sanitize_id(sym)
            uid = base_id
            suffix = 2
            while uid in existing_ids:
                uid = f"{base_id}_{region.upper()[:3]}{suffix}"
                suffix += 1
            existing_ids.add(uid)
            curated_lookup[key] = uid

            age_term = by_symbol_age.get(sym, Counter()).most_common(1)
            age_term = age_term[0][0] if age_term else None
            top_ma, base_ma = age_for(age_term)
            age_origin = "umurobj"
            if top_ma is None:
                top_ma, base_ma = age_from_symbol(sym)
                age_origin = "simobj" if top_ma is not None else "unknown"
            lith = lith_for(f"{name} {remark}")
            new_unit_rows.append({
                "unit_id": uid, "formation": clean_formation(name, remark, sym), "symbol_std": sym, "lith_class": lith,
                "lith_detail": lith_detail_for(remark), "age_top_ma": top_ma if top_ma is not None else "",
                "age_base_ma": base_ma if base_ma is not None else "",
                "interval_top": age_term or "", "interval_base": age_term or "",
                "color_hex": "", "description": f"[AUTO] {remark or name} — umur: {age_term or sym} ({age_origin})",
            })
            assigned += 1

        crosswalk.loc[idx, "unit_id"] = uid

    if new_unit_rows:
        import pandas as pd
        units = pd.concat([units, pd.DataFrame(new_unit_rows)], ignore_index=True)
        units.to_csv(REF / "units.csv", index=False)
    crosswalk.to_csv(REF / "crosswalk.csv", index=False)

    no_age = sum(1 for r in new_unit_rows if r["age_top_ma"] == "")
    print(f"Selesai: {assigned} unit baru dibuat [AUTO], {reused} dipakai ulang dari region lain.")
    if no_age:
        print(f"[PERINGATAN] {no_age} unit baru tanpa umur (umurobj sumber tidak dikenali/kosong) — cek manual.")
    lith_counts = Counter(r["lith_class"] for r in new_unit_rows)
    print("Distribusi lith_class unit baru:", dict(lith_counts))


if __name__ == "__main__":
    main()
