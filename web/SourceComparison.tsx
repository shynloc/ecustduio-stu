import React, { useEffect, useState } from "react";
export function SourceComparison({ jobId, result, checked, onChecked }: any) {
  const [page, setPage] = useState(1),
    [pages, setPages] = useState(0),
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false);
  const pdf = /\.pdf$/i.test(result.sourceName || "");
  useEffect(() => {
    if (!open || !pdf) return;
    let active = true,
      objectUrl = "";
    const controller = new AbortController();
    setUrl("");
    setError("");
    fetch(`/api/media/${jobId}/pages/${page}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok)
          throw new Error((await r.json()).error?.message || "预览失败");
        const blob = await r.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setPages(Number(r.headers.get("X-Page-Count") || 0));
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [jobId, page, pdf, open]);
  if (!result.sourceAssetId) return null;
  return (
    <section className="source-comparison">
      <strong>原文件对照 · {result.sourceName || "上传资料"}</strong>
      <div className="button-row">
        <a
          href={"/api/assets/" + result.sourceAssetId}
          target="_blank"
          rel="noreferrer"
        >
          打开原文件
        </a>
        {pdf && (
          <button
            type="button"
            className="btn secondary"
            onClick={() => setOpen(!open)}
          >
            {open ? "收起分页预览" : "查看原始页面"}
          </button>
        )}
        {result.evidenceAssetId && (
          <a href={"/api/assets/" + result.evidenceAssetId}>
            下载原始文本层记录
          </a>
        )}
      </div>
      {open && pdf && (
        <>
          <div className="button-row">
            <button
              type="button"
              className="btn secondary"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </button>
            <span>
              第 {page} 页{pages ? " / " + pages : ""}
            </span>
            <button
              type="button"
              className="btn secondary"
              disabled={!pages || page >= pages}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </button>
          </div>
          {error ? (
            <p role="alert">{error}</p>
          ) : url ? (
            <img src={url} alt={"原PDF第" + page + "页"} />
          ) : (
            <p>正在读取原文件页面…</p>
          )}
        </>
      )}
      {result.integrity?.requiresSourceReview && (
        <>
          <p className="notice warning">
            {result.integrity.status === "needs-review"
              ? "整理结果可能与原文不一致。"
              : "此内容为AI整理稿，尚未对照原文核验。"}
            可先存为待复核笔记；继续事实提取前请校正。
          </p>
          <label className="check-source">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => onChecked(e.target.checked)}
            />
            <span>我已对照原文件核对并校正以上内容</span>
          </label>
        </>
      )}
    </section>
  );
}
