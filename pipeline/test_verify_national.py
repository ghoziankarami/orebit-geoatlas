import json
import runpy
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import common


class NationalVerificationTest(unittest.TestCase):
    def test_manifest_and_exports_match(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            raw = root / "raw" / "all" / "esdm"
            out = root / "out" / "all"
            raw.mkdir(parents=True)
            out.mkdir(parents=True)
            (raw / "esdm_manifest.json").write_text('{"count": 1}')
            for scale in ("overview", "detail"):
                (raw / f"esdm_faults_{scale}_manifest.json").write_text('{"count": 1}')
            (out / "qa_report.csv").write_text("source_id,polygons,no_symbol\n5,1,0\n")
            (out / "units.geojsonl").write_text("\x1e" + json.dumps({"properties": {
                "poly_id": "5-1", "unit_id": "QH", "age_top_ma": 0, "age_base_ma": 0.0117}}) + "\n")
            (out / "lines.geojsonl").write_text("".join(json.dumps({"properties": {
                "fault_scale": scale}}) + "\n" for scale in ("overview", "detail")))
            (out / "all.pmtiles").write_bytes(b"PMTiles\x03")
            with patch.object(common, "RAW", root / "raw"), patch.object(common, "OUT", root / "out"):
                runpy.run_path(str(Path(__file__).parent / "verify_national.py"))
            report = json.loads((out / "build_report.json").read_text())
            self.assertEqual(report["errors"], [])
            self.assertEqual(report["unmapped_polygons"], 0)


if __name__ == "__main__":
    unittest.main()
