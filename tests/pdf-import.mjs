import assert from 'node:assert/strict';

// Original synthetic two-page PDF: concave blue logo, intentional white detail,
// and optional explicitly painted white page. No customer artwork is embedded.
export function pdfImportFixture(opaque=false) {
  const first=(opaque?'1 1 1 rg 0 0 200 160 re f\n':'')+
    '0.1 0.25 0.7 rg 20 20 m 180 20 l 180 55 l 70 55 l 70 105 l 180 105 l 180 140 l 20 140 l h f\n'+
    '1 1 1 rg 30 70 20 20 re f\n';
  const second='1 0 0 rg 0 0 200 160 re f\n';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 160] /Resources << >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(first)} >>\nstream\n${first}endstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 160] /Resources << >> /Contents 6 0 R >>',
    `<< /Length ${Buffer.byteLength(second)} >>\nstream\n${second}endstream`
  ];
  let pdf='%PDF-1.4\n';const offsets=[0];
  for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=Buffer.byteLength(pdf);
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(const offset of offsets.slice(1))pdf+=String(offset).padStart(10,'0')+' 00000 n \n';
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

export async function checkPdfImport(page,debugKey) {
  for(const opaque of [false,true]) {
    const generation=await page.evaluate(key=>window[key]?.geometry.generation||0,debugKey);
    await page.locator('#builder-file').setInputFiles({name:`synthetic-${opaque?'opaque':'transparent'}.pdf`,mimeType:'application/pdf',buffer:pdfImportFixture(opaque)});
    await page.locator('#builder-file-details').getByText(`synthetic-${opaque?'opaque':'transparent'}.pdf`,{exact:true}).waitFor();
    if(opaque)await page.locator('[name=backgroundMode][value=keep]').check({force:true});
    await page.waitForFunction(({key,generation})=>{
      const d=window[key];return d?.geometry.generation>generation&&d.processing.segmentationEngine==='source-alpha'&&d.contourPaths.length&&!document.querySelector('#builder-add').disabled;
    },{key:debugKey,generation},{timeout:120000});
    const pixels=await page.evaluate(key=>{
      const d=window[key],art=d.sourceArtBounds,pad=d.processing.workingPaddingPixels,w=d.processing.workingRaster.width;
      const sample=(x,y)=>{
        const i=((pad.top+art.y+Math.floor(art.height*y))*w+pad.left+art.x+Math.floor(art.width*x))*4;
        return [...d.processedPixels.slice(i,i+4)];
      };
      return {corner:sample(.02,.02),notch:sample(.6,.5),white:sample(.2,.5),blue:sample(.2,.25)};
    },debugKey);
    assert.equal(pixels.corner[3],opaque?255:0,'unpainted page alpha vs explicit white background');
    assert.equal(pixels.notch[3],opaque?255:0,'deep logo concavity remains transparent');
    assert.deepEqual(pixels.white,[255,255,255,255],'intentional white logo detail survives');
    assert.ok(pixels.blue[2]>pixels.blue[0]&&pixels.blue[3]===255,'first blue page, not second red page');
    assert.match(await page.locator('#builder-file-details').innerText(),/2 \(page 1 used\)/);
  }
  console.log('PDF import: transparent concave logo, white detail, explicit white page, first-page selection passed');
}
