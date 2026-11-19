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
import { upstreamWechatCatalog, upstreamWechatThemeIds, wechatRecipeIds, wechatRecipes } from "./wechat-theme-catalog.js";
export { wechatRecipes, wechatRecipeIds };
export const wechatThemeIds = ["green", "blue", "ink", ...upstreamWechatThemeIds] as const;
export type WechatTheme = (typeof wechatThemeIds)[number];
export type WechatFormat = { recipe?: (typeof wechatRecipeIds)[number]; size?: number; lineHeight?: number; indent?: boolean; decorations?: boolean };
export const wechatThemeCatalog = [
 {id:"green",name:"书院绿",description:"原有稿件版式",collection:"legacy",mode:"light",bg:"#ffffff",text:"#303638",heading:"#23483d",accent:"#23483d",bodySize:16,lineHeight:1.9,paraIndent:false},
 {id:"blue",name:"教育蓝",description:"原有稿件版式",collection:"legacy",mode:"light",bg:"#ffffff",text:"#303638",heading:"#245b91",accent:"#245b91",bodySize:16,lineHeight:1.9,paraIndent:false},
 {id:"ink",name:"简洁黑白",description:"原有稿件版式",collection:"legacy",mode:"light",bg:"#ffffff",text:"#303638",heading:"#292929",accent:"#292929",bodySize:16,lineHeight:1.9,paraIndent:false},
 ...upstreamWechatCatalog,
];
export const wechatThemeLabels = Object.fromEntries(wechatThemeCatalog.map(p=>[p.id,p.name])) as Record<WechatTheme,string>;
export function articleProfile(id: WechatTheme) { return upstreamWechatCatalog.find(p=>p.id===id); }
export const recipeDescriptions:Record<string,string>={default:"保留主题原有版式",tutorial:"步骤编号、代码与清晰引用",opinion:"首段导读与观点结构",data:"编号标题与数据表格",list:"编号、清单与卡片引用",essay:"导读、首行缩进与长文节奏",tech:"代码块、编号与技术说明",news:"导读和简报结构",product:"导读、列表与产品表达"};
