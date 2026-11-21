#!/usr/bin/env python3
"""Suite kontrak pipeline & data geologi nasional Orebit GeoAtlas (8 wilayah)."""

from __future__ import annotations

import csv
import io
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from auto_crosswalk import age_for, lith_for  # noqa: E402
from common import REGION_BBOX, REGION_ORDER  # noqa: E402


def read_csv_rows(name: str) -> list[dict[str, str]]:
    lines = (ROOT / "reference" / name).read_text(encoding="utf-8").splitlines()
    body = "\n".join(line for line in lines if not line.startswith("#"))
    return [
        {k: (v or "").strip() for k, v in row.items()}
        for row in csv.DictReader(io.StringIO(body))
    ]


class TestPipelineContracts(unittest.TestCase):
    def test_validate_reference_cli_passes(self) -> None:
        proc = subprocess.run(
            [sys.executable, str(ROOT / "pipeline" / "validate_reference.py")],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("referensi valid", proc.stdout)

    def test_eight_national_regions_defined(self) -> None:
        expected = {"sumatra", "babel", "jawa", "balinusra", "kalimantan", "sulawesi", "maluku", "papua"}
        self.assertEqual(set(REGION_BBOX.keys()), expected)
        self.assertEqual(set(REGION_ORDER), expected)
        for reg, (w, s, e, n) in REGION_BBOX.items():
            self.assertLess(w, e, f"{reg}: lon_min >= lon_max")
            self.assertLess(s, n, f"{reg}: lat_min >= lat_max")
            self.assertGreaterEqual(w, 94.0)
            self.assertLessEqual(e, 142.0)

    def test_audit_geology_corrections_and_confidence(self) -> None:
        units = {r["unit_id"]: r for r in read_csv_rows("units.csv")}
        for uid, row in units.items():
            self.assertIn(row["confidence"], {"curated", "auto", "flagged"}, f"{uid}: invalid confidence")
            if row["description"].startswith("[AUTO]") and row["confidence"] != "flagged":
                self.assertEqual(row["confidence"], "auto", f"{uid}: [AUTO] must not be disguised as curated")

        # Audit item 1: Granit Klabat TRJKG = Trias-Jura (143.1 - 251.902 Ma)
        trjkg = units["TRJKG"]
        self.assertEqual(trjkg["confidence"], "curated")
        self.assertAlmostEqual(float(trjkg["age_top_ma"]), 143.1)
        self.assertAlmostEqual(float(trjkg["age_base_ma"]), 251.902)

        # Audit item 2: Formasi Kluet PUK = flagged conflict
        puk = units["PUK"]
        self.assertEqual(puk["confidence"], "flagged")

        # Audit item 3: Kelapa Kampit PCKS1 = corrected metasediment/clastic
        pcks1 = units["PCKS1"]
        self.assertEqual(pcks1["confidence"], "curated")
        self.assertEqual(pcks1["lith_class"], "siliciclastic")

    def test_auto_crosswalk_known_answers(self) -> None:
        age_cases = [
            ("Holosen", (0.0, 0.0117)),
            ("Plistosen", (0.0117, 2.58)),
            ("Pliosen", (2.58, 5.333)),
            ("Miosen", (5.333, 23.03)),
            ("Miosen - Pliosen", (2.58, 23.03)),
            ("Oligosen", (23.03, 33.9)),
            ("Eosen", (33.9, 56.0)),
            ("Paleosen", (56.0, 66.0)),
            ("Tersier", (2.58, 66.0)),
            ("Kuarter - Tersier", (0.0, 66.0)),
            ("Kapur", (66.0, 143.1)),
            ("Jura", (143.1, 201.4)),
            ("Trias - Jura", (143.1, 251.902)),
            ("Permo - Karbon", (251.902, 358.9)),
            ("Devon", (358.9, 419.62)),
            ("Silur", (419.62, 443.1)),
            ("Ordovisium", (443.1, 486.85)),
            ("Kambrium", (486.85, 538.8)),
            ("Prakambrium", (538.8, 4567.0)),
        ]
        for term, expected in age_cases:
            self.assertEqual(age_for(term), expected, f"age_for({term!r})")

        lith_cases = [
            ("Batuan Gunungapi Merapi andesit tufa", "volcanic"),
            ("Formasi Tonasa batugamping terumbu", "carbonate"),
            ("Kompleks Melange Bobonaro bancuh", "melange"),
            ("Kompleks Metamorf Pompangeo sekis filit", "metamorphic"),
            ("Kompleks Ofiolit Sulawesi peridotit harzburgit", "plutonic_mafic"),
            ("Granit Klabat granodiorit intrusi", "plutonic_felsic"),
            ("Aluvium dan endapan rawa gambut", "unconsolidated"),
            ("Formasi Balikpapan batupasir batulempung", "siliciclastic"),
        ]
        for text, expected_lith in lith_cases:
            self.assertEqual(lith_for(text), expected_lith, f"lith_for({text!r})")

    def test_national_index_covers_all_8_regions(self) -> None:
        idx_path = ROOT / "app" / "public" / "data" / "indonesia-units-index.json"
        self.assertTrue(idx_path.is_file(), "indonesia-units-index.json missing")
        data = json.loads(idx_path.read_text(encoding="utf-8"))
        self.assertEqual(data.get("schema"), "orebit-geoatlas-index-v1")
        self.assertEqual(set(data.get("regions", [])), set(REGION_ORDER))
        self.assertGreaterEqual(len(data.get("units", [])), 550)
        for u in data["units"]:
            self.assertEqual(len(u["bbox"]), 4)
            self.assertLessEqual(u["age_top_ma"], u["age_base_ma"])
            self.assertIn(u["confidence"], {"curated", "auto", "flagged"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
