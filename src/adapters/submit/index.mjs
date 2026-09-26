import config from '../../config/index.mjs';
import { showDownloads } from '../storage/download.mjs';
export function jobFormData(job) {
  const form=new FormData();form.append('manifest',JSON.stringify(job.manifest));
  for(const a of job.artifacts)form.append(a.kind==='manifest'?'manifest-file':a.kind,a.blob,a.filename);
  return form;
}
export async function postJob(job, endpoint, fetcher=fetch) {
  const url=new URL(endpoint,globalThis.location?.href);
  if(url.protocol!=='https:' && !(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('Submission requires HTTPS');
  const response=await fetcher(url,{method:'POST',body:jobFormData(job),credentials:'same-origin',signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Error(`Submission failed (${response.status}). No order confirmation received.`);
  const result=await response.json();
  if(result.ok!==true)throw Error('Submission endpoint did not confirm success');
  return result;
}
export async function submitJob(job) {
  const {mode,endpoint,onSubmit}=config.submission;
  if(mode==='download')return showDownloads(job);
  if(mode==='callback') {
    if(typeof onSubmit!=='function')throw Error('Configure submission.onSubmit');
    return await onSubmit(job);
  }
  if(!endpoint)throw Error('Configure your receiving endpoint before submitting');
  return postJob(job,endpoint);
}
