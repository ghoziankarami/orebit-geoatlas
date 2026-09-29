"""Offline integrity checks for the national ArcGIS fetch."""
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location("fetch_esdm", Path(__file__).parent / "00_fetch_esdm.py")
fetch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetch)


class FetchIntegrityTest(unittest.TestCase):
    META = {"objectIdField": "objectid_1", "maxRecordCount": 2000, "fields": []}

    def response(self, url, params, post=False):
        if not url.endswith("/query"):
            return self.META
        if params.get("returnIdsOnly"):
            return {"objectIds": [1, 2]}
        return {"features": [{"type": "Feature", "properties": {"objectid_1": i},
                              "geometry": {"type": "Polygon", "coordinates": []}}
                             for i in self.returned]}

    def test_complete_inventory_is_written(self):
        self.returned = [1, 2]
        with tempfile.TemporaryDirectory() as directory, patch.object(fetch, "request", self.response), \
             patch.object(fetch.time, "sleep"):
            with patch.object(fetch, "RAW", Path(directory)):
                with patch.object(sys, "argv", ["fetch", "all", "--skip-faults"]):
                    fetch.main()
            output = Path(directory) / "all" / "esdm"
            self.assertEqual(json.loads((output / "esdm_manifest.json").read_text())["count"], 2)
            self.assertEqual(len(json.loads((output / "esdm_litologi.geojson").read_text())["features"]), 2)

    def test_missing_id_does_not_publish_output(self):
        self.returned = [1]
        with tempfile.TemporaryDirectory() as directory, patch.object(fetch, "request", self.response), \
             patch.object(fetch.time, "sleep"):
            with patch.object(fetch, "RAW", Path(directory)):
                with patch.object(sys, "argv", ["fetch", "all", "--skip-faults"]):
                    with self.assertRaises(SystemExit):
                        fetch.main()
            self.assertFalse((Path(directory) / "all" / "esdm" / "esdm_litologi.geojson").exists())

    def test_national_fetch_writes_both_fault_scales(self):
        def response(url, params, post=False):
            is_fault = "Patahan_Aktif_" in url
            if url.endswith("/query"):
                if params.get("returnIdsOnly"):
                    return {"objectIds": [10] if is_fault else [1, 2]}
                ids = [10] if is_fault else [1, 2]
                return {"features": [{"type": "Feature", "properties": {"objectid_1": i},
                    "geometry": {"type": "LineString" if is_fault else "Polygon", "coordinates": []}}
                    for i in ids]}
            return {**self.META, "geometryType": "esriGeometryPolyline" if is_fault else "esriGeometryPolygon"}
        with tempfile.TemporaryDirectory() as directory, patch.object(fetch, "request", response), \
             patch.object(fetch.time, "sleep"), patch.object(fetch, "RAW", Path(directory)), \
             patch.object(sys, "argv", ["fetch", "all"]):
            fetch.main()
            output = Path(directory) / "all" / "esdm"
            for scale in ("overview", "detail"):
                self.assertEqual(json.loads((output / f"esdm_faults_{scale}_manifest.json").read_text())["count"], 1)
                self.assertTrue((output / f"esdm_faults_{scale}.geojson").exists())

    def test_server_500_splits_batch_without_losing_ids(self):
        def overloaded(url, params, post=False):
            ids = [int(value) for value in params["objectIds"].split(",")]
            if len(ids) > 1:
                raise SystemExit("HTTP Error 500: Internal Server Error")
            return {"features": [{"properties": {"objectid_1": ids[0]}}]}
        with patch.object(fetch, "request", overloaded), patch.object(fetch.time, "sleep"):
            found = fetch.query_features("https://example.test/MapServer/0", [1, 2, 3])
        self.assertEqual([f["properties"]["objectid_1"] for f in found], [1, 2, 3])


if __name__ == "__main__":
    unittest.main()
