/* [animation-ai] AI animation editing (API or deterministic local interpreter), preview/apply/undo,
   native CSS animation timing, action-form extensions and the offline effects gallery.
   Talks to app.js only through window.SlideStudio.internals; applies changes via the runtime
   'apply-animation' command so each apply is one undo step. */
(()=>{
'use strict';
const S=window.SlideStudio.internals,A=window.StudioAnimation,FX=A.Effects,$=id=>document.getElementById(id),esc=S.esc;
const REDUCED_KEY='html-slide-studio-reduced-motion';
let proposal=null;
const el=(tag,attrs={},html='')=>{const e=document.createElement(tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(html)e.innerHTML=html;return e;};
/* ---------- request context (also sent to the server; see docs/animation-ai.md) ---------- */
function context(){
 const meta=S.meta;if(!meta)throw new A.ProposalError('슬라이드를 불러오는 중입니다. 잠시 후 다시 시도하세요.');
 const scene=[...meta.objects.map(o=>({id:o.id,tag:String(o.tag).toLowerCase(),text:o.text})),...meta.slides.map(s=>({id:s.id,tag:'slide',text:s.title}))].slice(0,160);
 const actions=meta.actions.map(({detail,...a})=>a);
 const native=meta.nativeActions.filter(n=>n.kind==='animation'&&n.id).map(n=>({id:n.id,name:n.name,detail:n.detail,motionName:n.motionName,duration:n.duration,delay:n.delay,targets:n.targets,elements:n.elements}));
 return {scene,actions,native,currentSlide:S.current,selectedIds:S.selection?.ids||[]};
}
const forServer=c=>({scene:c.scene,actions:c.actions,native:c.native.map(({elements,motionName,...n})=>n),currentSlide:c.currentSlide,selectedIds:c.selectedIds});
function clear(){proposal=null;$('animation-preview')?.close();}
function show(html){$('ai-result').innerHTML='<div class="ai-proposal">'+html+'</div>';}
function errorHtml(e){return esc(e.message||'요청을 처리하지 못했습니다.')+(e.hint?'<p class="muted small">'+esc(e.hint)+'</p>':'');}
/* ---------- generate: API first (if configured and not disabled), deterministic local fallback ---------- */
async function generate(){
 const prompt=$('ai-prompt').value,button=$('ai-generate');
 if(!S.meta||!prompt.trim()){S.toast('원하는 애니메이션 변경을 입력하세요.');return;}
 await S.flush();clear();$('ai-buttons').classList.add('hidden');
 const stamp=JSON.stringify(S.doc.state),slide=S.current;let ctx;
 try{ctx=context();}catch(e){show(errorHtml(e));return;}
 const localOnly=$('ai-local-only')?.checked||!S.session?.configured;
 button.disabled=true;button.textContent='애니메이션 변경을 확인하고 있습니다…';$('ai-result').textContent='';
 let result=null,source='local',note='',apiError=null;
 try{
  if(!localOnly){
   try{
    const r=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':S.session.token},body:JSON.stringify({prompt,selectedId:S.selection?.id,...forServer(ctx)}),signal:AbortSignal.timeout(70000)});
    const data=await r.json().catch(()=>({}));
    if(r.ok){result=A.validate(data,ctx);source='api';}
    else{apiError=Object.assign(new A.ProposalError(data.error||'AI 요청이 실패했습니다.',data.hint||''),{code:data.code,status:r.status});}
   }catch(e){apiError=e.name==='TimeoutError'?Object.assign(new A.ProposalError('AI 응답이 늦어졌습니다.'),{code:'timeout'}):e instanceof A.ProposalError?e:Object.assign(new A.ProposalError('AI 서버에 연결하지 못했습니다.'),{code:'network'});}
  }
  if(!result){
   try{result=A.validate(A.interpret(prompt,ctx),ctx);source='local';
    note=localOnly?(S.session?.configured?'기본 해석기만 사용하도록 설정되어 있습니다.':'AI API가 설정되지 않아 기본 해석기(오프라인 규칙)로 해석했습니다.'):'AI 요청이 실패해 기본 해석기로 해석했습니다: '+apiError.message;}
   catch(localError){throw apiError&&apiError.code==='invalid_proposal'?apiError:Object.assign(localError,{message:(apiError?'AI: '+apiError.message+' / 기본 해석기: ':'')+localError.message});}
  }
  if(JSON.stringify(S.doc.state)!==stamp||S.current!==slide||$('ai-prompt').value!==prompt||$('ai-mode').value!=='action')throw new A.ProposalError('요청 중 문서 또는 명령이 바뀌었습니다. 현재 상태로 다시 요청하세요.');
  if(!result.operations.length){show('<span class="fx-source '+source+'">'+(source==='api'?'AI 제안':'기본 해석기')+'</span> '+esc(result.explanation));return;}
  proposal={operations:result.operations,ctx,stamp,slide,source};
  const lines=A.describe(result.operations,ctx);
  show('<span class="fx-source '+source+'" data-source="'+source+'">'+(source==='api'?'AI 제안 (OpenAI API)':'기본 해석기 (오프라인 규칙)')+'</span>'+(note?'<p class="muted small">'+esc(note)+'</p>':'')+'<p>'+esc(result.explanation)+'</p><ul class="fx-ops">'+lines.map(l=>'<li>'+esc(l)+'</li>').join('')+'</ul>');
  $('ai-buttons').classList.remove('hidden');
 }catch(e){proposal=null;show(errorHtml(e));}
 finally{button.disabled=false;button.textContent='편집 제안 만들기';}
}
function nextState(){return A.apply(S.doc.state,proposal.operations,proposal.ctx);}
/* ---------- preview dialog (fresh frame, non-editing; enter/after actions auto-play) ---------- */
function ensureDialog(){
 if($('animation-preview'))return;
 const d=el('dialog',{id:'animation-preview'},'<header><h2>애니메이션 미리보기</h2><button id="animation-preview-close">닫기</button></header><div class="preview-toolbar"><button id="animation-replay">↻ 처음부터 재생</button><label><input id="animation-before" type="checkbox"> 변경 전 보기</label><button id="animation-commit" class="accent">변경 적용</button></div><div id="animation-preview-area"><iframe id="animation-frame" sandbox="allow-scripts" title="애니메이션 미리보기"></iframe></div><p class="muted">클릭으로 시작하는 효과는 미리보기 화면을 클릭해 확인하세요. 적용 후 Ctrl+Z로 되돌릴 수 있습니다.</p>');
 document.body.append(d);
 $('animation-preview-close').onclick=()=>d.close();$('animation-replay').onclick=drawPreview;$('animation-before').onchange=drawPreview;$('animation-commit').onclick=()=>{d.close();apply();};
 new ResizeObserver(()=>{const b=$('animation-preview-area');$('animation-frame').style.transform='scale('+Math.min(b.clientWidth/1280,b.clientHeight/720)+')';}).observe($('animation-preview-area'));
}
function drawPreview(){if(!proposal)return;const state=$('animation-before').checked?S.doc.state:nextState().state;$('animation-frame').srcdoc=S.buildHtml(false,null,{state,current:proposal.slide,editing:false,channel:'animation-preview-'+crypto.randomUUID()});}
function preview(){if(!proposal)return false;try{nextState();}catch(e){show(errorHtml(e));return true;}ensureDialog();$('animation-before').checked=false;$('animation-preview').showModal();drawPreview();return true;}
function apply(){
 if(!proposal)return false;
 if(JSON.stringify(S.doc.state)!==proposal.stamp||S.current!==proposal.slide){show('문서가 바뀌어 이 제안을 적용하지 않았습니다. 다시 요청하세요.');proposal=null;$('ai-buttons').classList.add('hidden');return true;}
 try{const r=nextState();S.cmd('apply-animation',{actions:r.state.actions,patches:r.patches});S.toast('애니메이션 변경을 적용했습니다. Ctrl+Z로 한 번에 되돌릴 수 있습니다.');}
 catch(e){show(errorHtml(e));}
 proposal=null;$('ai-buttons').classList.add('hidden');$('animation-preview')?.close();return true;
}
/* Apply operations immediately (gallery, native duration control, form). */
function applyNow(result,ctx=context()){const v=A.validate(result,ctx),r=A.apply(S.doc.state,v.operations,ctx);S.cmd('apply-animation',{actions:r.state.actions,patches:r.patches});return {...r,operations:v.operations};}
/* ---------- native animation timing control in the action panel ---------- */
function nativeControls(card,n){
 if(!n.id)return;const label=el('label',{},'재생 시간 (초)'),input=el('input',{type:'number',min:'0',max:'10',step:'0.1','data-native-duration':n.id});input.value=String((n.duration||0)/1000);
 input.onchange=()=>{const ms=Math.round(Number(input.value)*1000);if(!(ms>=0&&ms<=10000)){S.toast('재생 시간은 0~10초 사이입니다.');return;}try{applyNow({explanation:'',operations:[{op:'native',id:n.id,duration:ms}]});S.toast(n.name+' 재생 시간을 '+ms/1000+'초로 바꿨습니다.');}catch(e){S.toast(e.message);}};
 label.append(input);card.append(label);
}
/* ---------- action form: 'after' trigger + gallery effects ---------- */
function setupForm(){
 const trig=$('action-trigger'),eff=$('action-effect');if(!trig||!eff||$('action-after'))return;
 trig.append(el('option',{value:'after'},'이전 효과가 끝난 뒤'));
 for(const cat of FX.categories.filter(c=>c!=='연속 효과')){const g=el('optgroup',{label:'갤러리 · '+cat});for(const f of FX.list.filter(x=>x.category===cat&&x.kind!=='recipe'))g.append(el('option',{value:f.id},esc(f.name)));eff.append(g);}
 const wrap=el('label',{id:'action-after-label',class:'hidden'},'먼저 끝날 효과');const sel=el('select',{id:'action-after'});wrap.append(sel);trig.closest('.grid').after(wrap);
 trig.addEventListener('change',()=>wrap.classList.toggle('hidden',trig.value!=='after'));
}
let formEditing=null;
function formOpened(action){formEditing=action?.id||null;const sel=$('action-after');if(!sel)return;const list=(S.meta?.actions||[]).filter(a=>a.id!==formEditing);sel.innerHTML=list.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+' · '+a.duration/1000+'초</option>').join('')||'<option value="">(먼저 다른 액션을 만드세요)</option>';sel.value=action?.afterId||list.at(-1)?.id||'';$('action-after-label').classList.toggle('hidden',$('action-trigger').value!=='after');}
function formValues(){return $('action-trigger')?.value==='after'?{afterId:$('action-after').value,triggerId:''}:{afterId:''};}
function checkAction(a){
 if(a.trigger==='after'){if(!a.afterId)throw Error('먼저 끝날 효과를 선택하세요.');const all=(S.meta?.actions||[]).map(({detail,...x})=>x).filter(x=>x.id!==a.id);const state={actions:[...all,{...a,id:a.id||'__new',slideId:S.current}],patches:{}};A.apply(state,[],{currentSlide:S.current});}
}
/* ---------- effects gallery ---------- */
const samples={
 chart:()=>'<svg viewBox="0 0 200 110" class="fx-chart"><g class="axes" stroke="#64748b" fill="none"><path d="M24 8 V90 H196"/></g><g class="labels" fill="#475569" font-size="9"><text x="2" y="12">10</text><text x="6" y="92">0</text></g><rect x="40" y="50" width="22" height="40" fill="#2563eb"/><rect x="80" y="26" width="22" height="64" fill="#2563eb"/><rect x="120" y="62" width="22" height="28" fill="#2563eb"/><rect x="160" y="90" width="22" height="14" fill="#e11d48"/><path d="M40 70 L90 40 L140 52 L180 22" stroke="#f59e0b" stroke-width="3" fill="none"/><circle cx="90" cy="40" r="4" fill="#f59e0b"/><circle cx="140" cy="52" r="4" fill="#f59e0b"/></svg>',
 list:()=>'<ul class="fx-list"><li>1단계 · 등록</li><li>2단계 · 무작위 배정</li><li>3단계 · 추적 관찰</li></ul>',
 text:()=>'<p class="fx-text">결과 12.5% 감소</p>',
 image:()=>'<div class="fx-image"><div></div><div></div></div>',
 slide:()=>'<div class="fx-slide"><b>슬라이드</b><span>제목과 본문</span></div>',
 any:()=>'<div class="fx-box">핵심 메시지</div>'};
const sampleKind=f=>f.kind==='recipe'?'chart':f.id==='donut-fill'?'donut':f.id==='progress-fill'?'progress':['crossfade','compare-wipe','ken-burns'].includes(f.id)?'image':f.target==='chart'?'chart':f.target==='list'?'list':f.target==='text'?'text':f.target==='slide'?'slide':'any';
samples.donut=()=>'<svg viewBox="0 0 120 120" class="fx-chart"><circle cx="60" cy="60" r="40" fill="none" stroke="#e2e8f0" stroke-width="16" class="grid-track"/><circle cx="60" cy="60" r="40" fill="none" stroke="#2563eb" stroke-width="16" stroke-dasharray="150 101.3" transform="rotate(-90 60 60)"/></svg>';
samples.progress=()=>'<div class="fx-progress"><div></div></div>';
let playing=null;
function stopCard(){if(!playing)return;playing.handle?.cancel();playing.scope.restore();FX.cleanup(playing.stage);playing.card.classList.remove('playing');clearTimeout(playing.timer);playing=null;}
function playCard(card,f){
 stopCard();const stage=card.querySelector('[data-fx-stage]'),target=stage.firstElementChild;if(!target)return;
 const scope=FX.scope(),reduced=$('fx-reduced').checked||undefined,action={effect:f.kind==='recipe'?'fade-in':f.id,duration:Number($('fx-duration').value)*1000||f.duration,value:''};
 card.classList.add('playing');playing={card,stage,scope};
 if(f.kind==='recipe'){const steps=f.id==='recipe-black-graph'?[['black-reveal',stage],['grow-bars',target]]:[['rise-in',target]];let p=Promise.resolve();for(const [id,t] of steps){FX.prepare(t,{effect:id},{remember:scope.remember,reduced});}for(const [id,t] of steps)p=p.then(()=>{if(playing?.stage!==stage)return;const h=FX.play(t,{effect:id,duration:FX.get(id).duration},{remember:scope.remember,reduced});playing.handle=h;return h.finished;});p.then(()=>{if(playing?.stage===stage)playing.timer=setTimeout(stopCard,900);});return;}
 FX.prepare(target,action,{remember:scope.remember,reduced});
 const h=FX.play(target,action,{remember:scope.remember,reduced});playing.handle=h;h.finished.then(()=>{if(playing?.handle===h)playing.timer=setTimeout(stopCard,900);});
}
function galleryOptions(){return {trigger:$('fx-trigger').value,duration:Math.round(Number($('fx-duration').value)*1000)||undefined,delay:Math.round(Number($('fx-delay').value)*1000)||0,sequential:$('fx-sequential').checked};}
function applyEffect(f){
 try{const ctx=context(),opts=galleryOptions(),r=A.galleryOperations(f.id,ctx,{...opts,duration:opts.duration??(f.kind==='recipe'?undefined:f.duration)});const out=applyNow(r,ctx);S.toast(r.explanation+' Ctrl+Z로 되돌릴 수 있습니다.');$('fx-status').textContent=r.explanation;lastApplied=out.created;}
 catch(e){S.toast(e.message);$('fx-status').textContent=e.message;}
}
let lastApplied=[];
function previewOnSlide(f){
 try{const ctx=context(),r=f?A.galleryOperations(f.id,ctx,galleryOptions()):null;let actions;
  if(r){const res=A.apply({actions:[],patches:{}},A.validate(r,ctx).operations,ctx);actions=res.state.actions;}
  else actions=(S.meta?.actions||[]).map(({detail,...a})=>a);
  if(!actions.length){S.toast('미리볼 효과가 없습니다.');return;}
  const total=actions.reduce((t,a)=>t+(a.duration||0)+(a.delay||0),0)+900;S.cmd('fx-preview',{actions,ms:total});}
 catch(e){S.toast(e.message);}
}
function buildGallery(){
 if($('effects-panel'))return;
 const tab=el('button',{'data-panel':'effects'},'효과');document.querySelector('.panel-tabs').append(tab);tab.onclick=()=>S.setPanel('effects');
 const panel=el('section',{id:'effects-panel',class:'panel hidden'});
 panel.innerHTML='<div class="panel-title"><h3>효과 갤러리</h3><span class="muted small">'+FX.list.length+'개 · 오프라인</span></div>'+
  '<input id="fx-search" type="search" placeholder="효과 검색 (예: 왼쪽, 막대, 검은 화면)" aria-label="효과 검색"><div id="fx-categories" class="fx-chips" role="tablist"></div>'+
  '<div class="grid fx-options"><label>시작<select id="fx-trigger"><option value="enter">슬라이드 진입</option><option value="click">클릭할 때</option><option value="hover">마우스를 올릴 때</option><option value="after">이전 효과가 끝난 뒤</option></select></label><label>재생 시간 (초)<input id="fx-duration" type="number" min="0" max="10" step="0.1" placeholder="기본"></label><label>지연 (초)<input id="fx-delay" type="number" min="0" max="10" step="0.1" value="0"></label><label class="check"><input id="fx-sequential" type="checkbox" checked>여러 개 선택 시 차례로</label></div>'+
  '<label class="check"><input id="fx-reduced" type="checkbox">동작 줄이기 (이동·확대 없이 짧게, 발표·내보내기에도 적용)</label>'+
  '<div class="buttons"><button id="fx-play-slide">▷ 이 슬라이드 효과 재생</button></div><p id="fx-status" class="muted small" role="status">슬라이드에서 개체를 선택한 뒤 효과의 “적용”을 누르세요. 화면 전환 효과는 현재 슬라이드에 적용됩니다.</p><div id="fx-list" class="fx-list-grid"></div>';
 document.querySelector('.inspector').append(panel);
 let category='전체';const chips=$('fx-categories');
 for(const c of ['전체',...FX.categories]){const b=el('button',{'data-category':c,role:'tab'},esc(c));b.onclick=()=>{category=c;for(const x of chips.children)x.classList.toggle('active',x===b);render();};chips.append(b);}chips.firstChild.classList.add('active');
 $('fx-reduced').checked=localStorage.getItem(REDUCED_KEY)==='1';
 $('fx-reduced').onchange=()=>{localStorage.setItem(REDUCED_KEY,$('fx-reduced').checked?'1':'0');S.cmd('reduced-motion',{on:$('fx-reduced').checked});};
 $('fx-search').oninput=render;$('fx-play-slide').onclick=()=>previewOnSlide(null);
 function render(){
  stopCard();const q=$('fx-search').value.trim().toLowerCase(),list=$('fx-list');list.replaceChildren();
  const match=f=>(category==='전체'||f.category===category)&&(!q||[f.name,f.id,f.category,...f.keywords].some(x=>x.toLowerCase().includes(q)));
  const shown=FX.list.filter(match);
  for(const f of shown){
   const card=el('article',{class:'fx-card','data-effect':f.id,tabindex:'0'});
   const kind=sampleKind(f);
   card.innerHTML='<div class="fx-stage" data-fx-stage>'+samples[kind]()+'</div><div class="fx-meta"><strong>'+esc(f.name)+'</strong><span class="muted small">'+esc(f.category)+' · '+f.duration/1000+'초'+(f.motion?'':' · 동작 적음')+'</span></div><div class="buttons"><button data-play>▷ 미리보기</button><button data-slide>슬라이드에서</button><button data-apply class="accent">적용</button></div><details><summary>효과 정의</summary><pre>'+esc(String(f.frames||f.run||'(여러 효과를 차례로 연결하는 묶음)').slice(0,900))+'</pre><p class="muted small">참고 '+esc(f.note||'')+' · 자체 구현</p></details>';
   card.querySelector('[data-play]').onclick=()=>playCard(card,f);
   card.querySelector('[data-apply]').onclick=()=>applyEffect(f);
   card.querySelector('[data-slide]').onclick=()=>previewOnSlide(f);
   card.onkeydown=e=>{if(e.key==='Enter'&&e.target===card)playCard(card,f);};
   list.append(card);
  }
  if(!shown.length)list.innerHTML='<p class="muted">검색 결과가 없습니다. 다른 단어로 찾아보세요.</p>';
 }
 render();
 /* Pause card previews when the gallery is hidden. */
 new MutationObserver(()=>{if(panel.classList.contains('hidden'))stopCard();}).observe(panel,{attributes:true,attributeFilter:['class']});
}
/* ---------- AI panel: local-only option + status help ---------- */
function setupAi(){
 if($('ai-local-only'))return;
 const label=el('label',{class:'check',id:'ai-local-label'});label.innerHTML='<input id="ai-local-only" type="checkbox">기본 해석기만 사용 (오프라인 · API 비용 없음)';
 $('ai-generate').before(label);
 const help=el('p',{id:'ai-animation-help',class:'muted small'});help.textContent='애니메이션 명령 예: “0.2초 애니메이션을 2초로 바꿔줘”, “검은 화면에서 밝아진 다음 그래프가 자라게 해줘”. AI API가 없으면 기본 해석기가 시간 변경·삭제·효과 추가·순서 연결을 처리합니다.';
 label.after(help);
 const sync=()=>{const action=$('ai-mode').value==='action';label.classList.toggle('hidden',!action);help.classList.toggle('hidden',!action);};
 $('ai-mode').addEventListener('change',sync);sync();
}
window.StudioAnimationUI={generate,preview,apply,clear,nativeControls,formOpened,formValues,checkAction,context,applyNow,get proposal(){return proposal;}};
setupForm();setupAi();buildGallery();
})();
