import { viewerKey } from './comment-processing.js';
export function parseVote(text: any) { const match: any=typeof text==='string'?text.normalize('NFKC').trim().match(/^投\s*([123一二三])$/u):null;return match?({'一':1,'二':2,'三':3}[match[1]]||Number(match[1])):null; }
export class VotingRound {
  [key: string]: any;

  constructor(choices: any,{clock=Date.now,durationMs=30000,allowManualVotes=false}: any={}) {
    this.clock=clock;this.choices=structuredClone(choices);this.allowManualVotes=allowManualVotes;this.votes=new Map();this.seen=new Set();this.unknownVotes=0;this.deadline=clock()+durationMs;this.remainingMs=durationMs;this.paused=false;this.finished=false;
  }
  cast(comment: any) {
    const index: any=parseVote(comment.text);
    if(this.finished||this.paused||this.clock()>=this.deadline||!this.choices.some((c: any)=>c.index===index))return {accepted:false};
    if(comment.source==='manual'&&!this.allowManualVotes)return {accepted:false,reason:'manual'};
    const message: any=JSON.stringify([comment.source,comment.roomId,comment.id]);if(this.seen.has(message))return {accepted:false};this.seen.add(message);
    const key: any=viewerKey(comment);if(!key){this.unknownVotes++;return {accepted:false,reason:'unknown_uid'};}
    this.votes.set(key,index);return {accepted:true,index};
  }
  pause(){if(this.finished||this.paused)return;this.remainingMs=Math.max(0,this.deadline-this.clock());this.paused=true;this.deadline=null;}
  resume(){if(this.finished||!this.paused)return;this.deadline=this.clock()+this.remainingMs;this.paused=false;}
  snapshot(){return {choices:this.choices.map((c: any)=>({...c,votes:[...this.votes.values()].filter((v: any)=>v===c.index).length})),voters:this.votes.size,unknownVotes:this.unknownVotes,deadline:this.deadline,remainingMs:this.finished?0:this.paused?this.remainingMs:Math.max(0,this.deadline-this.clock())};}
  finish(){this.finished=true;const state: any=this.snapshot(),max: any=Math.max(0,...state.choices.map((c: any)=>c.votes));const winners: any=state.choices.filter((c: any)=>c.votes===max);return {...state,winnerCommentId:max>0&&winners.length===1?winners[0].commentId:null,tie:max===0||winners.length>1?winners.map((c: any)=>c.commentId):[]};}
}
