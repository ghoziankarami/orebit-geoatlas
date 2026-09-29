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
                with patch.object(sys, "argv", ["fetch", "all"]):
                    fetch.main()
            output = Path(directory) / "all" / "esdm"
            self.assertEqual(json.loads((output / "esdm_manifest.json").read_text())["count"], 2)
            self.assertEqual(len(json.loads((output / "esdm_litologi.geojson").read_text())["features"]), 2)

    def test_missing_id_does_not_publish_output(self):
        self.returned = [1]
        with tempfile.TemporaryDirectory() as directory, patch.object(fetch, "request", self.response), \
             patch.object(fetch.time, "sleep"):
            with patch.object(fetch, "RAW", Path(directory)):
                with patch.object(sys, "argv", ["fetch", "all"]):
                    with self.assertRaises(SystemExit):
                        fetch.main()
            self.assertFalse((Path(directory) / "all" / "esdm" / "esdm_litologi.geojson").exists())


if __name__ == "__main__":
    unittest.main()
