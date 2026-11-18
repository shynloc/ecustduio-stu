import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createCanvas,DOMMatrix,ImageData,Path2D} from '@napi-rs/canvas';
globalThis.DOMMatrix=DOMMatrix;globalThis.ImageData=ImageData;globalThis.Path2D=Path2D;
const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
const input=process.argv[2],out=process.argv[3];mkdirSync(out,{recursive:true});
const task=pdfjs.getDocument({data:new Uint8Array(readFileSync(input)),useSystemFonts:true});const doc=await task.promise;
for(let pageNumber=1;pageNumber<=doc.numPages;pageNumber++){const page=await doc.getPage(pageNumber),viewport=page.getViewport({scale:1.6}),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvasContext:canvas.getContext('2d'),viewport,canvas}).promise;writeFileSync(join(out,'page-'+pageNumber+'.png'),canvas.toBuffer('image/png'));}
console.log(JSON.stringify({pages:doc.numPages,input,out}));await task.destroy();
