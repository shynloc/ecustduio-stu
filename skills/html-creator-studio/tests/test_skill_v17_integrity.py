import pathlib,re,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class TestSkillIntegrity(unittest.TestCase):
    def test_references_exist(self):
        for name in ['references/CORE-WORKFLOW-v1.5.md','references/VISUAL-PITCH.md','references/ASSET-DIRECTION.md','references/AUDIO-DIRECTION.md','references/VISUAL-QA.md','references/WORKFLOW-MODES.md','references/designresources.md','references/INSTALL-AND-TEST.md','references/PROVENANCE-QA.md','references/ACCESSIBILITY-QUALITY.md','scripts/build_visual_pitch.py','scripts/visual_qa.py','scripts/validate_asset_plan.py','scripts/beta_doctor.py','scripts/check_source_coverage.py','templates/VISUAL-PITCH-BRIEF.json']:
            self.assertTrue((ROOT/name).is_file(),name)
    def test_start_here_chapter_numbers_unique(self):
        s=(ROOT/'START-HERE.md').read_text(encoding='utf8')
        nums=re.findall(r'^## (\d\d)｜',s,re.M)
        self.assertEqual(nums,[f'{i:02d}' for i in range(1,len(nums)+1)])
    def test_safety_gates_exist(self):
        s=(ROOT/'SKILL.md').read_text(encoding='utf8')
        for term in ['G0 SOURCE','G1 VISUAL','G2 COPY','G3 ASSETS','G4 BUILD','G5 VIDEO','G6 PUBLISH','G7 RELEASE','useCurrentFrame()','文案']:
            self.assertIn(term,s)

if __name__=='__main__':unittest.main()
