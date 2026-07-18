"""AI history persistence tests."""

import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from server import app, db


class AiHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.patch=patch.object(db,"DB_PATH",Path(self.temp.name)/"test.db"); self.patch.start(); db.initialize()
    def tearDown(self): self.patch.stop(); self.temp.cleanup()

    def test_explanation_survives_transcript_changes_via_page_identity(self):
        item={"id":"q1","sentence":"old OCR","focus":"old","question":None,"provider":"test","model":"test","explanation":{"interpretation":"x"},"created_at":"now","volume_id":"v1","page_index":2,"block_index":4}
        db.save_grammar_explanation(item)
        found=db.grammar_explanations_for_page("v1",2,["new corrected OCR"])
        self.assertEqual([row["id"] for row in found],["q1"])

    def test_follow_up_includes_and_persists_the_prior_conversation(self):
        provider=SimpleNamespace(id="mock",model="test")
        first_body={"interpretation":"It means I am hungry.","breakdown":[],"uncertainty":""}
        second_body={"interpretation":"Yes, it is casual.","breakdown":[],"uncertainty":""}
        location={"volume_id":"v1","page_index":2,"block_index":4}
        with patch.object(app,"structured_text",new=AsyncMock(side_effect=[(first_body,provider),(second_body,provider)])) as call:
            first=asyncio.run(app.explain_grammar(app.GrammarExplain(sentence="ハラへったな",focus="ハラへったな",question="What does this mean?",**location)))
            second=asyncio.run(app.explain_grammar(app.GrammarExplain(sentence="ハラへったな",focus="ハラへったな",question="Is it normal?",thread_id=first["thread_id"],**location)))
        self.assertEqual(second["thread_id"],first["thread_id"]);self.assertEqual(len(db.grammar_explanation_thread(first["thread_id"])),2)
        follow_up_prompt=call.await_args_list[1].args[1]
        self.assertIn("What does this mean?",follow_up_prompt);self.assertIn("It means I am hungry.",follow_up_prompt);self.assertIn("Is it normal?",follow_up_prompt)
