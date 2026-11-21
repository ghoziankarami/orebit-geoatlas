"""Klasifikasi OTOMATIS crosswalk untuk baris yang unit_id-nya masih kosong.

BUKAN pengganti kurasi manual (lihat docs/kurasi-crosswalk.md) — ini best-effort mekanis untuk
region berskala besar di mana kurasi tangan per-formasi belum selesai. Setiap unit yang dibuat
lewat skrip ini ditandai "[AUTO]" di kolom description dan `confidence="auto"`.

Pemakaian:
    python3 auto_crosswalk.py <wilayah>
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter

from common import RAW, REF, read_csv, region_arg

# --- 1. Umur: istilah umurobj sumber -> (top_ma, base_ma) ------------------------------------
AGE_MAP: dict[str, tuple[float, float]] = {
    "holosen": (0.0, 0.0117),
    "holocene": (0.0, 0.0117),
    "plistosen": (0.0117, 2.58),
    "pleistosen": (0.0117, 2.58),
    "pleistocene": (0.0117, 2.58),
    "kuarter": (0.0, 2.58),
    "quaternary": (0.0, 2.58),
    "pliosen": (2.58, 5.333),
    "pliocene": (2.58, 5.333),
    "miosen": (5.333, 23.03),
    "miocene": (5.333, 23.03),
    "miosen akhir": (5.333, 11.63),
    "miosen tengah": (11.63, 15.98),
    "miosen awal": (15.98, 23.03),
    "neogen": (2.58, 23.03),
    "neogene": (2.58, 23.03),
    "oligosen": (23.03, 33.9),
    "oligocene": (23.03, 33.9),
    "eosen": (33.9, 56.0),
    "eocene": (33.9, 56.0),
    "paleosen": (56.0, 66.0),
    "paleocene": (56.0, 66.0),
    "paleogen": (23.03, 66.0),
    "paleogene": (23.03, 66.0),
    "tersier": (2.58, 66.0),
    "tertiary": (2.58, 66.0),
    "kenozoikum": (0.0, 66.0),
    "cenozoic": (0.0, 66.0),
    "kuarter - tersier": (0.0, 66.0),
    "plio - plistosen": (0.0117, 5.333),
    "plio-plistosen": (0.0117, 5.333),
    "kapur": (66.0, 143.1),
    "cretaceous": (66.0, 143.1),
    "kapur akhir": (66.0, 100.5),
    "kapur awal": (100.5, 143.1),
    "jura": (143.1, 201.4),
    "jurassic": (143.1, 201.4),
    "jura akhir": (143.1, 161.5),
    "jura tengah": (161.5, 174.7),
    "jura awal": (174.7, 201.4),
    "trias": (201.4, 251.902),
    "triassic": (201.4, 251.902),
    "trias akhir": (201.4, 237.0),
    "trias tengah": (237.0, 247.2),
    "trias awal": (247.2, 251.902),
    "mesozoikum": (66.0, 251.902),
    "mesozoic": (66.0, 251.902),
    "perm": (251.902, 298.9),
    "permian": (251.902, 298.9),
    "karbon": (298.9, 358.9),
    "carboniferous": (298.9, 358.9),
    "permo karbon": (251.902, 358.9),
    "permo-karbon": (251.902, 358.9),
    "permo - karbon": (251.902, 358.9),
    "devon": (358.9, 419.62),
    "devonian": (358.9, 419.62),
    "silur": (419.62, 443.1),
    "silurian": (419.62, 443.1),
    "ordovisium": (443.1, 486.85),
    "ordovician": (443.1, 486.85),
    "kambrium": (486.85, 538.8),
    "cambrian": (486.85, 538.8),
    "paleozoikum": (251.902, 538.8),
    "paleozoic": (251.902, 538.8),
    "prakambrium": (538.8, 4567.0),
    "precambrian": (538.8, 4567.0),
    "meso - paleo": (66.0, 538.8),
    "pra tersier": (66.0, 538.8),
    "pra-tersier": (66.0, 538.8),
    "pra - tersier": (66.0, 538.8),
}


def age_for(term: str | None) -> tuple[float | None, float | None]:
    """Petakan istilah umur tunggal atau rentang gabungan ('miosen - pliosen') ke (top_ma, base_ma)."""
    if not term:
        return None, None
    norm = re.sub(r"\s+", " ", term.strip().lower()).replace("–", "-").replace("—", "-")
    if norm in AGE_MAP:
        return AGE_MAP[norm]
    parts = [p.strip() for p in re.split(r"\s*[-/]\s*", norm) if p.strip()]
    if len(parts) >= 2:
        hits = [AGE_MAP[p] for p in parts if p in AGE_MAP]
        if len(hits) == len(parts):
            return min(h[0] for h in hits), max(h[1] for h in hits)
    return None, None


# --- 2. Litologi: kata kunci -> lith_class (urutan spesifik -> umum) --------------------------
LITH_RULES: list[tuple[str, str]] = [
    (
        r"vulkanik|volcanic|\blava\b|\btuf|andesit|dasit|basal|basalt|breksi.*gunungapi|piroklastik|gunungapi|ignimbrit|lahar|riolit|rhyolit|trakit|centre|center\b",
        "volcanic",
    ),
    (
        r"batugamping|limestone|karbonat|terumbu|koral|coral|dolomit|kalkarenit|kalsilutit|napal|marl",
        "carbonate",
    ),
    (r"bancuh|melange|m[eé]lange|campuran|olistostrom", "melange"),
    (
        r"komplek.*malih|malihan|metamorf|metamorphic|sekis|schist|filit|phyllite|batusabak|slate|milonit|gneiss|kuarsit|quartzite|marmer|marble|amfibolit|eklogit",
        "metamorphic",
    ),
    (
        r"ofiolit|ophiolite|gabbro|gabro|peridotit|ultrabasa|ultramafik|ultramafic|serpentinit|serpentin|dunit|harzburgit|piroksenit|diabas|mikrogabro",
        "plutonic_mafic",
    ),
    (
        r"granit|granodiorit|tonalit|adamelit|monzonit|diorit|porfir|porphyry|intrusi|\bstok\b|\bretas\b|dyke|\bsill\b|mikrodiorit|pegmatit",
        "plutonic_felsic",
    ),
    (
        r"aluvium|alluvium|aluvial|endapan|\brawa\b|gambut|peat|pantai|\bsungai\b|koluvium|residu|pasir kuarsa|terumbu kuarter",
        "unconsolidated",
    ),
]
DEFAULT_LITH = "siliciclastic"


def lith_for(text: str) -> str:
    t = text.lower()
    for pattern, lith in LITH_RULES:
        if re.search(pattern, t):
            return lith
    return DEFAULT_LITH


def sanitize_id(s: str) -> str:
    return re.sub(r"[^A-Z0-9_]", "", s.upper().replace(" ", "_").replace("-", "_"))


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
            lith = lith_for(f"{name} {remark}")
            new_unit_rows.append({
                "unit_id": uid,
                "formation": name,
                "symbol_std": sym,
                "lith_class": lith,
                "lith_detail": "",
                "age_top_ma": top_ma if top_ma is not None else "",
                "age_base_ma": base_ma if base_ma is not None else "",
                "interval_top": age_term or "",
                "interval_base": age_term or "",
                "color_hex": "",
                "confidence": "auto",
                "description": f"[AUTO] {remark or name} — umur sumber: {age_term or 'tidak diketahui'}",
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
