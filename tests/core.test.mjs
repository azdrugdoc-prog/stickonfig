import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../src/config/index.mjs';
import {alphaMask,edgeBackgroundMask,padMask,cleanupSubjectMatte,dilate,erode} from '../src/core/mask/index.mjs';
import {labelComponents,traceComponentBoundary,polygonArea} from '../src/core/geometry/raster.mjs';
import {contourCommands} from '../src/core/contour/index.mjs';
import {stickerResolution} from '../src/core/dpi/index.mjs';
import {normalizeStickerBuilderManifest} from '../src/production/manifest.mjs';
import {buildStickerProductionPdf,contourSvgForManifest} from '../src/production/pdf.mjs';
import {createJob} from '../src/production/job.mjs';
import {stickerPrice} from '../src/adapters/pricing/example.mjs';
import {holographicPreview} from '../src/core/proof/material.mjs';
import {EndType,FillRule,JoinType,inflatePathsD,unionD,areaD} from 'clipper2-ts';
export const fixture={originalFilename:'synthetic.png',detectedFileType:'png',originalPixelWidth:900,originalPixelHeight:720,renderWidth:1000,renderHeight:800,width:3,height:2.4,quantity:50,cutStyle:'die-cut',perimeterInches:0.1,resolutionInput:{version:1,placedWidth:3,placedHeight:2.4},contour:{curveVersion:3,paths:[[[.1,.1],[.9,.1],[.9,.4],[.5,.4],[.5,.9],[.1,.9]],[[.7,.7],[.9,.7],[.9,.9],[.7,.9]]]}};
test('transparent alpha, concavity and symmetric padded morphology',()=>{
 const w=60,h=40,rgba=new Uint8ClampedArray(w*h*4);
 for(let y=5;y<35;y++)for(let x=0;x<20;x++)if(y<16||x<8)rgba[(y*w+x)*4+3]=255;
 const {mask,hasTransparency}=alphaMask({data:rgba,width:w,height:h});assert.ok(hasTransparency);
 const mirror=Uint8Array.from(mask,(_,i)=>mask[Math.floor(i/w)*w+w-1-i%w]);
 const padding={left:12,right:12,top:12,bottom:12};
 const a=padMask(mask,w,h,padding).mask,b=padMask(mirror,w,h,padding).mask,pw=w+24,ph=h+24;
 const clean=m=>erode(dilate(m,pw,ph),pw,ph);
 const l=clean(a),r=clean(b);assert.deepEqual(l,Uint8Array.from(r,(_,i)=>r[Math.floor(i/pw)*pw+pw-1-i%pw]));
 const {labels,components}=labelComponents(l,pw,ph);assert.equal(components.length,1);
 const path=traceComponentBoundary(labels,components[0],pw,ph);assert.ok(Math.abs(polygonArea(path))<20*30*.8);
});
test('opaque raster edge background and subject-support cleanup',()=>{
 const width=60,height=60,data=new Uint8ClampedArray(width*height*4).fill(255);
 for(let y=10;y<50;y++)for(let x=20;x<40;x++)data.set([30,60,100,255],(y*width+x)*4);
 const mask=edgeBackgroundMask({width,height,data},false);assert.equal(mask[0],0);assert.equal(mask[30*width+30],1);
 const matte=Uint8Array.from(mask,v=>v*255);matte[2*width+2]=80;
 const clean=cleanupSubjectMatte(matte,width,height);assert.equal(clean.mask[30*width+30],1);assert.equal(clean.mask[2*width+2],0);
});
test('physical polygon offsets and near/far component grouping',()=>{
 const a=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
 const close=d=>inflatePathsD(unionD(inflatePathsD([a,a.map(p=>({x:p.x+d,y:p.y}))],.06,JoinType.Round,EndType.Polygon,2,4,.002),FillRule.NonZero),-.06,JoinType.Round,EndType.Polygon,2,4,.002);
 assert.equal(close(1.08).length,1);assert.equal(close(2).length,2);
 assert.ok(Math.abs(areaD(inflatePathsD([a],.1,JoinType.Round,EndType.Polygon)[0]))>1);
});
test('DPI tiers and vector review',()=>{
 for(const [dpi,status,warning] of [[300,'good',false],[250,'acceptable',false],[175,'low',true],[149,'poor',true]]) {
  const d=stickerResolution({type:'png',pixelWidth:dpi*3,pixelHeight:dpi*2,placedWidth:3,placedHeight:2});assert.equal(d.status,status);assert.equal(d.requiresWarning,warning);
 }
 assert.equal(stickerResolution({type:'svg',pixelWidth:10,pixelHeight:10,placedWidth:5,placedHeight:5}).status,'unverified');
});
test('multiple vector CutContour paths, solid quarter-point PDF and physical ratio',()=>{
 const m=normalizeStickerBuilderManifest(fixture);assert.equal(m.contour.commands.length,2);
 const pdf=buildStickerProductionPdf(new Uint8Array([255,216,255,217]),m);const s=new TextDecoder().decode(pdf);
 assert.match(s,/\/Separation \/CutContour/);assert.match(s,/0\.25 w\n\[\] 0 d/);assert.match(s,/MediaBox \[0 0 216\.000 172\.800\]/);
 assert.equal(m.contour.paths.length,2);assert.ok(contourCommands(m.contour.paths,3,2.4).length===2);
 assert.match(contourSvgForManifest(m),/stroke-width="0.25"/);
 assert.throws(()=>normalizeStickerBuilderManifest({...fixture,width:999}));
 assert.throws(()=>normalizeStickerBuilderManifest({...fixture,contour:{points:[[NaN,0],[0,1],[1,1]]}}));
});
test('job contains all eight artifacts and no implicit backend',async()=>{
 const blob=new Blob([new Uint8Array([255,216,255,217])],{type:'image/jpeg'});
 const job=await createJob(fixture,{original:blob,printImage:blob,proof:blob,mask:blob});
 assert.equal(job.artifacts.length,8);assert.equal(job.manifest.production.strokePoints,.25);assert.equal(job.manifest.production.materialEffectInPrintArtwork,false);
 assert.equal(job.manifest.resolution.effectiveDpi,300);assert.equal(job.manifest.production.outputDpi,1000/3);
});
test('configurable pricing and white-only foil simulation',()=>{
 const base={width:3,height:3,quantity:50};const a=stickerPrice(base),b=stickerPrice({...base,material:'holographic'});assert.ok(b.subtotal>a.subtotal);
 const prev=config.pricing.calculate;config.pricing.calculate=()=>({subtotal:99,unitPrice:1.98});assert.equal(stickerPrice(base).subtotal,99);config.pricing.calculate=prev;
 const data=new Uint8ClampedArray([255,255,255,255,20,20,20,255,255,0,0,255]);holographicPreview({data,width:3,height:1});assert.notEqual(data[0],255);assert.deepEqual([...data.slice(4)],[20,20,20,255,255,0,0,255]);
});
