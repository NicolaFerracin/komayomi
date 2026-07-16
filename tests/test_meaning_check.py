import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from server import app, db


class MeaningCheckTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.db_patch=patch.object(db,"DB_PATH",Path(self.temp.name)/"test.db");self.db_patch.start();db.initialize()
        self.page={"img_width":800,"img_height":1200,"img_path":"page.jpg","blocks":[{"lines":["むかしむかし"],"ruby":[[]]},{"lines":["山奥"],"ruby":[[]]}]}
        self.volume=SimpleNamespace(id="v1",source_path=self.temp.name)
        self.result={"summary":"The scene was understood.","evaluations":[{"block_index":0,"meaning_score":92,"literal_score":70,"verdict":"Meaning correct","literal_translation":"Long ago","natural_translation":"Once upon a time","contextual_meaning":"A story opening","correct":["The time frame"],"missing":[],"added":[],"incorrect":[]}]}

    def tearDown(self): self.db_patch.stop();self.temp.cleanup()

    def test_page_answers_are_batched_saved_and_cached(self):
        provider=SimpleNamespace(id="mock",model="test")
        request=app.MeaningCheckRequest(answers=[app.MeaningAnswer(block_index=0,interpretation="Once upon a time")])
        with patch.object(app,"require_volume",return_value=self.volume),patch.object(app,"reader_payload",return_value={"pages":[self.page]}),patch.object(app,"apply_saved_text"),patch.object(app,"structured_text",new=AsyncMock(return_value=(self.result,provider))) as call:
            first=asyncio.run(app.meaning_check("v1",0,request));second=asyncio.run(app.meaning_check("v1",0,request))
        self.assertFalse(first["cached"]);self.assertTrue(second["cached"]);self.assertEqual(call.await_count,1)
        self.assertEqual(db.meaning_check_history("v1",0)[0]["input"]["answers"][0]["interpretation"],"Once upon a time")
        self.assertTrue(db.delete_ai_history("v1",0,"comprehension",first["id"],[]))
        self.assertEqual(db.meaning_check_history("v1",0),[])

    def test_unanswered_blocks_are_not_sent_for_evaluation(self):
        request=app.MeaningCheckRequest(answers=[app.MeaningAnswer(block_index=0,interpretation="  "),app.MeaningAnswer(block_index=99,interpretation="wrong block")])
        with patch.object(app,"require_volume",return_value=self.volume),patch.object(app,"reader_payload",return_value={"pages":[self.page]}),patch.object(app,"apply_saved_text"):
            with self.assertRaisesRegex(Exception,"at least one"): asyncio.run(app.meaning_check("v1",0,request))

    def test_incomplete_model_feedback_is_rejected(self):
        provider=SimpleNamespace(id="mock",model="test");request=app.MeaningCheckRequest(answers=[app.MeaningAnswer(block_index=0,interpretation="opening")])
        incomplete={"summary":"partial","evaluations":[]}
        with patch.object(app,"require_volume",return_value=self.volume),patch.object(app,"reader_payload",return_value={"pages":[self.page]}),patch.object(app,"apply_saved_text"),patch.object(app,"structured_text",new=AsyncMock(return_value=(incomplete,provider))):
            with self.assertRaisesRegex(Exception,"incomplete feedback"): asyncio.run(app.meaning_check("v1",0,request))
        self.assertEqual(db.meaning_check_history("v1",0),[])


if __name__=="__main__": unittest.main()
