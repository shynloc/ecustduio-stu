import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {MASTER, STAGE_MARKUP} from './generated/master';
import {frameCSS, markupAtFrame, sceneAtFrame} from './generated/frame-styles.mjs';
import './generated/stage.css';
import './generated/portrait.css';

type Profile = 'landscape'|'portrait';
interface VideoMasterProps {profile:Profile}

/**
 * Real frame-driven React Composition. No iframe, captured MP4, scroll event,
 * React useEffect, Date.now(), or free-running CSS animation is involved.
 * Stage markup and CSS are adapted from the approved HTML visual master.
 * Dynamic styling is calculated by the same pure function as the HTML preview.
 */
export const VideoMaster: React.FC<VideoMasterProps> = ({profile}) => {
  const frame = useCurrentFrame();
  const {width,height} = useVideoConfig();
  const {timeline,storyboard,tokens,preset} = MASTER;
  const portrait = profile === 'portrait';
  const canvas = tokens.viewport as {width:number;height:number;portrait?:{width:number;height:number}};
  const layoutWidth = portrait ? (canvas.portrait?.width ?? 1080) : canvas.width;
  const layoutHeight = portrait ? (canvas.portrait?.height ?? 1920) : canvas.height;
  const scale = Math.min(width / layoutWidth, height / layoutHeight);
  const offsetX = (width - layoutWidth * scale) / 2;
  const offsetY = (height - layoutHeight * scale) / 2;
  const css = useMemo(() => frameCSS(frame,timeline,storyboard,tokens,preset),[frame,timeline,storyboard,tokens,preset]);
  const markup = useMemo(() => markupAtFrame(STAGE_MARKUP,frame,timeline,preset),[frame,timeline,preset]);
  const scene = sceneAtFrame(frame,timeline);
  const background = scene.visualMode === 'paper' ? tokens.colors.paper : tokens.colors.night;
  return <AbsoluteFill style={{backgroundColor:background,overflow:'hidden'}}>
    <div className={portrait?'hcs-portrait':'hcs-landscape'} style={{
      position:'absolute',left:offsetX,top:offsetY,width:layoutWidth,height:layoutHeight,
      transformOrigin:'top left',transform:`scale(${scale})`,overflow:'hidden'
    }}>
      <div dangerouslySetInnerHTML={{__html:markup}} />
      <style>{css}</style>
    </div>
  </AbsoluteFill>;
};
