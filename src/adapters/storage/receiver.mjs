import {normalizeStickerBuilderManifest} from '../../production/manifest.mjs';
import {stickerPrice} from '../pricing/example.mjs';
// Shared server contract. Fail closed unless the host supplies authorization.
// Host must authenticate, enforce CSRF/rate limits, malware-scan and review files.
export async function receiveJob(request,{authorize,store,maxBytes=24*1024*1024}) {
 if(request.method!=='POST')return Response.json({ok:false,error:'POST required'},{status:405});
 if(!authorize||!await authorize(request))return Response.json({ok:false,error:'Unauthorized'},{status:401});
 if(!request.headers.get('content-type')?.startsWith('multipart/form-data;'))return Response.json({ok:false,error:'Multipart required'},{status:415});
 let reader;
 try{
  if(Number(request.headers.get('content-length'))>maxBytes)return Response.json({ok:false,error:'Too large'},{status:413});
  reader=request.body?.getReader();if(!reader)throw Error('Empty request');
  let total=0;const chunks=[];
  while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes){await reader.cancel();return Response.json({ok:false,error:'Too large'},{status:413})}chunks.push(value)}
  const form=await new Response(new Blob(chunks),{headers:{'content-type':request.headers.get('content-type')}}).formData();
  const text=form.get('manifest');if(typeof text!=='string'||text.length>250000)throw Error('Invalid manifest');
  const manifest=normalizeStickerBuilderManifest(JSON.parse(text));manifest.pricing=stickerPrice(manifest);
  const kinds=['original','normalized-print','proof','mask','contour-svg','contour-json','production-pdf','manifest'];
  const artifacts=kinds.map(kind=>{const blob=form.get(kind==='manifest'?'manifest-file':kind);if(!(blob instanceof Blob)||!blob.size)throw Error('Missing '+kind);return{kind,blob}});
  const id=crypto.randomUUID();
  await store({id,manifest,artifacts});
  return Response.json({ok:true,id,pricing:manifest.pricing,reviewRequired:true});
 }catch{return Response.json({ok:false,error:'Unable to validate or store job'},{status:400})}
 finally{reader?.releaseLock()}
}
