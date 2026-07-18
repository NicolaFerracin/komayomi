"""Learning pass persistence and progression tests."""

import tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from server import db

class LearningTests(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory();self.patch=patch.object(db,"DB_PATH",Path(self.temp.name)/"test.db");self.patch.start();db.initialize()
    def tearDown(self):self.patch.stop();self.temp.cleanup()
    def lesson(self):return {"id":"l1","kind":"vocabulary","form":"山奥","reading":"やまおく","meaning":"deep in the mountains","explanation":"A useful location word.","example_japanese":"山奥に住む。","example_english":"Live deep in the mountains.","source_volume_id":"v1","source_page_index":0,"source_block_index":2,"created_at":"now"}
    def test_lessons_match_future_blocks_and_advance_only_on_success(self):
        db.save_lesson(self.lesson());matches=db.lesson_matches(["静かな山奥だった","別の文"])
        self.assertEqual(matches[0]["block_indices"],[0]);failed=db.record_lesson_recall("l1",False,"later");self.assertEqual(failed["status"],"learning")
        recognized=db.record_lesson_recall("l1",True,"later");self.assertEqual(recognized["status"],"recognized")
        db.record_lesson_recall("l1",True,"later");familiar=db.record_lesson_recall("l1",True,"later");self.assertEqual(familiar["status"],"familiar")
    def test_dismissals_and_assistance_progress_are_durable(self):
        db.dismiss_lesson("v1",0,"p1","now");self.assertEqual(db.dismissed_lessons("v1",0),{"p1"})
        db.record_assistance({"id":"a1","volume_id":"v1","page_index":0,"block_index":0,"event_type":"lookup","lesson_id":None,"created_at":"now"});db.record_assistance({"id":"a2","volume_id":"v1","page_index":0,"block_index":0,"event_type":"recall_success","lesson_id":"l1","created_at":"now"})
        progress=db.learning_progress("v1");self.assertEqual(progress["independent_rate"],50)

if __name__=='__main__':unittest.main()
