"""Correction-aware volume search-index tests."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server import db


class SearchIndexTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.patch = patch.object(db, "DB_PATH", Path(self.temp.name) / "test.db")
        self.patch.start(); db.initialize()

    def tearDown(self):
        self.patch.stop(); self.temp.cleanup()

    def test_index_is_replaced_and_invalidated_by_text_edits(self):
        db.replace_search_index("v1", [(0, 2, "東京", "東京", "とうきょう")])
        self.assertEqual(db.search_index_rows("v1")[0]["normalized_reading"], "とうきょう")
        db.save_block_text("v1", 0, 2, ["京都"], [[]], "now")
        self.assertEqual(db.search_index_rows("v1"), [])

    def test_index_is_invalidated_by_line_corrections(self):
        db.replace_search_index("v1", [(0, 0, "誤字", "誤字", "ごじ")])
        db.save_correction("v1", 0, 0, 0, "誤字", "正字", [], "now")
        self.assertEqual(db.search_index_rows("v1"), [])
