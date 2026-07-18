"""AI history persistence tests."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server import db


class AiHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.patch=patch.object(db,"DB_PATH",Path(self.temp.name)/"test.db"); self.patch.start(); db.initialize()
    def tearDown(self): self.patch.stop(); self.temp.cleanup()

    def test_explanation_survives_transcript_changes_via_page_identity(self):
        item={"id":"q1","sentence":"old OCR","focus":"old","question":None,"provider":"test","model":"test","explanation":{"interpretation":"x"},"created_at":"now","volume_id":"v1","page_index":2,"block_index":4}
        db.save_grammar_explanation(item)
        found=db.grammar_explanations_for_page("v1",2,["new corrected OCR"])
        self.assertEqual([row["id"] for row in found],["q1"])
