import {randomUUID} from 'node:crypto';
// Two generation permits, one playback lane. Streaming requests retain their
// permit through completion even after their first audio bytes become playable.
export class SpeechQueue {
  constructor({synthesize,onPlay,onStop=()=>{},onError=()=>{},onChange=()=>{},clock=Date.now,maxPlaybackMs=45000,maxPending=3,maxAgeMs=20000}) {
    Object.assign(this,{synthesize,onPlay,onStop,onError,onChange,clock,maxPlaybackMs,maxPending,maxAgeMs});
    this.items=[];this.active=null;this.inFlight=new Map();this.version=0;this.pumping=false;
  }
  snapshot(){return [...(this.active?[this.describe(this.active)]:[]),...this.items.map(item=>this.describe(item))];}
  describe(item){return {id:item.id,text:item.text,status:item.status,...(item.mediaId?{mediaId:item.mediaId}:{})};}
  current(item){return item.version===this.version&&!item.cancelled&&!item.controller.signal.aborted;}
  expired(item){return item.expiresAt<=this.clock();}
  cancel(item){item.cancelled=true;item.controller.abort();}
  enqueue(item){
    if(typeof item.text!=='string'||!item.text.trim())return null;
    const now=this.clock(),expiresAt=Math.min(item.expiresAt??Infinity,now+this.maxAgeMs);
    if(expiresAt<=now)return null;
    const entry={...item,id:randomUUID(),text:item.text.trim(),expiresAt,status:'queued',controller:new AbortController(),version:this.version};
    while(this.items.length>=this.maxPending)this.cancel(this.items.shift());
    this.items.push(entry);this.onChange();this.pump();return entry.id;
  }
  pump(){
    if(this.pumping){this.pumpAgain=true;return;}
    this.pumping=true;
    try{
      this.items=this.items.filter(item=>{if(this.expired(item)){this.cancel(item);return false;}return true;});
      for(const item of this.items){
        if(item.status!=='queued'||!this.current(item))continue;
        if(item.media){item.status='ready';item.mediaId=item.media.id;continue;}
        if(this.inFlight.size>=2)break;
        item.status='synthesizing';this.inFlight.set(item.id,item);void this.prepare(item);
      }
      if(!this.active&&this.items[0]?.status==='ready'){
        const item=this.items.shift();this.active=item;item.status='playing';item.playedAt=this.clock();
        try{
          const receipt=this.onPlay(item.media,item)||{};
          if(this.current(item)&&this.active===item)item.revision=receipt.revision;
        }catch(error){this.fail(item,error);}
      }
      this.onChange();
    }finally{
      this.pumping=false;
      if(this.pumpAgain){this.pumpAgain=false;queueMicrotask(()=>this.pump());}
    }
  }
  async prepare(item){
    try{
      const output=await this.synthesize(item,item.controller.signal);
      const envelope=output&&Object.hasOwn(output,'media')?output:{media:output,completion:undefined};
      const completion=Promise.resolve(envelope.completion);
      // Attach before any callbacks: a background stream can fail immediately.
      const completionResult=completion.then(()=>({ok:true}),error=>({ok:false,error}));
      if(this.current(item)&&!this.expired(item)){
        if(!envelope.media||typeof envelope.media.id!=='string')throw Error('语音媒体结果无效');
        item.media=envelope.media;item.mediaId=envelope.media.id;item.status='ready';this.pump();
      }else if(this.current(item)){this.cancel(item);this.items=this.items.filter(other=>other!==item);}
      const result=await completionResult;
      if(!result.ok)throw result.error;
    }catch(error){if(this.current(item))this.fail(item,error);}
    finally{this.inFlight.delete(item.id);this.pump();}
  }
  fail(item,error){
    if(!this.current(item))return;
    this.stop();this.onError(error instanceof Error?error:Error('语音生成未完成'),{id:item.id,text:item.text,mediaId:item.mediaId});
  }
  ack({id,revision,error=false}){
    const active=this.active;
    if(active?.status!=='playing'||active.mediaId!==id||active.revision!==revision)return false;
    if(error){this.fail(active,Error('舞台音频未能播放，已清空待播队列'));return true;}
    this.active=null;this.onStop(active);this.onChange();this.pump();return true;
  }
  tick(){
    if(this.active?.status==='playing'&&this.clock()-this.active.playedAt>=this.maxPlaybackMs)this.ack({id:this.active.mediaId,revision:this.active.revision,error:true});
    else if(this.items.some(item=>this.expired(item)))this.pump();
  }
  stop(){
    this.version++;const old=this.active;
    for(const item of new Set([...this.items,...this.inFlight.values(),...(old?[old]:[])]))this.cancel(item);
    this.active=null;this.items=[];
    if(old)this.onStop(old);this.onChange();
  }
}
