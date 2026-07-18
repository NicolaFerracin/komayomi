"""Reader payload normalization and edit-boundary tests."""

import unittest
from types import SimpleNamespace
from unittest.mock import patch
from fastapi import HTTPException
from server import app
from server.app import BlockGeometry, BlockText, Correction, Position, normalize_block

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

    def test_reader_clamps_stale_saved_position(self):
        payload={'pages':[{'img_width':800,'img_height':1200,'img_path':'page.jpg','blocks':[]}]}
        volume=SimpleNamespace(current_page=99,series='Series',title='Volume')
        with patch.object(app,'require_volume',return_value=volume), patch.object(app,'reader_payload',return_value=payload), \
             patch.object(app.db,'corrections_for',return_value={}), patch.object(app.db,'page_overrides',return_value={}), \
             patch.object(app.db,'block_geometries',return_value={}), patch.object(app.db,'block_text_overrides',return_value={}), \
             patch.object(app.db,'reviewed_pages',return_value=set()):
            result=app.reader('v1')
        self.assertEqual(result['current_page'],0)

    def test_position_is_clamped_to_volume(self):
        volume=SimpleNamespace(page_count=3)
        with patch.object(app,'require_volume',return_value=volume), patch.object(app.db,'save_position') as save:
            app.position('v1',Position(page=20))
        save.assert_called_once_with('v1',2)

    def test_edit_endpoints_reject_unknown_block(self):
        metadata={'pages':[{'img_width':800,'img_height':1200,'blocks':[]}]}
        volume=SimpleNamespace()
        with patch.object(app,'require_volume',return_value=volume), patch.object(app,'reader_payload',return_value=metadata):
            requests=(
                lambda: app.save_geometry('v1',0,3,BlockGeometry(box=[0,0,20,20])),
                lambda: app.save_block_text('v1',0,3,BlockText(lines=['text'],ruby=[[]])),
                lambda: app.correction('v1',Correction(page_index=0,block_index=3,line_index=0,raw_text='a',canonical_text='b')),
            )
            for request in requests:
                with self.subTest(request=request), self.assertRaises(HTTPException) as raised: request()
                self.assertEqual(raised.exception.status_code,404)

    def test_geometry_validation_uses_saved_page_layout(self):
        metadata={'pages':[{'img_width':800,'img_height':1200,'blocks':[]}]}
        replacement={'box':[1,2,30,40],'lines':['text'],'ruby':[[]]}
        with patch.object(app,'require_volume',return_value=SimpleNamespace()), \
             patch.object(app,'reader_payload',return_value=metadata), \
             patch.object(app.db,'corrections_for',return_value={}), \
             patch.object(app.db,'page_overrides',return_value={0:[replacement]}), \
             patch.object(app.db,'block_geometries',return_value={}), \
             patch.object(app.db,'block_text_overrides',return_value={}), \
             patch.object(app.db,'reviewed_pages',return_value=set()), \
             patch.object(app.db,'save_block_geometry') as save:
            app.save_geometry('v1',0,0,BlockGeometry(box=[2,3,40,50]))
        save.assert_called_once()

    def test_delete_block_persists_the_remaining_effective_layout(self):
        blocks=[{'lines':['page number'],'ruby':[[]]},{'lines':['dialogue'],'ruby':[[]]}]
        metadata={'pages':[{'blocks':blocks}]}
        with patch.object(app,'require_volume',return_value=SimpleNamespace()), \
             patch.object(app,'reader_payload',return_value=metadata), \
             patch.object(app,'apply_saved_text'), patch.object(app.db,'replace_page_blocks') as replace:
            result=app.delete_block('v1',0,0)
        self.assertEqual(result['blocks'],[blocks[1]])
        replace.assert_called_once()

if __name__=='__main__':unittest.main()
