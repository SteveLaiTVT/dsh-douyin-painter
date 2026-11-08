import {VotingRound,parseVote} from './voting.js';
import {PlaybackQueue} from './playback-queue.js';
import {ConversationDirector} from './conversation.js';
import {viewerKey} from './comment-processing.js';
const requireThat: any=(value: any,message: any)=>{if(!value)throw Error(message);};
const connected: any=(c: any)=>c.active!==false&&['running','receiving','connected','online','live'].includes(c.state);
const seconds: any=(value: any,fallback: any,max: any)=>Number.isFinite(Number(value))?Math.min(max,Math.max(5,Number(value))):fallback;
export class LiveWorkflow {
  [key: string]: any;

  constructor(app: any,{clock=Date.now}: any={}) {
    this.app=app;this.clock=clock;this.ruleGates=new Map();this.version=0;this.op=null;this.vote=null;this.conversation=new ConversationDirector({text:app.text?.converse?app.text:{converse:async()=>({commentId:null,text:'',readOriginal:false})},clock});
    this.app.state.workflow=this.initial();
    this.queue=new PlaybackQueue({clock,synthesize:async(item: any,signal: any)=>{
      return await app.prepareSpeech({text:item.text,voiceId:item.voiceId,signal});
    },onPlay:(media: any,item: any)=>{app.state.stage.speechId=media.id;app.state.stage.speechRevision=++app.playbackSerial;app.state.stage.caption=item.text;return {revision:app.playbackSerial};},onStop:(old: any)=>{if(app.state.stage.speechId===old.mediaId&&app.state.stage.speechRevision===old.revision){app.state.stage.speechId=null;app.state.stage.caption='';}},onError:(e: any)=>{this.s.autoVoice=false;this.s.message='语音未完成，自动朗读已暂停；可检查后重新开启';this.warn(e);app.changed();},onChange:()=>app.changed()});
  }
  initial(){return {phase:'idle',recommendationFailed:false,deadline:null,remainingMs:0,choices:[],voters:0,unknownVotes:0,winnerCommentId:null,tie:[],message:'设置主题后，开始一轮共创',autoChat:true,autoVoice:true,voiceId:this.app.availability.defaultVoiceId||'Chinese (Mandarin)_Radio_Host',currentQuestion:'',conversation:[],queue:[]};}
  get s(){return this.app.state.workflow;}
  snapshot(){return {...this.s,previousPhase:this.s.phase==='paused'?this.previousPhase:null,...(this.vote?this.vote.snapshot():{}),remainingMs:this.s.phase==='collecting'?Math.max(0,this.s.deadline-this.clock()):this.vote?this.vote.snapshot().remainingMs:this.s.remainingMs,queue:this.queue?.snapshot()||[]};}
  reset(){this.version++;this.conversation.reset({preserveRecent:true});this.queue?.stop();this.vote=null;this.op=null;this.pendingArtworkId=null;this.app.state.workflow=this.initial();}
  warn(e: any){this.app.state.errors.push(e.message||'工作流操作失败');this.app.state.errors=this.app.state.errors.slice(-5);}
  say(text: any,{expiresAt}: any={}){if(this.s.autoVoice&&this.s.phase!=='paused')this.queue.enqueue({text,voiceId:this.s.voiceId,expiresAt});}
  ruleGate(){
    const key: any=JSON.stringify([this.app.state.theme.title,this.app.state.theme.rules,this.app.state.theme.plan?.hostIntro||null]);
    if(!this.ruleGates.has(key)){
      this.ruleGates.set(key,{explanation:'',text:'',nextAt:-Infinity});
      while(this.ruleGates.size>10)this.ruleGates.delete(this.ruleGates.keys().next().value);
    }
    return this.ruleGates.get(key);
  }
  remindRules({opening=false}: any={}){
    if(!this.s.autoVoice||!['collecting','voting','generating'].includes(this.s.phase))return false;
    const gate: any=this.ruleGate(),now: any=this.clock();
    if(!gate.text||now<gate.nextAt)return false;
    // A reminder slot is dropped when speech is occupied; never queue a
    // delayed rule script behind audience interaction or replay missed slots.
    if(this.queue.snapshot().length){if(!opening)gate.nextAt=now+180000;return false;}
    const boundary: any=this.s.phase==='collecting'?this.s.deadline:this.s.phase==='voting'?this.vote?.deadline:Infinity;
    const expiresAt: any=Math.min(now+15000,boundary??Infinity);
    if(expiresAt<=now)return false;
    const text: any=this.s.phase==='generating'
      ? '本轮投票已经结束，正在生成动图。下一轮仍由大家围绕主题提交创意，候选公布后再投票决定作画内容；请等待主播开启下一轮。'
      : this.s.phase==='voting'
        ? '本轮已经进入投票阶段。发送投1、投2或投3选择你想看的候选，每个UID以截止前的最后一票为准，仅统计实际收到的有效票。'
        : gate.text;
    const id: any=this.queue.enqueue({text,voiceId:this.s.voiceId,expiresAt});
    if(!id)return false;
    gate.nextAt=now+180000;
    this.conversation.recordNarration(text,'rules');
    return true;
  }
  onComment(comment: any){if(this.s.phase==='voting'){if(this.clock()>=this.vote.deadline)this.finishVote();else if(!this.room||comment.roomId===this.room)this.vote.cast(comment);}}
  onCapture(){if(this.s.phase==='voting'&&!connected(this.app.state.capture))this.pause('弹幕连接中断或直播间未开播，正式投票已暂停');}
  pause(message: any='主播已暂停互动'){
    requireThat(['collecting','voting','generating'].includes(this.s.phase),'当前阶段无需暂停');
    this.previousPhase=this.s.phase;
    if(this.vote&&!this.vote.finished)this.vote.pause();
    else if(this.s.phase==='collecting')this.s.remainingMs=Math.max(0,this.s.deadline-this.clock());
    this.s.deadline=null;this.s.phase='paused';this.s.message=message;this.queue.stop();this.conversation.cancel();this.app.jobs.get('explain')?.controller.abort();
  }
  resume(){
    requireThat(this.s.phase==='paused','当前没有暂停的比赛');
    if(this.previousPhase==='voting'){
      requireThat(connected(this.app.state.capture),'请先恢复弹幕连接');
      requireThat(!this.room||this.app.state.capture.room===this.room,'请恢复投票所属直播间的连接');this.vote.resume();
    }else if(this.previousPhase==='collecting')this.s.deadline=this.clock()+this.s.remainingMs;
    const gate: any=this.ruleGate();
    // Finite nextAt means a prior slot was scheduled. Never repay missed
    // reminders after a pause; an unscheduled first introduction stays eligible.
    if(Number.isFinite(gate.nextAt)&&this.clock()>=gate.nextAt)gate.nextAt=this.clock()+180000;
    this.s.phase=this.previousPhase;this.s.message='比赛已继续';
    if(this.pendingArtworkId){this.app.state.stage.artworkId=this.pendingArtworkId;this.pendingArtworkId=null;this.say('动图已经完成，感谢大家一起创作。');}
  }
  finishVote(){requireThat(this.s.phase==='voting'||(this.s.phase==='paused'&&this.previousPhase==='voting'),'当前没有正在进行的投票');this.conversation.cancel();Object.assign(this.s,this.vote.finish());this.s.phase='ready';this.s.currentQuestion=this.s.winnerCommentId?'票选结果已经确定，准备把灵感变成动图':'等待主播裁定或重新投票';this.queue.stop();this.s.message=this.s.winnerCommentId?'投票完成，准备揭晓作画':this.s.voters?'票数相同，请主播在候选中裁定':'没有收到有效票，请主播选择一个创意或重新投票';this.say(this.s.winnerCommentId?'投票结束，大家选出的创意即将变成动图。':'投票结束，这一轮请主播从候选中选出要画的创意。');}
  async exclusive(work: any){requireThat(!this.op,'当前阶段正在处理，请稍候');const token: any={version:this.version};this.op=token;try{return await work(token);}finally{if(this.op===token)this.op=null;}}
  async dispatch(input: any) {
    const app: any=this.app;
    switch(input.action){
      case 'workflow-start': {
        requireThat(!['collecting','selecting','voting','paused','generating'].includes(this.s.phase),'当前一轮尚未结束');
        await app.dispatch({action:'start'},this);this.s.collectSeconds=seconds(input.collectSeconds,90,600);this.s.voteSeconds=seconds(input.voteSeconds,30,180);this.s.autoChat=input.autoChat!==false;this.s.autoVoice=input.autoVoice!==false;if(input.voiceId)this.setVoice(input.voiceId);this.allowManualVotes=input.allowManualVotes===true;
        this.s.phase='collecting';this.s.startedAt=this.clock();this.s.deadline=this.clock()+this.s.collectSeconds*1000;this.s.currentQuestion=app.state.theme.plan?.audiencePrompt||`今天的主题是「${app.state.theme.title}」，你有什么有画面感的创意？`;this.s.message='正在收集创意，投票将在候选公布后开始';const version: any=this.version;
        await this.exclusive(async()=>{try{
          const gate: any=this.ruleGate();
          if(gate.explanation)app.state.explanation=gate.explanation;
          else await app.dispatch({action:'explain'});
          if(version!==this.version||this.s.phase!=='collecting')return;
          if(app.state.explanation?.trim()){
            gate.explanation=app.state.explanation;
            gate.text=`${gate.explanation} 收词结束后会推荐候选，大家发送投1、投2或投3投票，每人一票，截止前可以改票。`;
            if(!this.remindRules({opening:true}))this.say(`新一轮开始，围绕「${app.state.theme.title}」分享你的新创意吧。`);
          }
        }catch{if(version===this.version)this.s.message='开场解说未完成，可继续收词或手动重试';}});break;
      }
      case 'workflow-next': {
        requireThat(this.s.phase==='collecting'||(this.s.phase==='ready'&&this.s.recommendationFailed&&!this.vote),'请在收词阶段使用结束收词');const wasCollecting: any=this.s.phase==='collecting';const version: any=this.version;
        await this.exclusive(async()=>{this.conversation.cancel();this.s.phase='selecting';this.s.currentQuestion='正在按贴题、创意和画面感整理大家的好点子';this.s.deadline=null;this.queue.stop();this.s.message='DeepSeek正在按贴题、创意和画面感推荐候选';if(wasCollecting)await app.dispatch({action:'close-round'},this);
          try{await app.dispatch({action:'select'},this);if(version!==this.version)return;this.syncChoices();this.s.recommendationFailed=false;this.s.phase='ready';this.s.currentQuestion='候选已经就位，你最想看哪个创意变成动图？';this.s.message=this.s.choices.length?'候选已就绪，可补选或开始观众投票':'没有合适候选，可以由主播补选';this.say('候选创意已经公布。请看看大家的点子，主播还可以补充候选。');}catch(e: any){if(version===this.version){this.s.phase='ready';this.s.recommendationFailed=true;this.s.message='推荐未完成，可以手动补选候选或再试';app.changed();}throw e;}});break;
      }
      case 'workflow-nominate': {
        requireThat(this.s.phase==='ready'&&!this.vote,'请在投票前调整候选');const c: any=app.comment(input.commentId);requireThat(c.roundId===app.state.round.id&&!parseVote(c.text),'只能补选本轮创意');requireThat(app.state.selections.length<3,'候选已满，请先移除一个');const key: any=viewerKey(c);requireThat(!app.state.selections.some((s: any)=>s.commentId===c.id||(key&&viewerKey(s)===key)),'同一观众只能有一个候选');app.state.selections.push({...c,commentId:c.id,reason:'主播补选',prompt:`${app.state.theme.title}。${c.text}`,sourceIds:[c.id],sources:[{...c}]});this.syncChoices();break;
      }
      case 'workflow-remove':requireThat(this.s.phase==='ready'&&!this.vote,'投票前才能调整候选');app.state.selections=app.state.selections.filter((s: any)=>s.commentId!==input.commentId);this.syncChoices();break;
      case 'workflow-vote':requireThat(this.s.phase==='ready'&&this.s.choices.length,'先准备候选，再开始投票');requireThat(connected(app.state.capture),'请先连接已开播的直播间，再开始正式投票');this.vote=new VotingRound(this.s.choices,{clock:this.clock,durationMs:this.s.voteSeconds*1000,allowManualVotes:this.allowManualVotes});this.room=app.state.capture.room||app.state.settings.room;this.conversation.cancel();this.queue.stop();this.s.phase='voting';this.s.currentQuestion='发送投1、投2或投3，选出你想看的动图！';this.s.winnerCommentId=null;this.s.tie=[];this.s.message='发送投1、投2或投3；每UID最后一票生效，仅统计收到的有效票';this.say(this.s.message);break;
      case 'workflow-close-vote':this.finishVote();break;
      case 'workflow-pause':this.pause();break;
      case 'workflow-resume':this.resume();break;
      case 'workflow-settings':if(typeof input.autoChat==='boolean'){this.s.autoChat=input.autoChat;if(!input.autoChat)this.conversation.cancel();}if(typeof input.autoVoice==='boolean'){const wasEnabled: any=this.s.autoVoice;this.s.autoVoice=input.autoVoice;if(!input.autoVoice)this.queue.stop();else if(!wasEnabled){const gate: any=this.ruleGate();gate.nextAt=Math.max(gate.nextAt,this.clock()+180000);}}if(input.autoChat===true)this.conversation.lastError=null;if(input.voiceId)this.setVoice(input.voiceId);break;
      case 'workflow-reveal': {
        requireThat(this.s.phase==='ready'&&this.vote?.finished,'先结束观众投票，再揭晓作品');const winner: any=this.s.winnerCommentId||input.commentId;requireThat(winner,'平票或没有有效票，请主播先裁定一个创意');requireThat(this.s.choices.some((c: any)=>c.commentId===winner),'该创意不在本轮候选中');if(this.s.winnerCommentId&&input.commentId)requireThat(input.commentId===this.s.winnerCommentId,'请尊重有效票选出的获胜创意');if(this.s.tie.length)requireThat(this.s.tie.includes(winner),'请从平票候选中裁定');const version: any=this.version;
        await this.exclusive(async()=>{this.s.winnerCommentId=winner;this.s.phase='generating';this.s.currentQuestion='动图正在创作中，欢迎继续补充你的想象';this.s.message='正在生成原生GIF动图，请稍候';this.queue.stop();const choice: any=this.s.choices.find((c: any)=>c.commentId===winner);this.say(`本轮要画的是${String(choice.nickname||'观众').slice(0,12)}的创意${Array.from(choice.text||'').length<=40?'，'+choice.text:''}。正在生成动图。`);
          try{await app.dispatch({action:'generate',commentId:winner,format:'gif',publish:false},this);if(version!==this.version)return;this.conversation.cancel();const artworkId: any=app.state.artworks.at(-1)?.id;if(this.s.phase==='paused'){this.previousPhase='revealed';this.pendingArtworkId=artworkId;this.s.message='动图已完成，等待主播继续揭晓';return;}app.state.stage.artworkId=artworkId;this.s.phase='revealed';this.s.currentQuestion='感谢每位观众的灵感，下一轮继续一起创作';this.s.message='动图已揭晓，感谢每位观众的灵感';this.say(`动图已经完成，灵感来自${choice.nickname||'这位观众'}。感谢大家一起创作。`);}catch(e: any){if(version===this.version){this.conversation.cancel();this.s.phase='ready';this.s.message='GIF生成未完成；可查看错误后手动重试，不会自动重复调用';app.changed();}throw e;}});break;
      }
      default:throw Error('未知工作流操作');
    }
    app.changed();return app.snapshot();
  }
  interactionNarration(result: any,comment: any){
    const reply: any=typeof result.text==='string'?result.text.trim():'';
    if(!reply||Array.from(reply).length>100)return null;
    const original: any=typeof comment.text==='string'?comment.text.trim():'';
    const readable: any=original&&Array.from(original).length<=40&&!/[\r\n]|https?:\/\/|www\./iu.test(original);
    if(result.readOriginal&&readable)return `${String(comment.nickname||'观众').slice(0,12)}说，${original}。${reply}`;
    return reply;
  }
  setVoice(id: any){const voices: any=this.app.availability.voicePresets||[];requireThat(typeof id==='string'&&id.length<=128&&(!voices.length||voices.some((v: any)=>v.id===id)||id===this.app.availability.defaultVoiceId),'请选择可用音色');this.s.voiceId=id;}
  syncChoices(){this.s.choices=this.app.state.selections.map((s: any,i: any)=>({...s,index:i+1,votes:0}));}
  async tick(){if(this.app.closed)return;this.queue.tick();let changed: any=false;
    if(this.s.phase==='collecting'&&this.clock()>=this.s.deadline&&!this.op){try{await this.dispatch({action:'workflow-next'});}catch(e: any){this.warn(e);}return;}
    if(this.s.phase==='voting'&&this.clock()>=this.vote.deadline){this.finishVote();changed=true;}
    if(['collecting','voting'].includes(this.s.phase)&&Math.floor(this.clock()/1000)!==this.lastTick){this.lastTick=Math.floor(this.clock()/1000);changed=true;}
    if(changed)this.app.changed();
    this.remindRules();
    if(this.s.autoChat&&['collecting','voting','generating'].includes(this.s.phase)&&(!this.op||this.s.phase==='generating')&&this.app.text?.converse){const version: any=this.version,phase: any=this.s.phase;const result: any=await this.conversation.next({theme:this.app.state.theme.title,rules:this.app.state.theme.rules,themePlan:this.app.state.theme.plan,phase,comments:this.app.state.comments.filter((c: any)=>c.receivedAt>=this.s.startedAt)});if(version!==this.version||phase!==this.s.phase||!this.s.autoChat)return;if(!result){if(this.conversation.lastError){this.s.autoChat=false;this.s.message='AI接话未完成，已暂停自动接话，请检查后重新开启';this.warn(Error(this.conversation.lastError));this.app.changed();}return;}if(result.kind==='rules'){this.remindRules();return;}const c: any=this.app.state.comments.find((c: any)=>c.id===result.commentId);if(!c)return;const entry: any={...result,nickname:c.nickname,at:this.clock()};this.s.conversation.push(entry);this.s.conversation=this.s.conversation.slice(-20);this.s.currentQuestion=result.text;c.reply=result.text;this.app.state.stage.caption=result.text;const narration: any=this.interactionNarration(result,c);if(narration)this.say(narration,{expiresAt:this.clock()+15000});this.app.changed();}
  }
}
