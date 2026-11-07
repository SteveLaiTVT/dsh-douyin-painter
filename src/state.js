import {normalizeThemeDraft,normalizeThemePlan} from './theme-planning.js';
// Validate a saved snapshot before replacing live state. A partially valid file
// must never leave the application half restored and unable to start a contest.
export function restoreState(saved, defaults) {
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const str=v=>typeof v==='string';
  const validId=v=>str(v)&&/^[a-f0-9-]{36}$/.test(v);
  const check=(condition)=>{if(!condition)throw Error('历史记录格式损坏，已恢复空白工作台');};
  check(saved?.version===1&&object(saved.state));
  const s=saved.state;
  check(object(s.theme)&&str(s.theme.title)&&str(s.theme.rules));
  check(object(s.round)&&str(s.round.id)&&['idle','collecting','closed'].includes(s.round.status));
  check(Array.isArray(s.comments)&&s.comments.every(c=>object(c)&&str(c.id)&&str(c.text)&&str(c.nickname)&&Number.isFinite(c.receivedAt)&&(!c.evaluation||object(c.evaluation))&&(!c.reply||str(c.reply))));
  check(Array.isArray(s.selections)&&s.selections.every(c=>object(c)&&str(c.commentId)&&str(c.reason)&&str(c.prompt)));
  check(Array.isArray(s.artworks)&&s.artworks.every(c=>object(c)&&validId(c.id)&&c.url===`/media/${c.id}`&&['image/png','image/jpeg','image/webp','image/gif'].includes(c.mime)&&str(c.prompt)));
  check(Array.isArray(s.speech)&&s.speech.every(c=>object(c)&&validId(c.id)&&c.url===`/media/${c.id}`&&['audio/mpeg','audio/wav','audio/flac'].includes(c.mime)&&str(c.text)));
  check(str(s.explanation)&&object(s.stage));
  let themeDraft=null;try{if(s.themeDraft)themeDraft=normalizeThemeDraft(s.themeDraft);}catch{ /* Discard only the optional damaged draft. */ }
  const theme=structuredClone(s.theme);if(theme.plan){try{theme.plan=normalizeThemePlan(theme.plan);}catch{delete theme.plan;delete theme.planSelection;}}
  return {
    ...defaults,settings:{room:typeof s.settings?.room==='string'?s.settings.room:'',avatarEnabled:s.settings?.avatarEnabled!==false},theme,themeDraft,round:{id:s.round.id,status:s.round.status==='collecting'?'closed':s.round.status},
    comments:structuredClone(s.comments.slice(-500)),selections:structuredClone(s.selections),artworks:structuredClone(s.artworks),speech:structuredClone(s.speech.filter(item=>!item.streaming)),explanation:s.explanation,
    stage:{artworkId:s.artworks.some(a=>a.id===s.stage.artworkId)?s.stage.artworkId:null,speechId:null,caption:''},errors:[],
  };
}
