import { useEffect, useRef, useState } from "react";
export function OfficePages({ conversationId, file, onClose, collection=false }: any) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  const [page, setPage] = useState(1),
    [count, setCount] = useState(0),
    [image, setImage] = useState("");
  const [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const cancel = new AbortController();
    setImage("");
    setError("");
    (async () => {
      const response = await fetch(
        collection ? "/api/collections/artifacts/"+file.id+"/pages/"+page : "/api/conversations/" +
          conversationId +
          "/artifacts/" +
          file.id +
          "/pages/" +
          page,
        { signal: cancel.signal },
      );
      if (!response.ok)
        throw new Error(
          (await response.json()).error?.message || "读取预览失败",
        );
      const blob = await response.blob();
      if (cancel.signal.aborted) return;
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("预览图片读取失败"));
        reader.readAsDataURL(blob);
      });
      if (cancel.signal.aborted) return;
      setImage(data);
      setCount(Number(response.headers.get("x-page-count")));
    })().catch((e) => {
      if (!cancel.signal.aborted) setError(e.message);
    });
    return () => {
      cancel.abort();
    };
  }, [conversationId, file.id, page, retry]);
  return (
    <dialog
      ref={dialog}
      className="office-viewer"
      aria-label="文件预览"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <section className="office-pages" aria-label="附件分页预览">
        <div className="button-row">
          <strong>
            {file.title || file.name} · 第 {file.version || 1} 版
          </strong>
          <button className="text-link" onClick={onClose}>
            关闭预览
          </button>
        </div>
        <div className="button-row">
          <button
            className="btn secondary"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            上一页
          </button>
          <span aria-live="polite">
            {count ? "第 " + page + " / " + count + " 页" : "准备分页"}
          </span>
          <button
            className="btn secondary"
            disabled={!count || page >= count}
            onClick={() => setPage(page + 1)}
          >
            下一页
          </button>
        </div>
        {image && (
          <button
            className="text-link"
            aria-pressed={zoom}
            onClick={() => setZoom(!zoom)}
          >
            {zoom ? "适应页面" : "放大页面"}
          </button>
        )}
        <div className={"office-canvas" + (zoom ? " zoom" : "")}>
          {image ? (
            <img
              onError={() => {
                setImage("");
                setError("分页图片无法显示，请重试。");
              }}
              src={image}
              alt={(file.title || file.name) + " 第 " + page + " 页"}
            />
          ) : error ? (
            <p role="alert">
              {error}{" "}
              <button
                className="text-link"
                onClick={() => setRetry((n) => n + 1)}
              >
                重试预览
              </button>
            </p>
          ) : (
            <p role="status">正在打开原文件并生成分页…</p>
          )}
        </div>
      </section>
    </dialog>
  );
}
