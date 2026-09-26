import config from '../config/index.mjs';
import { normalizeStickerBuilderManifest } from './manifest.mjs';
import { buildStickerProductionPdf, contourSvgForManifest } from './pdf.mjs';
import { stickerPrice } from '../adapters/pricing/example.mjs';
export async function createJob(input, {original,printImage,proof,mask}) {
  const manifest=normalizeStickerBuilderManifest(input);
  const id=crypto.randomUUID();
  manifest.product='custom-sticker';manifest.id=id;manifest.createdAt=new Date().toISOString();
  manifest.pricing=stickerPrice(manifest);
  manifest.production={spotColorName:'CutContour',strokePoints:0.25,solid:true,material:manifest.material,
    materialEffectInPrintArtwork:false,enhancementPending:manifest.enhanceResolution,
    outputDpi:Math.min(manifest.renderWidth/manifest.width,manifest.renderHeight/manifest.height),
    sourceArtworkRetained:true,requiresRipVerification:true};
  const json=data=>new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const artifacts=[
    {kind:'original',filename:'original-'+manifest.originalFilename,blob:original},
    {kind:'normalized-print',filename:'normalized-print.jpg',blob:printImage},
    {kind:'proof',filename:'customer-proof.png',blob:proof},
    {kind:'mask',filename:'foreground-mask.png',blob:mask},
    {kind:'contour-svg',filename:'cut-contour.svg',blob:new Blob([contourSvgForManifest(manifest)],{type:'image/svg+xml'})},
    {kind:'contour-json',filename:'cut-contour.json',blob:json(manifest.contour)},
    {kind:'production-pdf',filename:'production-CutContour.pdf',blob:new Blob([buildStickerProductionPdf(new Uint8Array(await printImage.arrayBuffer()),manifest)],{type:'application/pdf'})}
  ];
  for(const a of artifacts)if(!(a.blob instanceof Blob)||a.blob.size===0)throw Error('Missing artifact: '+a.kind);
  manifest.artifacts=artifacts.map(({kind,filename,blob})=>({kind,filename,bytes:blob.size,contentType:blob.type}));
  artifacts.push({kind:'manifest',filename:'job-manifest.json',blob:json(manifest)});
  return {id,manifest,artifacts};
}
