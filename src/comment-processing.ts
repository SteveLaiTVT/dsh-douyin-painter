// Reusable mechanics: identity, exact repetition and fair bounded candidate sets.
// Theme relevance and which idea is best remain the evaluator's responsibility.
export const normalizeText: any = (text: any) => text.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
export function messageKey(comment: any) {
  return JSON.stringify([comment.source==='manual'?'manual':'live',comment.roomId||'',comment.sourceMsgId||comment.id]);
}
export function viewerKey(comment: any) {
  return typeof comment.userId==='string' && comment.userId.trim()
    ? JSON.stringify([comment.source==='manual'?'manual':'live',comment.roomId||'',comment.userId]) : null;
}
export function duplicateKey(comment: any) {
  const viewer: any=viewerKey(comment);
  return viewer ? JSON.stringify([comment.roundId||'',viewer,normalizeText(comment.text)]) : null;
}
// Keep registration generous. Only unambiguous non-ideas are skipped here;
// whether a plain object is interesting is not a permanent admission gate.
export function isCandidateNoise(text: any) {
  if (typeof text !== 'string') return true;
  const normalized: any = text.normalize('NFKC').trim();
  return !normalized || /^[\p{P}\s]+$/u.test(normalized) || /^(?:哈{2,}|呵{2,}|嘿{2,}|呃{2,}|嗯{2,})[!！。,.，\s]*$/u.test(normalized)
    || /^投\s*[123一二三](?:\s*号)?$/u.test(normalized);
}
export function prepareCandidates(comments: any,{roundId,maxPerUser=10,maxTotal=100}: any={}) {
  const groups: any=new Map();
  for(const comment of comments) {
    if(comment.roundId!==roundId||isCandidateNoise(comment.text))continue;
    const key: any=viewerKey(comment)||`message:${comment.id}`;
    if(!groups.has(key))groups.set(key,{all:[],unique:new Map()});
    const group: any=groups.get(key);group.all.push(comment);
    const normalized: any=normalizeText(comment.text);
    if(group.unique.has(normalized))group.unique.get(normalized).sourceIds.push(comment.id);
    else group.unique.set(normalized,{...comment,sourceIds:[comment.id]});
  }
  const queues: any=[...groups.values()].map((group: any)=>{
    let entries: any=[...group.unique.values()];
    if(entries.length>maxPerUser){const head: any=Math.min(2,maxPerUser-1);entries=[...entries.slice(0,head),...entries.slice(-(maxPerUser-head))];}
    return entries.map((entry: any)=>{
      const context: any=[...group.all.slice(-4)];if(!context.some((c: any)=>c.id===entry.id))context.unshift(entry);
      return {...entry,context:context.map(({id,text}: any)=>({id,text}))};
    });
  });
  // One candidate per viewer before taking another from anyone, so a fast
  // chatter cannot crowd other viewers out of the model's bounded input.
  const result: any=[];
  for(let index: any=0;result.length<maxTotal&&queues.some((q: any)=>index<q.length);index++)
    for(const queue of queues)if(queue[index]&&result.length<maxTotal)result.push(queue[index]);
  return result;
}
export function historyEvictionIndex(comments: any,{roundId}: any={}) {
  const old: any=comments.findIndex((comment: any)=>comment.roundId!==roundId);
  if(old!==-1)return old;
  const groups: any=new Map();
  comments.forEach((comment: any,index: any)=>{const key: any=viewerKey(comment);if(key){if(!groups.has(key))groups.set(key,[]);groups.get(key).push(index);}});
  const largest: any=[...groups.values()].sort((a: any,b: any)=>b.length-a.length)[0];
  // Preserve the first idea and the newest contributions. Excess messages
  // from one known viewer cannot evict somebody else's only contribution.
  return largest?.length>1?largest[Math.min(2,largest.length-2)]:0;
}
