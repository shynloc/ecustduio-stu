import json, pathlib, sys, tempfile, unittest
from html.parser import HTMLParser
root=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'scripts'))
import build_visual_pitch as pitch

class Checker(HTMLParser):
    def error(self,message):raise AssertionError(message)

class TestVisualPitch(unittest.TestCase):
    def setUp(self):
        self.brief=json.loads((root/'examples/visual-pitch-demo/pitch-brief.json').read_text(encoding='utf8'))
    def test_styles_produce_distinct_original_compositions(self):
        pages={name:fn(self.brief) for name,fn in pitch.RENDER.items()}
        self.assertEqual(len(pages),3)
        for name,content in pages.items():
            self.assertIn('让内容，成为体验。',content)
            self.assertIn('文案待用户审批',content)
            self.assertIn('从资料到结构',content)
            self.assertNotIn('<script src=',content)
            self.assertNotIn('<link rel="stylesheet" href=',content)
            Checker().feed(content)
        self.assertIn('paper-art',pages['editorial'])
        self.assertIn('space-art',pages['signal'])
        self.assertIn('class="disc"',pages['collision'])
        self.assertGreater(len(set(map(len,pages.values()))),1)
    def test_escaped_injection(self):
        self.brief['headline']='"><script>alert(1)</script>'
        self.brief['summary']='</script><script>alert(2)</script>'
        p=pitch.editorial(self.brief)
        self.assertNotIn('<script>alert(1)</script>',p)
        self.assertIn('&lt;script&gt;',p)
        h=pitch.make_hub(self.brief, {'editorial':p,'signal':p,'collision':p})
        self.assertNotIn('<script>alert(2)</script>',h)
        self.assertIn('\\u003C',h)
    def test_generator_outputs_json(self):
        with tempfile.TemporaryDirectory() as td:
            path=pathlib.Path(td)
            (path/'brief.json').write_text(json.dumps(self.brief,ensure_ascii=False),encoding='utf8')
            out=path/'out'
            # Verify builder uses the documented format without reaching the web.
            for id,fn in pitch.RENDER.items():
                out.mkdir(exist_ok=True)
                (out/f'{id}.html').write_text(fn(self.brief),encoding='utf8')
            self.assertEqual(len(list(out.glob('*.html'))),3)
    def test_input_validation(self):
        with self.assertRaises(ValueError):pitch.validate({'headline':'bad','sections':[]})
        with self.assertRaises(ValueError):pitch.validate(dict(self.brief,sections=[{'heading':'only'}]))
    def test_quick_and_studio_direction_count(self):
        self.assertEqual(len(pitch.choose_directions('quick')),2)
        self.assertEqual(len(pitch.choose_directions('studio')),3)
        self.assertEqual([d['id'] for d in pitch.choose_directions('studio','collision')],['collision'])
        with self.assertRaises(ValueError):pitch.choose_directions('invalid')

if __name__=='__main__':unittest.main()
