/* Effect registry + WAAPI player.
   Shared by gallery cards (editor page), the slide frame, presentation and standalone export.
   app.js serializes this factory with toString() into every generated HTML, so it must not
   reference any outer variable. Creating the registry touches no DOM; only play/prepare do. */
globalThis.StudioEffects=function StudioEffects(){
'use strict';
const list=[];
const def=(id,name,category,o)=>{list.push({id,name,category,duration:700,easing:'cubic-bezier(.2,.7,.2,1)',kind:'in',motion:true,target:'any',keywords:[],...o});};
const byId=id=>list.find(e=>e.id===id)||null;
const px=n=>Math.round(n*100)/100+'px';
const html=e=>e instanceof HTMLElement||e?.namespaceURI==='http://www.w3.org/1999/xhtml';
const svgOf=e=>e.tagName.toLowerCase()==='svg'?e:e.querySelector('svg');
const host=e=>e.closest('[data-ss-slide],[data-fx-stage]')||e.parentElement||e;
const kids=e=>{let c=[...e.children].filter(x=>!x.matches('script,style,template,[data-ss-fx-temp]'));if(c.length===1&&c[0].children.length>1&&!/^(LI|TR|TD|P|H\d)$/.test(c[0].tagName))c=[...c[0].children];return c;};
const graphemes=s=>{try{return [...new Intl.Segmenter('ko',{granularity:'grapheme'}).segment(s)].map(x=>x.segment);}catch{return [...s];}};
/* ---------- chart mark detection: data marks only, never axes/ticks/labels/legend ---------- */
const NOT_DATA='defs,clipPath,mask,pattern,marker,text,tspan,[data-ss-fx-temp],[class*="axis" i],[class*="axes" i],[class*="domain" i],[class*="frame" i],[class*="legend" i],[class*="grid" i],[class*="tick" i],[class*="label" i],[class*="annot" i],[id*="axis" i],[id*="axes" i],[id*="legend" i],[id*="grid" i],[data-ss-axis]';
/* Axis-like path: only horizontal/vertical straight segments (e.g. "M60 20 V300 H600") — treated as frame, not data. */
function orthogonal(e){const t=e.tagName.toLowerCase();let pts=[];
 if(t==='polyline'||t==='polygon')pts=[...(e.points||[])].map(p=>[p.x,p.y]);
 else{const d=e.getAttribute('d')||'';if(/[CcSsQqTtAa]/.test(d))return false;let x=0,y=0;
  for(const c of d.match(/[MmLlHhVvZz][^MmLlHhVvZz]*/g)||[]){const k=c[0],rel=k===k.toLowerCase(),v=(c.slice(1).match(/-?\d*\.?\d+(?:e-?\d+)?/gi)||[]).map(Number);
   if(/z/i.test(k))continue;
   if(/h/i.test(k)){for(const n of v){x=rel?x+n:n;pts.push([x,y]);}continue;}
   if(/v/i.test(k)){for(const n of v){y=rel?y+n:n;pts.push([x,y]);}continue;}
   for(let i=0;i+1<v.length;i+=2){x=rel?x+v[i]:v[i];y=rel?y+v[i+1]:v[i+1];pts.push([x,y]);}}}
 return pts.length>=2&&pts.length<=4&&pts.every((p,i)=>!i||p[0]===pts[i-1][0]||p[1]===pts[i-1][1]);}
/* Exclusion only counts matches INSIDE the chart root (an outer wrapper class like "grid"/"frame" must not disable marks). */
const excluded=(e,root)=>{const hit=e.closest(NOT_DATA);return !!hit&&hit!==root&&root.contains(hit);};
function box(e){try{const b=e.getBBox();return {x:b.x,y:b.y,w:b.width,h:b.height};}catch{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}}
function painted(e){const cs=getComputedStyle(e);return cs.fill!=='none'&&!/rgba\(.*,\s*0\)$/.test(cs.fill)&&cs.display!=='none'&&cs.visibility!=='hidden';}
function chartMarks(root){
 const svg=svgOf(root),out={bars:[],lines:[],points:[],areas:[],whiskers:[],svg};
 if(svg){
  const vb=box(svg),full=b=>b.w>=vb.w*.9&&b.h>=vb.h*.85,explicit=svg.querySelectorAll('[data-ss-mark]').length>0;
  for(const e of svg.querySelectorAll('rect,path,polygon,polyline,circle,ellipse,line')){if(explicit&&!e.closest('[data-ss-mark]'))continue;if(excluded(e,svg))continue;
   const t=e.tagName.toLowerCase(),b=box(e),cs=getComputedStyle(e);
   if(t==='rect'||t==='polygon'&&e.points?.numberOfItems===4){if(b.w>1&&b.h>1&&painted(e)&&!full(b))out.bars.push(e);continue;}
   if(t==='circle'||t==='ellipse'){if(cs.strokeDasharray&&cs.strokeDasharray!=='none'&&cs.fill==='none')out.areas.push(e);else if(Math.max(b.w,b.h)<=28)out.points.push(e);continue;}
   if(t==='line'){if(e.getAttribute('x1')===e.getAttribute('x2')&&b.h<vb.h/3&&b.h>2)out.whiskers.push(e);continue;}
   if(cs.fill!=='none'&&painted(e)&&!full(b))out.areas.push(e);else if(cs.stroke!=='none'&&(e.getTotalLength?.()||0)>20&&(explicit||!orthogonal(e)))out.lines.push(e);
  }
 }else{
  for(const e of root.querySelectorAll('[class*="bar" i],[class*="fill" i],[class*="progress" i]'))if(!excluded(e,root)&&e.getBoundingClientRect().width>1)out.bars.push(e);
 }
 return out;
}
function orient(bars){
 const bs=bars.map(box),mode=vals=>{const m=new Map();for(const v of vals){const k=Math.round(v);m.set(k,(m.get(k)||0)+1);}let best=[0,0];for(const [k,n]of m)if(n>best[1])best=[k,n];return best;};
 const v=mode(bs.flatMap(b=>[b.y,b.y+b.h])),h=mode(bs.flatMap(b=>[b.x,b.x+b.w]));
 const vertical=v[1]>=h[1];const base=vertical?v[0]:h[0];
 return bs.map(b=>vertical?{vertical,origin:Math.abs(b.y+b.h-base)<=1.5?'center bottom':'center top'}:{vertical,origin:Math.abs(b.x-base)<=1.5?'left center':'right center'});
}
/* ---------- definitions (ids are stable; names are Korean UI labels) ---------- */
const enter=(id,name,frames,o={})=>def(id,name,'등장',{frames,...o});
enter('fade-in','서서히 나타나기',()=>[{opacity:0},{opacity:1}],{motion:false,keywords:['서서히','페이드 인','나타나'],note:'1 · A/B'});
enter('rise-in','아래에서 올라오기',()=>[{opacity:0,translate:'0 40px'},{opacity:1,translate:'0 0'}],{keywords:['올라오','아래에서','떠오르'],note:'3'});
enter('drop-in','위에서 내려오기',()=>[{opacity:0,translate:'0 -40px'},{opacity:1,translate:'0 0'}],{keywords:['내려오','위에서'],note:'4'});
enter('slide-in-left','왼쪽에서 들어오기',()=>[{opacity:0,translate:'-120px 0'},{opacity:1,translate:'0 0'}],{keywords:['왼쪽에서'],note:'5'});
enter('slide-in-right','오른쪽에서 들어오기',()=>[{opacity:0,translate:'120px 0'},{opacity:1,translate:'0 0'}],{keywords:['오른쪽에서'],note:'6'});
enter('zoom-in','작게 시작해 확대',()=>[{opacity:0,scale:.6},{opacity:1,scale:1}],{keywords:['확대되며','커지며','줌 인'],note:'7'});
enter('wipe-right','왼쪽부터 펼치기',()=>[{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0% 0 0)'}],{keywords:['왼쪽부터','펼치'],note:'9'});
enter('wipe-up','아래부터 펼치기',()=>[{clipPath:'inset(100% 0 0 0)'},{clipPath:'inset(0% 0 0 0)'}],{keywords:['아래부터'],note:'10'});
enter('spring-in','부드러운 스프링 등장',()=>[{opacity:0,scale:.7},{opacity:1,scale:1.08,offset:.55},{scale:.97,offset:.8},{opacity:1,scale:1}],{easing:'ease-out',duration:900,keywords:['스프링','탄력'],note:'31'});
enter('bounce-in','가벼운 바운스 등장',()=>[{opacity:0,translate:'0 -60px'},{opacity:1,translate:'0 0',offset:.5},{translate:'0 -14px',offset:.72},{translate:'0 0',offset:.88},{translate:'0 -4px',offset:.94},{opacity:1,translate:'0 0'}],{easing:'ease-out',duration:1000,keywords:['바운스','통통'],note:'32'});
enter('flip-in','카드 뒤집기',()=>[{opacity:0,transform:'perspective(800px) rotateY(90deg)'},{opacity:1,transform:'perspective(800px) rotateY(0deg)'}],{keywords:['뒤집'],note:'34'});
enter('focus-in','초점 맞추기',()=>[{opacity:0,filter:'blur(12px)'},{opacity:1,filter:'blur(0px)'}],{keywords:['초점','흐릿','블러'],note:'35'});
enter('circle-reveal','원형으로 공개',()=>[{clipPath:'circle(0% at 50% 50%)'},{clipPath:'circle(75% at 50% 50%)'}],{keywords:['원형으로'],note:'36'});
enter('diagonal-reveal','대각선으로 공개',()=>[{clipPath:'polygon(0 0,0 0,0 0,0 0)'},{clipPath:'polygon(0 0,200% 0,0 200%,0 0)'}],{keywords:['대각선'],note:'37'});
def('black-reveal','검은 화면에서 밝아지기','화면 전환',{kind:'in',motion:false,duration:1200,easing:'ease-in-out',target:'slide',keywords:['검은 화면','검정 화면','검은색','검정색','까만','암전','어두운 화면','어둠'],note:'22',
 prepare:c=>overlay(c,1),run:c=>{const o=overlay(c,1);return [o.animate([{opacity:1},{opacity:0}],{duration:c.duration,easing:c.easing,fill:'forwards'})];},done:c=>c.el.querySelectorAll(':scope>[data-ss-fx-temp="black"]').forEach(x=>x.remove())});
function overlay(c,opacity){let o=c.el.querySelector(':scope>[data-ss-fx-temp="black"]');if(!o){c.remember(c.el);if(getComputedStyle(c.el).position==='static')c.el.style.position='relative';o=c.el.ownerDocument.createElement('div');o.dataset.ssFxTemp='black';o.setAttribute('aria-hidden','true');o.style.cssText='position:absolute;inset:0;background:#000;z-index:2147482000;pointer-events:none;opacity:'+opacity;c.el.append(o);}return o;}
const exit=(id,name,frames,o={})=>def(id,name,'퇴장',{kind:'out',frames,...o});
exit('fade-out','서서히 사라지기',()=>[{opacity:1},{opacity:0}],{motion:false,keywords:['사라지','페이드 아웃'],note:'2'});
exit('zoom-out','축소하며 퇴장',()=>[{opacity:1,scale:1},{opacity:0,scale:.6}],{keywords:['축소하며','작아지며 사라'],note:'8'});
exit('sink-out','아래로 가라앉기',()=>[{opacity:1,translate:'0 0'},{opacity:0,translate:'0 40px'}],{keywords:['가라앉','내려가며 사라'],note:'A'});
exit('wipe-out-left','왼쪽으로 걷히기',()=>[{clipPath:'inset(0 0 0 0)'},{clipPath:'inset(0 100% 0 0)'}],{keywords:['걷히'],note:'B'});
const emph=(id,name,o)=>def(id,name,'강조',{kind:'emph',duration:800,...o});
emph('pulse','가볍게 커졌다 복귀',{frames:()=>[{scale:1},{scale:1.12},{scale:1}],keywords:['커졌다','펄스','두근'],note:'11'});
emph('flash-bg','배경색 강조 후 복귀',{motion:false,frames:c=>[{backgroundColor:getComputedStyle(c.el).backgroundColor},{backgroundColor:c.color||'#ffe066'},{backgroundColor:getComputedStyle(c.el).backgroundColor}],duration:1200,keywords:['배경색','형광'],note:'12'});
emph('outline-glow','테두리 강조 후 복귀',{motion:false,frames:c=>[{boxShadow:'0 0 0 0 transparent'},{boxShadow:'0 0 0 6px '+(c.color||'#f59e0b')},{boxShadow:'0 0 0 0 transparent'}],duration:1200,keywords:['테두리'],note:'13'});
emph('underline-draw','밑줄 그리기',{final:true,run:c=>gradient(c,'linear-gradient(currentColor,currentColor)','0 100%','0% 3px','100% 3px'),keywords:['밑줄'],note:'14'});
emph('marker','마커로 문장 강조',{final:true,run:c=>gradient(c,'linear-gradient(transparent 58%,'+(c.color||'#ffe066')+' 58%)','0 0','0% 100%','100% 100%'),keywords:['마커','형광펜'],note:'41'});
function gradient(c,image,pos,from,to){c.remember(c.el);Object.assign(c.el.style,{backgroundImage:image,backgroundRepeat:'no-repeat',backgroundPosition:pos,backgroundSize:to});return [c.el.animate([{backgroundSize:from},{backgroundSize:to}],{duration:c.duration,easing:c.easing})];}
emph('shake','짧은 좌우 흔들림',{frames:()=>[0,-10,10,-8,8,-4,0].map(x=>({translate:x+'px 0'})),duration:600,easing:'ease-in-out',keywords:['흔들'],note:'33'});
emph('circle-mark','원 그려 강조',{final:true,motion:false,run:c=>{const h=host(c.el),r=c.el.getBoundingClientRect(),hr=h.getBoundingClientRect(),s=h.offsetWidth?hr.width/h.offsetWidth:1,ns='http://www.w3.org/2000/svg';c.remember(h);if(getComputedStyle(h).position==='static')h.style.position='relative';
 const svg=c.el.ownerDocument.createElementNS(ns,'svg'),w=r.width/s+28,ht=r.height/s+24;svg.dataset.ssFxTemp='circle';svg.setAttribute('aria-hidden','true');svg.style.cssText='position:absolute;pointer-events:none;overflow:visible;z-index:2147481000;left:'+px((r.x-hr.x)/s-14)+';top:'+px((r.y-hr.y)/s-12)+';width:'+px(w)+';height:'+px(ht);
 const e=c.el.ownerDocument.createElementNS(ns,'ellipse');e.setAttribute('cx',w/2);e.setAttribute('cy',ht/2);e.setAttribute('rx',w/2-3);e.setAttribute('ry',ht/2-3);e.setAttribute('fill','none');e.setAttribute('stroke',c.color||'#e11d48');e.setAttribute('stroke-width','4');svg.append(e);h.append(svg);const len=e.getTotalLength?.()||Math.PI*(w+ht)/2;e.style.strokeDasharray=len;return [e.animate([{strokeDashoffset:len},{strokeDashoffset:0}],{duration:c.duration,easing:c.easing,fill:'backwards'})];},keywords:['동그라미','원 그려','원으로 표시'],note:'42'});
emph('ken-burns','이미지 천천히 확대',{final:true,duration:4000,easing:'linear',run:c=>{c.remember(c.el);c.el.style.scale='1.08';return [c.el.animate([{scale:1},{scale:1.08}],{duration:c.duration,easing:c.easing})];},keywords:['천천히 확대','켄 번스'],target:'image',note:'38'});
emph('dim-others','비교 대상만 강조',{final:true,motion:false,run:c=>[...(c.el.parentElement?.children||[])].filter(x=>x!==c.el&&!x.dataset.ssFxTemp).map(x=>{c.remember(x);const from=getComputedStyle(x).opacity;x.style.opacity='0.25';return x.animate([{opacity:from},{opacity:.25}],{duration:c.duration,easing:c.easing});}),keywords:['나머지','흐리게','비교 강조'],note:'48'});
/* ---------- staggered / text ---------- */
function stagger(c,items,frames,itemShare=.6){if(!items.length)return [];const item=Math.max(1,Math.min(c.duration,Math.max(c.duration*itemShare,c.duration/items.length))),step=items.length>1?(c.duration-item)/(items.length-1):0;
 return items.map((e,i)=>{c.remember(e);return e.animate(frames(e,i),{duration:item,delay:i*step,easing:c.easing,fill:'backwards'});});}
function split(c,mode){const e=c.el;if(e.children.length){return kids(e);}const text=e.textContent;c.remember(e);e.dataset.ssActionText='true';e.setAttribute('aria-label',text.trim());const parts=mode==='word'?text.split(/(\s+)/):graphemes(text);e.textContent='';const out=[];for(const p of parts){if(!p)continue;if(/^\s+$/.test(p)){e.append(p);continue;}const s=e.ownerDocument.createElement('span');s.textContent=p;s.setAttribute('aria-hidden','true');s.style.display='inline-block';s.style.whiteSpace='pre';e.append(s);out.push(s);}return out;}
const textFx=(id,name,run,o)=>def(id,name,'텍스트·목록',{run,duration:1400,...o});
textFx('stagger-items','항목별 순차 등장',c=>stagger(c,kids(c.el),()=>[{opacity:0,translate:'0 18px'},{opacity:1,translate:'0 0'}]),{keywords:['항목별','하나씩','차례로','순서대로','글머리'],target:'list',note:'15'});
textFx('stagger-rows','행별 순차 등장',c=>stagger(c,[...c.el.querySelectorAll('tr')].length?[...c.el.querySelectorAll('tr')]:kids(c.el),()=>[{opacity:0},{opacity:1}]),{motion:false,keywords:['행별','줄별'],target:'list',note:'16'});
textFx('stagger-columns','열별 순차 등장',c=>{const cells=[...c.el.querySelectorAll('td,th')];if(!cells.length)return stagger(c,kids(c.el),()=>[{opacity:0},{opacity:1}]);const cols=new Map();for(const td of cells){const k=td.cellIndex;cols.set(k,[...(cols.get(k)||[]),td]);}const groups=[...cols.keys()].sort((a,b)=>a-b).map(k=>cols.get(k));const item=Math.max(1,c.duration*.6),step=groups.length>1?(c.duration-item)/(groups.length-1):0;return groups.flatMap((g,i)=>g.map(td=>{c.remember(td);return td.animate([{opacity:0},{opacity:1}],{duration:item,delay:i*step,fill:'backwards'});}));},{motion:false,keywords:['열별'],target:'list',note:'17'});
textFx('word-by-word','단어별 순차 등장',c=>stagger(c,split(c,'word'),()=>[{opacity:0,translate:'0 .4em'},{opacity:1,translate:'0 0'}],.4),{keywords:['단어별','단어씩'],target:'text',note:'18'});
textFx('letters-up','글자별 위로 등장',c=>stagger(c,split(c,'grapheme'),()=>[{opacity:0,translate:'0 .6em'},{opacity:1,translate:'0 0'}],.25),{keywords:['글자별','한 글자씩 올라'],target:'text',note:'40'});
textFx('typewriter','타자 효과',c=>{const parts=split(c,'grapheme'),step=parts.length?c.duration/parts.length:0;return parts.map((s,i)=>s.animate([{opacity:0},{opacity:0,offset:.999},{opacity:1}],{duration:Math.max(1,step),delay:i*step,fill:'backwards'}));},{motion:false,keywords:['타자','타이핑','한 글자씩'],target:'text',note:'39'});
textFx('count-up','숫자 카운트업',c=>{const e=c.el,original=e.textContent,m=/([-−+]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/.exec(original);if(!m)return [];c.remember(e);e.dataset.ssActionText='true';
 const target=Number(m[2].replace(/,/g,'')+(m[3]||'')),dec=(m[3]||'.').length-1,comma=m[2].includes(','),anim=e.animate([{opacity:1},{opacity:1}],{duration:c.duration});
 const fmt=v=>{let s=v.toFixed(dec);if(comma){const [a,b]=s.split('.');s=a.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(b?'.'+b:'');}return original.slice(0,m.index)+m[1]+s+original.slice(m.index+m[0].length);};
 const tick=()=>{if(anim.playState==='idle')return;const p=Math.min(1,(anim.currentTime||0)/c.duration);if(anim.playState==='finished'||p>=1){e.textContent=original;return;}e.textContent=fmt(target*(1-Math.pow(1-p,3)));requestAnimationFrame(tick);};
 e.textContent=fmt(0);requestAnimationFrame(tick);anim.finished.then(()=>{e.textContent=original;},()=>{});return [anim];},{motion:false,duration:1200,keywords:['카운트','숫자가 올라','숫자가 늘어'],target:'text',note:'19'});
textFx('flow-steps','단계 흐름 순차 등장',c=>stagger(c,kids(c.el),()=>[{opacity:0,translate:'-30px 0'},{opacity:1,translate:'0 0'}],.45),{keywords:['단계','흐름','절차'],target:'list',note:'52'});
/* ---------- charts: only data marks move; axes, ticks, labels and legends stay fixed ---------- */
function grow(c,staggered){const m=chartMarks(c.el),bars=m.bars;if(!bars.length)return null;const o=orient(bars),item=staggered?Math.max(1,c.duration*.55):c.duration,step=staggered&&bars.length>1?(c.duration-item)/(bars.length-1):0;
 return bars.map((b,i)=>{c.remember(b);b.style.transformBox='fill-box';b.style.transformOrigin=o[i].origin;b.style.scale='';return b.animate([{scale:o[i].vertical?'1 0':'0 1'},{scale:'1 1'}],{duration:item,delay:i*step,easing:c.easing,fill:'backwards'});});}
function prepGrow(c){const m=chartMarks(c.el),o=orient(m.bars);m.bars.forEach((b,i)=>{c.remember(b);b.style.transformBox='fill-box';b.style.transformOrigin=o[i].origin;b.style.scale=o[i].vertical?'1 0':'0 1';});}
function draw(c,paths){return paths.map(p=>{c.remember(p);const cs=getComputedStyle(p);if(cs.strokeDasharray&&cs.strokeDasharray!=='none')return p.animate([{opacity:0},{opacity:1}],{duration:c.duration,fill:'backwards'});const len=p.getTotalLength?.()||100;p.style.strokeDasharray=len+' '+len;return p.animate([{strokeDashoffset:len},{strokeDashoffset:0}],{duration:c.duration,easing:c.easing,fill:'backwards'});});}
const chart=(id,name,o)=>def(id,name,'그래프',{target:'chart',duration:1200,...o});
chart('grow-bars','막대 성장 (기준선에서)',{run:c=>grow(c,false)||[c.el.animate([{clipPath:'inset(100% 0 0 0)'},{clipPath:'inset(0 0 0 0)'}],{duration:c.duration,easing:c.easing})],prepare:prepGrow,keywords:['막대','그래프가 자라','자라','성장','늘어나','차오르'],note:'25/26 음수 막대는 반대 방향'});
chart('grow-bars-stagger','막대 차례로 성장',{duration:1600,run:c=>grow(c,true)||[],prepare:prepGrow,keywords:['막대 차례로','막대 하나씩'],note:'27'});
chart('draw-line','선 그래프 그리기',{run:c=>draw(c,chartMarks(c.el).lines),keywords:['선 그래프','선이 그려','추세선'],note:'28'});
chart('points-in','점 차례로 나타나기',{run:c=>stagger(c,chartMarks(c.el).points,e=>{e.style.transformBox='fill-box';e.style.transformOrigin='center';return [{opacity:0,scale:0},{opacity:1,scale:1}];},.3),keywords:['점이','점 차례로','산점'],note:'29'});
chart('progress-fill','진행 표시줄 채우기',{run:c=>{const t=c.el.children.length===1?c.el.children[0]:c.el;c.remember(t);t.style.transformOrigin='left center';return [t.animate([{scale:'0 1'},{scale:'1 1'}],{duration:c.duration,easing:c.easing,fill:'backwards'})];},keywords:['진행','프로그레스','게이지'],note:'30'});
chart('donut-fill','도넛 값 채우기',{run:c=>chartMarks(c.el).areas.filter(e=>/circle|ellipse/i.test(e.tagName)).map(e=>{c.remember(e);const d=getComputedStyle(e).strokeDasharray.split(/[\s,]+/).map(parseFloat).filter(Number.isFinite),total=d.reduce((a,b)=>a+b,0)||1;return e.animate([{strokeDasharray:'0 '+total},{strokeDasharray:d.join(' ')}],{duration:c.duration,easing:c.easing,fill:'backwards'});}),keywords:['도넛','원그래프','파이'],note:'45 범례 고정'});
chart('area-rise','영역그래프 차오르기',{run:c=>chartMarks(c.el).areas.filter(e=>!/circle|ellipse/i.test(e.tagName)).map(e=>{c.remember(e);e.style.transformBox='fill-box';e.style.transformOrigin='center bottom';return e.animate([{scale:'1 0',opacity:.3},{scale:'1 1',opacity:1}],{duration:c.duration,easing:c.easing,fill:'backwards'});}),keywords:['영역'],note:'46'});
chart('error-bars','오차막대 등장',{motion:false,run:c=>stagger(c,chartMarks(c.el).whiskers,()=>[{opacity:0},{opacity:1}],.5),keywords:['오차','신뢰구간'],note:'47'});
chart('arrow-draw','화살표·선 그리기',{run:c=>draw(c,[...(c.el.matches('path,line,polyline')?[c.el]:c.el.querySelectorAll('path,line,polyline'))].filter(p=>!p.closest('defs,marker')&&getComputedStyle(p).stroke!=='none')),keywords:['화살표','연결선','기준선'],note:'43/49'});
chart('callout','주석 콜아웃 펼치기',{target:'any',duration:900,run:c=>[c.el.animate([{opacity:0,clipPath:'inset(0 100% 0 0)'},{opacity:1,clipPath:'inset(0 0 0 0)'}],{duration:c.duration,easing:c.easing})],keywords:['콜아웃','주석','말풍선'],note:'50'});
/* ---------- slide-level / layered ---------- */
const scene=(id,name,o)=>def(id,name,'화면 전환',{target:'slide',duration:800,...o});
scene('slide-fade','슬라이드 교차 페이드',{motion:false,frames:()=>[{filter:'opacity(0)'},{filter:'opacity(1)'}],keywords:['슬라이드 페이드','화면이 서서히'],note:'21'});
scene('push-left','좌우 밀기 전환',{frames:()=>[{translate:'1280px 0'},{translate:'0 0'}],keywords:['밀기','옆으로 밀'],note:'23'});
scene('push-up','위로 밀기 전환',{frames:()=>[{translate:'0 720px'},{translate:'0 0'}],keywords:['위로 밀'],note:'24'});
scene('crossfade','이미지 교차 페이드',{target:'any',motion:false,duration:1200,run:c=>{const k=kids(c.el);if(k.length<2)return [c.el.animate([{opacity:0},{opacity:1}],{duration:c.duration})];const a=k[0],b=k[k.length-1];c.remember(a);c.remember(b);a.style.opacity='0';b.style.opacity='1';return [a.animate([{opacity:1},{opacity:0}],{duration:c.duration}),b.animate([{opacity:0},{opacity:1}],{duration:c.duration})];},keywords:['교차','전후 이미지'],note:'20'});
scene('compare-wipe','전후 이미지 와이프',{target:'any',duration:1400,run:c=>{const k=kids(c.el),t=k.length>1?k[k.length-1]:c.el;c.remember(t);return [t.animate([{clipPath:'inset(0 0 0 100%)'},{clipPath:'inset(0 0 0 0%)'}],{duration:c.duration,easing:c.easing,fill:'backwards'})];},keywords:['와이프','전후 비교'],note:'51'});
/* Recipes create several chained actions; they are expanded by StudioAnimation, not played directly. */
def('recipe-black-graph','어둠 해제 후 그래프 성장','연속 효과',{kind:'recipe',target:'slide',duration:2400,keywords:['어둠 해제 후'],note:'53 = 22 → 25'});
def('recipe-title-body-graph','제목 → 본문 → 그래프 순서','연속 효과',{kind:'recipe',target:'slide',duration:2600,keywords:['제목부터','순서대로 등장'],note:'54'});
/* ---------- player ---------- */
const reducedQuery=()=>{try{return matchMedia('(prefers-reduced-motion: reduce)').matches;}catch{return false;}};
function context(el,action,env){const fx=byId(action.effect);const duration=Math.max(0,Math.min(10000,Number.isFinite(+action.duration)?+action.duration:fx.duration));return {el,fx,duration,easing:fx.easing,color:/^#[0-9a-f]{3,8}$/i.test(action.value||'')?action.value:'',remember:env.remember||(()=>{}),reduced:!!(env.reduced??reducedQuery())};}
/* Chart effects never hide the chart root: axes, ticks, labels and legends stay visible; only data marks start hidden. */
const allMarks=el=>{const m=chartMarks(el);return [...m.bars,...m.lines,...m.points,...m.areas,...m.whiskers];};
function prepare(el,action,env={}){const fx=byId(action.effect);if(!fx||!el)return false;const c=context(el,action,env);
 if(fx.id==='black-reveal'){fx.prepare(c);return true;}
 if(fx.target==='chart'){if(fx.prepare&&!c.reduced)fx.prepare(c);else for(const m of allMarks(el)){c.remember(m);m.style.opacity='0';}return true;}
 if(fx.prepare&&!c.reduced){fx.prepare(c);return true;}
 if(fx.kind==='in'){c.remember(el);el.style.opacity='0';return true;}return false;}
function revealMarks(c){const marks=allMarks(c.el);for(const m of marks){if(m.style.opacity==='0'||m.style.scale){c.remember(m);m.style.opacity='';m.style.scale='';}}return marks;}
function play(el,action,env={}){
 const fx=byId(action.effect);if(!fx||!el||fx.kind==='recipe')return {finished:Promise.resolve(),cancel(){}};
 const c=context(el,action,env);c.remember(el);let anims=[];
 if(fx.kind==='in'&&fx.target!=='chart'){el.style.visibility='visible';el.style.opacity='1';}
 if(fx.kind==='out')el.style.opacity='0';
 if(c.reduced&&fx.id!=='black-reveal'){
  /* Reduced motion: no travel/scale/rotation. Entrances/exits become a short opacity change, emphasis and
     chart growth jump to the final state. Completion still resolves so dependent actions continue. */
  const short=Math.min(c.duration,180);
  if(fx.target==='chart'){const marks=revealMarks(c);anims=marks.length?marks.map(m=>m.animate([{opacity:0},{opacity:1}],{duration:short})):[];}
  else if(fx.kind==='in')anims=[el.animate([{opacity:0},{opacity:1}],{duration:short})];
  else if(fx.kind==='out')anims=[el.animate([{opacity:1},{opacity:0}],{duration:short})];
  else if(fx.final)anims=(fx.run(c)||[]).map(a=>{a.finish();return a;});
 }else{if(fx.target==='chart')revealMarks(c);anims=(fx.run?fx.run(c):[el.animate(fx.frames(c),{duration:c.duration,easing:c.easing})])||[];}
 const finished=Promise.all(anims.map(a=>a.finished.catch(()=>{}))).then(()=>{if(fx.done&&!anims.some(a=>a.playState==='idle'))fx.done(c);});
 return {finished,animations:anims,cancel(){anims.forEach(a=>{try{a.cancel();}catch{}});}};
}
/* Remove helper nodes (black overlay, circle marks) — used on reset/re-entry. */
function cleanup(root){root.querySelectorAll('[data-ss-fx-temp]').forEach(x=>{x.getAnimations?.({subtree:true}).forEach(a=>a.cancel());x.remove();});}
function scope(){const saved=new Map();return {remember(e){if(!saved.has(e))saved.set(e,{style:e.getAttribute('style'),html:e.innerHTML,label:e.getAttribute('aria-label')});},restore(){for(const [e,b]of saved){e.getAnimations?.().forEach(a=>a.cancel());if(b.style===null)e.removeAttribute('style');else e.setAttribute('style',b.style);if(e.dataset.ssActionText){e.innerHTML=b.html;delete e.dataset.ssActionText;if(b.label===null)e.removeAttribute('aria-label');else e.setAttribute('aria-label',b.label);}}saved.clear();}};}
return {list,get:byId,play,prepare,cleanup,scope,chartMarks,reducedQuery,categories:['등장','퇴장','강조','텍스트·목록','그래프','화면 전환','연속 효과']};
};
