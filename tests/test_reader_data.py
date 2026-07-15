import unittest
from server.app import normalize_block

class ReaderDataTests(unittest.TestCase):
    def test_normalizes_missing_ruby_and_invalid_geometry(self):
        block=normalize_block({'box':['bad',2,3,4],'lines':['食べる'],'ruby':[],'font_size':'bad'},800,1200)
        self.assertEqual(block['ruby'],[[]]);self.assertEqual(block['raw_lines'],['食べる']);self.assertEqual(block['box'],[0,0,800,1200]);self.assertEqual(block['font_size'],20)

    def test_discards_malformed_ruby_spans_but_preserves_valid_ones(self):
        block=normalize_block({'lines':['食べる','次'],'ruby':[[{'base':'食','reading':'た'}],'wrong']},800,1200)
        self.assertEqual(block['ruby'][0][0]['reading'],'た');self.assertEqual(block['ruby'][1],[])

if __name__=='__main__':unittest.main()
