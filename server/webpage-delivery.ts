import { load } from "cheerio";
import { err } from "./db.js";
import { addUsage, deepseekRequest, newUsage } from "./deepseek.js";
import type { StreamListener } from "./provider-stream.js";

const maxPageChars = 1_500_000;
export { maxPageChars };

export function wantsWebpage(input: any) {
  if (input.target) return input.target.format === "html";
  const prompt = String(input.prompt || "");
  if (
    !/html|网页|网站|页面|单页|H5|落地页|website|web\s?page|landing page/i.test(
      prompt,
    )
  )
    return false;
  if (
    /(?:怎么|如何|怎样).{0,6}(?:做|写|制作|生成).{0,8}(?:网页|页面|HTML)|(?:总结|分析|阅读|搜集|搜索|检索|提取|翻译|介绍|解释).{0,10}(?:网页|网站|HTML)(?!文件)|(?:网页|网站).{0,4}(?:的摘要|的内容|的链接)/i.test(
      prompt,
    ) &&
    !/(?:做成|生成|交付|导出|整理成).{0,12}(?:网页|页面|HTML)/i.test(prompt)
  )
    return false;
  if (
    /(?:只|仅)(?:需|要|输出|展示|给我)*(?:源码|代码)|不要(?:做|生成|制作|交付)(?:成)?(?:网页|网站|文件)|(?:解释|分析|讲解).{0,10}(?:源码|代码)|网页转视频|(?:网页|html).{0,8}(?:转成|转为|做成)视频/i.test(
      prompt,
    )
  )
    return false;
  // Leave mixed deliverables on the existing multi-file tool path.
  if (
    /(?:并|再|同时|以及|和|及|and).{0,10}(?:pptx?|word|docx|pdf)|(?:pptx?|word|docx|pdf)\s*(?:和|及|、|and)\s*(?:html|网页)/i.test(
      prompt,
    )
  )
    return false;
  return /生成|做|制作|交付|写|搭建|创建|改成|改为|变成|转成|转为|整理成|导出|输出|设计|开发|给我|create|build|make|design|generate|export|deliver|\.html\b/i.test(
    prompt,
  );
}

export function htmlDocument(text: string) {
  const start = text.search(/(?:<!doctype\s+html\b[^>]*>\s*)?<html\b/i);
  if (start < 0 || !/<\/html\s*>/i.test(text)) return;
  const candidate = text.slice(start);
  const $ = load(candidate, { sourceCodeLocationInfo: true });
  const end = $("html")[0]?.sourceCodeLocation?.endTag?.endOffset;
  if (!end) return;
  if (
    !$("body").text().trim() &&
    !$("body").find("img,svg,canvas,video,input,button,iframe").length
  )
    return;
  return {
    content: candidate.slice(0, end),
    title: (
      $("title").first().text().trim() ||
      $("h1").first().text().trim() ||
      "网页作品"
    ).slice(0, 100),
  };
}

const direction =
  "本轮要交付可打开的网页文件。直接返回单个完整 HTML 文档，从 <!doctype html> 开始，以 </html> 结束。CSS、交互脚本放在同一文件内，正文可直接阅读。工作台负责预览与下载，不要输出操作教程或文件标记。资料中的事实保留真实来源编号。";
function joinPage(prefix: string, next: string) {
  if (!prefix) return next;
  for (let n = Math.min(1024, prefix.length, next.length); n >= 12; n--)
    if (prefix.endsWith(next.slice(0, n))) return prefix + next.slice(n);
  return prefix + next;
}

// Per turn, including search and citation correction calls. Partial HTML never becomes a chat delta.
export function exploreCompletion(
  input: any,
  progress: any,
  check: () => void,
  signal: AbortSignal,
  transport: typeof fetch,
) {
  const webpage = wantsWebpage(input);
  const usage = newUsage();
  let calls = 0;
  async function request(original: any, listener: StreamListener) {
    let body = original;
    if (webpage) {
      body = {
        ...original,
        messages: original.messages.map((m: any, i: number) =>
          i === 0 ? { ...m, content: m.content + "\n" + direction } : m,
        ),
      };
      if (body.tools)
        body.tools = body.tools.filter(
          (t: any) => t.function?.name !== "deliver_files",
        );
    }
    let partial = "",
      attempts = 0;
    const nativeRecords: any[] = [];
    const annotations: any[] = [];
    for (;;) {
      signal.throwIfAborted();
      check();
      if (++calls > input.config.maxRequests)
        err(
          "BUDGET_EXCEEDED",
          "已用完本任务的模型请求次数，请在设置中增加请求次数后重试。",
          422,
        );
      if (JSON.stringify(body.messages).length > input.config.maxInputChars)
        err(
          "BUDGET_EXCEEDED",
          "本轮资料超过输入预算，请在设置中提高输入上限或减少所选资料。",
          422,
        );
      let streamed = "",
        result: any;
      try {
        result = await deepseekRequest(
          body,
          signal,
          transport,
          (e) => {
            if (webpage && e.text) streamed += e.text;
            else listener(e);
          },
          webpage,
        );
      } catch (error: any) {
        signal.throwIfAborted();
        if (
          !webpage ||
          attempts >= 3 ||
          ![
            "MODEL_STREAM_INTERRUPTED",
            "MODEL_NETWORK_UNAVAILABLE",
            "MODEL_STREAM_FAILED",
            "MODEL_STREAM_TRANSPORT",
          ].includes(error.code)
        )
          throw error;
        result = {
          choices: [
            { message: { content: streamed }, finish_reason: "length" },
          ],
        };
      }
      addUsage(usage, result.usage);
      if (!webpage) return result;
      const choice = result.choices?.[0];
      if (!choice?.message) err("MODEL_EMPTY", "模型未返回网页内容", 502);
      const msg = choice.message;
      const segment = String(msg.content || "");
      const restarted =
        !!partial &&
        /^\s*(?:```html\s*)?(?:<!doctype\s+html|<html\b)/i.test(segment);
      const joined = restarted ? segment : joinPage(partial, segment);
      if (restarted) annotations.length = 0;
      if (joined.length > maxPageChars)
        err("FILE_TOO_LARGE", "网页已超过单文件大小上限，请拆分页面。", 422);
      const offset = Array.from(
        joined.slice(0, joined.length - segment.length),
      ).length;
      for (const ann of msg.annotations || []) {
        const c = ann.url_citation;
        annotations.push(
          c
            ? {
                ...ann,
                url_citation: {
                  ...c,
                  start_index: c.start_index + offset,
                  end_index: c.end_index + offset,
                },
              }
            : ann,
        );
      }
      nativeRecords.push(...(msg.server_tool_calls || []));
      const complete = htmlDocument(joined);
      const declared =
        /(?:^|\n):::ecustudio-files\s+[^\n]*"html"[^\n]*\s*$/.test(joined) &&
        !/<(?:html\b|!doctype\s+html)/i.test(joined);
      if (
        choice.finish_reason !== "length" &&
        (msg.tool_calls?.length || complete || declared)
      ) {
        msg.content = joined;
        if (annotations.length) msg.annotations = annotations;
        if (nativeRecords.length) msg.server_tool_calls = nativeRecords;
        return result;
      }
      if (calls >= input.config.maxRequests)
        err(
          "WEBPAGE_INCOMPLETE",
          "网页未写完整，已达到本任务请求上限；请增加「最多模型请求」后重试。",
          422,
        );
      attempts++;
      const markup = joined.search(/<!doctype\s+html\b|<html\b/i);
      partial = markup >= 0 ? joined.slice(markup) : "";
      if (!partial) annotations.length = 0;
      const remaining =
        input.config.maxInputChars -
        JSON.stringify(original.messages).length -
        direction.length -
        800;
      if (remaining < 500)
        err(
          "BUDGET_EXCEEDED",
          "没有足够的输入空间自动续写，请提高输入上限。",
          422,
        );
      const tail = partial.slice(-Math.min(16000, remaining));
      progress("model", {
        message: partial
          ? "正在自动续写网页，完成后可预览和下载"
          : "正在重新生成完整网页文件",
        round: calls + 1,
      });
      // Never replay unfinished tool arguments, and never execute tools during a continuation.
      body = {
        model: original.model,
        max_tokens: original.max_tokens,
        stream: true,
        stream_options: { include_usage: true },
        thinking: { type: "disabled" },
        messages: [
          ...original.messages,
          {
            role: "user",
            content: tail
              ? "文件已保存到以下末尾。只返回紧接最后一个字符的剩余 HTML，不重复开头，不加代码围栏，完成时闭合 html。\n" +
                tail
              : direction,
          },
        ],
      };
    }
  }
  return { request, usage, webpage };
}

export function webpagePlan(text: string, expected: boolean) {
  if (!expected) return;
  const doc = htmlDocument(text);
  if (doc)
    return {
      text: doc.content,
      fileDrafts: undefined,
      filePlan: { title: doc.title, formats: ["html"] },
    };
}
