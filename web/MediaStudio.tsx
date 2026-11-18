import {EvidencePanel} from './EvidencePanel';
import {carry,readContext} from './context';
import {DocumentReader} from './DocumentReader';
import {SourceComparison} from './SourceComparison';
import React, { useEffect, useRef, useState } from "react";
import {
  FileText,
  Image,
  Mic,
  Volume2,
  Upload,
  LoaderCircle,
  ArrowRight,
  BookOpen,
  Download,
  Plus,
} from "lucide-react";
import { api, post, upload } from "./api";
import { uid } from "./compat";
import { mediaActions, voiceNames, billingCharacters } from "../shared/media";
import { normalizeRecording } from "./audio";
import "./media.css";

export function openSpeech(
  go: any,
  sourceKind: string,
  sourceId: string,
  title: string,
  text: string,
) {
  carry(go,'media',[{kind:sourceKind,id:sourceId}], 'speech');
}
const duration = (ms: number) =>
  `${Math.floor(ms / 60000)}分${Math.round(ms / 1000) % 60}秒`;
const field = (label: string, child: any) => (
  <label className="field">
    <span>{label}</span>
    {React.cloneElement(child, { "aria-label": label })}
  </label>
);

export function MediaStudio({ data, act, go, id }: any) {
  const intent:any={};
  const [action, setAction] = useState(intent.action || "document"),
    [title, setTitle] = useState(intent.title || ""),
    [prompt, setPrompt] = useState(""),
    [purpose, setPurpose] = useState("rich_layout_recognition"),
    [voice, setVoice] = useState("stella"),
    [speechText, setSpeechText] = useState(intent.text || ""),
    [source, setSource] = useState<any>(intent.sourceId ? intent : null),
    [file, setFile] = useState<any>(null),
    [job, setJob] = useState<any>(null),
    [history, setHistory] = useState<any[]>([]),
    [text, setText] = useState(""),
    [sourceChecked,setSourceChecked]=useState(false),
    [resultTitle, setResultTitle] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [stage, setStage] = useState(""),
    [recording, setRecording] = useState(false),
    [scope, setScope] = useState({
      region: "北京",
      district: "全市",
      stage: "中考",
      year: new Date().getFullYear(),
      audience: "北京初三家长",
    });
  const recorder = useRef<MediaRecorder | null>(null),
    microphone = useRef<MediaStream | null>(null),
    timer = useRef<any>(null),
    alive = useRef(true),
    request = useRef({ body: "", key: uid() });
  const selected = mediaActions.find((a) => a.id === action)!,
    result = job&&["succeeded","partial"].includes(job.state) ? job.result : null;
  const running = job && ["queued", "running"].includes(job.state),
    disabled = busy || running || recording;
  const list = () => api("/media").then(setHistory);
  useEffect(() => {
    alive.current = true;
    list().catch((e) => setError(e.message));
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      microphone.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    setJob(null); setText(""); setResultTitle(""); setError("");
    if (!id) return;
    let active = true;
    api("/jobs/" + id)
      .then((j) => {
        if (active) {
          if (j.type !== "media") throw new Error("此记录不是媒体任务");
          setJob(j);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    if (!running) return;
    let active = true;
    const t = setInterval(
      () =>
        api("/jobs/" + job.id)
          .then((j) => {
            if (active) {
              setJob(j);
              setStage(j.events?.at(-1)?.payload?.message || "正在处理…");
              if (!["queued", "running"].includes(j.state))
                list().catch(() => {});
            }
          })
          .catch((e) => {
            if (active) {
              setError(e.message);
              setJob(null);
            }
          }),
      1200,
    );
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [job?.id, running]);
  useEffect(() => {
    setSourceChecked(false);
    if (result) {
      setText(result.text || "");
      setResultTitle(result.title || "处理结果");
    }
  }, [job?.id, job?.state]);

  async function receive(input: File) {
    setBusy(true);
    setError("");
    setFile(null); setJob(null); setText(""); setResultTitle("");
    try {
      setStage(action === "asr" ? "正在本机转换录音…" : "正在上传到工作台…");
      const f =
        action === "asr" ? await normalizeRecording(input, input.name) : input;
      const uploaded = await upload(f, "/media/uploads");
      if (alive.current) {
        setFile(uploaded);
        setTitle(input.name.replace(/\.[^.]+$/, ""));
        setStage("");
      }
    } catch (e: any) {
      if (alive.current) setError(e.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function record() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      microphone.current = stream;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(
          stream,
          mime ? { mimeType: mime } : undefined,
        ),
        chunks: Blob[] = [];
      recorder.current = r;
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onerror = () => {
        setError("录音失败，请使用上传录音");
        r.stop();
      };
      r.onstop = () => {
        clearTimeout(timer.current);
        stream.getTracks().forEach((t) => t.stop());
        if (alive.current) {
          setRecording(false);
          receive(
            new File(
              chunks,
              "现场录音." + (r.mimeType.includes("mp4") ? "m4a" : "webm"),
              { type: r.mimeType },
            ),
          );
        }
      };
      r.start(1000);
      setRecording(true);
      timer.current = setTimeout(() => {
        if (r.state === "recording") r.stop();
      }, 1200000);
    } catch (e: any) {
      microphone.current?.getTracks().forEach((t) => t.stop());
      setError("麦克风未获授权或不可用，请上传已有录音。");
    }
  }
  async function start(e: any) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = {
        action,
        title: title.trim() || selected.title,
        assetId: action === "tts" ? undefined : file?.id,
        prompt,
        purpose,
        voice,
        text: action === "tts" && !source ? speechText : "",
        sourceKind: source?.sourceKind || "custom",
        sourceId: source?.sourceId,
      };
      const signature = JSON.stringify(body);
      if (signature !== request.current.body)
        request.current = { body: signature, key: uid() };
      const j = await post("/media", body, request.current.key);
      setJob(j);
      setStage("已排队，正在准备处理");
      await list();
      go("media/" + j.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(()=>{let live=true;readContext().then(c=>{if(!live||!c||c.purpose!=='speech')return;const i=c.items[0],v=i.value;setAction('tts');setTitle(v.title||v.body?.title||'内容配音');setSpeechText(typeof v.body==='string'?v.body:v.body?.blocks?.map((b:any)=>b.text).join('\n\n')||v.content||'');setSource({sourceKind:i.ref.kind,sourceId:i.ref.id});}).catch(e=>live&&setError(e.message));return()=>{live=false;};},[]);
  async function note(destination: string) {
    setBusy(true);
    try {
      const n = await post(`/media/${job.id}/note`, {
        title: resultTitle,
        text,
        sourceChecked:sourceChecked?result?.sourceHash:undefined,
      });
      if (destination === "explore") {
        await carry(go,'explore',[{kind:'note',id:n.id}], 'explore');
      } else go("notes/" + n.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function material(create: boolean) {
    setBusy(true);
    try {
      const r = await act(
        () =>
          post(`/media/${job.id}/material`, {
            title: resultTitle,
            text,
            scope,
            sourceChecked:sourceChecked?result?.sourceHash:undefined,
          }),
        "已导入为待核实素材",
      );
      if (r) {
        if (create) {
          await carry(go,'deliver',[{kind:'snapshot',id:r.snapshotId}]);
        } else go("snapshot/" + r.snapshotId);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">READ · UNDERSTAND · LISTEN · CREATE</span>
          <h1>文件与语音</h1>
          <p>把文档、画面和录音变为创作素材，让文字成为可试听的作品。</p>
        </div>
        <button
          className="btn secondary"
          onClick={() => {
            setJob(null);
            setFile(null);
            setSource(null);
            setTitle("");
            setSpeechText("");
            go("media");
          }}
        >
          <Plus size={16} />
          新建处理
        </button>
      </div>
      <div className="media-layout">
        <section className="panel media-main">
          {!job && (
            <>
              <div className="media-tabs" role="group" aria-label="处理类型">
                {mediaActions.map((a, i) => {
                  const Icon = [FileText, FileText, Image, Mic, Volume2][i];
                  return (
                    <button
                      key={a.id}
                      disabled={disabled}
                      className={action === a.id ? "active" : ""}
                      aria-pressed={action === a.id}
                      onClick={() => {
                        setAction(a.id);
                        setFile(null);
                        setError("");
                        setSource(null);
                      }}
                    >
                      <Icon size={19} />
                      <span>{a.title}</span>
                    </button>
                  );
                })}
              </div>
              <form className="media-form" onSubmit={start}>
                <p className="muted">{selected.description}</p>
                {action !== "tts" ? (
                  <>
                    <label className="media-upload">
                      <Upload size={24} />
                      <strong>{file ? file.name : "选择文件"}</strong>
                      <span>
                        {file
                          ? `${(file.size / 1024 / 1024).toFixed(1)} MB${file.durationMs ? " · " + duration(file.durationMs) : ""}`
                          : "PDF最多200MB，自动按页拆分；其他文件最多50MB。先暂存本机，再按需处理"}
                      </span>
                      <input
                        aria-label="媒体文件"
                        key={action}
                        type="file"
                        accept={selected.accept}
                        disabled={disabled}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) receive(f);
                        }}
                      />
                    </label>
                    {file?.kind === "image" && (
                      <img
                        className="media-preview"
                        src={"/api/assets/" + file.id}
                        alt="已选图片预览"
                      />
                    )}
                    {action === "asr" && (
                      <div className="media-record">
                        {typeof MediaRecorder !== "undefined" &&
                        navigator.mediaDevices?.getUserMedia ? (
                          <button
                            type="button"
                            className="btn secondary"
                            disabled={busy}
                            onClick={() =>
                              recording ? recorder.current?.stop() : record()
                            }
                          >
                            <Mic size={16} />
                            {recording ? "停止录音并上传" : "使用麦克风录音"}
                          </button>
                        ) : (
                          <p className="help">
                            当前访问方式不能使用麦克风。局域网HTTP下可上传手机或电脑已有录音；本机或HTTPS可直接录音。
                          </p>
                        )}
                        <small>
                          录音会在浏览器转为单声道
                          WAV；最长20分钟，工作台自动分段识别。
                        </small>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {source && (
                      <div className="notice">
                        <span>
                          配音来源：{source.title}。生成时使用服务器保存的内容。
                        </span>
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => setSource(null)}
                        >
                          改为自填文字
                        </button>
                      </div>
                    )}
                    {field(
                      "配音文字",
                      <textarea
                        rows={10}
                        value={speechText}
                        readOnly={!!source}
                        maxLength={10000}
                        onChange={(e) => setSpeechText(e.target.value)}
                      />,
                    )}
                    <p className="help">
                      {billingCharacters(speechText)} / 10000
                      计费字符；汉字按2个计。配音标为AI合成草稿，可试听后下载。
                    </p>
                    {field(
                      "配音音色",
                      <select
                        value={voice}
                        onChange={(e) => setVoice(e.target.value)}
                      >
                        {Object.entries(voiceNames).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>,
                    )}
                  </>
                )}
                {field(
                  "任务标题",
                  <input
                    value={title}
                    maxLength={200}
                    placeholder={selected.title}
                    onChange={(e) => setTitle(e.target.value)}
                  />,
                )}
                {["document", "ocr"].includes(action) &&
                  field(
                    "解析方式",
                    <select
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                    >
                      <option value="text_recognition">文字为主</option>
                      <option value="rich_layout_recognition">
                        结合图表与版面
                      </option>
                    </select>,
                  )}
                {["document", "vision"].includes(action) &&
                  field(
                    "处理要求",
                    <textarea
                      rows={4}
                      maxLength={10000}
                      value={prompt}
                      placeholder={
                        action === "document"
                          ? "例如：按章节整理关键信息，保留日期、对象、条件和页码。识别全文可选云端文字识别。"
                          : "例如：读取图表数据，解释趋势，把可见事实与推断分开。"
                      }
                      onChange={(e) => setPrompt(e.target.value)}
                    />,
                  )}
                <div className="notice media-consent">
                  开始后会把本次文件或文字发送给
                  DeepSeek，并按官方规则计费。文档远端副本设置1小时有效期，处理结束会尝试删除；取消后远端处理仍可能计费。
                </div>
                {!data.settings.allowExternalAI && (
                  <p className="notice warning">
                    请管理员在设置中开启 DeepSeek 调用授权。
                  </p>
                )}
                {data.capabilities.deepseek !== "configured" && <p className="notice warning">请管理员在设置中录入 DeepSeek 凭据。</p>}
                {(!data.settings.allowExternalAI || data.capabilities.deepseek !== "configured") && data.user?.role === "admin" && <button type="button" className="text-link" onClick={() => go("settings")}>前往设置，配置并允许 DeepSeek 调用</button>}
                <button
                  className="btn"
                  type="submit"
                  disabled={
                    disabled ||
                    !data.settings.allowExternalAI ||
                    data.capabilities.deepseek !== "configured" ||
                    (action === "tts"
                      ? !speechText.trim() ||
                        billingCharacters(speechText) > 10000
                      : !file)
                  }
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <ArrowRight size={16} />
                  )}
                  发送至 DeepSeek 并{action === "tts" ? "生成配音" : "处理"}
                </button>
              </form>
            </>
          )}
          {job && (
            <div className="media-form">
              <div className="section-head">
                <h2>{result?.title || "媒体处理任务"}</h2>
                <button
                  className="text-link"
                  onClick={() => go("job/" + job.id)}
                >
                  查看任务记录
                </button>
              </div>
              {running && (
                <div className="media-status" role="status">
                  <LoaderCircle className="spin" size={24} />
                  <p>{stage || "任务已排队"}</p>
                  <button
                    className="btn secondary"
                    onClick={async () => {
                      try {
                        setJob(await post(`/jobs/${job.id}/cancel`));
                      } catch (e: any) {
                        setError(e.message);
                      }
                    }}
                  >
                    取消任务
                  </button>
                </div>
              )}
              {["failed", "interrupted", "canceled", "partial"].includes(job.state) && (
                <div className="notice warning">
                  <p>{job.error?.message || "任务已停止"}</p>
                  {job.state !== "canceled" && (
                    <button
                      className="btn secondary"
                      onClick={async () => {
                        try {
                          setJob(await post(`/jobs/${job.id}/retry`));
                        } catch (e: any) {
                          setError(e.message);
                        }
                      }}
                    >
                      重试未完成部分
                    </button>
                  )}
                </div>
              )}
              {result?.coverage==='partial'&&<p className="notice warning">已完成 {result.completedPages}/{result.pageCount} 页。未完成部分可重试，完整前暂不导入为创作素材。</p>}
              {result && (
                <>
                  {result.warnings?.map((w: string) => (
                    <p className="notice warning" key={w}>
                      {w}
                    </p>
                  ))}
                  {result.audioAssetId ? (
                    <div className="media-audio">
                      <Volume2 size={26} />
                      <h3>
                        AI合成配音 ·{" "}
                        {voiceNames[result.voice as keyof typeof voiceNames]}
                      </h3>
                      <p>{duration(result.durationMs)} · 研究草稿</p>
                      <audio
                        controls
                        preload="metadata"
                        src={`/api/media/${job.id}/audio`}
                      />
                      <a
                        className="btn"
                        href={`/api/media/${job.id}/audio?download=1`}
                      >
                        <Download size={16} />
                        下载 WAV 音频
                      </a>
                      <small>
                        配音不代表内容通过审核。分镜中的画面描述如需剔除，可选择自填文字再生成。
                      </small>
                    </div>
                  ) : (
                    <>
                      {field(
                        "结果标题",
                        <input
                          value={resultTitle}
                          maxLength={200}
                          onChange={(e) => setResultTitle(e.target.value)}
                        />,
                      )}
                      <EvidencePanel kind="media" id={job.id}/><SourceComparison key={'source:'+job.id} jobId={job.id} result={result} checked={sourceChecked} onChecked={setSourceChecked}/>
                      <DocumentReader key={job.id} label="校正后的文字" text={text} onChange={(value:string)=>{setText(value);setSourceChecked(false);}}/>
                      <div className="button-row">
                        <button
                          className="btn secondary"
                          disabled={busy || text.trim().length < 5}
                          onClick={() => note("notes")}
                        >
                          <BookOpen size={16} />
                          存入创作笔记
                        </button>
                        <button
                          className="btn secondary"
                          disabled={busy || text.trim().length < 5}
                          onClick={() => note("explore")}
                        >
                          带入 AI 探索
                        </button>
                        <button
                          className="btn secondary"
                          onClick={async () => {try{const n=await post(`/media/${job.id}/note`,{title:resultTitle,text,sourceChecked:sourceChecked?result?.sourceHash:undefined});await carry(go,'media',[{kind:'note',id:n.id}],'speech');setJob(null);setAction('tts');setTitle(resultTitle);setSpeechText(text);setSource({sourceKind:'note',sourceId:n.id});}catch(e:any){setError(e.message);}}}
                        >
                          用这些文字配音
                        </button>
                      </div>
                      <details className="media-import">
                        <summary>导入共享素材，继续事实提取与内容制作</summary>
                        <p className="help">
                          导入后文字和原文件对工作台成员共享，内容保持待核实。
                        </p>
                        <div className="form-grid">
                          {field(
                            "地区",
                            <input
                              value={scope.region}
                              onChange={(e) =>
                                setScope({ ...scope, region: e.target.value })
                              }
                            />,
                          )}
                          {field(
                            "区县",
                            <input
                              value={scope.district}
                              onChange={(e) =>
                                setScope({ ...scope, district: e.target.value })
                              }
                            />,
                          )}
                          {field(
                            "学段",
                            <select
                              value={scope.stage}
                              onChange={(e) =>
                                setScope({ ...scope, stage: e.target.value })
                              }
                            >
                              <option>中考</option>
                              <option>高考</option>
                              <option>综合</option>
                            </select>,
                          )}
                          {field(
                            "年度",
                            <input
                              type="number"
                              min={2000}
                              max={2100}
                              value={scope.year}
                              onChange={(e) =>
                                setScope({ ...scope, year: +e.target.value })
                              }
                            />,
                          )}
                          {field(
                            "读者对象",
                            <input
                              value={scope.audience}
                              onChange={(e) =>
                                setScope({ ...scope, audience: e.target.value })
                              }
                            />,
                          )}
                        </div>
                        <div className="button-row">
                          <button
                            className="btn secondary"
                            disabled={busy || result.coverage === "partial" || text.trim().length < 5}
                            onClick={() => material(false)}
                          >
                            导入素材并核验
                          </button>
                          <button
                            className="btn"
                            disabled={busy || result.coverage === "partial" || text.trim().length < 5}
                            onClick={() => material(true)}
                          >
                            导入并开始制作 <ArrowRight size={16} />
                          </button>
                        </div>
                      </details>
                    </>
                  )}
                  <div className="media-provenance">
                    {result.sourceAssetId && (
                      <a
                        href={"/api/assets/" + result.sourceAssetId}
                        target="_blank"
                        rel="noreferrer"
                      >
                        查看原始文件
                      </a>
                    )}
                    {result.rawAssetId && (
                      <a href={"/api/assets/" + result.rawAssetId}>
                        下载逐页识别记录
                      </a>
                    )}
                    {result.source && (
                      <span>
                        来源：{result.source.title}{" "}
                        {result.source.number ? "v" + result.source.number : ""}
                      </span>
                    )}
                    {result.pageCount && <span>{result.pageCount} 页</span>}
                    {result.segments && (
                      <span>
                        {result.segments.length} 段 ·{" "}
                        {duration(result.durationMs)}
                      </span>
                    )}
                    {result.usage && (
                      <span>
                        输入{" "}
                        {result.usage.inputTokens ??
                          result.usage.input_tokens ??
                          "未返回"}{" "}
                        / 输出{" "}
                        {result.usage.outputTokens ??
                          result.usage.output_tokens ??
                          "未返回"}{" "}
                        token
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          {busy && stage && (
            <p className="media-inline-status" role="status">
              {stage}
            </p>
          )}
          {error && (
            <p className="notice warning media-error" role="alert">
              {error}
            </p>
          )}
        </section>
        <aside className="panel media-history">
          <h2>最近处理</h2>
          <p className="help">
            暂存文件和处理结果按账号隔离。管理员可查看全部。
          </p>
          {history.length ? (
            history.map((h) => (
              <button
                key={h.id}
                className={h.id === job?.id ? "active" : ""}
                onClick={() => go("media/" + h.id)}
              >
                <strong>{h.title}</strong>
                <small>
                  {mediaActions.find((a) => a.id === h.action)?.title} ·{" "}
                  {(
                    {
                      queued: "排队中",
                      running: "处理中",
                      succeeded: "已完成",
                      failed: "失败",
                      canceled: "已取消",
                      interrupted: "已中断",
                    } as any
                  )[h.state] || h.state}
                </small>
              </button>
            ))
          ) : (
            <p className="muted">上传一份文件或录音开始。</p>
          )}
        </aside>
      </div>
    </>
  );
}
