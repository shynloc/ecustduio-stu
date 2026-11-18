import React from 'react';
import {Composition} from 'remotion';
import {VideoMaster} from './VideoMaster';
import {MASTER} from './generated/master';

export const RemotionRoot: React.FC = () => {
  const timeline = MASTER.timeline;
  const horizontal = MASTER.tokens.viewport as {width:number;height:number;portrait?:{width:number;height:number}};
  // 9:16 has its own composition-specific CSS layout, not a center crop.
  return <>
    <Composition
      id="HCS-Landscape" component={VideoMaster}
      durationInFrames={timeline.durationFrames} fps={timeline.fps}
      width={horizontal.width} height={horizontal.height}
      defaultProps={{profile:'landscape'}}
    />
    {MASTER.hasPortrait && <Composition
      id="HCS-Portrait" component={VideoMaster}
      durationInFrames={timeline.durationFrames} fps={timeline.fps}
      width={horizontal.portrait?.width ?? 1080} height={horizontal.portrait?.height ?? 1920}
      defaultProps={{profile:'portrait'}}
    />}
  </>;
};
