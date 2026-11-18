import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from lint_audience_copy import check

class CopyGateTests(unittest.TestCase):
    def setUp(self):
        self.tmp=TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.project=Path(self.tmp.name)
        m=self.project/'visual-master'; m.mkdir(); (self.project/'stage').mkdir()
        self.copy='整个流程分为三步：准备、执行和复盘。\n'
        (m/'copy-draft.md').write_text(self.copy,encoding='utf8')
        (m/'content.json').write_text(json.dumps({'scenes':[{'headline':'三步构建高质量内容'}]}),encoding='utf8')
        (m/'source-map.json').write_text(json.dumps({'source':'原文提到，后续有三步。'}),encoding='utf8')
        (self.project/'stage'/'stage-markup.html').write_text('<section><h1>三个阶段</h1></section>',encoding='utf8')
        self.set_approval('review_requested')
    def set_approval(self, status, hash_override=None):
        actual=hashlib.sha256((self.project/'visual-master'/'copy-draft.md').read_bytes()).hexdigest()
        data={'copy_approval':{'status':status,'sha256':hash_override if hash_override is not None else actual}}
        (self.project/'visual-master'/'approval.json').write_text(json.dumps(data), encoding='utf8')
    def test_unapproved_blocks_production(self):
        r=check(self.project,'production'); self.assertEqual(r['status'],'FAIL')
        self.assertTrue(any('未获' in e for e in r['errors']))
    def test_draft_only_warns(self):
        self.assertEqual(check(self.project,'draft')['status'],'PASS')
    def test_approved_clean_pass(self):
        self.set_approval('approved'); self.assertEqual(check(self.project,'production')['status'],'PASS')
    def test_changed_copy_invalidates_hash(self):
        self.set_approval('approved'); (self.project/'visual-master'/'copy-draft.md').write_text(self.copy+'改了', encoding='utf8')
        self.assertEqual(check(self.project,'production')['status'],'FAIL')
    def test_meta_phrase_in_stage_blocks(self):
        self.set_approval('approved'); (self.project/'stage'/'stage-markup.html').write_text('<p>原文说流程分三步</p>',encoding='utf8')
        r=check(self.project,'production'); self.assertEqual(r['status'],'FAIL'); self.assertTrue(any('元话语' in e for e in r['errors']))
    def test_source_map_not_scanned(self):
        self.set_approval('approved');self.assertEqual(check(self.project,'production')['status'],'PASS')
    def test_phrase_in_narration_blocks(self):
        self.set_approval('approved'); (self.project/'visual-master'/'content.json').write_text(json.dumps({'scenes':[{'narration':'原链接说这种变化越来越明显。'}]}),encoding='utf8')
        self.assertEqual(check(self.project,'production')['status'],'FAIL')
    def test_production_missing_copy_draft_blocks(self):
        self.set_approval('approved'); (self.project/'visual-master'/'copy-draft.md').unlink()
        self.assertEqual(check(self.project,'production')['status'],'FAIL')

if __name__=='__main__': unittest.main()
