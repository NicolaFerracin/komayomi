import unittest
from types import SimpleNamespace
from unittest.mock import patch
from server import app
from server.app import normalize_block

class ReaderDataTests(unittest.TestCase):
    def test_normalizes_missing_ruby_and_invalid_geometry(self):
        block=normalize_block({'box':['bad',2,3,4],'lines':['食べる'],'ruby':[],'font_size':'bad'},800,1200)
        self.assertEqual(block['ruby'],[[]]);self.assertEqual(block['raw_lines'],['食べる']);self.assertEqual(block['box'],[0,0,800,1200]);self.assertEqual(block['font_size'],20)

    def test_discards_malformed_ruby_spans_but_preserves_valid_ones(self):
        block=normalize_block({'lines':['食べる','次'],'ruby':[[{'base':'食','reading':'た'}],'wrong']},800,1200)
        self.assertEqual(block['ruby'][0][0]['reading'],'た');self.assertEqual(block['ruby'][1],[])

    def test_reader_loads_review_status_for_ocr_quality(self):
        payload={'pages':[{'img_width':800,'img_height':1200,'img_path':'page.jpg','blocks':[]}]}
        volume=SimpleNamespace(current_page=0,series='Series',title='Volume')
        with patch.object(app,'require_volume',return_value=volume), patch.object(app,'reader_payload',return_value=payload), \
             patch.object(app.db,'corrections_for',return_value={}), patch.object(app.db,'page_overrides',return_value={}), \
             patch.object(app.db,'block_geometries',return_value={}), patch.object(app.db,'block_text_overrides',return_value={}), \
             patch.object(app.db,'reviewed_pages',return_value={0}):
            result=app.reader('v1')
        self.assertTrue(result['pages'][0]['ocr_quality']['reviewed'])

if __name__=='__main__':unittest.main()
