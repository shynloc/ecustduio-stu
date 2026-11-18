import { posix } from "node:path";
import { load } from "cheerio";
import { validateArchive } from "./security.js";
import { err } from "./db.js";

export function presentationPages(bytes: Buffer) {
  const zip = validateArchive(bytes);
  const document = zip.getEntry("ppt/presentation.xml"),
    relationships = zip.getEntry("ppt/_rels/presentation.xml.rels");
  if (!document || !relationships)
    return err("INVALID_PPTX", "无法读取演示文稿的页面目录", 422);
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    if (/(?:vbaProject\.bin|\/activeX\/|\/embeddings\/)/i.test(entry.entryName))
      err("ACTIVE_OFFICE", "请上传移除宏和嵌入对象的演示副本", 422);
    if (entry.entryName.endsWith(".rels")) {
      const rel = load(entry.getData().toString(), { xml: true });
      if (
        rel("Relationship")
          .toArray()
          .some(
            (e) =>
              rel(e).attr("TargetMode") === "External" &&
              !rel(e).attr("Type")?.endsWith("/hyperlink"),
          )
      )
        err("EXTERNAL_OFFICE", "请先将外部链接的媒体嵌入演示", 422);
    }
  }
  const rel = load(relationships.getData().toString(), { xml: true }),
    doc = load(document.getData().toString(), { xml: true });
  const paths = new Map(
    rel("Relationship")
      .toArray()
      .filter((e) => rel(e).attr("Type")?.endsWith("/slide"))
      .map((e) => [rel(e).attr("Id"), rel(e).attr("Target") || ""]),
  );
  const ordered = doc("p\\:sldIdLst > p\\:sldId").toArray();
  if (!ordered.length || ordered.length > 40)
    err("SLIDE_LIMIT", "支持 1–40 页演示，请先拆分长演示", 422);
  return ordered.map((item, index) => {
    const target = paths.get(doc(item).attr("r:id"));
    const path = target?.startsWith("/")
      ? target.slice(1)
      : posix.join("ppt", target || "");
    const slide = path.startsWith("ppt/slides/") && zip.getEntry(path);
    if (!slide)
      return err("INVALID_PPTX", "缺少演示的第 " + (index + 1) + " 页", 422);
    const xml = load(slide.getData().toString(), { xml: true });
    return {
      page: index + 1,
      text: xml("a\\:p")
        .toArray()
        .map((p) =>
          xml(p)
            .find("a\\:t")
            .toArray()
            .map((t) => xml(t).text())
            .join(""),
        )
        .join("\n"),
    };
  });
}
