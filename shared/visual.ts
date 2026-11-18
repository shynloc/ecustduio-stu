import { z } from 'zod';
import { SceneList, type EditableScene } from './visual-edit.js';

export const VisualDesign = z.object({
  name: z.string().min(1).max(120), rationale: z.string().max(1600),
  layout: z.enum(['editorial', 'cards', 'timeline', 'comparison']),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  foreground: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  font: z.enum(['serif', 'sans-serif']), density: z.enum(['spacious', 'compact']),
}).strict();
export const VisualOutputs = z.enum(['html', 'pptx', 'pdf', 'gif', 'mp4']);
export const VisualExport = z.object({
  copyHash: z.string().min(1), visualHash: z.string().min(1),
  approveCopy: z.literal(true), approveVisual: z.literal(true),
  outputs: z.array(VisualOutputs).min(1).max(5),
  aspect: z.enum(['portrait', 'landscape','square']).default('landscape'),
  duration: z.number().int().min(10).max(120).default(45),
  voice: z.enum(['stella', 'tide', 'none']).default('stella'),
  pptMode: z.enum(['editable', 'snapshot']).default('editable'),
  gifSceneIds: z.array(z.string().max(200)).min(1).max(6).optional(),
  useSceneDurations:z.boolean().default(false),speed:z.number().min(.7).max(1.5).default(1),
  subtitles:z.enum(['off','scene','sentence']).default('scene'),
  transition:z.enum(['cut','fade','slide']).default('cut'),
  musicAssetId:z.string().max(120).optional(),musicVolume:z.number().min(0).max(.4).default(.12),
}).strict();
export const VisualCreate = z.object({
  versionId: z.string().min(1).max(100), designBrief: z.string().max(3000).default('清晰可读，适配网页、演示、动图和视频'),
  duration: z.number().int().min(10).max(120).default(45),
  assetIds: z.array(z.string().max(100)).max(8).default([]),
}).strict();
export const VisualRevision = z.object({
  visualHash: z.string().min(1), design: VisualDesign,
  assetIds: z.array(z.string().max(100)).max(8).default([]),
  scenes:SceneList.optional(),
}).strict();

export type Scene = {
  id: string; blockId: string; title: string; text: string; notes: string;
  claimIds: string[]; narration: string; index: number;
} & Partial<Omit<EditableScene,'id'|'blockId'|'title'|'text'|'notes'|'claimIds'|'narration'>> & {edited?:boolean};
export type VisualAsset = { id: string; hash: string; name: string; mime: string; data: string; frames?: {data:string;durationMs:number}[] };
export type VisualMaster = {
  schemaVersion: '2.0'; title: string; summary: string; scenes: Scene[];
  design: z.infer<typeof VisualDesign>; assets: VisualAsset[];
  sources: { id: string; title: string; url: string }[]; unverified: string[];
  evidence?: {id:string;quote:string;snapshotId:string;paragraphId:string;title:string;url:string}[];
};

// Preserve every character and source ID while paginating, including conditions and exceptions.
export function paginateText(text: string, limit = 180): string[] {
  const chars = Array.from(text || '');
  const parts: string[] = [];
  while (chars.length) {
    let count = Math.min(limit, chars.length);
    if (chars.length > limit) {
      for (let i = count - 1; i >= Math.floor(limit * .55); i--)
        if (/[。！？；\n]/.test(chars[i])) { count = i + 1; break; }
    }
    parts.push(chars.splice(0, count).join(''));
  }
  return parts.length ? parts : [''];
}
export function buildVisualMaster(copy: any, design: any, sources: any[] = [], assets: VisualAsset[] = []): VisualMaster {
  const scenes: Scene[] = [];
  for (const block of copy.blocks || []) {
    const parts = paginateText(String(block.text || ''));
    parts.forEach((text, part) => scenes.push({
      id: `${block.id}:${part}`, blockId: block.id, index: scenes.length,
      title: block.title + (part ? ' · 续' : ''), text,
      notes: block.notes || '', claimIds: block.claimIds || [],
      narration: (part ? '' : block.title + '。') + text.replace(/\[S\d+\]/g, ''),
    }));
  }
  if (!scenes.length || scenes.length > 80) throw new Error('视觉项目需要 1–80 页内容，请在创作项目中拆分过长稿件');
  return { schemaVersion: '2.0', title: copy.title, summary: copy.summary || '', scenes,
    design: VisualDesign.parse(design), assets, sources: sources.map(s => ({ id: s.id, title: s.title, url: s.url })),
    unverified: copy.unverified || [] };
}
