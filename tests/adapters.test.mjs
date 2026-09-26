import test from 'node:test';
import assert from 'node:assert/strict';
import {receiveJob} from '../src/adapters/storage/receiver.mjs';
import {createJob} from '../src/production/job.mjs';
import {jobFormData,postJob} from '../src/adapters/submit/index.mjs';
import worker from '../examples/cloudflare/worker.mjs';
const input={originalFilename:'shape.png',detectedFileType:'png',originalPixelWidth:900,originalPixelHeight:900,width:3,height:3,quantity:50,renderWidth:900,renderHeight:900,perimeterInches:.1,contour:{curveVersion:3,paths:[[[.1,.1],[.9,.1],[.9,.9],[.1,.9]]]}};
const blob=new Blob(['synthetic'],{type:'image/png'});
const job=await createJob(input,{original:blob,printImage:blob,proof:blob,mask:blob});
const request=()=>new Request('https://intake.example.com/jobs',{method:'POST',body:jobFormData(job)});
test('intake is fail-closed; bounded; normalized pricing and eight artifacts',async()=>{
 assert.equal((await receiveJob(request(),{store:()=>{throw Error('Unexpected write')}})).status,401);
 const oversized=new Request('https://intake.example.com/jobs',{method:'POST',body:new Uint8Array(100),headers:{'Content-Type':'multipart/form-data; boundary=test','Content-Length':'1'}});
 assert.equal((await receiveJob(oversized,{authorize:()=>true,maxBytes:12})).status,413);
 let saved;const response=await receiveJob(request(),{authorize:()=>true,store:j=>{saved=j}});
 assert.equal(response.status,200);assert.equal(saved.artifacts.length,8);assert.equal(saved.manifest.pricing.subtotal,61);
 const broken=jobFormData(job);broken.delete('production-pdf');
 assert.equal((await receiveJob(new Request('https://intake.example.com/jobs',{method:'POST',body:broken}),{authorize:()=>true,store:()=>{throw Error()}})).status,400);
});
test('REST/webhook contract and transport failures',async()=>{
 const result=await postJob(job,'https://api.example.com/jobs',async(url,options)=>{assert.equal(options.method,'POST');assert.ok(options.body.get('manifest-file') instanceof Blob);return Response.json({ok:true,id:'test-id'})});
 assert.equal(result.ok,true);
 await assert.rejects(()=>postJob(job,'http://untrusted.example.com/jobs'),/HTTPS/);
 await assert.rejects(()=>postJob(job,'https://api.example.com/jobs',async()=>Response.json({ok:false})),/confirm/);
});
test('optional Worker requires origin, auth and private storage; supports preflight',async()=>{
 const origin='https://stickers.example.com';
 assert.equal((await worker.fetch(request(),{})).status,403);
 const req=()=>new Request('https://intake.example.com/jobs',{method:'POST',headers:{Origin:origin},body:jobFormData(job)});
 assert.equal((await worker.fetch(req(),{ALLOWED_ORIGIN:origin})).status,503);
 const env={ALLOWED_ORIGIN:origin,AUTH:{fetch:async()=>new Response(null,{status:204})},FILES:{put:async()=>{}}};
 const accepted=await worker.fetch(req(),env);assert.equal(accepted.status,200);assert.equal(accepted.headers.get('Access-Control-Allow-Origin'),origin);
 env.AUTH.fetch=async()=>new Response(null,{status:401});assert.equal((await worker.fetch(req(),env)).status,401);
});
