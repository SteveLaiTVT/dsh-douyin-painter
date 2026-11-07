import {randomUUID} from 'node:crypto';
import {writeFile,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';

// Private in-memory transport for at most a few active MP3 streams. Completed
// audio is served from disk by LocalServer; partial files never survive restart.
export class ProgressiveAudio {
  constructor({directory,maxBytes=10*1024*1024}={}){this.directory=directory;this.maxBytes=maxBytes;this.records=new Map();}
  has(id){return this.records.has(id);}
  async open({chunks,signal}={}){
    if(!chunks?.[Symbol.asyncIterator])throw Error('流式音频数据无效');
    signal?.throwIfAborted();
    const iterator=chunks[Symbol.asyncIterator](), controller=new AbortController();
    const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    const record={id:randomUUID(),chunks:[],size:0,listeners:new Set(),done:false,error:null,controller};
    const wake=()=>{for(const listener of record.listeners)listener();record.listeners.clear();};
    let rejectAbort;
    const aborted=new Promise((_,reject)=>{rejectAbort=reject;});
    // A non-cooperative injected provider must not keep a cancelled stream alive.
    const onAbort=()=>rejectAbort(Error('语音请求已取消'));
    combined.addEventListener('abort',onAbort,{once:true});
    if(combined.aborted)onAbort();
    const next=()=>Promise.race([iterator.next(),aborted]);
    const append=value=>{
      if(!Buffer.isBuffer(value)&&!(value instanceof Uint8Array))throw Error('流式音频数据无效');
      const bytes=Buffer.from(value);record.size+=bytes.length;
      if(record.size>this.maxBytes)throw Error('流式音频过大');
      if(bytes.length)record.chunks.push(bytes);wake();
    };
    try{
      while(!record.size){const part=await next();if(part.done)throw Error('语音没有返回音频');append(part.value);}
      combined.throwIfAborted();this.records.set(record.id,record);
    }catch(error){controller.abort();combined.removeEventListener('abort',onAbort);void iterator.return?.().catch?.(()=>{});throw error;}
    const media={id:record.id,url:`/media/${record.id}`,mime:'audio/mpeg',streaming:true};
    const completion=(async()=>{
      const temporary=join(this.directory,`${record.id}.part`),destination=join(this.directory,record.id);
      try{
        for(;;){const part=await next();combined.throwIfAborted();if(part.done)break;append(part.value);}
        await writeFile(temporary,Buffer.concat(record.chunks));combined.throwIfAborted();
        await rename(temporary,destination);combined.throwIfAborted();record.done=true;wake();
      }catch(error){record.error=combined.aborted?Error('语音请求已取消'):error;record.done=true;wake();await Promise.allSettled([rm(temporary,{force:true}),rm(destination,{force:true})]);throw record.error;}
      finally{combined.removeEventListener('abort',onAbort);void iterator.return?.().catch?.(()=>{});}
    })();
    completion.catch(()=>{});
    return {media,completion};
  }
  async serve(id,req,res){
    const record=this.records.get(id);if(!record)return false;
    if(record.error){res.writeHead(410);res.end();return true;}
    // A fresh player starts at byte zero. Seeking a still-growing stream is not
    // supported; standard HTTP permits responding 200 to an initial Range.
    res.writeHead(200,{'Content-Type':'audio/mpeg','Cache-Control':'no-store','Accept-Ranges':'none'});
    res.flushHeaders();
    let closed=false,wakeClient;const close=()=>{closed=true;wakeClient?.();};res.on('close',close);
    try{
      let index=0;
      while(!closed){
        if(record.error){res.destroy();break;}
        while(index<record.chunks.length&&!closed){
          if(!res.write(record.chunks[index++]))await new Promise(resolve=>{const ready=()=>{res.off('drain',ready);res.off('close',ready);resolve();};res.once('drain',ready);res.once('close',ready);});
        }
        if(closed)break;if(record.done){res.end();break;}
        await new Promise(resolve=>{wakeClient=resolve;record.listeners.add(resolve);});
        record.listeners.delete(wakeClient);wakeClient=null;
      }
    }finally{res.off('close',close);if(wakeClient)record.listeners.delete(wakeClient);}
    return true;
  }
  release(id){const record=this.records.get(id);if(record?.done)this.records.delete(id);}
  close(){for(const record of this.records.values())record.controller.abort();}
}
