import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {serve} from '../scripts/serve.mjs';
import {animatedGif} from './fixtures.mjs';
import {checkPdfImport} from './pdf-import.mjs';
import {checkArtworkEditing} from './editing-browser.mjs';
const out='test-results';fs.mkdirSync(out,{recursive:true});
const server=await serve({port:0,basePath:'/embedded/'});
const base=`http://127.0.0.1:${server.address().port}/embedded`;
const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{ });
const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
page.setDefaultTimeout(45000);
page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message)});
const ready=()=>page.waitForFunction(()=>window.__stickonfigDebug?.contourPaths.length&&!document.querySelector('#builder-add').disabled,null,{timeout:120000});
async function upload(svg,name='synthetic.svg') {console.log('Upload:',name);await page.locator('#builder-file').setInputFiles({name,mimeType:'image/svg+xml',buffer:Buffer.from(svg)});await ready();}
async function change(action) {const g=await page.evaluate(()=>window.__stickonfigDebug?.geometry.generation);await action();await page.waitForFunction(g=>window.__stickonfigDebug?.geometry.generation>g&&!document.querySelector('#builder-add').disabled,g,{timeout:120000});}
try {
 await page.goto(base+'/?debug=1');
 await page.locator('#sticker-builder-app[data-ready=true]').waitFor();
 await upload(fs.readFileSync('public/samples/constellation.svg','utf8'));
 assert.equal(await page.locator('#builder-enhance').isVisible(),false);
 assert.equal(await page.locator('.builder-material-grid').evaluate(e=>e.closest('fieldset').previousElementSibling.querySelector('legend').textContent),'Cut style');
 await page.screenshot({path:out+'/desktop.png',fullPage:true});
 console.log('Desktop proof screenshot complete');
 if(process.env.UPDATE_SCREENSHOT==='1') {
  fs.mkdirSync('docs/assets',{recursive:true});
  await page.setViewportSize({width:1440,height:2050});
  await page.screenshot({path:'docs/assets/configurator.png'});
  await page.setViewportSize({width:1440,height:1100});
 }
 await page.locator('#builder-custom-size').click();await ready();
 console.log('Testing dimensions');
 await change(()=>page.locator('#builder-width').fill('3'));
 const ratio=await page.evaluate(()=>window.__stickonfigDebug.geometry.isolatedArtAspectRatio);
 assert.ok(Math.abs(Number(await page.locator('#builder-width').inputValue())/Number(await page.locator('#builder-height').inputValue())-ratio)<.001);
 await change(()=>page.locator('[data-dimension=width][data-size-step="1"]').click());assert.equal(Number(await page.locator('#builder-width').inputValue()),3.25);
 await change(()=>page.locator('[data-dimension=height][data-size-step="1"]').click());
 await change(()=>page.locator('#builder-lock-ratio').uncheck());const height=await page.locator('#builder-height').inputValue();
 await change(()=>page.locator('[data-dimension=width][data-size-step="-1"]').click());assert.equal(await page.locator('#builder-height').inputValue(),height);
 for(const shape of ['circle','oval','rectangle','rounded-rectangle','square','bumper','die-cut']) {
  console.log('Shape:',shape);
  await change(()=>page.locator(`[name=cutStyle][value="${shape}"]`).check({force:true}));
  const geom=await page.evaluate(()=>window.__stickonfigDebug.geometry);assert.ok(geom.contourBounds.minX>=0&&geom.contourBounds.maxX<=1);
 }
 await page.locator('[name=material][value=holographic]').check({force:true});assert.equal(await page.locator('#builder-border-label').innerText(),'Holographic border');
 await upload('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect x="20" y="30" width="160" height="320" fill="#1a5070"/><circle cx="470" cy="200" r="105" fill="#dc5030"/></svg>');
 assert.equal(await page.locator('[name=material][value=vinyl]').isChecked(),true);
 await change(()=>page.locator('#builder-grouping').selectOption('tight'));
 assert.ok(await page.evaluate(()=>window.__stickonfigDebug.contourPaths.length>=2));
 await page.locator('#builder-add').click();await page.locator('#downloads').waitFor({state:'visible',timeout:30000});
 assert.equal(await page.locator('#download-links a').count(),9);
 const artifacts=await page.locator('#download-links a').evaluateAll(async links=>Promise.all(links.filter(a=>!a.download.endsWith('.zip')).map(async a=>({name:a.download,bytes:Array.from(new Uint8Array(await(await fetch(a.href)).arrayBuffer()))}))));
 for(const a of artifacts)fs.writeFileSync(out+'/'+a.name,Buffer.from(a.bytes));
 const manifest=JSON.parse(fs.readFileSync(out+'/job-manifest.json'));assert.equal(manifest.contour.paths.length,2);assert.equal(manifest.production.strokePoints,.25);
 const pdf=fs.readFileSync(out+'/production-CutContour.pdf').toString('latin1');assert.match(pdf,/\/Separation \/CutContour/);assert.match(pdf,/0\.25 w/);
 // Render the actual generated PDF using the same local PDF.js distribution.
 await page.evaluate(async()=>{const pdfjs=await import('./assets/vendor/pdfjs/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='./assets/vendor/pdfjs/pdf.worker.min.mjs';const a=document.querySelector('a[download="production-CutContour.pdf"]');const doc=await pdfjs.getDocument({data:new Uint8Array(await(await fetch(a.href)).arrayBuffer())}).promise;const p=await doc.getPage(1),view=p.getViewport({scale:3});const c=document.createElement('canvas');c.id='pdf-check';c.width=view.width;c.height=view.height;document.body.append(c);await p.render({canvasContext:c.getContext('2d'),viewport:view}).promise;});
 await page.locator('#pdf-check').screenshot({path:out+'/pdf-render.png'});
 await page.locator('#pdf-check').evaluate(e=>e.remove());
 // Synthetic raster with textured foreground and flat backdrop: force real model inference.
 const raster=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=500;const x=c.getContext('2d');x.fillStyle='#85aac8';x.fillRect(0,0,400,500);const g=x.createRadialGradient(200,175,15,200,175,110);g.addColorStop(0,'#e4b888');g.addColorStop(1,'#936440');x.fillStyle=g;x.beginPath();x.ellipse(200,180,88,115,0,0,Math.PI*2);x.fill();x.fillStyle='#283e59';x.beginPath();x.ellipse(200,420,130,160,0,0,Math.PI*2);x.fill();x.fillStyle='#342921';x.fillRect(165,165,12,8);x.fillRect(225,165,12,8);for(let i=0;i<150;i++){x.fillStyle=`rgba(255,255,255,${(i%5)*.008})`;x.fillRect(85+(i*29)%230,310+(i*13)%180,9,5)}return c.toDataURL().split(',')[1]});
 await page.locator('#builder-file').setInputFiles({name:'synthetic-portrait.png',mimeType:'image/png',buffer:Buffer.from(raster,'base64')});await ready();
 const engine=await page.evaluate(()=>window.__stickonfigDebug.processing.segmentationEngine);assert.equal(engine,'u2netp-onnx-wasm');
 console.log('Local ONNX inference:',engine);
 for(const type of ['image/jpeg','image/webp']) {
  const bytes=await page.evaluate(type=>{const c=document.createElement('canvas');c.width=300;c.height=200;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,300,200);x.fillStyle='#285de5';x.fillRect(50,40,200,120);return c.toDataURL(type).split(',')[1]},type);
  await page.locator('#builder-file').setInputFiles({name:'synthetic.'+(type==='image/jpeg'?'jpg':'webp'),mimeType:type,buffer:Buffer.from(bytes,'base64')});
  await page.locator('[name=backgroundMode][value=keep]').check({force:true});await ready();
  assert.match(await page.locator('#builder-file-details').innerText(),/300 × 200/);
 }
 await page.locator('#builder-file').setInputFiles({name:'first-page.pdf',mimeType:'application/pdf',buffer:fs.readFileSync(out+'/production-CutContour.pdf')});
 await page.locator('[name=backgroundMode][value=keep]').check({force:true});await ready();
 assert.equal(await page.evaluate(()=>window.__stickonfigDebug.resolution.status),'unverified');
 await page.locator('#builder-file').setInputFiles({name:'first-frame.gif',mimeType:'image/gif',buffer:animatedGif()});
 await page.locator('[name=backgroundMode][value=keep]').check({force:true});await ready();
 const first=await page.evaluate(()=>{const d=window.__stickonfigDebug,p=d.processing.workingPaddingPixels,w=d.processing.workingRaster.width,i=((p.top+d.sourceArtBounds.y+10)*w+p.left+d.sourceArtBounds.x+10)*4;return [...d.processedPixels.slice(i,i+4)]});
 console.log('GIF sample:',first);
 assert.ok(first[0]>first[2]+100,'GIF first red frame, not second blue frame');
 await page.locator('#builder-add').click();await page.locator('#builder-resolution-dialog').waitFor({state:'visible'});await page.locator('#builder-resolution-dialog [value=cancel]').click();
 assert.equal(await page.locator('#downloads').isVisible(),false);
 console.log('JPEG/WEBP/PDF first page/GIF first frame and low-DPI dialog passed');
 await checkPdfImport(page,'__stickonfigDebug');
 await checkArtworkEditing(page,ready);
 if(process.env.PRIVATE_PHOTO) {
  // Optional local-only check. Never copy private fixtures/screenshots to the repo.
  await page.locator('#builder-file').setInputFiles(process.env.PRIVATE_PHOTO);await ready();
  assert.equal(await page.evaluate(()=>window.__stickonfigDebug.processing.segmentationEngine),'u2netp-onnx-wasm');
  console.log('Optional external photographic artwork processed locally; no fixture/artifact saved.');
  await upload(fs.readFileSync('public/samples/constellation.svg','utf8'));
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);console.log('Browser: transparent/vector/raster processing, aspect ratio, controls, shapes, multiple contours, eight exports, actual PDF rendering, material, reset, mobile passed.');
} catch(error) {console.error('Browser test failed:',error);throw error;}
finally {await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
