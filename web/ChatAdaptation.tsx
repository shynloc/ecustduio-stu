import React, { useEffect, useState } from "react";
import { api, post } from "./api";
import { copyRichHtml } from "./compat";
import { wechatThemeLabels } from "../shared/wechat-themes";
import { OfficePages } from "./OfficePages";

export function ChatAdaptation({ cid, message, source, refresh }: any) {
  const card = message.context.adaptation,
    mid = message.id,
    base = "/conversations/" + cid + "/messages/" + mid + "/adaptation";
  const [state, setState] = useState<any>(null),
    [preview, setPreview] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false),
    [epoch, setEpoch] = useState(0),
    [showSlides, setShowSlides] = useState(false);
  const [complete, setComplete] = useState(false),
    [page, setPage] = useState(1),
    [text, setText] = useState(""),
    [speed, setSpeed] = useState(1);
  const scene = card.scenes?.[page - 1];
  useEffect(() => {
    if (scene) {
      setText(scene.text);
      setSpeed(scene.speed);
    }
  }, [scene?.text, scene?.speed, page]);
  useEffect(() => {
    let live = true,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const status = await api(base);
        if (!live) return;
        setState(status);
        if (
          status.jobs.some((j: any) =>
            ["queued", "running"].includes(j.state),
          ) ||
          status.drafts.some((d: any) =>
            ["queued", "running"].includes(d.jobState),
          )
        )
          timer = setTimeout(poll, 900);
      } catch (e: any) {
        if (live) setError(e.message);
      }
    }
    poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [base, epoch]);
  useEffect(() => {
    let live = true;
    if (card.previewId)
      api("/wechat/previews/" + card.previewId)
        .then((v) => live && setPreview(v))
        .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [card.previewId, epoch]);
  async function perform(action: () => Promise<any>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setEpoch((i) => i + 1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function edit(prompt: string, adaptEdit: any) {
    await post("/conversations/" + cid + "/messages", {
      prompt,
      adaptEdit: { ...adaptEdit, messageId: mid },
      queueTurn: true,
    });
    await refresh();
  }
  const audio = state?.jobs.find((j: any) => j.action === "listen"),
    film = state?.jobs.find((j: any) => j.action === "render"),
    take = audio?.result;
  const draft = state?.drafts?.[0],
    account = state?.connection;
  const status = (j: any) =>
    j && (
      <div role="status">
        {
          (
            {
              queued: "已排队",
              running: "正在制作",
              failed: "未完成",
              interrupted: "已中断",
              partial: "部分完成",
              canceled: "已取消",
              succeeded: "已完成",
            } as any
          )[j.state]
        }
        {j.progress && " · " + j.progress}
        {j.error?.message ? " · " + j.error.message : ""}
        {["failed", "interrupted", "partial"].includes(j.state) && (
          <button
            className="text-link"
            disabled={busy}
            onClick={() => perform(() => post("/jobs/" + j.id + "/retry"))}
          >
            重试此步骤
          </button>
        )}
      </div>
    );
  return (
    <section
      id={card.articleFileId ? "chat-file-" + card.articleFileId : undefined}
      tabIndex={-1}
      className="adaptation-card"
      aria-label={
        card.kind === "wechat"
          ? "对话公众号文章"
          : card.html
            ? "HTML 视频"
            : "对话配音视频"
      }
    >
      <header>
        <h3>{card.title}</h3>
        <small>
          第 {card.version} 版{" "}
          {card.priorMessageId && (
            <button
              className="text-link"
              onClick={() => {
                const prev = document.getElementById(
                  "chat-message-" + card.priorMessageId,
                );
                prev?.scrollIntoView({ block: "center" });
                prev?.focus({ preventScroll: true });
              }}
            >
              查看上一版{card.kind === "wechat" ? "文章" : "讲稿"}
            </button>
          )}
        </small>
        <small>
          来源：
          <a
            href={
              card.sourceAssetId
                ? "/api/artifacts/" + card.sourceId + "/download"
                : "#explore/" + cid + "?file=" + card.sourceId
            }
          >
            {source?.title || card.sourceName} · 第 {card.sourceVersion} 版
          </a>
        </small>
      </header>
      {card.kind === "wechat" ? (
        <>
          <label>
            公众号主题{" "}
            <select
              aria-label="对话文章主题"
              disabled={busy}
              value={card.palette}
              onChange={(e) => {
                const palette = e.target.value;
                perform(() =>
                  edit(
                    "换成" +
                      wechatThemeLabels[
                        palette as keyof typeof wechatThemeLabels
                      ],
                    { action: "theme", palette },
                  ),
                );
              }}
            >
              {Object.entries(wechatThemeLabels).map(([key, v]) => (
                <option key={key} value={key}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {preview && (
            <>
              <iframe
                className="wechat-preview"
                title="对话文章手机预览"
                sandbox=""
                srcDoc={preview.previewHtml}
              />
              <div className="button-row">
                <a
                  className="btn secondary"
                  href={"#wechat/" + card.noteId + "?preview=" + card.previewId}
                >
                  编辑文章
                </a>
                <button
                  className="btn secondary"
                  onClick={() =>
                    perform(async () => {
                      const copied = await copyRichHtml(preview.previewHtml);
                      setNotice(
                        copied === "rich" ? "已复制完整图文" : "已复制完整正文",
                      );
                    })
                  }
                >
                  复制排版
                </button>
                <a
                  className="text-link"
                  download
                  href={"/api/assets/" + preview.assetId}
                >
                  下载排版
                </a>
              </div>
            </>
          )}
          {draft ? (
            <div role="status">
              <strong>
                {draft.state === "saved" ? "微信已回读草稿" : "草稿保存记录"} ·{" "}
                {draft.accountName}
              </strong>
              {draft.message && <p>{draft.message}</p>}
              {draft.mediaId && <small>草稿回执 {draft.mediaId}</small>}
              {draft.state !== "saved" &&
                !["queued", "running"].includes(draft.jobState) && (
                  <div className="button-row">
                    <button
                      className="btn secondary"
                      disabled={busy}
                      onClick={() =>
                        perform(() =>
                          post("/wechat/drafts/" + draft.id + "/retry", {}),
                        )
                      }
                    >
                      核对草稿并继续
                    </button>
                    {["unknown", "submitting"].includes(draft.state) &&
                      !draft.mediaId && (
                        <button
                          className="text-link"
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                "确认已在该公众号后台核对，确实没有这篇草稿？",
                              )
                            )
                              perform(() =>
                                post("/wechat/drafts/" + draft.id + "/retry", {
                                  confirmedAbsent: true,
                                }),
                              );
                          }}
                        >
                          确认后台无此草稿后重送
                        </button>
                      )}
                  </div>
                )}
            </div>
          ) : account?.connected ? (
            <button
              className="btn"
              data-chat-action="draft"
              disabled={busy || !preview}
              onClick={() => {
                if (
                  confirm(
                    "将本次预览保存到「" + account.name + "」的微信草稿箱？",
                  )
                )
                  perform(() =>
                    post(base + "/draft", {
                      previewId: card.previewId,
                      accountId: account.id,
                      confirmed: true,
                    }),
                  );
              }}
            >
              保存到「{account.name}」草稿箱
            </button>
          ) : (
            state && (
              <p className="muted">
                连接公众号后可保存到草稿箱。
                <button
                  className="text-link"
                  onClick={() => setEpoch((i) => i + 1)}
                >
                  刷新连接
                </button>
              </p>
            )
          )}
        </>
      ) : (
        <>
          {card.html && (
            <>
              <p>
                {card.html.mode === "original"
                  ? "保留原网页版式和动效"
                  : "重新编排分镜"}{" "}
                ·{" "}
                {
                  { landscape: "横屏", portrait: "竖屏", square: "方形" }[
                    card.html.aspect as "landscape" | "portrait" | "square"
                  ]
                }{" "}
                · {card.seconds} 秒
              </p>
              {card.html.mode === "storyboard" && (
                <details>
                  <summary>查看分镜 · {card.scenes.length} 段</summary>
                  <ol>
                    {card.scenes.map((s: any) => (
                      <li key={s.page}>
                        <strong>{s.title}</strong>
                        <p>{s.text}</p>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
              {!card.html.narrated && (!film || film.state === "canceled") && (
                <button
                  className="btn"
                  disabled={!state || busy}
                  onClick={() =>
                    perform(() =>
                      post(base + "/jobs", {
                        action: "render",
                        confirmed: true,
                      }),
                    )
                  }
                >
                  生成无声视频
                </button>
              )}
            </>
          )}
          {!card.html && (
            <div className="button-row">
              <span>
                原演示 {card.scenes.length} 页 · 目标 {card.seconds} 秒
              </span>
              <button className="text-link" onClick={() => setShowSlides(true)}>
                查看原演示画面
              </button>
            </div>
          )}
          {showSlides && (
            <OfficePages
              conversationId={cid}
              file={{
                id: card.slideId,
                title: card.sourceName,
                version: card.sourceVersion,
              }}
              onClose={() => setShowSlides(false)}
            />
          )}
          {(!card.html || card.html.narrated) && (
            <>
              <label className="field">
                旁白页码
                <select
                  aria-label="旁白页码"
                  value={page}
                  onChange={(e) => setPage(Number(e.target.value))}
                >
                  {card.scenes.map((s: any) => (
                    <option key={s.page} value={s.page}>
                      第 {s.page} 页 · {s.title}
                    </option>
                  ))}
                </select>
              </label>
              <small>
                {take
                  ? "本页实际旁白 " +
                    (
                      take.timeline[page - 1].audioEnd -
                      take.timeline[page - 1].start
                    ).toFixed(1) +
                    " 秒"
                  : "本页旁白预计约 " +
                    Math.ceil([...text].length / (3.5 * speed || 3.5)) +
                    " 秒，试听后显示实际时长。"}
              </small>
              <label className="field">
                本页讲稿
                <textarea
                  aria-label="本页讲稿"
                  rows={3}
                  maxLength={1000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <div className="button-row">
                <label>
                  本页语速{" "}
                  <input
                    aria-label="本页语速"
                    type="number"
                    min=".7"
                    max="1.5"
                    step=".1"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                  />
                </label>
                <button
                  className="btn secondary"
                  disabled={
                    busy ||
                    !text.trim() ||
                    speed < 0.7 ||
                    speed > 1.5 ||
                    (text === scene.text && speed === scene.speed)
                  }
                  onClick={() =>
                    perform(() =>
                      edit("修改第 " + page + " 页讲稿与语速", {
                        action: "scene",
                        page,
                        text,
                        speed,
                      }),
                    )
                  }
                >
                  保存为新版讲稿
                </button>
              </div>
              <p>
                {state &&
                  "本次需合成 " +
                    state.estimate.segments +
                    " 段，共 " +
                    state.estimate.characters +
                    " 个计费字符；其余复用本账号已有配音。"}
              </p>
              {(!audio || audio.state === "canceled") && (
                <button
                  className="btn"
                  data-chat-action="listen"
                  disabled={!state || busy}
                  onClick={() =>
                    perform(() =>
                      post(base + "/jobs", {
                        action: "listen",
                        confirmed: true,
                      }),
                    )
                  }
                >
                  {state?.estimate.characters
                    ? "确认配音用量并试听"
                    : "复用配音并试听"}
                </button>
              )}
              {status(audio)}
              {take && (
                <>
                  <label id={"chat-file-" + take.wav.id} tabIndex={-1}>
                    整段试听 · 语音 {take.speechSeconds.toFixed(1)}{" "}
                    秒，含画面停留共 {take.duration.toFixed(1)} 秒
                    <audio
                      aria-label="整段试听"
                      controls
                      preload="metadata"
                      src={"/api/assets/" + take.wav.assetId}
                    />
                  </label>
                  <label>
                    第 {page} 页试听
                    <audio
                      key={page}
                      aria-label="本页试听"
                      controls
                      preload="none"
                      src={
                        "/api/assets/" + take.timeline[page - 1].audioAssetId
                      }
                    />
                  </label>
                  {(!film || film.state === "canceled") && (
                    <>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={complete}
                          onChange={(e) => setComplete(e.target.checked)}
                        />
                        已核对本版画面、配音与时长
                      </label>
                      <button
                        className="btn"
                        data-chat-action="render"
                        disabled={!complete || busy}
                        onClick={() =>
                          perform(() =>
                            post(base + "/jobs", {
                              action: "render",
                              audioJobId: audio.id,
                              confirmed: true,
                            }),
                          )
                        }
                      >
                        确认渲染 MP4 与字幕
                      </button>
                    </>
                  )}
                </>
              )}
            </>
          )}
          {status(film)}
          {film?.result?.artifacts?.map((f: any) => (
            <div key={f.id} id={"chat-file-" + f.id} tabIndex={-1}>
              {f.format === "mp4" && (
                <video
                  aria-label={
                    card.html && !card.html.narrated ? "网页成片" : "配音成片"
                  }
                  controls
                  preload="metadata"
                  src={"/api/assets/" + f.assetId}
                />
              )}
              <a href={"/api/artifacts/" + f.id + "/download"} download>
                下载 {f.format.toUpperCase()}
              </a>
            </div>
          ))}
        </>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="status">
          {error}{" "}
          <button
            className="text-link"
            onClick={() => {
              setError("");
              setEpoch((i) => i + 1);
            }}
          >
            刷新记录
          </button>
        </p>
      )}
    </section>
  );
}
