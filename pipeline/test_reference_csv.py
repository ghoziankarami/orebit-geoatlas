"""Regression: ESDM's literal 'na' symbol is not a missing value."""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import common


class ReferenceCsvTest(unittest.TestCase):
    def test_literal_na_symbol_survives_csv_read(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "crosswalk.csv").write_text("source_id,symbol_orig,name_orig,unit_id,note\n5,na,Unit NA,,\n")
            with patch.object(common, "REF", root):
                row = common.read_csv("crosswalk.csv").iloc[0]
            self.assertEqual(row.symbol_orig, "na")
            self.assertEqual(row.unit_id, "")


if __name__ == "__main__":
    unittest.main()
