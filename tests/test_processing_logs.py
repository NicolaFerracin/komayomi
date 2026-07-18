"""Persistent OCR processing-log tests."""

import tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from server import db

class ProcessingLogTests(unittest.TestCase):
    def setUp(self): self.temp=tempfile.TemporaryDirectory();self.patch=patch.object(db,"DB_PATH",Path(self.temp.name)/"test.db");self.patch.start();db.initialize()
    def tearDown(self): self.patch.stop();self.temp.cleanup()
    def test_log_is_persistent_and_ordered(self):
        db.append_processing_log("v1","started");db.append_processing_log("v1","finished")
        self.assertEqual([line["message"] for line in db.processing_log("v1")],["started","finished"])
