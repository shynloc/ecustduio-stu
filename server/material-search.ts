// Deterministic candidate selection before any private/source text is sent to the model.
export function relevantMaterials(query: string, rows: any[], limit = 20) {
  const cleaned = query
    .toLowerCase()
    .replace(
      /(?:请|帮我|根据|使用|这些|资料|材料|制作|生成|整理|一份|一套|内容|文章|讲义|pptx?|html|pdf|docx|视频|动图|公众号|介绍|工作台|任务|设计)/gi,
      " ",
    );
  const terms = new Set<string>();
  for (const word of cleaned.match(/[a-z0-9]{3,}|[\p{Script=Han}]{2,}/gu) ||
    []) {
    if (/^[a-z0-9]+$/.test(word)) terms.add(word);
    else
      for (let n = 0; n < word.length - 1; n++) terms.add(word.slice(n, n + 2));
  }
  if (!terms.size) return [];
  return rows
    .map((row) => ({
      row,
      score: [...terms].reduce(
        (n, t) =>
          n +
          (String(row.title).toLowerCase().includes(t) ? 3 : 0) +
          (String(row.body).toLowerCase().includes(t) ? 1 : 0),
        0,
      ),
    }))
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.row);
}
