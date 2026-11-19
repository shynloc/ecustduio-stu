import { z } from "zod";
export const Kind = z.enum([
  "master",
  "policy",
  "speech",
  "wechat",
  "presentation",
  "storyboard",
]);
export const Block = z.object({
  id: z.string().min(1).max(100),
  title: z.string().max(300).default(""),
  text: z.string().max(30000),
  claimIds: z.array(z.string()).max(100).default([]),
  locked: z.boolean().default(false),
  notes: z.string().max(10000).default(""),
  duration: z.number().min(0).max(7200).optional(),
  scene: z.string().max(2000).optional(),
  camera: z.string().max(2000).optional(),
  prompt: z.string().max(6000).optional(),
});
export const Content = z.object({
  schemaVersion: z.literal("1.0").default("1.0"),
  title: z.string().min(1).max(300),
  blocks: z.array(Block).min(1).max(200),
  unverified: z.array(z.string()).max(100).default([]),
  summary: z.string().max(3000).default(""),
});
export const Scope = z.object({
  domain:z.enum(['policy','teaching','general']).default('policy'),
  subject:z.string().max(100).optional(),
  grade:z.string().max(100).optional(),
  objectives:z.string().max(2000).optional(),
  region: z.string().min(1).max(100).default("北京"),
  district: z.string().max(100).default("全市"),
  stage: z.enum(["中考", "高考", "综合"]).default("中考"),
  year: z.number().int().min(2000).max(2100),
  audience: z.string().max(500).default("北京初三家长"),
});
export const ImportInput = z
  .object({
    url: z.string().url().optional(),
    text: z.string().max(500000).optional(),
    title: z.string().max(300).optional(),
    publisher: z.string().max(200).default("用户提供"),
    published: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
    scope: Scope,
    documentType: z
      .enum(["正式文件", "征求意见", "媒体解读", "历史资料", "待判断"])
      .default("待判断"),
    sourceId: z.string().optional(),
  })
  .refine((v) => v.url || v.text, "请提供网址或原文");
export const Settings = z.object({
  theme: z.enum(["scholar", "obsidian"]).default("scholar"),
  model: z.string().min(1).max(100).default("deepseek-flash"),
  thinkingMode: z.enum(["disabled", "low", "high", "max"]).default("disabled"),
  exploreEngine: z.enum(["native", "controlled"]).default("native"),
  exploreSafetyCheck: z.boolean().default(true),
  maxRequests: z.number().int().min(1).max(20).default(8),
  maxTools: z.number().int().min(1).max(50).default(30),
  timeoutSeconds: z.number().int().min(30).max(1800).default(600),
  maxInputChars: z.number().int().min(5000).max(200000).default(100000),
  maxTokens: z.number().int().min(1024).max(65536).default(8192),
  region: z.string().max(100).default("北京"),
  keywords: z
    .string()
    .max(2000)
    .default("中考,高考,招生,升学,学业,报名,考试,入学,志愿,录取"),
  windowHours: z.number().int().min(1).max(720).default(48),
  scheduleEnabled: z.boolean().default(false),
  scheduleTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default("09:00"),
  weekdaysOnly: z.boolean().default(false),
  autoSend: z.boolean().default(false),
  targetName: z.string().max(200).default(""),
  allowExternalAI: z.boolean().default(false),
});
export type ContentData = z.infer<typeof Content>;
export const DeepSeekSettings = Settings.pick({
  model: true,
  thinkingMode: true,
  exploreEngine: true,
  exploreSafetyCheck: true,
  allowExternalAI: true,
  maxRequests: true,
  maxTools: true,
  timeoutSeconds: true,
  maxInputChars: true,
  maxTokens: true,
}).strict();
export const kindNames: Record<string, string> = {
  master: "基础稿",
  policy: "报告与解读",
  speech: "演讲与口播稿",
  wechat: "公众号图文",
  presentation: "演示 PPT",
  storyboard: "视频脚本",
};
