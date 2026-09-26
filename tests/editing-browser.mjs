import assert from 'node:assert/strict';

// Synthetic original artwork only: a blue ring and a removable red detail.
export async function checkArtworkEditing(page, ready) {
  const fixture=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><path fill="#1946ae" fill-rule="evenodd" d="M300 30a230 230 0 1 0 0 460a230 230 0 1 0 0-460M300 170a90 90 0 1 1 0 180a90 90 0 1 1 0-180"/><rect fill="#ff0020" x="480" y="530" width="70" height="40"/></svg>');
  const load=async()=>{await page.locator('#builder-file').setInputFiles({name:'editable-ring.svg',mimeType:'image/svg+xml',buffer:fixture});await ready();};
  const debug=()=>page.evaluate(()=>({paths:window.__stickonfigDebug.contourPaths,processing:window.__stickonfigDebug.processing}));
  const open=()=>page.locator('#builder-edit-artwork').click();
  const apply=async()=>{await page.locator('#builder-editor-apply').click();await ready();};
  async function stroke(from,to=from,size='16') {
    await page.locator('#builder-editor-size').fill(size);await page.locator('#builder-editor-size').dispatchEvent('input');
    const coords=await page.evaluate(({from,to})=>{
      const c=document.querySelector('#builder-editor-canvas'),r=c.getBoundingClientRect(),a=window.__stickonfigDebug.sourceArtBounds;
      const p=([x,y])=>({x:r.x+(a.x+x*a.width)*r.width/c.width,y:r.y+(a.y+y*a.height)*r.height/c.height});return {from:p(from),to:p(to)};
    },{from,to});
    await page.mouse.move(coords.from.x,coords.from.y);await page.mouse.down();await page.mouse.move(coords.to.x,coords.to.y,{steps:5});await page.mouse.up();
    await page.evaluate(()=>new Promise(requestAnimationFrame));
  }
  await load();await page.locator('#builder-grouping').selectOption('tight');await ready();
  const initial=await debug();assert.equal(initial.paths.length,2,'two disconnected outer shapes');
  await page.locator('#builder-outer-outline').uncheck();await ready();assert.equal((await debug()).paths.length,3,'optional enclosed cutout');
  await page.locator('#builder-outer-outline').check();await ready();
  await open();await stroke([.86,.915]);await page.locator('#builder-editor-cancel').click();assert.deepEqual((await debug()).paths,initial.paths);
  await open();await stroke([.86,.915]);await page.locator('#builder-editor-undo').click();await apply();assert.equal((await debug()).processing.manualArtworkEdits,false);
  await open();await stroke([.86,.915]);await page.locator('#builder-editor-restore').click();await stroke([.86,.915]);await apply();assert.equal((await debug()).processing.manualArtworkEdits,false);
  await open();await stroke([.86,.915]);await apply();
  const edited=await debug();assert.equal(edited.paths.length,1);assert.ok(edited.processing.manualErasePixels>1000);
  await page.locator('[name=perimeterMode][value=wide]').check({force:true});await ready();assert.equal((await debug()).processing.manualErasePixels,edited.processing.manualErasePixels);
  await page.locator('[name=cutStyle][value=rectangle]').check({force:true});await ready();assert.equal((await debug()).processing.manualErasePixels,edited.processing.manualErasePixels);
  await page.locator('[name=cutStyle][value=die-cut]').check({force:true});await ready();
  const expected=(await debug()).paths;
  await page.locator('#builder-add').click();await page.locator('#downloads').waitFor({state:'visible'});
  const artifacts=await page.locator('#download-links a').evaluateAll(async links=>Promise.all(links.filter(a=>!a.download.endsWith('.zip')).map(async a=>({name:a.download,bytes:[...new Uint8Array(await(await fetch(a.href)).arrayBuffer())]}))));
  assert.equal(artifacts.length,8);
  const artifact=name=>Buffer.from(artifacts.find(a=>a.name===name).bytes);
  assert.deepEqual(artifact('original-editable-ring.svg'),fixture,'unedited original retained byte-for-byte');
  const manifest=JSON.parse(artifact('job-manifest.json'));
  assert.equal(manifest.version,2);assert.equal(manifest.outerOutlineOnly,true);assert.equal(manifest.processing.manualArtworkEdits,true);
  assert.deepEqual(manifest.contour.paths,expected);assert.deepEqual(JSON.parse(artifact('cut-contour.json')).paths,expected);
  const pdf=artifact('production-CutContour.pdf').toString('latin1');assert.match(pdf,/0\.25 w/);assert.match(pdf,/\[\] 0 d/);assert.match(pdf,/\/Separation \/CutContour/);
  const red=await page.evaluate(async b64=>{
    const image=new Image();image.src='data:image/jpeg;base64,'+b64;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
    const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;let red=0;
    for(let i=0;i<data.length;i+=4)if(data[i]>170&&data[i+1]<70&&data[i+2]<100)red++;return red;
  },artifact('normalized-print.jpg').toString('base64'));
  assert.equal(red,0,'erased detail absent from exported print JPEG');
  await page.locator('#builder-outer-outline').uncheck();await ready();assert.equal(await page.locator('#downloads').isVisible(),false,'cut changes invalidate old downloads');
  await page.locator('#builder-outer-outline').check();await ready();
  await page.locator('#builder-add').click();await page.locator('#downloads').waitFor({state:'visible'});
  await open();await page.locator('#builder-editor-reset').click();await apply();assert.equal(await page.locator('#downloads').isVisible(),false,'brush changes invalidate old downloads');
  await load();assert.equal((await debug()).processing.manualArtworkEdits,false);assert.equal(await page.locator('#builder-outer-outline').isChecked(),true);
  await page.setViewportSize({width:390,height:844});await open();
  const fit=await page.locator('#builder-editor-canvas').evaluate(c=>{const r=c.getBoundingClientRect(),d=document.querySelector('#builder-editor-dialog');return {ratio:r.width/r.height/(c.width/c.height),overflow:d.scrollWidth>d.clientWidth};});
  assert.ok(Math.abs(fit.ratio-1)<.001);assert.equal(fit.overflow,false);
  const cdp=await page.context().newCDPSession(page),rect=await page.locator('#builder-editor-canvas').boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width*.5,y:rect.y+rect.height*.2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.evaluate(()=>new Promise(requestAnimationFrame));assert.equal(await page.locator('#builder-editor-undo').isEnabled(),true);
  await page.locator('#builder-editor-dialog').screenshot({path:'test-results/mobile-editor.png'});
  await page.locator('#builder-editor-reset').click();await apply();assert.equal((await debug()).processing.manualArtworkEdits,false);
  await page.locator('#builder-reset').click();assert.equal(await page.locator('#builder-edit-artwork').isVisible(),false);
  await load();await open();for(let y=.05;y<1;y+=.15)await stroke([0,y],[1,y],'25');
  assert.equal(await page.locator('#builder-editor-apply').isEnabled(),false,'blank edits blocked');
  await page.keyboard.press('Escape');assert.equal((await debug()).processing.manualArtworkEdits,false,'Escape discards draft');
  await page.setViewportSize({width:1440,height:1100});
  console.log('Editing: outer/cutout topology, Erase/Restore/Undo/Cancel, original preservation, edited exports, stale download invalidation, mobile touch, blank guard and reset passed.');
}
