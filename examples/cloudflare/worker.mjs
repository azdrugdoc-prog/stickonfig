import {receiveJob} from '../../src/adapters/storage/receiver.mjs';
// Optional intake example, NOT an anonymous upload service.
// AUTH is your own session/CSRF/rate-limit service; no usable default exists.
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin');
  if(!env.ALLOWED_ORIGIN||origin!==env.ALLOWED_ORIGIN)return Response.json({ok:false},{status:403});
  const cors={'Access-Control-Allow-Origin':origin,'Vary':'Origin'};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type, Authorization'}});
  if(!env.AUTH||!env.FILES)return Response.json({ok:false,error:'Configure authentication and storage first'},{status:503,headers:cors});
  const response=await receiveJob(request,{
   authorize:async req=>{
    const check=await env.AUTH.fetch(new Request('https://auth.internal/authorize',{method:'POST',headers:{Cookie:req.headers.get('Cookie')||'',Authorization:req.headers.get('Authorization')||'',Origin:origin}}));
    return check.status===204;
   },
   store:async({id,manifest,artifacts})=>{
    // Quarantine client artifacts, including PDFs. Never serve uploads inline.
    // Recomputed manifest is authoritative; browser pricing is untrusted.
    for(const a of artifacts)await env.FILES.put(`quarantine/${id}/${a.kind}`,a.blob.stream(),{httpMetadata:{contentType:'application/octet-stream',contentDisposition:'attachment'}});
    await env.FILES.put(`quarantine/${id}/validated-manifest.json`,JSON.stringify(manifest),{httpMetadata:{contentType:'application/json'}});
   }
  });
  for(const [key,value]of Object.entries(cors))response.headers.set(key,value);return response;
 }
};
