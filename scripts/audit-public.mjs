import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const ignored=new Set(['.git','node_modules','dist','test-results']);
const failures=[];let count=0;
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\b(?:ghp|gho|github_pat|sk_live|AKIA)[_A-Za-z0-9]{20,}\b/,/https?:\/\/[^\s"']*(?:workers\.dev|r2\.cloudflarestorage\.com|r2\.dev)\b/i,/\b(?:password|api_key|secret|token)\s*[:=]\s*["'][A-Za-z0-9_+/=-]{24,}["']/i,/C:[\\/]Users[\\/]/i];
function visit(dir='.'){
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  if(ignored.has(e.name))continue;const p=path.join(dir,e.name);
  if(e.isDirectory()){visit(p);continue;}
  count++;
  if(/^\.env|^\.dev\.vars/i.test(e.name)&&e.name!=='.env.example')failures.push(p+': environment file');
  if(/\.(?:onnx|png|jpg|jpeg|gif|webp|pdf|zip|wasm)$/i.test(p)){
    if(p.replaceAll('\\','/')==='public/assets/models/u2netp.onnx'){
      const h=createHash('sha256').update(fs.readFileSync(p)).digest('hex');if(h!=='309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8')failures.push(p+': unverified model');
    }else if(!p.replaceAll('\\','/').startsWith('docs/assets/'))failures.push(p+': review binary provenance');
    continue;
  }
  if(p.replaceAll('\\','/')==='scripts/audit-public.mjs')continue;
  const text=fs.readFileSync(p,'utf8');for(const rule of patterns)if(rule.test(text))failures.push(p+': sensitive pattern');
  if(/\.(?:mjs|html|css|jsonc)$/i.test(p)&&/weprinteagle|postalannex|annex brands/i.test(text))failures.push(p+': business branding in runtime');
 }
}
visit();if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log(`Public-source scan passed (${count} files). This heuristic supplements manual review; it is not a security guarantee.`);
