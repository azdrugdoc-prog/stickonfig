import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
test('public documentation relative links resolve',()=>{
 const visit=(dir)=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?visit(path.join(dir,e.name)):[path.join(dir,e.name)]);
 const files=['README.md','SUPPORT.md','CONTRIBUTING.md','SECURITY.md','THIRD_PARTY_NOTICES.md',...visit('docs'),...visit('examples')].filter(f=>f.endsWith('.md'));
 for(const file of files)for(const match of fs.readFileSync(file,'utf8').matchAll(/\]\(([^)]+)\)/g)){
  const url=match[1];if(/^[a-z]+:|^#/i.test(url))continue;
  const target=path.resolve(path.dirname(file),url.split('#')[0]);assert.ok(fs.existsSync(target),`${file}: missing ${url}`);
 }
});
