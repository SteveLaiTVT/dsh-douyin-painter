const record: any=(v: any)=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function field(value: any,name: any,max: any){if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(`策划${name}不能为空且不得超过${max}字符`);return value.trim();}
export function normalizeThemePlan(value: any){
 if(!record(value))throw Error('策划方案格式无效');
 const result: any={};
 for(const [key,label,max] of [['title','标题',100],['genre','题材类型',80],['logline','故事钩子',240],['setting','世界背景',500],['visualStyle','视觉风格',300],['audiencePrompt','参与引导',300],['rules','玩法规则',1500],['hostIntro','开场词',160],['imageGuidance','生图指导',500]])result[key]=field(value[key],label,max);
 if([...result.hostIntro].length>80)throw Error('策划开场词请控制在80字以内');
 if(!Array.isArray(value.examples)||value.examples.length!==3)throw Error('策划需要三个创意示例');
 result.examples=value.examples.map((v: any)=>field(v,'创意示例',120));
 if(!Array.isArray(value.storyboard)||value.storyboard.length<3||value.storyboard.length>5)throw Error('故事板需要3到5格');
 result.storyboard=value.storyboard.map((item: any)=>{if(!record(item))throw Error('故事板格式无效');return {title:field(item.title,'镜头名称',60),visual:field(item.visual,'镜头画面',240),motion:field(item.motion,'镜头动作',160),narration:field(item.narration,'镜头主持词',160)};});
 return result;
}
export function normalizeThemeDraft(value: any){
 if(!record(value)||typeof value.id!=='string'||!Array.isArray(value.options)||value.options.length!==3)throw Error('策划草案格式无效');
 const options: any=value.options.map((item: any)=>{if(!record(item)||typeof item.id!=='string'||!item.id||item.id.length>100)throw Error('策划选项格式无效');return {id:item.id,plan:normalizeThemePlan(item.plan)};});
 if(new Set(options.map((o: any)=>o.id)).size!==3)throw Error('策划选项编号重复');
 return {id:field(value.id,'草案编号',100),seed:field(value.seed,'初始主题',100),notes:typeof value.notes==='string'?value.notes.slice(0,1500):'',createdAt:Number.isFinite(value.createdAt)?value.createdAt:0,revision:Number.isInteger(value.revision)&&value.revision>=1?value.revision:1,options};
}
export const planningInstruction: any=`你是中国区观众共创绘画直播的策划导演。给定主题，生成恰好三个题材方向，必须在叙事、情绪和视觉上有明显区别，不只是改标题。每个方向写完整故事背景、故事板、画风和低门槛玩法，适合人气很少的首播，一个词或普通物品也能参与。不要承诺奖品、虚构人气或冒充真实观众。用贴合主题的中文生活意象或熟悉文化，不堆梗，不臆造电影典故。创意示例和故事板是虚构策划，不是真实投稿。玩法必须先收词、公布候选、观众投票、生成获选GIF；零票和同票由主播决定。整场故事板3–5格，逐格写清画面、一个动作和主持词；每个商品GIF只有固定机位的一镜轻动作，6帧共1.2秒，不承诺长片、多镜头视频、转场或复杂连贯剧情。留足观众想象空间，物体仍是画面主角。开场词最多80字，不重复长规则。输出JSON {"options":[方案,方案,方案]}。每个方案的字段为 {"title":"主题标题","genre":"题材类型","logline":"故事钩子","setting":"世界背景及地点","visualStyle":"画风、配色与光影","audiencePrompt":"观众该发什么","rules":"清楚简短的玩法","examples":["例一","例二","例三"],"hostIntro":"开场词","imageGuidance":"单个作品的构图与动作约束","storyboard":[{"title":"镜头名称","visual":"画面","motion":"动作","narration":"主持词"}]}。每个方向控制在800中文字左右，遵循输入中的主播补充要求。`;

export function normalizeGeneratedThemePlans(value: any){
 if(!Array.isArray(value)||value.length!==3)throw Error('DeepSeek 需要返回三个完整策划方向');
 const plans: any=value.map(normalizeThemePlan);
 const titles: any=plans.map((plan: any)=>plan.title.normalize('NFKC').replace(/\s+/gu,'').toLowerCase());
 if(new Set(titles).size!==3||new Set(plans.map((plan: any)=>JSON.stringify(plan))).size!==3)throw Error('生成的策划方向重复，请调整补充要求后手动重试');
 return plans;
}
