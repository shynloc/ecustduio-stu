#!/usr/bin/env python3
"""Package the three fictional v1.8 pages into one offline preview HTML.

No real user's content is loaded; no network assets, template engine or AI model.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

PROFILES = ("precision", "warm", "quiet")


def build(source: pathlib.Path) -> str:
    source = source.resolve()
    hub = source.read_text(encoding="utf-8")
    pages = {name: (source.parent / f"{name}-resume.html").read_text(encoding="utf-8") for name in PROFILES}
    # A literal closing script element inside JSON would end the outer script.
    # Escaping all '<' keeps script/text nesting safe in the standalone artifact.
    embedded = json.dumps(pages, ensure_ascii=False).replace("<", "\\u003c")
    replacements = {
        'src="precision-resume.html"': 'src="about:blank"',
        'href="precision-resume.html" target="_blank" rel="noopener">独立打开 ↗':
            'href="#" download="precision-resume.html">下载当前 HTML ↓',
        "const profiles={precision:": f"const pages={embedded};\n      const profiles={{precision:",
        "frame.src=id+'-resume.html';": "frame.srcdoc=pages[id];",
        "document.getElementById('open-page').href=id+'-resume.html';": "setDownload(id);",
        '    })();': "      frame.srcdoc=pages.precision;setDownload('precision');\n    })();",
    }
    for old, new in replacements.items():
        if hub.count(old) != 1:
            raise ValueError(f"Expected exactly one hub marker: {old[:48]}")
        hub = hub.replace(old, new, 1)
    hook = "      const stage=document.getElementById('stage');const frame=document.getElementById('preview');"
    if hub.count(hook) != 1:
        raise ValueError("Preview script anchor not found")
    hub = hub.replace(hook, hook + "\n" + """
      let activeDownload;
      function setDownload(id){
        if(activeDownload)URL.revokeObjectURL(activeDownload);
        activeDownload=URL.createObjectURL(new Blob([pages[id]],{type:'text/html;charset=utf-8'}));
        const link=document.getElementById('open-page');
        link.href=activeDownload;link.download=id+'-resume.html';
      }""", 1)
    return hub


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--hub", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    try:
        dest = pathlib.Path(args.out).resolve()
        if dest.exists():
            raise ValueError("Refusing to overwrite an existing preview")
        html = build(pathlib.Path(args.hub))
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(html, encoding="utf-8")
    except (OSError, ValueError) as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1
    print(json.dumps({"status": "PASS", "out": str(dest), "bytes": dest.stat().st_size,
                      "source": "FICTIONAL_ONLY", "external_assets": False}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
