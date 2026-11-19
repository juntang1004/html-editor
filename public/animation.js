/* Declarative animation-edit contract shared by server (validation, JSON schema) and editor
   (preview/apply, deterministic local Korean interpreter, gallery recipes). No generated code. */
(()=>{
'use strict';
const Effects=globalThis.StudioEffects();
const legacy=['show','hide','toggle','fade','move','scale','highlight','draw','navigate','text'];
const gallery=Effects.list.filter(e=>e.kind!=='recipe').map(e=>e.id);
const effects=[...legacy,...gallery];
const triggers=['click','enter','hover','after'];
const legacyNames={show:'나타나기',hide:'사라지기',toggle:'표시 전환',fade:'서서히 나타나기',move:'이동',scale:'확대·축소',highlight:'색으로 강조',draw:'왼쪽부터 펼치기',navigate:'슬라이드 이동',text:'텍스트 바꾸기'};
const effectName=id=>legacyNames[id]||Effects.get(id)?.name||id;
const triggerName=t=>({click:'클릭',enter:'슬라이드 진입',hover:'마우스 올리기',after:'이전 효과 후'})[t]||t;
class ProposalError extends Error{constructor(message,hint=''){super(message);this.name='ProposalError';this.hint=hint;}}
const nullable=(type,extra={})=>({type:[type,'null'],...extra});
const opFields={op:{type:'string',enum:['add','update','delete','native']},id:{type:'string'},name:nullable('string'),trigger:nullable('string',{enum:[...triggers,null]}),triggerId:nullable('string'),targetId:nullable('string'),effect:nullable('string',{enum:[...effects,null]}),duration:nullable('number'),delay:nullable('number'),value:nullable('string'),initialHidden:nullable('boolean'),afterId:nullable('string')};
const schema={type:'object',additionalProperties:false,properties:{explanation:{type:'string'},operations:{type:'array',items:{type:'object',additionalProperties:false,properties:opFields,required:Object.keys(opFields)}}},required:['explanation','operations']};
const MAX_OPS=24,blank=()=>({name:null,trigger:null,triggerId:null,targetId:null,effect:null,duration:null,delay:null,value:null,initialHidden:null,afterId:null});
const sec=ms=>Math.round(ms)/1000+'초';
const parseTime=v=>{if(typeof v==='number')return v;const m=/^\s*(-?[\d.]+)\s*(ms|s)?\s*$/.exec(String(v||''));return m?+m[1]*(m[2]==='ms'?1:1000):NaN;};
const uid=()=>'fx-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);

/* Normalize: accepts the new {operations} contract and the legacy {actions} contract (each action = add). */
function normalize(result){
 if(!result||typeof result.explanation!=='string')throw new ProposalError('AI 응답 형식을 확인할 수 없습니다. 다시 요청해 주세요.');
 if(!Array.isArray(result.operations)&&Array.isArray(result.actions)){
  if(result.actions.length>8)throw new ProposalError('한 번에 추가할 수 있는 액션은 8개까지입니다.');
  return {explanation:result.explanation,operations:result.actions.map((a,i)=>({...blank(),...(a&&typeof a==='object'?a:{name:undefined}),afterId:a?.afterId??'',op:'add',id:a?.id||'new'+(i+1)}))};
 }
 if(!Array.isArray(result.operations))throw new ProposalError('AI 응답 형식을 확인할 수 없습니다. 다시 요청해 주세요.');
 if(result.operations.length>MAX_OPS)throw new ProposalError('변경이 너무 많습니다. '+MAX_OPS+'개 이하로 나누어 요청해 주세요.');
 return {explanation:result.explanation,operations:result.operations.map(o=>({...blank(),...(o&&typeof o==='object'?o:{op:'invalid'})}))};
}
/* Validate operations against the request context. Error messages are user-facing Korean. */
function validate(result,ctx){
 const out=normalize(result),scene=new Set((ctx.scene||[]).map(x=>x.id)),existing=new Map((ctx.actions||[]).map(a=>[a.id,a])),native=new Map((ctx.native||[]).map(n=>[n.id,n])),refs=new Set();
 const label=o=>o.name||effectName(o.effect||'');
 for(const o of out.operations){
  if(!['add','update','delete','native'].includes(o.op)||typeof o.id!=='string'||!o.id||o.id.length>100)throw new ProposalError('알 수 없는 변경 종류가 포함되어 있습니다.');
  if(o.op==='update'||o.op==='delete'){
   if(!existing.has(o.id)&&!(o.op==='delete'&&native.has(o.id)))throw new ProposalError('바꾸려는 기존 액션을 찾지 못했습니다. 액션 패널에서 대상 액션을 확인해 주세요.');
  }
  if(o.op==='native'&&!native.has(o.id))throw new ProposalError('원본 애니메이션을 찾지 못했습니다. 슬라이드를 다시 선택한 뒤 요청해 주세요.');
  if(o.op==='add'){if(existing.has(o.id)||refs.has(o.id))throw new ProposalError('새 액션 이름표가 중복되었습니다.');refs.add(o.id);
   for(const k of ['name','trigger','targetId','effect','duration','delay'])if(o[k]===null||o[k]===undefined)throw new ProposalError('새 액션 “'+label(o)+'”의 '+({name:'이름',trigger:'시작 조건',targetId:'대상',effect:'효과',duration:'재생 시간',delay:'지연'})[k]+'이 비어 있습니다.');}
  if(o.name!==null&&(typeof o.name!=='string'||o.name.length>80))throw new ProposalError('액션 이름이 올바르지 않습니다.');
  if(o.effect!==null&&!effects.includes(o.effect))throw new ProposalError('지원하지 않는 효과입니다. 효과 갤러리에서 비슷한 효과를 선택해 주세요.');
  if(o.trigger!==null&&!triggers.includes(o.trigger))throw new ProposalError('시작 조건은 클릭·진입·마우스 올리기·이전 효과 후 중 하나여야 합니다.');
  for(const k of ['duration','delay'])if(o[k]!==null&&(typeof o[k]!=='number'||!Number.isFinite(o[k])||o[k]<0||o[k]>10000))throw new ProposalError((k==='duration'?'재생 시간':'지연')+'은 0~10초 사이여야 합니다.');
  if(o.targetId!==null&&o.op!=='native'&&!scene.has(o.targetId))throw new ProposalError('“'+label(o)+'”의 대상 개체를 이 슬라이드에서 찾지 못했습니다. 개체를 선택하거나 이름을 더 정확히 적어 주세요.');
  {const base=existing.get(o.id)||{},trig=o.trigger??base.trigger,src=o.triggerId??base.triggerId;if(o.op!=='native'&&o.op!=='delete'&&trig==='hover'&&!src)throw new ProposalError('“'+label(o)+'”: 마우스를 올릴 개체가 지정되지 않았습니다. 대상 개체를 선택하거나 “○○에 마우스를 올리면”처럼 적어 주세요.');}
  if(o.triggerId&&!scene.has(o.triggerId))throw new ProposalError('클릭하거나 마우스를 올릴 개체를 찾지 못했습니다.');
  if(o.value!==null&&(typeof o.value!=='string'||o.value.length>1000))throw new ProposalError('효과 값이 너무 깁니다.');
  if(o.initialHidden!==null&&typeof o.initialHidden!=='boolean')throw new ProposalError('처음 숨김 설정이 올바르지 않습니다.');
  if(o.afterId&&!existing.has(o.afterId)&&!refs.has(o.afterId))throw new ProposalError('“'+label(o)+'” 앞에 실행할 효과를 찾지 못했습니다.');
  const effect=o.effect??existing.get(o.id)?.effect;
  if(effect==='move'&&o.value!==null&&!/^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/.test(o.value))throw new ProposalError('이동 값은 120,0처럼 가로,세로 픽셀로 지정해야 합니다.');
  if(effect==='scale'&&o.value!==null&&o.op!=='native'&&!(+o.value>=.1&&+o.value<=5))throw new ProposalError('확대 배율은 0.1~5 사이입니다.');
  if(effect==='highlight'&&o.value!==null&&!/^#[0-9a-f]{3,8}$/i.test(o.value))throw new ProposalError('강조 색은 #ffd166 형식이어야 합니다.');
 }
 /* Dry-run apply checks dependency cycles and dangling after-links. */
 apply({actions:(ctx.actions||[]).map(a=>({...a,slideId:a.slideId||ctx.currentSlide})),patches:{}},out.operations,{...ctx,dryRun:true});
 return out;
}
/* Pure apply: returns a new state; also lists the changed patches for the runtime command. */
function apply(state,operations,ctx){
 const next=JSON.parse(JSON.stringify(state)),slide=ctx.currentSlide,native=new Map((ctx.native||[]).map(n=>[n.id,n])),refMap={},changedPatches={};
 next.actions=next.actions||[];next.patches=next.patches||{};
 for(const o of operations)if(o.op==='add')refMap[o.id]=ctx.dryRun?o.id:uid();
 const after=id=>id?(refMap[id]||id):'';
 for(const o of operations){
  if(o.op==='add'){const a={id:refMap[o.id],slideId:slide,name:o.name,trigger:o.trigger,triggerId:o.trigger==='after'?'':(o.triggerId||''),targetId:o.targetId,effect:o.effect,duration:Math.round(o.duration),delay:Math.round(o.delay),value:o.value||'',initialHidden:o.initialHidden??(Effects.get(o.effect)?.kind==='in'||Effects.get(o.effect)?.target==='chart'),afterId:o.trigger==='after'?after(o.afterId):''};
   if(a.trigger==='after'&&!a.afterId)a.afterId=next.actions.filter(x=>x.slideId===slide).at(-1)?.id||'';
   if(a.trigger==='after'&&!a.afterId)a.trigger='enter';
   next.actions.push(a);}
  else if(o.op==='update'){const a=next.actions.find(x=>x.id===o.id);if(!a)continue;for(const k of ['name','trigger','triggerId','targetId','effect','duration','delay','value','initialHidden'])if(o[k]!==null&&o[k]!==undefined)a[k]=k==='duration'||k==='delay'?Math.round(o[k]):o[k];if(o.afterId!==null&&o.afterId!==undefined)a.afterId=after(o.afterId);if(a.trigger!=='after')a.afterId='';}
  else if(o.op==='delete'&&!native.has(o.id)){next.actions=next.actions.filter(x=>x.id!==o.id);for(const x of next.actions)if(x.afterId===o.id){x.afterId='';x.trigger='enter';}}
  else{const n=native.get(o.id);if(!n)continue;
   for(const e of n.elements||[]){const i=e.names.indexOf(n.motionName);if(i<0)continue;const p=next.patches[e.id]||{},style={...p.style};
    /* Compose from the accumulated patch so several ops on one element (e.g. names a,b) do not overwrite each other. */
    const list=(prop,src)=>{const acc=style[prop]?String(style[prop]).split(',').map(x=>x.trim()):src;return e.names.map((_,j)=>acc[j%Math.max(1,acc.length)]||'0s');};
    if(o.op==='delete'){const names=list('animation-name',e.names);names[i]='none';style['animation-name']=names.join(', ');}
    if(o.duration!==null&&o.duration!==undefined){const d=list('animation-duration',e.durations);d[i]=o.duration/1000+'s';style['animation-duration']=d.join(', ');}
    if(o.delay!==null&&o.delay!==undefined){const d=list('animation-delay',e.delays);d[i]=o.delay/1000+'s';style['animation-delay']=d.join(', ');}
    next.patches[e.id]={...p,style};changedPatches[e.id]=next.patches[e.id];}}
 }
 const ids=new Map(next.actions.map(a=>[a.id,a]));
 for(const a of next.actions){if(a.trigger!=='after')continue;const seen=new Set([a.id]);let p=ids.get(a.afterId);if(!p||p.slideId!==a.slideId)throw new ProposalError('“'+(a.name||effectName(a.effect))+'” 앞에 실행할 효과가 같은 슬라이드에 없습니다.');while(p&&p.trigger==='after'){if(seen.has(p.id))throw new ProposalError('효과 순서가 서로를 기다리는 순환 구조입니다. 순서를 다시 지정해 주세요.');seen.add(p.id);p=ids.get(p.afterId);}}
 return {state:next,patches:changedPatches,created:Object.values(refMap)};
}
/* Human-readable list of operations for preview. */
function describe(operations,ctx){
 const existing=new Map((ctx.actions||[]).map(a=>[a.id,a])),native=new Map((ctx.native||[]).map(n=>[n.id,n])),scene=new Map((ctx.scene||[]).map(x=>[x.id,x])),refs=new Map(operations.filter(o=>o.op==='add').map(o=>[o.id,o]));
 const obj=id=>{const x=scene.get(id);return x?(x.tag==='slide'?'슬라이드':'“'+String(x.text||x.tag).slice(0,24)+'”'):'개체';};
 return operations.map(o=>{
  if(o.op==='native'){const n=native.get(o.id);return '원본 애니메이션 수정 · '+n.name+(o.duration!==null&&o.duration!==undefined?' · 재생 시간 '+sec(n.duration)+' → '+sec(o.duration):'')+(o.delay!==null&&o.delay!==undefined?' · 지연 '+sec(n.delay||0)+' → '+sec(o.delay):'');}
  if(o.op==='delete'){const a=existing.get(o.id)||native.get(o.id);return (native.has(o.id)?'원본 애니메이션 끄기 · ':'삭제 · ')+(a?.name||'액션');}
  if(o.op==='update'){const a=existing.get(o.id),ch=[];if(o.duration!==null&&o.duration!==a.duration)ch.push('재생 시간 '+sec(a.duration)+' → '+sec(o.duration));if(o.delay!==null&&o.delay!==a.delay)ch.push('지연 '+sec(a.delay)+' → '+sec(o.delay));if(o.effect!==null&&o.effect!==a.effect)ch.push('효과 '+effectName(a.effect)+' → '+effectName(o.effect));if(o.trigger!==null&&o.trigger!==a.trigger)ch.push('시작 '+triggerName(a.trigger)+' → '+triggerName(o.trigger));if(o.targetId!==null&&o.targetId!==a.targetId)ch.push('대상 '+obj(o.targetId));if(o.name!==null&&o.name!==a.name)ch.push('이름 “'+o.name+'”');return '수정 · '+a.name+' · '+(ch.join(' · ')||'변경 없음');}
  const prev=o.afterId?(refs.get(o.afterId)?.name||existing.get(o.afterId)?.name||'이전 효과'):'';
  return '추가 · '+obj(o.targetId)+' · '+effectName(o.effect)+' · '+(o.trigger==='after'?'“'+prev+'” 끝난 뒤':triggerName(o.trigger))+' · '+sec(o.duration)+(o.delay?' · '+sec(o.delay)+' 지연':'');
 });
}
/* ---------- deterministic local interpreter (no network) ---------- */
const HELP='예: “0.2초 애니메이션을 2초로 바꿔줘”, “검은 화면에서 밝아진 뒤 그래프가 자라게 해줘”, “선택한 개체를 왼쪽에서 들어오게 해줘”, “막대 애니메이션 삭제해줘”.';
const durations=s=>[...s.matchAll(/(\d+(?:\.\d+)?)\s*(밀리초|ms|초|s(?![a-z]))/gi)].map(m=>({ms:+m[1]*(/ms|밀리초/i.test(m[2])?1:1000),index:m.index,text:m[0]}));
const CHANGE=/바꿔|바꾸|변경|수정|늘려|줄여|조정|조절|느리게|빠르게|길게|짧게|(초|ms)\s*(로|으로)\s*(해|만들|설정|맞춰)/;
const DELETE=/삭제|지워|지우|없애|제거|빼\s*줘|빼줘|꺼\s*줘|끄기/;
function objectsBy(ctx,kind){const s=(ctx.scene||[]).filter(x=>x.tag!=='slide'),t=x=>String(x.tag).toLowerCase();
 if(kind==='chart'){const sel=s.filter(x=>(ctx.selectedIds||[]).includes(x.id)&&(t(x)==='svg'||/그래프|차트|chart|graph/i.test(x.text)));if(sel.length)return sel;const svg=s.filter(x=>t(x)==='svg');if(svg.length)return [svg[0]];return s.filter(x=>/그래프|차트|막대|chart|bar/i.test(x.text)).slice(0,1);}
 if(kind==='title')return s.filter(x=>/^h[1-3]$/.test(t(x))).slice(0,1);
 if(kind==='body')return s.filter(x=>t(x)==='p').slice(0,6);
 if(kind==='image')return s.filter(x=>t(x)==='img').slice(0,1);
 if(kind==='list')return s.filter(x=>/^(ul|ol|table)$/.test(t(x))).slice(0,1);
 return [];}
function namedObject(text,ctx){const q=/[“"'‘]([^”"'’]{1,60})[”"'’]/.exec(text);let best=null;for(const x of ctx.scene||[]){if(x.tag==='slide'||!x.text)continue;const name=String(x.text).trim();if(name.length<2)continue;if((q&&name.includes(q[1].trim()))||text.includes(name.slice(0,30))){if(!best||name.length<best.text.length||q)best=x;}}return best;}
function matchEffect(text){let best=null;for(const fx of Effects.list){if(fx.kind==='recipe')continue;for(const k of [fx.name,...fx.keywords])if(text.includes(k)&&(!best||k.length>best.k.length))best={fx,k};}
 if(/검(은|정)|까만|암전|어두운|어둠/.test(text)&&/밝아|밝게|나타|풀리|해제|걷히|페이드/.test(text))return Effects.get('black-reveal');
 return best?.fx||null;}
function targetFor(fx,text,ctx){
 if(fx.target==='slide'||/슬라이드\s*(전체|가|를|에서)|화면\s*(전체|이|가|을|에서)/.test(text)&&fx.target!=='chart')return [{id:ctx.currentSlide}];
 const named=namedObject(text,ctx);if(named)return [named];
 if(/그래프|차트|막대|선 그래프|도넛/.test(text)||fx.target==='chart')return objectsBy(ctx,'chart');
 if(/제목/.test(text))return objectsBy(ctx,'title');
 if(/본문|문단|설명/.test(text))return objectsBy(ctx,'body');
 if(/이미지|사진|그림/.test(text))return objectsBy(ctx,'image');
 if(/목록|표|리스트/.test(text))return objectsBy(ctx,'list');
 return (ctx.selectedIds||[]).map(id=>({id}));
}
function matchesName(a,text){const words=String(a.name||'').concat(' ',effectName(a.effect||'')).split(/[\s·,→()]+/).filter(w=>w.length>=2);const stems=['막대','그래프','선','숫자','나타','사라','이동','확대','강조','펼치','떠오','가로','점선','검은','밝아','등장','제목','본문'];return stems.some(s=>text.includes(s)&&words.some(w=>w.includes(s)));}
function interpret(prompt,ctx){
 const text=String(prompt||'').replace(/\s+/g,' ').trim();if(!text)throw new ProposalError('원하는 애니메이션 변경을 입력해 주세요.',HELP);
 const actions=(ctx.actions||[]).map(a=>({...a,kind:'action'})),native=(ctx.native||[]).map(n=>({...n,kind:'native'})),all=[...actions,...native];
 const ds=durations(text),fromTo=/(\d+(?:\.\d+)?)\s*(밀리초|ms|초|s)\s*(?:짜리|인|의)?\s*(?:[가-힣\s]{0,24}?)(?:을|를|에서|→|->|부터)\s*(?:[가-힣\s]{0,12}?)(\d+(?:\.\d+)?)\s*(밀리초|ms|초|s)\s*(?:로|으로|까지)/.exec(text);
 const pick=list=>{const sel=list.filter(a=>(ctx.selectedIds||[]).includes(a.targetId)||(a.targets||[]).some(t=>(ctx.selectedIds||[]).includes(t)));if(/모든|전체|다\s/.test(text))return list;const named=list.filter(a=>matchesName(a,text));if(named.length)return named;if(sel.length)return sel;return list;};
 const ops=[];
 /* 1) Delete */
 if(DELETE.test(text)&&all.length){let c=pick(all);if(c.length>1&&!/모든|전체/.test(text)&&!c.some(a=>matchesName(a,text)))throw new ProposalError('삭제할 액션이 여러 개입니다. 액션 이름(예: “막대 그래프 늘어나기”)을 함께 적거나 “모든 애니메이션 삭제”라고 요청해 주세요.',HELP);
  for(const a of c)ops.push({...blank(),op:'delete',id:a.id});return {explanation:c.length+'개 애니메이션을 '+(c.some(a=>a.kind==='native')?'끄거나 ':'')+'삭제합니다.',operations:ops,local:true};}
 /* 2) Duration change of existing action/native animation */
 const ratio=/(\d+(?:\.\d+)?)\s*배\s*(느리게|길게|빠르게|짧게)/.exec(text);
 if(all.length&&(fromTo||(CHANGE.test(text)&&(ds.length||ratio))&&!/검(은|정)\s*화면/.test(text))){
  let c=all,to=null,factor=null;
  if(fromTo){const from=+fromTo[1]*(/ms|밀리초/i.test(fromTo[2])?1:1000);to=+fromTo[3]*(/ms|밀리초/i.test(fromTo[4])?1:1000);c=all.filter(a=>Math.abs(a.duration-from)<1);
   if(!c.length)throw new ProposalError(sec(from)+' 길이의 애니메이션을 이 슬라이드에서 찾지 못했습니다. 현재 길이: '+[...new Set(all.map(a=>sec(a.duration)))].join(', ')+'.',HELP);if(c.length>1)c=pick(c);}
  else if(ratio){factor=+ratio[1];if(/빠르게|짧게/.test(ratio[2]))factor=1/factor;c=pick(all);}
  else{to=ds.at(-1).ms;c=pick(all);if(c.length>1&&!/모든|전체/.test(text)&&!c.some(a=>matchesName(a,text)))throw new ProposalError('이 슬라이드에 애니메이션이 '+c.length+'개 있습니다. 어느 것을 바꿀지 “0.2초를 2초로”처럼 현재 길이를 함께 적거나, 액션 이름이나 대상 개체를 지정해 주세요. (현재: '+c.map(a=>a.name+' '+sec(a.duration)).join(', ')+')',HELP);}
  if(to!==null&&(to<0||to>10000))throw new ProposalError('재생 시간은 0~10초 사이로 지정해 주세요.');
  for(const a of c){const d=Math.min(10000,Math.round(to??a.duration*factor));ops.push({...blank(),op:a.kind==='native'?'native':'update',id:a.id,duration:d});}
  return {explanation:c.length+'개 애니메이션의 재생 시간을 바꿉니다. 새 액션은 만들지 않습니다.',operations:ops,local:true};
 }
 /* 3) Add (possibly sequential) */
 const clauses=text.split(/(?<!\d\s*(?:초|ms)\s*)(?:그\s*다음(?:에)?|다음(?:에)?|이어서|그\s*후(?:에)?|그리고\s*나서|(?:고|ㄴ|진|난|된)\s*(?:뒤|후)(?:에)?|고\s*나서|(?<=[가-힣])\s*뒤에|(?<=[가-힣])\s*후에|→|->|하면서\s*이어|, 그리고)/).map(s=>s.trim()).filter(Boolean);
 const trigger=/클릭|누르면|누를\s*때/.test(text)?'click':/마우스|올리면|호버/.test(text)?'hover':'enter';
 let prev='';const notes=[];
 for(const [i,clause] of clauses.entries()){
  const fx=matchEffect(clause);if(!fx){if(clauses.length>1)throw new ProposalError('“'+clause+'” 부분에 해당하는 효과를 찾지 못했습니다.',HELP);break;}
  const targets=targetFor(fx,clause,ctx);if(!targets.length)throw new ProposalError('“'+clause+'”를 적용할 '+(fx.target==='chart'?'그래프':'개체')+'를 찾지 못했습니다. 슬라이드에서 대상을 선택한 뒤 다시 요청해 주세요.',HELP);
  const cd=durations(clause),delay=/(\d+(?:\.\d+)?)\s*(초|ms)\s*(?:후|뒤|지나|기다)/.exec(clause),dur=cd.find(d=>!delay||d.index!==delay.index);
  for(const t of targets){const id='new'+(ops.length+1);ops.push({...blank(),op:'add',id,name:fx.name,trigger:prev?'after':trigger,triggerId:!prev&&trigger==='hover'?t.id:'',targetId:t.id,effect:fx.id,duration:dur?dur.ms:fx.duration,delay:delay?+delay[1]*(delay[2]==='ms'?1:1000):0,value:'',initialHidden:fx.kind==='in'||fx.target==='chart',afterId:prev});prev=id;}
  notes.push(fx.name);
 }
 if(ops.length)return {explanation:notes.join(' → ')+' 순서로 '+ops.length+'개 액션을 추가합니다.'+(ops.length>1?' 앞 효과가 끝나면 다음 효과가 시작됩니다.':''),operations:ops,local:true};
 if(ds.length&&!all.length)throw new ProposalError('이 슬라이드에서 바꿀 기존 애니메이션을 찾지 못했습니다. 새 효과를 추가하려면 효과 이름(예: 서서히 나타나기)을 함께 적어 주세요.',HELP);
 throw new ProposalError('기본 해석기가 이 요청을 이해하지 못했습니다. 효과 이름·대상·시간을 함께 적어 주세요.',HELP);
}
/* Gallery application: same operation pipeline as AI proposals. */
function galleryOperations(effectId,ctx,options={}){
 const fx=Effects.get(effectId);if(!fx)throw new ProposalError('알 수 없는 효과입니다.');
 if(fx.kind==='recipe')return recipe(effectId,ctx,options);
 const ids=fx.target==='slide'?[ctx.currentSlide]:(ctx.selectedIds||[]);
 if(!ids.length)throw new ProposalError('슬라이드에서 효과를 적용할 개체를 먼저 선택하세요.');
 const ops=[];let prev=options.trigger==='after'?(options.afterId||(ctx.actions||[]).at(-1)?.id||''):'';
 ids.forEach((id,i)=>{const op={...blank(),op:'add',id:'new'+(i+1),name:fx.name,trigger:prev?'after':(options.trigger==='after'?'enter':options.trigger||'enter'),triggerId:options.triggerId||(!prev&&options.trigger==='hover'?id:''),targetId:id,effect:fx.id,duration:options.duration??fx.duration,delay:options.delay??0,value:options.value||'',initialHidden:fx.kind==='in'||fx.target==='chart',afterId:prev};ops.push(op);if(options.sequential!==false&&(prev||ids.length>1))prev=op.id;});
 return {explanation:fx.name+' 효과를 '+ids.length+'개 대상에 적용합니다.',operations:ops};
}
function recipe(id,ctx,options={}){
 const ops=[],add=(fx,target,after,duration)=>{const f=Effects.get(fx),op={...blank(),op:'add',id:'new'+(ops.length+1),name:f.name,trigger:after?'after':'enter',triggerId:'',targetId:target,effect:fx,duration:duration??f.duration,delay:0,value:'',initialHidden:true,afterId:after||''};ops.push(op);return op.id;};
 const chart=objectsBy(ctx,'chart')[0];
 if(id==='recipe-black-graph'){if(!chart)throw new ProposalError('이 슬라이드에서 그래프를 찾지 못했습니다. 그래프를 선택한 뒤 적용하세요.');add('grow-bars',chart.id,add('black-reveal',ctx.currentSlide,'',options.duration?Math.round(options.duration*.45):undefined),options.duration?Math.round(options.duration*.55):undefined);return {explanation:'검은 화면이 밝아진 뒤 그래프 막대가 기준선에서 자랍니다.',operations:ops};}
 let prev='';for(const t of objectsBy(ctx,'title'))prev=add('rise-in',t.id,prev);for(const p of objectsBy(ctx,'body'))prev=add('fade-in',p.id,prev,500);if(chart)prev=add('grow-bars',chart.id,prev);
 if(!ops.length)throw new ProposalError('제목·본문·그래프를 찾지 못했습니다.');return {explanation:'제목 → 본문 → 그래프 순서로 차례로 등장합니다.',operations:ops};
}
globalThis.StudioAnimation={schema,effects,legacy,triggers,effectName,triggerName,validate,apply,describe,interpret,galleryOperations,ProposalError,parseTime,HELP,Effects,
 catalog:()=>Effects.list.filter(e=>e.kind!=='recipe').map(e=>e.id+'='+e.name+'('+e.category+(e.target!=='any'?', '+e.target:'')+')').join('; ')};
})();
