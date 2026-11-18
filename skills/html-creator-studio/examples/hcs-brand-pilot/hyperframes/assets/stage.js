/* HCS VIDEO READY: PURE FRAME-ADDRESSABLE RENDERER
 * Source of time: frame / FPS only. No Math.random, Date.now, CSS animation,
 * Web Animations or requestAnimationFrame are used to determine an image.
 * Preview transport may use requestAnimationFrame merely to advance the frame.
 */
(function(){
  'use strict';
  const FPS = 30, END_FRAME = 1079, DURATION = 36;
  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  if (!stage) throw new Error('Missing visual master stage');
  const scenes = Array.from(document.querySelectorAll('.scene'));
  const clamp = (v,a=0,b=1)=>Math.min(b,Math.max(a,v));
  const sm = (a,b,x)=>{const v=clamp((x-a)/(b-a));return v*v*(3-2*v)};
  const ease = x=>1-Math.pow(1-clamp(x),3);
  const key=(t,a,b)=>ease((t-a)/(b-a));
  const lerp=(a,b,p)=>a+(b-a)*p;
  const sel = (scene,selector)=>scenes[scene].querySelector(selector);
  function animateEl(scene, selector, p, options={}){
    const el=sel(scene,selector); if(!el)return;
    const {dy=70,dx=0,scale=1,delay=0,duration=.7,rotate=0,opacity=1}=options;
    const k=key(p,delay,delay+duration);el.style.opacity=String(k*opacity);
    el.style.transform=`translate3d(${(dx*(1-k)).toFixed(2)}px,${(dy*(1-k)).toFixed(2)}px,0) rotate(${(rotate*(1-k)).toFixed(2)}deg) scale(${lerp(scale,1,k).toFixed(4)})`;
  }
  function renderAtTime(requestedSeconds){
    let t=clamp(Number(requestedSeconds)||0,0,DURATION-1/FPS);const frame=Math.min(END_FRAME,Math.round(t*FPS));
    stage.dataset.theme=(t<11.6 || (t>=23.5 && t<29.6))?'paper':'night';
    scenes.forEach((sc,i)=>{
      const start=i*6;
      const fadeIn=i===0?1:sm(start-.58,start+.05,t);
      const fadeOut=i===5?1:1-sm(start+5.35,start+6,t);
      const opacity=clamp(fadeIn*fadeOut);
      sc.style.opacity=String(opacity);
      sc.style.zIndex=String(i);
      sc.style.visibility=opacity<=.0001?'hidden':'visible';
    });
    let p=clamp(t,0,6);
    animateEl(0,'.intro-eyebrow',p,{delay:.15,duration:.7,dy:28});
    animateEl(0,'.intro-title',p,{delay:.25,duration:1.05,dy:92,scale:.95});
    animateEl(0,'.intro-caption',p,{delay:.9,duration:.8,dy:45});
    sel(0,'.intro-underline').style.transform=`scaleX(${key(p,.8,2.5).toFixed(4)})`;
    const orb=sel(0,'.intro-rings');
    orb.style.transform=`rotate(${(-35+p*16).toFixed(3)}deg) scale(${lerp(.85,1.03,key(p,.25,2.8)).toFixed(3)})`;
    orb.style.opacity=String(key(p,.25,1.3));
    sel(0,'.orb-dot').style.transform=`translate(${(15*Math.cos(p)).toFixed(3)}px,${(19*Math.sin(p*.75)).toFixed(3)}px)`;
    // 02: information decomposition
    p=clamp(t-6,0,6);
    animateEl(1,'.s1-title',p,{delay:.05,duration:.85,dy:55});
    animateEl(1,'.document-stack',p,{delay:.4,duration:1.1,dy:40,dx:-125,rotate:-8});
    animateEl(1,'.convert-connector',p,{delay:1,duration:.7,dx:-40});
    const path=sel(1,'#connect-path');path.style.strokeDasharray='600';path.style.strokeDashoffset=String(Math.round(600*(1-key(p,1.15,3))));
    animateEl(1,'.visual-modules',p,{delay:1.3,duration:1,dx:135,scale:.92});
    Array.from(sel(1,'.bars').children).forEach((bar,i)=>{bar.style.transformOrigin='bottom';bar.style.transform=`scaleY(${key(p,1.8+i*.2,3.5+i*.15).toFixed(3)})`});
    animateEl(1,'.s1-bottom',p,{delay:2.15,duration:.7,dy:30});
    // 03: visual direction
    p=clamp(t-12,0,6);
    animateEl(2,'.direction-kicker',p,{delay:0,duration:.6,dy:25});
    animateEl(2,'.direction-head',p,{delay:.22,duration:1,dy:82});
    const cards=sel(2,'.art-cards').children;
    Array.from(cards).forEach((el,i)=>{
      const k=key(p,.7+i*.25,2.1+i*.25);
      el.style.opacity=String(k);
      el.style.transform=`translateY(${(95*(1-k)).toFixed(3)}px) rotateX(${(-12*(1-k)+1.8*Math.sin(p*.45+i)).toFixed(3)}deg)`;
    });
    animateEl(2,'.direction-footer',p,{delay:1.7,duration:.9,dy:29});
    // 04: deterministic timeline — playhead source is local time
    p=clamp(t-18,0,6);
    animateEl(3,'.motion-tag',p,{delay:.08,duration:.7,dy:26});
    animateEl(3,'.motion-title',p,{delay:.16,duration:.95,dy:68});
    animateEl(3,'.motion-description',p,{delay:.7,duration:.65,dy:29});
    animateEl(3,'.timeline',p,{delay:.9,duration:.85,dy:95,scale:.97});
    const playhead=sel(3,'.playhead');
    playhead.style.left=`${(205+1224*clamp((p-.9)/4.7)).toFixed(2)}px`;
    Array.from(sel(3,'.timeline').querySelectorAll('.track-bar')).forEach((bar,i)=>{
      const k=key(p,1.1+i*.22,2.9+i*.15);
      bar.style.transformOrigin='left';bar.style.transform=`scaleX(${k.toFixed(3)})`;
    });
    animateEl(3,'.motion-sublabel',p,{delay:1.7,duration:.7,dy:22});
    // 05: editing before video handoff
    p=clamp(t-24,0,6);
    animateEl(4,'.edit-title',p,{delay:.05,duration:.8,dy:60});
    animateEl(4,'.fake-editor',p,{delay:.65,duration:.9,dy:90,scale:.96});
    animateEl(4,'.fake-controls',p,{delay:1.2,duration:.75,dx:100});
    const box=sel(4,'.selected-element');
    box.style.transform=`translateX(${(key(p,3.0,4.65)*24).toFixed(2)}px) scale(${(1-.045*key(p,3.0,4.6)).toFixed(3)})`;
    box.querySelector('h3').innerHTML=p>=3.75?'BUILD <b>REMARKABLE.</b>':'BUILD <b>BEAUTIFUL.</b>';
    box.querySelector('h3').style.fontSize=p>=3.75?'61px':'67px';
    const sliderA=sel(4,'#fontsize-progress'); const sliderB=sel(4,'#fontsize-knob');
    const slidePct=55-22*key(p,2.7,4.7);sliderA.style.width=`${slidePct}%`;sliderB.style.left=`${slidePct-2}%`;
    sel(4,'#speed-progress').style.width=`${(35+34*key(p,2.9,4.4)).toFixed(2)}%`;
    sel(4,'#speed-knob').style.left=`${(33+34*key(p,2.9,4.4)).toFixed(2)}%`;
    const cursor=sel(4,'.fake-cursor');cursor.style.transform=`translate3d(${(-455*key(p,1.5,3.2)).toFixed(2)}px,${(-85*key(p,1.5,3.2)).toFixed(2)}px,0)`;
    animateEl(4,'.edit-caption',p,{delay:1.7,duration:.7,dy:33});
    // 06: handoff for both media
    p=clamp(t-30,0,6);
    animateEl(5,'.outro-kicker',p,{delay:.08,duration:.65,dy:22});
    animateEl(5,'.outro-title',p,{delay:.24,duration:.95,dy:85,scale:.97});
    Array.from(sel(5,'.deliverables').children).forEach((el,i)=>{
      const k=key(p,1.0+i*.35,2.1+i*.35);
      el.style.opacity=String(k);
      el.style.transform=`translateY(${(90*(1-k)).toFixed(3)}px) scale(${lerp(.93,1,k).toFixed(3)})`;
    });
    animateEl(5,'.outro-footer',p,{delay:2.5,duration:1,dy:40});
    const ix=Math.min(5,Math.floor((t+.25)/6));
    $('stageCurrent').textContent=String(ix+1).padStart(2,'0');
    $('stageTime').textContent=`00:${String(Math.floor(t)).padStart(2,'0')}`;
    stage.dataset.frame=String(frame);stage.dataset.time=t.toFixed(3);
    return {frame,timeSeconds:t,sceneId:`S${String(ix+1).padStart(2,'0')}`};
  }
  function renderAtFrame(frame){ return renderAtTime(clamp(Math.round(Number(frame)||0),0,END_FRAME)/FPS); }
  window.HCS={FPS,DURATION,END_FRAME,renderAtFrame,renderAtTime,getFrame:()=>Number(stage.dataset.frame)};
  renderAtFrame(0);
})();
