import test from "node:test";
import assert from "node:assert/strict";
import { MarkdownManager } from "@tiptap/markdown";
import { documentExtensions } from "../shared/document.js";
const markdown = new MarkdownManager({ extensions: documentExtensions() });
test("编辑普通正文后，公式、脚注、HTML原片段与表格保真", () => {
  const input =
    '# 教学资料\n\n学生观察 **光合作用**。公式 $E=mc^2$，来源[^one]。\n\n|项目|数量|\n|---|---|\n|观察|12|\n\n$$\n\\frac{a}{b}\n$$\n\n[^one]: 原始课堂记录。\n\n<div class="original">原文特殊说明 <b>保留</b></div>\n';
  const doc = markdown.parse(input),
    kinds: string[] = [];
  const walk = (n: any) => {
    kinds.push(n.type);
    for (const c of n.content || []) walk(c);
  };
  walk(doc);
  assert.ok(kinds.includes("table"));
  assert.ok(kinds.includes("preservedBlock"));
  assert.ok(kinds.includes("preservedInline"));
  doc.content!.find((n) => n.type === "heading")!.content![0].text =
    "修改后的教学资料";
  const saved = markdown.serialize(doc);
  for (const value of [
    "$E=mc^2$",
    "[^one]",
    "[^one]: 原始课堂记录。",
    "\\frac{a}{b}",
    '<div class="original">原文特殊说明 <b>保留</b></div>',
    "12",
  ])
    assert.ok(saved.includes(value), value + " was lost");
  const again = markdown.serialize(markdown.parse(saved));
  assert.equal(again, saved);
});
test("高亮与脚注不吞掉紧随的普通文字或链接", () => {
  const text =
    "这是 ==重要== 的内容，引用[^a] 后继续正文。\n\n[^a]: 参考信息\n\n下一段 [原网页](https://example.com)。";
  const result = markdown.serialize(markdown.parse(text));
  assert.match(result, /==重要==/);
  assert.match(result, /后继续正文/);
  assert.match(result, /下一段/);
  assert.match(result, /https:\/\/example.com/);
});
