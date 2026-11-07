import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { restoreState } from './state.js';
import { LiveWorkflow } from './workflow.js';
import { parseVote } from './voting.js';
import { normalizeRoom } from './capture.js';
import { prepareCandidates, viewerKey, duplicateKey, messageKey, historyEvictionIndex } from './comment-processing.js';
import { ProgressiveAudio } from './progressive-audio.js';
import { buildArtPrompt } from './art-direction.js';
import { resolveArtReferences } from './art-references.js';
const uid = () => randomUUID();
const required = (condition,message) => { if (!condition) throw Error(message); };
const string = (v,max=4000) => typeof v === 'string' ? v.trim().slice(0,max) : '';
export class Application extends EventEmitter {
  constructor({text,image,speech,capture,dataDir,config={},clock=Date.now,autoTick=true,artReferences=resolveArtReferences}) {
    super(); Object.assign(this,{text,image,speech,capture,dataDir,clock,autoTick,artReferences});
    this.availability=config; this.epoch=0; this.revision=0; this.instanceId=uid(); this.jobs=new Map(); this.seen=new Set(); this.closed=false; this.playbackSerial=0; this.speechGeneration=0; this.stageRevision=0;
    this.writes=Promise.resolve();
    this.progressive=new ProgressiveAudio({directory:join(dataDir,'media')});this.speechControllers=new Set();
    this.state={settings:{room:'',avatarEnabled:true},theme:{title:'',rules:''},round:{id:uid(),status:'idle'},capture:{state:'disconnected',message:'尚未连接直播间',room:''},comments:[],selections:[],artworks:[],speech:[],explanation:'',stage:{artworkId:null,speechId:null,caption:''},errors:[]};
    this.workflow=new LiveWorkflow(this,{clock});
    this.onComment=c=>this.receive(c);
    this.onStatus=s=>{ if(this.closed)return; this.state.capture={...this.state.capture,...s};this.workflow.onCapture();this.changed(); };
    capture?.on('comment',this.onComment);capture?.on('status',this.onStatus);
  }
  async open() {
    await mkdir(join(this.dataDir,'media'),{recursive:true});
    try {
      const saved=JSON.parse(await readFile(join(this.dataDir,'state.json'),'utf8'));
      this.state=restoreState(saved,this.state);
      this.seen=new Set(this.state.comments.map(messageKey));
    } catch(e) { if(e.code!=='ENOENT')this.state.errors.push('历史记录读取失败：'+e.message); }
    if(this.autoTick){this.workflowTimer=setInterval(()=>{void this.workflow.tick().catch(e=>{this.workflow.warn(e);this.changed();});},250);this.workflowTimer.unref();}
    return this;
  }
  snapshot() { return structuredClone({...this.state,workflow:this.workflow.snapshot(),revision:this.revision,instanceId:this.instanceId,busy:[...this.jobs.keys()],config:this.availability}); }
  persist() {
    this.pendingWrite=JSON.stringify({version:1,state:this.state});
    if(this.writeActive)return;
    this.writeActive=true;
    this.writes=(async()=>{
      try {
        while(this.pendingWrite){
          const body=this.pendingWrite;this.pendingWrite=null;
          await writeFile(join(this.dataDir,'state.tmp'),body);
          await rename(join(this.dataDir,'state.tmp'),join(this.dataDir,'state.json'));
        }
      } finally {this.writeActive=false;}
    })();
    this.writes.catch(()=>{if(!this.state.errors.includes('本机记录保存失败')){this.state.errors.push('本机记录保存失败');this.revision++;this.emit('change',this.snapshot());}});
  }
  changed() { if(this.closed)return; this.revision++; this.emit('change',this.snapshot());this.persist(); }
  flush() {return this.writes;}
  receive(c) {
    if(this.closed||!string(c.text))return;
    const source=c.source==='manual'?'manual':'live',roomId=string(c.roomId,100)||(source==='manual'?this.state.settings.room:this.state.capture.room||this.state.settings.room),sourceMsgId=string(c.id,200);
    if(sourceMsgId&&this.seen.has(messageKey({id:sourceMsgId,source,roomId})))return;
    const id=sourceMsgId&&!this.state.comments.some(c=>c.id===sourceMsgId)?sourceMsgId:uid();
    const comment={id,sourceMsgId,text:string(c.text),nickname:string(c.nickname,100)||'观众',userId:string(c.userId,200),roomId,source,receivedAt:c.receivedAt||this.clock(),roundId:this.state.round.status==='collecting'?this.state.round.id:null,occurrenceCount:1};
    const repeated=duplicateKey(comment);
    const original=repeated?this.state.comments.find(c=>!c.duplicateOf&&duplicateKey(c)===repeated):null;
    if(original){original.occurrenceCount=(original.occurrenceCount||1)+1;comment.duplicateOf=original.id;}
    this.state.comments.push(comment);this.seen.add(messageKey(comment));
    if(this.state.comments.length>500){const [old]=this.state.comments.splice(historyEvictionIndex(this.state.comments,{roundId:this.state.round.id}),1);this.seen.delete(messageKey(old));}
    this.workflow.onComment(comment);
    this.changed();
  }
  reset() {
    this.abortSpeechStreams();
    this.workflow.reset();
    this.stageRevision++; this.speechGeneration++;
    this.epoch++;for(const [key,job] of this.jobs)if(key!=='connect')job.controller.abort();
    this.state.round={id:uid(),status:'idle'};this.state.selections=[];this.state.explanation='';
    this.state.stage={artworkId:null,speechId:null,caption:''};
  }
  comment(id) { const c=this.state.comments.find(c=>c.id===id);required(c,'未找到该条弹幕');return c; }
  async task(key,work,apply,{scoped=true,retainUntil}={}) {
    required(!this.jobs.has(key),'操作进行中，请稍候');
    const token={controller:new AbortController()};const epoch=this.epoch;
    this.jobs.set(key,token);this.changed();
    let retained=false;
    try {
      const result=await work(token.controller.signal);
      if((!scoped||this.epoch===epoch)&&!this.closed){
        await apply(result);
        if(retainUntil){
          const completion=retainUntil(result);retained=true;
          Promise.resolve(completion).catch(()=>{}).finally(()=>{if(this.jobs.get(key)===token)this.jobs.delete(key);if(!this.closed)this.changed();});
        }
      }
    } catch(e) {
      if((!scoped||this.epoch===epoch)&&!this.closed&&!token.controller.signal.aborted){this.state.errors.push(string(e.message||'任务失败',400));this.state.errors=this.state.errors.slice(-5);throw e;}
    } finally {if(!retained&&this.jobs.get(key)===token)this.jobs.delete(key);if(!this.closed)this.changed();}
  }
  async media(result,kind,extra={}) {
    required(Buffer.isBuffer(result.bytes)&&result.bytes.length>0&&result.bytes.length<=30*1024*1024,'生成的媒体数据无效或过大');
    const mime=result.mime;required((kind==='image'?['image/png','image/jpeg','image/webp','image/gif']:['audio/mpeg','audio/wav','audio/flac']).includes(mime),'不支持的媒体类型');
    const id=uid();await writeFile(join(this.dataDir,'media',id),result.bytes);
    return {id,url:`/media/${id}`,mime,...extra};
  }
  abortSpeechStreams(){for(const controller of this.speechControllers)controller.abort();}
  async prepareSpeech({text,voiceId,signal}={}){
    const epoch=this.epoch,controller=new AbortController();this.speechControllers.add(controller);
    const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    const valid=()=>{combined.throwIfAborted();required(!this.closed&&this.epoch===epoch,'语音任务已过时');};
    let live;
    try{
      valid();
      if(typeof this.speech.openStream==='function'){
        const output=await this.speech.openStream({text,voiceId,signal:combined});valid();
        live=await this.progressive.open({chunks:output.chunks,signal:combined});valid();
        const media={...live.media,text,voiceId};this.state.speech.push(media);this.changed();
        const completion=live.completion.then(()=>{
          media.streaming=false;this.progressive.release(media.id);if(!this.closed)this.changed();
        },error=>{
          this.state.speech=this.state.speech.filter(item=>item.id!==media.id);
          if(this.state.stage.speechId===media.id){this.state.stage.speechId=null;this.state.stage.caption='';}
          this.progressive.release(media.id);if(!this.closed)this.changed();throw error;
        }).finally(()=>this.speechControllers.delete(controller));
        completion.catch(()=>{});return {media,completion};
      }
      const output=await this.speech.synthesize({text,voiceId,signal:combined});valid();
      const media=await this.media(output,'speech',{text,voiceId});valid();this.state.speech.push(media);
      this.speechControllers.delete(controller);return {media,completion:Promise.resolve()};
    }catch(error){controller.abort();this.speechControllers.delete(controller);if(live)live.completion.catch(()=>{});throw error;}
  }
  async dispatch(input,internal=null) {
    required(!this.closed,'应用已关闭');const action=input.action;
    if(action?.startsWith('workflow-'))return this.workflow.dispatch(input);
    if(['start','close-round','select','generate'].includes(action)&&this.state.workflow.phase!=='idle'&&internal!==this.workflow)throw Error('请使用上方工作流主控，完成本轮投票和揭晓作画');
    const context=()=>({theme:this.state.theme.title,rules:this.state.theme.rules});
    switch(action) {
      case 'theme': {
        const title=string(input.title,100);required(title,'请先填写今日主题');this.reset();this.state.theme={title,rules:string(input.rules,2000)};break;
      }
      case 'start':required(this.state.theme.title,'请先填写今日主题');required(this.state.round.status!=='collecting','已经在收词');this.reset();this.state.round.status='collecting';break;
      case 'close-round':required(this.state.round.status==='collecting','当前没有进行中的收词');this.state.round.status='closed';break;
      case 'avatar':required(typeof input.enabled==='boolean','请选择是否显示动画主持');this.state.settings.avatarEnabled=input.enabled;break;
      case 'room':this.state.settings.room=normalizeRoom(input.room);break;
      case 'connect': {
        required(!this.jobs.has('connect'),'操作进行中，请稍候');
        const room=normalizeRoom(input.room||this.state.settings.room);this.state.settings.room=room;this.state.capture.room=room;
        await this.task('connect',()=>this.capture.start(room),()=>{},{scoped:false});break;
      }
      case 'disconnect':await this.capture.stop();this.state.capture={state:'disconnected',message:'已断开直播间',room:this.state.settings.room,active:false};break;
      case 'manual':required(string(input.text),'请输入弹幕内容');this.receive({id:uid(),text:input.text,nickname:input.nickname||'主播代录',userId:input.userId,source:'manual'});break;
      case 'select': {
        required(this.state.round.status==='closed','先结束收词，再进行评选');
        const comments=prepareCandidates(this.state.comments.filter(c=>!parseVote(c.text)),{roundId:this.state.round.id});
        const originals=new Map(this.state.comments.map(c=>[c.id,{...c}]));
        required(comments.length,'本轮还没有可评选的投稿');
        await this.task('select',signal=>this.text.select({...context(),comments,signal}),result=>{
          required(Array.isArray(result.selections)&&result.selections.length<=3,'评选结果格式无效');
          const ids=new Set(),viewers=new Set();
          for(const item of result.selections){
            const candidate=comments.find(c=>c.id===item.commentId);
            required(candidate&&!ids.has(item.commentId)&&string(item.prompt)&&string(item.reason),'评选包含无效候选');
            const viewer=viewerKey(candidate);required(!viewer||!viewers.has(viewer),'同一位观众本轮只能占一个入选名额');
            const sourceIds=item.sourceIds??[item.commentId];
            const allowed=new Set([...candidate.sourceIds,...candidate.context.map(c=>c.id)]);
            required(Array.isArray(sourceIds)&&sourceIds.includes(item.commentId)&&sourceIds.length>0&&sourceIds.every(id=>allowed.has(id)&&originals.has(id)),'评选引用了无效的原文依据');
            ids.add(item.commentId);if(viewer)viewers.add(viewer);
          }
          this.state.selections=result.selections.map(s=>{
            const candidate=comments.find(c=>c.id===s.commentId),sourceIds=[...new Set(s.sourceIds??[s.commentId])];
            return {commentId:s.commentId,reason:string(s.reason,500),prompt:string(s.prompt,2000),text:candidate.text,nickname:candidate.nickname,userId:candidate.userId,roomId:candidate.roomId,source:candidate.source,sourceIds,sources:sourceIds.map(id=>{const c=originals.get(id);return {id:c.id,text:c.text,nickname:c.nickname,userId:c.userId,roomId:c.roomId,source:c.source,sourceMsgId:c.sourceMsgId};})};
          });
        });break;
      }
      case 'explain':required(this.state.theme.title,'请先填写今日主题');await this.task('explain',signal=>this.text.explain({...context(),signal}),r=>{required(string(r.text),'规则解说为空');this.state.explanation=string(r.text);});break;
      case 'evaluate':case 'reply': {
        const c=this.comment(input.commentId);required(this.state.theme.title,'请先填写今日主题');
        await this.task(`${action}:${c.id}`,signal=>this.text[action]({...context(),comment:{...c},signal}),r=>{
          if(action==='evaluate'){required(typeof r.eligible==='boolean'&&Number.isFinite(r.score)&&r.score>=0&&r.score<=100&&string(r.reason),'评估结果格式无效');c.evaluation=r;}else{required(string(r.text),'AI 回复为空');c.reply=string(r.text);}
        });break;
      }
      case 'generate': {
        const selected=this.state.selections.find(s=>s.commentId===input.commentId),c={id:input.commentId};required(selected,'先让 AI 评选，再选择入选词出图');
        const epoch=this.epoch, stageRevision=this.stageRevision;
        const format=input.format||this.availability.outputFormat||'png';
        const sourceIds=new Set(selected.sourceIds||[selected.commentId]),selectedViewer=viewerKey(selected);
        const originals=(selected.sources||[]).filter(source=>sourceIds.has(source.id)&&(source.id===selected.commentId||(selectedViewer&&viewerKey(source)===selectedViewer))).map(source=>string(source.text)).filter(Boolean);
        const originalText=originals.length?originals.join('\n'):selected.text;
        const references=this.artReferences(originalText);
        required(this.epoch===epoch&&!this.closed,'出图任务已过时');
        const artPrompt=buildArtPrompt({prompt:selected.prompt,originalText,theme:this.state.theme.title,style:string(input.style,300),referenceNotes:references.notes,format});
        await this.task(`generate:${c.id}`,signal=>this.image.generate({prompt:artPrompt,artDirected:true,references:references.images,signal,format}),async r=>{
          if(input.format==='gif')required(r.mime==='image/gif','动图接口没有返回GIF，未用静图替代');
          const artwork=await this.media(r,'image',{commentId:c.id,text:selected.text,nickname:selected.nickname,prompt:artPrompt,info:r.info,references:references.sources,theme:this.state.theme.title});
          if(this.epoch!==epoch||this.closed)return;this.state.artworks.push(artwork);if(stageRevision===this.stageRevision&&input.publish!==false)this.state.stage.artworkId=artwork.id;
        });break;
      }
      case 'speak': {
        if(this.state.workflow.phase!=='idle'){this.workflow.queue.enqueue({text:string(input.text,2000),voiceId:this.state.workflow.voiceId});this.changed();return this.snapshot();}
        const text=string(input.text,2000);required(text,'没有可朗读的文字');const epoch=this.epoch, speechGeneration=this.speechGeneration+1;
        await this.task('speak',signal=>{this.speechGeneration=speechGeneration;return this.prepareSpeech({text,signal});},async ({media:audio,completion})=>{
          if(this.epoch!==epoch||this.closed)return;
          completion.catch(error=>{if(!this.closed&&this.epoch===epoch&&!error.message?.includes('取消')){this.state.errors.push('语音流中断，请手动重试');this.changed();}});
          if(speechGeneration!==this.speechGeneration)return;this.state.stage.speechId=audio.id;this.state.stage.speechRevision=++this.playbackSerial;this.state.stage.caption=text;
        },{retainUntil:result=>result.completion});break;
      }
      case 'show-artwork':required(this.state.artworks.some(a=>a.id===input.id),'作品不存在');this.stageRevision++;this.state.stage.artworkId=input.id;break;
      case 'play-speech': {const audio=this.state.speech.find(a=>a.id===input.id);required(audio,'语音不存在');if(this.state.workflow.phase!=='idle'){this.workflow.queue.enqueue({text:audio.text,media:audio});break;}this.speechGeneration++;this.state.stage.speechId=audio.id;this.state.stage.speechRevision=++this.playbackSerial;this.state.stage.caption=audio.text;break;}
      case 'speech-ended':this.workflow.queue.ack(input);break;
      case 'stop-speech':this.abortSpeechStreams();this.workflow.s.autoVoice=false;this.workflow.queue.stop();this.speechGeneration++;this.jobs.get('speak')?.controller.abort();this.state.stage.speechId=null;this.state.stage.caption='';break;
      case 'clear-stage':this.abortSpeechStreams();this.workflow.queue.stop();this.stageRevision++;this.speechGeneration++;this.state.stage={artworkId:null,speechId:null,caption:''};break;
      case 'clear-errors':this.state.errors=[];break;
      default:throw Error('不支持的操作');
    }
    this.changed();return this.snapshot();
  }
  async close() {
    if(this.closed)return;this.abortSpeechStreams();this.progressive.close();this.closed=true;clearInterval(this.workflowTimer);this.workflow.reset();this.epoch++;for(const job of this.jobs.values())job.controller.abort();
    this.capture?.off('comment',this.onComment);this.capture?.off('status',this.onStatus);
    await this.capture?.stop();await this.flush();
  }
}
