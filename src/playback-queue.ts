import {randomUUID} from 'node:crypto';
// One playback lane with bounded look-ahead. SDK services enforce provider
// concurrency; this queue owns playback order, expiry and stage acknowledgments.
export class PlaybackQueue {
  [key: string]: any;

  constructor({synthesize,onPlay,onStop=()=>{},onError=()=>{},onChange=()=>{},clock=Date.now,maxPlaybackMs=45000,maxPrefetch=2,maxPending=3,maxAgeMs=20000}: any) {
    Object.assign(this,{synthesize,onPlay,onStop,onError,onChange,clock,maxPlaybackMs,maxPrefetch,maxPending,maxAgeMs});
    this.items=[];this.active=null;this.inFlight=new Map();this.version=0;this.pumping=false;
  }
  snapshot(){return [...(this.active?[this.describe(this.active)]:[]),...this.items.map((item: any)=>this.describe(item))];}
  describe(item: any){return {id:item.id,text:item.text,status:item.status,...(item.mediaId?{mediaId:item.mediaId}:{})};}
  current(item: any){return item.version===this.version&&!item.cancelled&&!item.controller.signal.aborted;}
  expired(item: any){return item.expiresAt<=this.clock();}
  cancel(item: any){item.cancelled=true;item.controller.abort();}
  enqueue(item: any){
    if(typeof item.text!=='string'||!item.text.trim())return null;
    const now: any=this.clock(),expiresAt: any=Math.min(item.expiresAt??Infinity,now+this.maxAgeMs);
    if(expiresAt<=now)return null;
    const entry: any={...item,id:randomUUID(),text:item.text.trim(),expiresAt,status:'queued',controller:new AbortController(),version:this.version};
    while(this.items.length>=this.maxPending)this.cancel(this.items.shift());
    this.items.push(entry);this.onChange();this.pump();return entry.id;
  }
  pump(){
    if(this.pumping){this.pumpAgain=true;return;}
    this.pumping=true;
    try{
      this.items=this.items.filter((item: any)=>{if(this.expired(item)){this.cancel(item);return false;}return true;});
      for(const item of this.items){
        if(item.status!=='queued'||!this.current(item))continue;
        if(item.media){item.status='ready';item.mediaId=item.media.id;continue;}
        if(this.inFlight.size>=this.maxPrefetch)break;
        item.status='synthesizing';this.inFlight.set(item.id,item);void this.prepare(item);
      }
      if(!this.active&&this.items[0]?.status==='ready'){
        const item: any=this.items.shift();this.active=item;item.status='playing';item.playedAt=this.clock();
        try{
          const receipt: any=this.onPlay(item.media,item)||{};
          if(this.current(item)&&this.active===item)item.revision=receipt.revision;
        }catch(error: any){this.fail(item,error);}
      }
      this.onChange();
    }finally{
      this.pumping=false;
      if(this.pumpAgain){this.pumpAgain=false;queueMicrotask(()=>this.pump());}
    }
  }
  async prepare(item: any){
    try{
      const output: any=await this.synthesize(item,item.controller.signal);
      const envelope: any=output&&Object.hasOwn(output,'media')?output:{media:output,completion:undefined};
      const completion: any=Promise.resolve(envelope.completion);
      // Attach before any callbacks: a background stream can fail immediately.
      const completionResult: any=completion.then(()=>({ok:true}),(error: any)=>({ok:false,error}));
      if(this.current(item)&&!this.expired(item)){
        if(!envelope.media||typeof envelope.media.id!=='string')throw Error('语音媒体结果无效');
        item.media=envelope.media;item.mediaId=envelope.media.id;item.status='ready';this.pump();
      }else if(this.current(item)){this.cancel(item);this.items=this.items.filter((other: any)=>other!==item);}
      const result: any=await completionResult;
      if(!result.ok)throw result.error;
    }catch(error: any){if(this.current(item))this.fail(item,error);}
    finally{this.inFlight.delete(item.id);this.pump();}
  }
  fail(item: any,error: any){
    if(!this.current(item))return;
    this.stop();this.onError(error instanceof Error?error:Error('语音生成未完成'),{id:item.id,text:item.text,mediaId:item.mediaId});
  }
  ack({id,revision,error=false}: any){
    const active: any=this.active;
    if(active?.status!=='playing'||active.mediaId!==id||active.revision!==revision)return false;
    if(error){this.fail(active,Error('舞台音频未能播放，已清空待播队列'));return true;}
    this.active=null;this.onStop(active);this.onChange();this.pump();return true;
  }
  tick(){
    if(this.active?.status==='playing'&&this.clock()-this.active.playedAt>=this.maxPlaybackMs)this.ack({id:this.active.mediaId,revision:this.active.revision,error:true});
    else if(this.items.some((item: any)=>this.expired(item)))this.pump();
  }
  stop(){
    this.version++;const old: any=this.active;
    for(const item of new Set([...this.items,...this.inFlight.values(),...(old?[old]:[])]))this.cancel(item);
    this.active=null;this.items=[];
    if(old)this.onStop(old);this.onChange();
  }
}
