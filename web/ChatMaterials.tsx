import { useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { resumeUpload } from "./resumable";
import { normalizeRecording } from "./audio";
import { uid } from "./compat";

type Item = {
  key: string;
  name: string;
  id?: string;
  url?: string;
  percent?: number;
  error?: string;
  file?: File;
};
const supported =
  /\.(html?|pdf|docx|pptx|md|txt|csv|json|png|jpe?g|webp|wav|mp3|m4a|ogg|webm)$/i;
export function useChatMaterials() {
  const [items, set] = useState<Item[]>([]),
    [issue, setIssue] = useState("");
  const current = useRef(items);
  function update(fn: (items: Item[]) => Item[]) {
    current.current = fn(current.current);
    set(current.current);
  }
  function restore(files: any[] = [], urls: string[] = []) {
    update(() => [
      ...files.map((a) => ({ key: a.id, id: a.id, name: a.name })),
      ...urls.map((url) => ({ key: url, name: url, url })),
    ]);
    setIssue("");
  }
  async function upload(key: string, file: File) {
    const patch = (v: Partial<Item>) =>
      update((rows) => rows.map((i) => (i.key === key ? { ...i, ...v } : i)));
    patch({ error: undefined, percent: 0 });
    try {
      const audio = /\.(wav|mp3|m4a|ogg|webm)$/i.test(file.name);
      const prepared = audio ? await normalizeRecording(file, file.name) : file;
      const a = await resumeUpload(prepared, (n) => patch({ percent: n }));
      if (current.current.some((i) => i.key !== key && i.id === a.id)) {
        update((rows) => rows.filter((i) => i.key !== key));
        return;
      }
      patch({ id: a.id, name: a.name, file: undefined, percent: undefined });
    } catch (e: any) {
      patch({ error: e.message, percent: undefined });
    }
  }
  function add(files: File[]) {
    setIssue("");
    for (const file of files) {
      if (!supported.test(file.name)) {
        setIssue(
          file.name + " 格式暂不支持。可添加 HTML、PDF、Word、PPT、文字、图片或录音。",
        );
        continue;
      }
      if (current.current.filter((i) => !i.url).length >= 8) {
        setIssue("每轮最多 8 个文件。");
        break;
      }
      const key = uid();
      update((rows) => [...rows, { key, name: file.name, file, percent: 0 }]);
      void upload(key, file);
    }
  }
  function addUrl(raw: string) {
    let url: URL;
    try {
      url = new URL(raw);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error();
    } catch {
      setIssue("请输入公开的 HTTP 或 HTTPS 网页地址。");
      return;
    }
    const href = url.href;
    if (current.current.some((i) => i.url === href)) return;
    if (current.current.filter((i) => i.url).length >= 4) {
      setIssue("每轮最多 4 个网址。");
      return;
    }
    setIssue("");
    update((rows) => [...rows, { url: href, key: href, name: href }]);
  }
  return {
    items,
    issue,
    restore,
    add,
    addUrl,
    retry: (i: Item) => i.file && upload(i.key, i.file),
    remove: (key: string) =>
      update((rows) => rows.filter((i) => i.key !== key)),
    pending: items.some((i) => !i.id && !i.url),
  };
}
export function ChatMaterials({
  materials,
}: {
  materials: ReturnType<typeof useChatMaterials>;
}) {
  const chooser = useRef<HTMLInputElement>(null);
  return (
    <div className="chat-materials">
      <button
        type="button"
        className="text-link"
        onClick={() => chooser.current?.click()}
      >
        <Paperclip size={16} />
        添加材料
      </button>
      <small>拖入课程文件或粘贴网址；录音随本轮转写。</small>
      <input
        hidden
        ref={chooser}
        type="file"
        multiple
        accept=".html,.htm,.pdf,.docx,.pptx,.txt,.md,.csv,.json,.jpg,.jpeg,.png,.webp,.wav,.mp3,.m4a,.ogg,.webm"
        aria-label="添加对话材料"
        onChange={(e) => {
          materials.add(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
      {materials.items.map((i) => (
        <div className="chat-source-chip" key={i.key}>
          <span>
            {i.name} ·{" "}
            {i.error ||
              (i.id || i.url ? "本轮使用" : "上传 " + i.percent + "%")}
          </span>
          {i.error && (
            <button
              type="button"
              className="text-link"
              onClick={() => materials.retry(i)}
            >
              重试上传
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            aria-label={"移除 " + i.name}
            onClick={() => materials.remove(i.key)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      {materials.issue && <p role="alert">{materials.issue}</p>}
    </div>
  );
}
