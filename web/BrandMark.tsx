import React from "react";

/** One vector master for the app mark and browser icon. */
export function BrandMark({ size = 42, decorative = false }: { size?: number; decorative?: boolean }) {
  return <img className="brand-symbol" src="/ecustudio-mark.svg" width={size} height={size} alt={decorative ? "" : "EcuStudio 教创工作台"} draggable={false} />;
}
