import React,{useEffect,useRef,useState} from 'react';
export function VisualPreview({mode,aspect,src,frame,onLoad}:any){
 const box=useRef<HTMLDivElement>(null),[width,setWidth]=useState(1);
 useEffect(()=>{const observer=new ResizeObserver(entries=>setWidth(entries[0].contentRect.width));if(box.current)observer.observe(box.current);return()=>observer.disconnect()},[]);
 const stage=mode==='slides'||mode==='video',mobile=mode==='mobile';
 const w=mobile?390:mode==='video'&&aspect!=='landscape'?720:1280,h=mobile?620:mode==='video'&&aspect==='portrait'?1280:720,scale=width/w;
 const fixed=stage||mobile;
 return <div ref={box} className={'wf-preview visual-live-preview'+(mobile?' mobile':'')} style={fixed?{height:width*h/w}:undefined}>
  <iframe ref={frame} title="共享视觉预览" sandbox="allow-scripts" src={src} onLoad={onLoad} style={fixed?{position:'absolute',width:w,height:h,transform:`scale(${scale})`,transformOrigin:'top left'}:{height:'100%'}}/>
 </div>;
}
