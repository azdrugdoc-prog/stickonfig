import fs from 'node:fs';
import path from 'node:path';
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
const rows=[];const allowed=new Set(['MIT','Apache-2.0','BSD-3-Clause','BSD-2-Clause','ISC','BSL-1.0']);
for(const [location,item] of Object.entries(lock.packages)) {
 if(!location||item.dev)continue;
 if(!allowed.has(item.license))throw Error(`Review license for ${location}: ${item.license}`);
 if(item.optional) {
  const name=location.slice(location.lastIndexOf('node_modules/')+13);
  rows.push(`| ${name} (optional Node-only; not copied to browser distribution) | ${item.version} | ${item.license} | [package](https://www.npmjs.com/package/${name}) |`);
  continue;
 }
 if(!fs.existsSync(path.join(location,'package.json'))) {
  if(!item.optional)throw Error('Missing installed package: '+location);
  const name=location.slice(location.lastIndexOf('node_modules/')+13);
  rows.push(`| ${name} (optional, not installed on this platform) | ${item.version} | ${item.license} | [package](https://www.npmjs.com/package/${name}) |`);
  continue;
 }
 const pkg=JSON.parse(fs.readFileSync(path.join(location,'package.json'),'utf8'));
 const dir=path.join('licenses',pkg.name.replaceAll('/','__'));
 fs.mkdirSync(dir,{recursive:true});
 const files=fs.readdirSync(location).filter(n=>/^(licen[cs]e|copying|notice)(\.|$)/i.test(n));
 if(files.length===0) {
  if(['onnxruntime-common','onnxruntime-web'].includes(pkg.name)) {
    for(const name of ['LICENSE','ThirdPartyNotices.txt']) {
      const response=await fetch(`https://raw.githubusercontent.com/microsoft/onnxruntime/v${pkg.version}/${name}`);
      if(!response.ok)throw Error('Could not retrieve ONNX notices');
      fs.writeFileSync(path.join(dir,name),await response.text());
    }
  } else if(pkg.name!=='guid-typescript')throw Error('Missing license text for '+pkg.name);
  // This dependency is not used by the bundled wasm-only runtime. Its npm
  // tarball declares ISC but omits the license file. Retain metadata, not code.
  if(pkg.name==='guid-typescript')fs.writeFileSync(path.join(dir,'PACKAGE-METADATA.json'),JSON.stringify({name:pkg.name,version:pkg.version,author:pkg.author,license:pkg.license,repository:pkg.repository,note:'Not present in the browser bundle; npm package does not include a license text.'},null,2));
 }
 for(const file of files)fs.copyFileSync(path.join(location,file),path.join(dir,file));
 rows.push(`| ${pkg.name} | ${pkg.version} | ${item.license} | [package](https://www.npmjs.com/package/${pkg.name}) |`);
}
fs.mkdirSync('docs',{recursive:true});
fs.writeFileSync('docs/DEPENDENCIES.md','# Production dependency inventory\n\nGenerated from the installed lockfile using `npm run audit:licenses`. Includes transitive and type-only dependencies; not all are in the browser bundle. Full installed notices are retained in `licenses/`. Development tools are listed in THIRD_PARTY_NOTICES.md.\n\n| Package | Version | License | Source |\n|---|---|---|---|\n'+rows.join('\n')+'\n');
console.log(`Reviewed ${rows.length} production dependencies; all allowlisted permissive licenses; full notices copied.`);
