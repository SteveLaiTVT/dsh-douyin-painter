// Reusable mechanics: identity, exact repetition and fair bounded candidate sets.
// Theme relevance and which idea is best remain the evaluator's responsibility.
export const normalizeText = text => text.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
export function messageKey(comment) {
  return JSON.stringify([comment.source==='manual'?'manual':'live',comment.roomId||'',comment.sourceMsgId||comment.id]);
}
export function viewerKey(comment) {
  return typeof comment.userId==='string' && comment.userId.trim()
    ? JSON.stringify([comment.source==='manual'?'manual':'live',comment.roomId||'',comment.userId]) : null;
}
export function duplicateKey(comment) {
  const viewer=viewerKey(comment);
  return viewer ? JSON.stringify([comment.roundId||'',viewer,normalizeText(comment.text)]) : null;
}
// Keep registration generous. Only unambiguous non-ideas are skipped here;
// whether a plain object is interesting is not a permanent admission gate.
export function isCandidateNoise(text) {
  if (typeof text !== 'string') return true;
  const normalized = text.normalize('NFKC').trim();
  return !normalized || /^[\p{P}\s]+$/u.test(normalized) || /^(?:哈{2,}|呵{2,}|嘿{2,}|呃{2,}|嗯{2,})[!！。,.，\s]*$/u.test(normalized)
    || /^投\s*[123一二三](?:\s*号)?$/u.test(normalized);
}
export function prepareCandidates(comments,{roundId,maxPerUser=10,maxTotal=100}={}) {
  const groups=new Map();
  for(const comment of comments) {
    if(comment.roundId!==roundId||isCandidateNoise(comment.text))continue;
    const key=viewerKey(comment)||`message:${comment.id}`;
    if(!groups.has(key))groups.set(key,{all:[],unique:new Map()});
    const group=groups.get(key);group.all.push(comment);
    const normalized=normalizeText(comment.text);
    if(group.unique.has(normalized))group.unique.get(normalized).sourceIds.push(comment.id);
    else group.unique.set(normalized,{...comment,sourceIds:[comment.id]});
  }
  const queues=[...groups.values()].map(group=>{
    let entries=[...group.unique.values()];
    if(entries.length>maxPerUser){const head=Math.min(2,maxPerUser-1);entries=[...entries.slice(0,head),...entries.slice(-(maxPerUser-head))];}
    return entries.map(entry=>{
      const context=[...group.all.slice(-4)];if(!context.some(c=>c.id===entry.id))context.unshift(entry);
      return {...entry,context:context.map(({id,text})=>({id,text}))};
    });
  });
  // One candidate per viewer before taking another from anyone, so a fast
  // chatter cannot crowd other viewers out of the model's bounded input.
  const result=[];
  for(let index=0;result.length<maxTotal&&queues.some(q=>index<q.length);index++)
    for(const queue of queues)if(queue[index]&&result.length<maxTotal)result.push(queue[index]);
  return result;
}
export function historyEvictionIndex(comments,{roundId}={}) {
  const old=comments.findIndex(comment=>comment.roundId!==roundId);
  if(old!==-1)return old;
  const groups=new Map();
  comments.forEach((comment,index)=>{const key=viewerKey(comment);if(key){if(!groups.has(key))groups.set(key,[]);groups.get(key).push(index);}});
  const largest=[...groups.values()].sort((a,b)=>b.length-a.length)[0];
  // Preserve the first idea and the newest contributions. Excess messages
  // from one known viewer cannot evict somebody else's only contribution.
  return largest?.length>1?largest[Math.min(2,largest.length-2)]:0;
}
