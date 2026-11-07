import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
const files=new Map([['/','control.html'],['/control','control.html'],['/stage','stage.html'],['/control.js','control.js'],['/stage.js','stage.js'],['/app.css','app.css']]);
export class LocalServer {
  constructor({app}) {this.app=app;this.clients=new Set();this.http=http.createServer((req,res)=>this.handle(req,res));this.listener=s=>this.broadcast(s);app.on('change',this.listener);}
  async start(port=3210) {
    await new Promise((resolve,reject)=>{this.http.once('error',reject);this.http.listen(port,'127.0.0.1',resolve);});
    this.port=this.http.address().port;this.origin=`http://127.0.0.1:${this.port}`;return this.origin;
  }
  broadcast(state) {const frame=`data: ${JSON.stringify(state)}\n\n`;for(const res of this.clients){if(!res.write(frame)){this.clients.delete(res);res.end();}}}
  async handle(req,res) {
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
    try {
      const hosts=[`localhost:${this.port}`,`127.0.0.1:${this.port}`];
      if(!hosts.includes(req.headers.host)||(req.headers.origin&&!hosts.some(h=>req.headers.origin===`http://${h}`)))return json(403,{error:'仅支持从本机页面访问'});
      const path=req.url;
      if(req.method==='GET'&&files.has(path)) {
        const file=files.get(path);res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');
        res.end(await readFile(new URL(`../public/${file}`,import.meta.url)));return;
      }
      if(req.method==='GET'&&path==='/api/state')return json(200,this.app.snapshot());
      if(req.method==='GET'&&path==='/api/events') {
        res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});res.write(`data: ${JSON.stringify(this.app.snapshot())}\n\n`);this.clients.add(res);
        const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),15000);
        req.on('close',()=>{clearInterval(heartbeat);this.clients.delete(res);});return;
      }
      if(req.method==='POST'&&path==='/api/actions') {
        const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>65536)return json(413,{error:'输入文字过长'});chunks.push(chunk);}
        let input;try{input=JSON.parse(Buffer.concat(chunks).toString());}catch{return json(400,{error:'请求格式错误'});}
        if(!input||typeof input!=='object'||Array.isArray(input))return json(400,{error:'请求格式错误'});
        try{return json(200,await this.app.dispatch(input));}catch(e){return json(400,{error:e.message||'操作失败'});}
      }
      const media=path.match(/^\/media\/([a-f0-9-]{36})$/);
      if(req.method==='GET'&&media) {
        if(this.app.progressive?.has(media[1])){await this.app.progressive.serve(media[1],req,res);return;}
        const state=this.app.snapshot();const item=[...state.artworks,...state.speech].find(m=>m.id===media[1]);if(!item)return json(404,{error:'素材不存在'});
        const bytes=await readFile(join(this.app.dataDir,'media',item.id));res.writeHead(200,{'Content-Type':item.mime,'Content-Length':bytes.length});res.end(bytes);return;
      }
      json(404,{error:'页面或接口不存在'});
    }catch{if(!res.headersSent)json(500,{error:'本机服务处理失败，请重试'});else res.end();}
  }
  async close() {this.app.off('change',this.listener);for(const res of this.clients)res.end();this.clients.clear();this.http.closeAllConnections();await new Promise(resolve=>this.http.close(resolve));}
}
