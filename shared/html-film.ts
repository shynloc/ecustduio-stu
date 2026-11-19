import { z } from "zod";
export const HtmlFilmOptions = z
  .object({
    mode: z.enum(["original", "storyboard"]).default("original"),
    aspect: z.enum(["landscape", "portrait", "square"]).default("landscape"),
    seconds: z.number().int().min(1).max(600).default(10),
    narrated: z.boolean().default(false),
  })
  .strict();
export function htmlFilmIntent(
  prompt: string,
  previous?: Partial<z.infer<typeof HtmlFilmOptions>>,
) {
  const positive = prompt.replace(
    /(?:不要|不用|无需|不必|不做|不需要|不)(?:再|做|加|生成|使用)?(?:重新编排|重新排版|重排|分镜|配音|旁白)/g,
    "",
  );
  const duration = prompt.match(/(\d+|[一二两三四五六七八九十]+)\s*(分钟|秒)/);
  function number(s: string) {
    if (/^\d+$/.test(s)) return Number(s);
    s = s.replace(/两/g, "二");
    const n = "零一二三四五六七八九";
    const [a, b] = s.split("十");
    return b !== undefined
      ? (a ? n.indexOf(a) : 1) * 10 + (b ? n.indexOf(b) : 0)
      : n.indexOf(s);
  }
  return HtmlFilmOptions.parse({
    mode: /重新编排|重新排版|重排|分镜/.test(positive)
      ? "storyboard"
      : /原样|原网页|保留|不.{0,4}(?:分镜|重排|重新编排)/.test(prompt)
        ? "original"
        : previous?.mode || "original",
    aspect: /竖屏|9[:：]16/.test(prompt)
      ? "portrait"
      : /方形|1[:：]1/.test(prompt)
        ? "square"
        : /横屏|16[:：]9/.test(prompt)
          ? "landscape"
          : previous?.aspect || "landscape",
    seconds: duration
      ? number(duration[1]) * (duration[2] === "分钟" ? 60 : 1)
      : (previous?.seconds ?? 10),
    narrated: /无声|静音|(?:不要|不用|无需|不需要)(?:加)?(?:配音|旁白)/.test(
      prompt,
    )
      ? false
      : /配音|旁白|朗读/.test(positive) || previous?.narrated || false,
  });
}
