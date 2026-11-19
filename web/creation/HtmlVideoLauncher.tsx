import React, { useEffect, useState } from "react";
import { Globe, FileUp, ArrowRight } from "lucide-react";
import { api, post } from "../api";
import { VisualWebImport } from "../UnifiedVisualStudio";
export function HtmlVideoLauncher({ data, go }: any) {
  const [files, setFiles] = useState<any[]>([]),
    [q, setQ] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api(
      "/collections/artifacts?format=html&limit=100&q=" + encodeURIComponent(q),
    )
      .then((r) => live && setFiles(r.items))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [q]);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>网页转视频</h1>
          <p>
            选择已经制作的网页，或上传 HTML
            文件。可以保留网页原有样式与动效，也可以整理成分镜讲解。
          </p>
        </div>
      </div>
      <section className="panel">
        <h2>
          <Globe size={20} />
          从已有网页开始
        </h2>
        <input
          aria-label="搜索网页作品"
          placeholder="搜索网页作品…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="html-choice-list">
          {files.map((f) => (
            <button
              key={f.id}
              className="btn secondary"
              onClick={() => {
                const m = f.manifest || {};
                if (m.conversationId)
                  go("explore/" + m.conversationId + "?file=" + f.id);
                else if (f.projectId)
                  go("project/" + f.projectId + "?tab=works");
                else if (m.visualId) go("visual/" + m.visualId);
                else
                  setError("请下载这份 HTML，再通过下方入口导入以制作视频。");
              }}
            >
              <Globe size={17} />
              {f.title}
              <ArrowRight size={15} />
            </button>
          ))}
        </div>
        {!files.length && (
          <p>还没有网页作品。可以先制作网页，也可以直接导入现有文件。</p>
        )}
        <button className="text-link" onClick={() => go("explore?task=html")}>
          先制作一个网页
        </button>
      </section>
      <section className="panel lower">
        <h2>
          <FileUp size={20} />
          导入已有网页
        </h2>
        <VisualWebImport
          go={go}
          scope={{
            domain: "general",
            region: "不限地区",
            district: "",
            year: new Date().getFullYear(),
            stage: "综合",
            audience: "相关读者",
          }}
        />
      </section>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
