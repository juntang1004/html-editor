/* Shared declarative design contract: no generated code, selectors, URLs or HTML. */
(()=>{
'use strict';
const properties=['font-size','font-weight','font-style','font-family','color','background-color','border-color','border-width','border-style','border-radius','text-align','line-height','letter-spacing','padding','padding-top','padding-bottom','padding-left','padding-right','margin-top','margin-bottom','gap','row-gap','column-gap','width','height','max-width','min-width','display','flex-direction','justify-content','align-items','grid-template-columns','grid-column','position','left','top'];
const schema={type:'object',additionalProperties:false,properties:{explanation:{type:'string'},operations:{type:'array',items:{type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:['style','text','font-scale','columns']},targets:{type:'array',items:{type:'string'}},property:{type:'string'},value:{type:'string'}},required:['kind','targets','property','value']}}},required:['explanation','operations']};
const numbers=s=>(String(s).match(/[-−+]?\d+(?:[.,]\d+)*(?:\s*[%％])?/g)||[]).map(s=>s.replace(/\s/g,'')).join('|');
function styleValid(p,v){
 if(!properties.includes(p)||typeof v!=='string'||v.length>150||/[;{}<>\\]|url\s*\(|expression\s*\(|var\s*\(/i.test(v))return false;
 if(/color$/.test(p))return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(v)||v==='transparent';
 const enums={'font-weight':['normal','bold','400','500','600','700','800','900'],'font-style':['normal','italic'],'text-align':['left','center','right','justify'],'display':['block','flex','grid','inline-block'],'flex-direction':['row','column'],'justify-content':['flex-start','center','flex-end','space-between','space-around','space-evenly'],'align-items':['stretch','flex-start','center','flex-end'],'position':['relative','absolute'],'border-style':['solid','dashed','dotted','none']};
 if(enums[p])return enums[p].includes(v);
 if(p==='font-family')return /^[\w\s,"'가-힣-]{1,120}$/.test(v);
 if(p==='grid-template-columns')return /^(?:minmax\(0,\s*1fr\)(?:\s+minmax\(0,\s*1fr\)){0,3}|(?:[1-3]fr\s*){1,4})$/.test(v);
 if(p==='grid-column')return /^(1\s*\/\s*-1|span [1-4])$/.test(v);
 if(p==='line-height')return /^\d+(\.\d+)?$/.test(v)&&+v>=.8&&+v<=3;
 if(['width','height','max-width','min-width'].includes(p)&&v==='auto')return true;
 if(!/^-?\d+(\.\d+)?(px|%)$/.test(v))return false;
 const n=parseFloat(v);return p==='font-size'?v.endsWith('px')&&n>=6&&n<=200:n>=-1280&&n<=1280;
}
function validate(result,scene){
 if(!result||typeof result.explanation!=='string'||!Array.isArray(result.operations)||result.operations.length>400)throw Error('디자인 제안 형식이 올바르지 않습니다.');
 const map=new Map(scene.map(x=>[x.id,x]));
 for(const o of result.operations){
  if(!Array.isArray(o.targets)||!o.targets.length||o.targets.length>4000||typeof o.value!=='string'||o.value.length>6000||!['style','text','font-scale','columns'].includes(o.kind))throw Error('지원하지 않는 디자인 변경입니다.');
  if(o.targets.some(id=>!map.has(id)))throw Error('선택한 범위 밖의 개체를 바꾸려는 제안입니다.');
  if(o.kind==='style'&&!styleValid(o.property,o.value))throw Error('허용되지 않는 서식 값입니다: '+o.property);
  if(o.kind==='font-scale'&&!(Number(o.value)>=.5&&Number(o.value)<=2))throw Error('글자 확대 비율은 0.5~2배까지 지원합니다.');
  if(o.kind==='columns'&&!['1','2','3'].includes(o.value))throw Error('단 수는 1~3 사이여야 합니다.');
  for(const id of o.targets){const node=map.get(id);
   if(o.kind==='text'&&(!node.textEditable||!o.value.trim()||numbers(node.text)!==numbers(o.value)))throw Error('수치가 바뀌거나 보호된 텍스트가 포함되어 제안을 적용하지 않았습니다. 수치와 출처를 유지하도록 다시 요청하세요.');
   if(o.kind==='columns'&&!node.container)throw Error('단 배치는 글자 하나가 아닌 묶음에 적용해야 합니다.');
  }
 }
 return result;
}
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll('\n','<br>');
function apply(state,result,scene){
 validate(result,scene);const next=JSON.parse(JSON.stringify(state)),map=new Map(scene.map(x=>[x.id,x]));
 for(const op of result.operations)for(const id of op.targets){const p=next.patches[id]||{},node=map.get(id);let styles={};
  if(op.kind==='text')p.html=esc(op.value);
  else if(op.kind==='style')styles[op.property]=op.value;
  else if(op.kind==='font-scale')styles['font-size']=Math.max(6,Math.min(200,Math.round(node.fontSize*Number(op.value))))+'px';
  else if(op.kind==='columns')styles={display:'grid','grid-template-columns':Array(Number(op.value)).fill('minmax(0, 1fr)').join(' '),'align-items':'start',gap:'28px'};
  if(styles.width||styles.height)styles['box-sizing']='border-box';
  p.style={...p.style,...styles};next.patches[id]=p;
  if(op.kind==='columns')for(const child of scene.filter(n=>n.parentId===id)){
   const cp=next.patches[child.id]||{};cp.style={...cp.style,'box-sizing':'border-box','min-width':'0px',width:'auto'};next.patches[child.id]=cp;
  }
 }
 return next;
}
globalThis.StudioDesign={schema,properties,validate,apply,styleValid,numbers};
})();
