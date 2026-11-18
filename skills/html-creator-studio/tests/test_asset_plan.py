import json,pathlib,sys,tempfile,unittest
root=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'scripts'))
from validate_asset_plan import check

class AssetPlanTest(unittest.TestCase):
    def test_real_demo_assets(self):
        result=check(root/'examples/visual-pitch-demo/asset-plan.json')
        self.assertEqual(result['status'],'PASS')
        self.assertEqual(result['checked_assets'],3)
    def test_external_asset_needs_source_and_permission(self):
        with tempfile.TemporaryDirectory() as td:
            p=pathlib.Path(td)/'a.json'
            p.write_text(json.dumps({'assets':[{'id':'foo','scene_id':'s1','purpose':'x','origin':'licensed-stock','status':'ready','fallback':'svg','alt_text':'photo'}]}))
            result=check(p)
            self.assertEqual(result['status'],'FAIL')
            self.assertTrue(any('source_or_license' in e for e in result['errors']))
    def test_user_provided_asset_needs_publication_rights(self):
        with tempfile.TemporaryDirectory() as td:
            p=pathlib.Path(td)/'a.json'
            p.write_text(json.dumps({'assets':[{'id':'user-photo','scene_id':'s1','purpose':'photo','origin':'provided-by-user','status':'ready','fallback':'text','alt_text':'image','source_or_license':'uploaded'}]}))
            self.assertEqual(check(p)['status'],'REVIEW')

    def test_draft_pending_license_flag(self):
        with tempfile.TemporaryDirectory() as td:
            p=pathlib.Path(td)/'a.json'
            p.write_text(json.dumps({'assets':[{'id':'foo','scene_id':'s1','purpose':'x','origin':'licensed-stock','status':'needs-permission','fallback':'svg','alt_text':'photo','source_or_license':'pending-license'}]}))
            result=check(p)
            self.assertEqual(result['status'],'REVIEW')

if __name__=='__main__':unittest.main()
