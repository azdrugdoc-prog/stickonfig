// Static-host mode: object URLs live only in this tab; nothing is uploaded.
let urls=[];
export function clearDownloads() {
  urls.forEach(url=>URL.revokeObjectURL(url));urls=[];
  document.querySelector('#download-links')?.replaceChildren();
  const section=document.querySelector('#downloads');if(section)section.hidden=true;
}
export async function showDownloads(job) {
  const {zipSync}=await import(new URL('../../../assets/vendor/zip.mjs',import.meta.url));
  clearDownloads();
  const section=document.querySelector('#downloads'),links=document.querySelector('#download-links');
  links.replaceChildren();
  const files={};
  for(const a of job.artifacts)files[a.filename]=new Uint8Array(await a.blob.arrayBuffer());
  const archive=new Blob([zipSync(files,{level:0})],{type:'application/zip'});
  for(const a of [{filename:`stickonfig-${job.id}.zip`,blob:archive},...job.artifacts]) {
    const link=document.createElement('a');link.href=URL.createObjectURL(a.blob);urls.push(link.href);
    link.download=a.filename;link.textContent=a.filename;link.className='button';links.append(link);
  }
  section.hidden=false;section.scrollIntoView({behavior:'smooth',block:'start'});
  return {ok:true,id:job.id,mode:'download'};
}
