/*! MD Editor (Milestone theme values).
MIT License

Copyright (c) 2026 ACKS

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
export const articleProfiles = {
  "milestone-clean-light": {
    name: "清隽阅读 · 浅色",
    bg: "#FBFAF8",
    text: "#2a2722",
    heading: "#23211d",
    accent: "#C2613A",
    titleText: "#23211d",
    thBg: "#f3efe5",
    thText: "#23211d",
    quoteBg: "#FBFAF8",
    quoteBorder: "#C2613A",
    codeBlockBg: "#f5f1e8",
    codeBlockText: "#3a372f",
    bodySize: 18,
    lineHeight: 1.78,
    h1: 36.9,
    h2: 27,
    fontFamily: "'Lora',Georgia,serif",
    headingFamily: "'Source Serif 4','Lora',serif",
  },
  "milestone-business-light": {
    name: "商务报告 · 浅色",
    bg: "#FFFFFF",
    text: "#27313f",
    heading: "#0f1c2e",
    accent: "#1F5FA8",
    titleText: "#0f1c2e",
    thBg: "#f1f5fa",
    thText: "#0f1c2e",
    quoteBg: "#f4f7fb",
    quoteBorder: "#1F5FA8",
    codeBlockBg: "#0a0e13",
    codeBlockText: "#c4cdd9",
    bodySize: 16,
    lineHeight: 1.62,
    h1: 30.4,
    h2: 21.12,
    fontFamily: "'Inter','Noto Sans SC',sans-serif",
    headingFamily: "'Inter',sans-serif",
  },
  "milestone-darkcode-dark": {
    name: "暗夜代码 · 深色",
    bg: "#0b0d12",
    text: "#c2cdda",
    heading: "#eef2f7",
    accent: "#F97316",
    titleText: "#eef2f7",
    thBg: "#13171f",
    thText: "#dde6f0",
    quoteBg: "#11141b",
    quoteBorder: "#F97316",
    codeBlockBg: "#070910",
    codeBlockText: "#d6e1f0",
    bodySize: 15,
    lineHeight: 1.7,
    h1: 25.5,
    h2: 18.75,
    fontFamily: "'Inter','Noto Sans SC',sans-serif",
    headingFamily: "'JetBrains Mono',monospace",
  },
  "milestone-wechat-light": {
    name: "公众号文章 · 浅色",
    bg: "#FFFFFF",
    text: "#3f3f3f",
    heading: "#2c2c2c",
    accent: "#07A35A",
    titleText: "#2c2c2c",
    thBg: "#f5f5f5",
    thText: "#2c2c2c",
    quoteBg: "#f7f7f7",
    quoteBorder: "#07A35A",
    codeBlockBg: "#f8f8f8",
    codeBlockText: "#3a3a3a",
    bodySize: 16.5,
    lineHeight: 1.9,
    h1: 25.575,
    h2: 20.13,
    fontFamily: "'Noto Sans SC',sans-serif",
    headingFamily: "'Noto Sans SC',sans-serif",
  },
  "milestone-magazine-light": {
    name: "杂志随笔 · 浅色",
    bg: "#F7F4EF",
    text: "#2c2823",
    heading: "#1c1a17",
    accent: "#B33A2B",
    titleText: "#1c1a17",
    thBg: "#efe9da",
    thText: "#1c1a17",
    quoteBg: "#F7F4EF",
    quoteBorder: "#B33A2B",
    codeBlockBg: "#f2eee4",
    codeBlockText: "#3a352c",
    bodySize: 18,
    lineHeight: 1.72,
    h1: 38,
    h2: 27.900000000000002,
    fontFamily: "'Lora',Georgia,serif",
    headingFamily: "'Playfair Display',serif",
  },
  "milestone-cnclassic-light": {
    name: "中式古典 · 浅色",
    bg: "#F3ECE0",
    text: "#3a3026",
    heading: "#2a211a",
    accent: "#9E2B25",
    titleText: "#2a211a",
    thBg: "#ebe0cd",
    thText: "#2a211a",
    quoteBg: "#E6DECA",
    quoteBorder: "#9E2B25",
    codeBlockBg: "#eee3d1",
    codeBlockText: "#3a322a",
    bodySize: 18,
    lineHeight: 1.95,
    h1: 38,
    h2: 27,
    fontFamily: "'Noto Serif SC','Songti SC',serif",
    headingFamily: "'Ma Shan Zheng','Noto Serif SC',serif",
  },
} as const;

export const wechatThemeIds = [
  "green",
  "blue",
  "ink",
  "milestone-clean-light",
  "milestone-business-light",
  "milestone-darkcode-dark",
  "milestone-wechat-light",
  "milestone-magazine-light",
  "milestone-cnclassic-light",
] as const;
export type WechatTheme = (typeof wechatThemeIds)[number];

export function articleProfile(id: WechatTheme) {
  return id === "green" || id === "blue" || id === "ink"
    ? undefined
    : articleProfiles[id];
}
