import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
export function serve({port=4173,host='127.0.0.1',basePath='/'}={}) {
  const root=path.resolve(import.meta.dirname,'../dist');
  const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.onnx':'application/octet-stream','.json':'application/json'};
  const server=http.createServer(async(req,res)=>{
    try{
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
      const url=new URL(req.url,'http://localhost');
      if(!url.pathname.startsWith(basePath)){res.writeHead(404).end();return;}
      let name='/'+decodeURIComponent(url.pathname.slice(basePath.length));if(name.endsWith('/'))name+='index.html';
      const file=path.resolve(root,'.'+name);
      if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
      const stat=await fs.promises.stat(file);if(!stat.isFile())throw Error();
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      if(req.method==='HEAD')res.end();else await pipeline(fs.createReadStream(file),res);
    }catch{if(!res.headersSent)res.writeHead(404);res.end();}
  });
  return new Promise(resolve=>server.listen(port,host,()=>{console.log(`Stickonfig: http://${host}:${server.address().port}`);resolve(server)}));
}
if(process.argv[1]===path.resolve(import.meta.filename))await serve({port:Number(process.env.PORT)||4173,host:process.env.HOST||'127.0.0.1'});
