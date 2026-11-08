const fields: any=[['title','主题标题',100,1],['genre','题材类型',80,1],['logline','故事钩子',240,2],['setting','世界背景与地点',500,3],['visualStyle','画风、配色与光影',300,2],['audiencePrompt','观众该发什么',300,2],['rules','玩法与规则',1500,3],['hostIntro','开场词 · 最多80字',160,3],['imageGuidance','单个作品的生图指导',500,3]];
const make: any=(tag: any,text: any,className: any)=>{const el: any=document.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;};
export function createThemePlanner({dispatch,busy}: any){
 const $: any=(id: any)=>document.getElementById(id);
 const cards: any=$('theme-plan-options'),form: any=$('theme-plan-review'),editor: any=$('theme-plan-fields'),shots: any=$('theme-plan-storyboard');
 let state: any,draftId: any=null,optionId: any=null,loadedRevision: any=0,dirty: any=false,seedDirty: any=false,notesDirty: any=false,signature: any='';
 const inputs: any={};
 for(const [key,label,max,rows] of fields){const box: any=make('label',label,'plan-field');const input: any=make(rows===1?'input':'textarea');input.id=`plan-${key}`;input.maxLength=max;input.required=true;if(Number(rows)>1)input.rows=rows;box.htmlFor=input.id;box.append(input);editor.append(box);inputs[key]=input;}
 const exampleLabel: any=make('label','三个创意示例 · 每行一个','plan-field');const examples: any=make('textarea');examples.id='plan-examples';examples.rows=3;examples.maxLength=362;examples.required=true;exampleLabel.append(examples);editor.append(exampleLabel);
 function readPlan(){const plan: any={};for(const [key]of fields)plan[key]=inputs[key].value.trim();plan.examples=examples.value.split('\n').map((v: any)=>v.trim()).filter(Boolean);plan.storyboard=[...shots.children].map((box: any)=>{const shot: any={};for(const input of box.querySelectorAll('[data-shot-field]'))shot[input.dataset.shotField]=input.value.trim();return shot;});return plan;}
 function load(option: any){
  optionId=option.id;loadedRevision=state.themeDraft.revision;dirty=false;
  for(const [key]of fields)inputs[key].value=option.plan[key];examples.value=option.plan.examples.join('\n');shots.replaceChildren();
  option.plan.storyboard.forEach((shot: any,index: any)=>{const box: any=make('fieldset',null,'plan-shot');box.append(make('legend',`分镜 ${index+1}`));
   for(const [key,label,max,rows]of [['title','镜头名称',60,1],['visual','画面',240,3],['motion','单一动作',160,2],['narration','主持词',160,2]]){
    const wrap: any=make('label',label);const input: any=make(rows===1?'input':'textarea');input.dataset.shotField=key;input.value=shot[key];input.maxLength=max;input.required=true;if(Number(rows)>1)input.rows=rows;wrap.append(input);box.append(wrap);
   }shots.append(box);
  });signature='';
 }
 function render(next: any = undefined){
  if(next)state=next;if(!state)return;
  const draft: any=state.themeDraft,working: any=busy('theme-plan');
  if(!seedDirty)$('plan-seed').value=draft?.seed||state.theme?.title||'';
  if(!notesDirty)$('plan-notes').value=draft?.notes||'';
  $('generate-theme-plan').disabled=working||dirty;
  $('generate-theme-plan').textContent=working?'正在编写三个方向…':draft?'重新生成三个方向':'生成三个策划方向';
  $('theme-plan-status').textContent=working?'正在准备世界观、故事板、风格和玩法。现有直播继续，完成后在这里 Review。':dirty?'当前有未保存的修改，先保存或恢复草稿，再切换方向。':'生成的是待审核草案，点击应用前不会改变直播主题。';
  form.hidden=!draft;cards.hidden=!draft;if(!draft)return;
  if(draft.id!==draftId&&dirty){
    $('plan-review-state').textContent='新草案已在其他页面生成，当前编辑仍保留；可恢复到新草案继续 Review。';
    $('save-theme-plan').disabled=true;$('apply-theme-plan').disabled=true;$('discard-theme-plan-edits').hidden=false;
    for(const card of cards.children)card.disabled=true;
    return;
  }
  if(draft.id!==draftId){draftId=draft.id;load(draft.options[0]);}
  if(!dirty&&loadedRevision!==draft.revision)load(draft.options.find((o: any)=>o.id===optionId)||draft.options[0]);
  const sig: any=JSON.stringify([draft.id,draft.revision,optionId,dirty,working]);
  if(sig!==signature){signature=sig;cards.replaceChildren();for(const [index,option]of draft.options.entries()){
   const card: any=make('button',null,'plan-option');card.type='button';card.dataset.selected=String(option.id===optionId);card.setAttribute('aria-pressed',String(option.id===optionId));card.disabled=dirty||working;
   card.append(make('span',`方向 ${index+1} · ${option.plan.genre}`,'plan-option-genre'),make('strong',option.plan.title),make('p',option.plan.logline));
   card.onclick=()=>{load(option);render();};cards.append(card);
  }}
  const conflict: any=dirty&&loadedRevision!==draft.revision;
  const selected: any=state.theme?.planSelection;
  const applied: any=selected?.draftId===draft.id&&selected?.optionId===optionId&&JSON.stringify(state.theme.plan)===JSON.stringify(draft.options.find((o: any)=>o.id===optionId)?.plan);
  $('plan-review-state').textContent=conflict?'草案已在其他页面更新。当前编辑仍保留，请恢复最新草稿后继续。':dirty?'有未保存的修改':applied?'已应用到直播间':'草案已保存 · 尚未应用';
  $('save-theme-plan').disabled=working||busy('theme-plan-save')||!dirty||conflict;
  const canApply: any=['idle','revealed','error'].includes(state.workflow?.phase||'idle')&&state.round?.status!=='collecting';
  $('apply-theme-plan').disabled=working||busy('theme-plan-save')||busy('theme-plan-apply')||!canApply||conflict;
  $('plan-apply-help').textContent=canApply?'确认后将替换主题与规则，主持接话和生图会使用这份方案。':'本轮进行中，可以准备和保存草案；结束本轮后再应用。';
  $('discard-theme-plan-edits').hidden=!dirty;
 }
 form.addEventListener('input',()=>{dirty=true;render();});
 $('plan-seed').addEventListener('input',()=>{seedDirty=true;});
 $('plan-notes').addEventListener('input',()=>{notesDirty=true;});
 $('theme-plan-form').onsubmit=async (event: any)=>{
  event.preventDefault();const theme: any=$('plan-seed').value.trim(),notes: any=$('plan-notes').value.trim();
  const success: any=await dispatch({action:'theme-plan',theme,notes});
  if(success){if($('plan-seed').value.trim()===theme)seedDirty=false;if($('plan-notes').value.trim()===notes)notesDirty=false;render();}
 };
 async function send(action: any){
  if(!form.reportValidity())return;
  const success: any=await dispatch({action,draftId,optionId,revision:loadedRevision,plan:readPlan()});
  if(success){dirty=false;load(state.themeDraft.options.find((o: any)=>o.id===optionId)||state.themeDraft.options[0]);render();}
 }
 form.onsubmit=(event: any)=>{event.preventDefault();void send('theme-plan-save');};
 $('apply-theme-plan').onclick=()=>void send('theme-plan-apply');
 $('discard-theme-plan-edits').onclick=()=>{load(state.themeDraft.options.find((o: any)=>o.id===optionId)||state.themeDraft.options[0]);render();};
 return {render};
}
