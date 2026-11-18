import PptxGenJS from 'pptxgenjs';
import { imageSize } from 'image-size';
import type { VisualMaster,VisualAsset } from '../shared/visual.js';
import {sceneAssets} from '../shared/visual-edit.js';
export async function writeVisualPresentation(master:VisualMaster,target:string,copyHash:string,snapshot?: (index:number)=>Promise<Buffer>){
 const ppt=new ((PptxGenJS as any).default||PptxGenJS)();ppt.layout='LAYOUT_WIDE';ppt.author='EcuStudio';ppt.title=master.title;ppt.lang='zh-CN';
 const family=process.platform==='darwin'?(master.design.font==='serif'?'Songti SC':'PingFang SC'):(master.design.font==='serif'?'SimSun':'Microsoft YaHei');
 ppt.theme={headFontFace:family,bodyFontFace:family,lang:'zh-CN'};
 const bg=master.design.background.slice(1),fg=master.design.foreground.slice(1),accent=master.design.accent.slice(1);
 const image=(slide:any,asset:VisualAsset,x:number,y:number,w:number,h:number)=>{const size=imageSize(Buffer.from(asset.data.split(',')[1],'base64')),scale=Math.min(w/size.width!,h/size.height!);const iw=size.width!*scale,ih=size.height!*scale;slide.addImage({data:asset.data,x:x+(w-iw)/2,y:y+(h-ih)/2,w:iw,h:ih});};
 for(const original of master.scenes){
  const s={...original,items:['steps','comparison'].includes(original.layout||'auto')?original.items:[],table:original.layout==='table'?original.table:undefined};
  const slide=ppt.addSlide();slide.background={color:bg};
  if(snapshot)slide.addImage({data:'image/png;base64,'+(await snapshot(s.index)).toString('base64'),x:0,y:0,w:13.333,h:7.5});
  else{
   const layout=s.layout||'auto',assets=sceneAssets(master,s),picture=assets.length>0;
   const left=layout==='image-left'&&picture?5.3:.95,right=layout==='image-left'||layout==='image-right',width=picture?(right?7.1:8.0):11.4;
   slide.addShape(ppt.ShapeType.rect,{x:.55,y:.55,w:.09,h:6.3,line:{color:accent},fill:{color:accent}});
   slide.addText(`${String(s.index+1).padStart(2,'0')} / ${master.scenes.length} · ${master.title}`,{x:.95,y:.55,w:11.4,h:.4,fontSize:12,color:accent,margin:0,fit:'shrink'});
   slide.addText(s.title,{x:.95,y:layout==='title'?1.4:1.1,w:11.4,h:1,fontSize:layout==='title'?40:29,bold:true,align:layout==='title'?'center':'left',color:fg,margin:0,fit:'shrink'});
   const extras=!!s.items?.length||!!s.table?.headers.length,bodyY=layout==='title'?2.8:2.3,bodyH=extras?1.1:3.8;
   if(layout==='quote')slide.addShape(ppt.ShapeType.rect,{x:left,y:bodyY,w:.05,h:bodyH,line:{color:accent},fill:{color:accent}});
   slide.addText(s.text,{x:left+(layout==='quote'?.2:0),y:bodyY,w:width-(layout==='quote'?.2:0),h:bodyH,fontSize:layout==='quote'?26:23,align:layout==='title'?'center':'left',color:fg,margin:0,fit:'shrink',paraSpaceAfterPt:8});
   if(s.items?.length){
    const cols=layout==='comparison'?2:1,rows=Math.ceil(s.items.length/cols),gap=.12,height=Math.min(.72,(2.65-(rows-1)*gap)/rows);
    s.items.forEach((item,index)=>{const x=left+index%cols*(width/cols+.02),y=3.55+Math.floor(index/cols)*(height+gap),w=width/cols-.12;
     slide.addShape(ppt.ShapeType.roundRect,{x,y,w,h:height,rectRadius:.08,line:{color:accent,transparency:65},fill:{color:accent,transparency:92}});
     slide.addText(String(index+1),{x:x+.12,y:y+.08,w:.32,h:height-.12,fontSize:16,bold:true,color:accent,margin:0,fit:'shrink'});
     slide.addText(item,{x:x+.58,y:y+.08,w:w-.7,h:height-.12,fontSize:18,color:fg,margin:0,fit:'shrink'});
    });
   }
   if(s.table?.headers.length){const rows=[s.table.headers.map(text=>({text,options:{bold:true,color:bg,fill:accent}})),...s.table.rows];slide.addTable(rows,{x:left,y:3.55,w:width,h:2.7,fontSize:14,color:fg,margin:.06,border:{type:'solid',color:accent,pt:.5},autoPage:false,colW:Array(s.table.headers.length).fill(width/s.table.headers.length),rowH:2.7/(s.table.rows.length+1)});}
   if(picture){const x=layout==='image-left'?.95:(right?8.6:9.35),w=right?3.7:3.0;image(slide,assets[0],x,2.3,w,3.7);if(assets.length>1&&s.motion!=='sequence')assets.slice(1,4).forEach((a,i)=>image(slide,a,x+i*w/3,5.65,w/3,.65));}
   slide.addText(`研究草稿 · 版本 ${copyHash.slice(0,8)} · ${s.claimIds.length} 项事实引用${s.edited?' · 本页文案已编辑，待复核':''}`,{x:.95,y:6.75,w:11.4,h:.3,fontSize:10,color:fg,margin:0,fit:'shrink'});
  }
  const evidence=s.claimIds.map(id=>master.evidence?.find(c=>c.id===id)).filter(Boolean).map(c=>`${c!.quote}\n${c!.title} · ${c!.paragraphId} · ${c!.url}`).join('\n');
  slide.addNotes(`${s.notes}\n\n完整文案：${s.text}\n步骤：${s.items?.join('；')||''}\n表格：${s.table?[s.table.headers,...s.table.rows].map(row=>row.join(' | ')).join('\n'):''}\n配音稿：${s.narration}\n事实依据：${evidence||s.claimIds.join('、')}\n${master.sources.map(x=>x.title+' '+x.url).join('\n')}\n${snapshot?'页面为外观快照，主体不可编辑。':'文字、基础图形和表格可编辑；配图是媒体对象。'}`);
 }
 await ppt.writeFile({fileName:target});
}
