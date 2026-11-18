export const mediaActions = [
  {
    id: "document",
    title: "文档解析",
    description: "阅读 PDF、Word、PPT、表格和文本文档，整理为创作资料",
    accept: ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.json",
  },
  {
    id: "ocr",
    title: "云端文字识别",
    description: "按页识别文档、图片和扫描 PDF，保留原文记录",
    accept:
      ".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff",
  },
  {
    id: "vision",
    title: "图像理解",
    description: "读懂截图、图表和画面，提取信息或形成创作建议",
    accept: ".png,.jpg,.jpeg,.webp,.gif",
  },
  {
    id: "asr",
    title: "录音转文字",
    description: "录音、采访和讲解转写，长音频自动分段，最长 20 分钟",
    accept: "audio/*,.m4a,.mp3,.wav,.ogg,.webm,.mp4",
  },
  {
    id: "tts",
    title: "文字配音",
    description: "把口播版本、笔记、对话回答或自填文字合成为 WAV",
    accept: "",
  },
] as const;
export const voiceNames = { stella: "海星 · 女声", tide: "暗潮 · 男声" };
export const billingCharacters = (value: string) =>
  Array.from(value).reduce(
    (n, c) => n + (/\p{Script=Han}/u.test(c) ? 2 : 1),
    0,
  );
