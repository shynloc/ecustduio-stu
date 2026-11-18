import {z} from 'zod';
import {Scope} from './schema.js';
export const outputNames={policy:'政策解读',wechat:'公众号图文',speech:'口播稿',presentation:'讲座PPT',storyboard:'视频分镜',html:'视觉网页',video:'配音视频',gif:'动态图卡'};
export const Output=z.enum(['policy','wechat','speech','presentation','storyboard','html','video','gif']);
export const PlanInput=z.object({prompt:z.string().trim().min(3).max(10000),revisionOf:z.string().max(100).optional(),snapshotIds:z.array(z.string().max(100)).max(20).default([]),scope:Scope,outputs:z.array(Output).max(8).default([]),duration:z.number().int().min(10).max(120).default(45)}).strict();
export const WorkflowPlan=z.object({status:z.enum(['ready','needs-material']).default('ready'),slideCount:z.number().int().min(1).max(80).default(8),title:z.string().min(1).max(200),optimizedPrompt:z.string().min(3).max(10000),snapshotIds:z.array(z.string().max(100)).max(20),scope:Scope,outputs:z.array(Output).min(1).max(8),duration:z.number().int().min(10).max(120).default(45),steps:z.array(z.string().max(500)).max(12).default([]),assumptions:z.array(z.string().max(500)).max(10).default([]),designBrief:z.string().max(3000).default('由AI根据资料设计，清晰可读，适配手机')}).strict();
export const ExecuteInput=z.object({planJobId:z.string().max(100),plan:WorkflowPlan,revisionOf:z.string().max(100).optional()}).strict();
