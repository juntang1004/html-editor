import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/design.js';

const design = globalThis.StudioDesign;
const scene = [
 {id:'group',container:true,textEditable:false,fontSize:24},
 {id:'title',parentId:'group',text:'Study: 120 people, 12.5%',textEditable:true,fontSize:30},
 {id:'label',parentId:'group',text:'Protected',textEditable:false,fontSize:18},
];
const proposal = (...operations) => ({explanation:'테스트',operations});
const style = (property,value,targets=['title']) => ({kind:'style',targets,property,value});

test('supported styles pass while CSS injection and unknown properties fail', () => {
 assert.doesNotThrow(()=>design.validate(proposal(style('color','#123456')),scene));
 for(const value of ['red;display:none','url(https://example.invalid)','expression(alert(1))','var(--external)'])
  assert.equal(design.styleValid('color',value),false);
 assert.equal(design.styleValid('animation-duration','2s'),false,'current limitation is explicit');
 assert.equal(design.styleValid('transition-duration','2s'),false);
});
test('font sizes and scale factors respect boundaries', () => {
 for(const value of ['6px','200px']) assert.equal(design.styleValid('font-size',value),true);
 for(const value of ['5px','201px','20%']) assert.equal(design.styleValid('font-size',value),false);
 for(const value of ['0.49','2.01','NaN']) assert.throws(()=>design.validate(proposal({kind:'font-scale',targets:['title'],property:'',value}),scene));
});
test('unknown targets and protected text are rejected', () => {
 assert.throws(()=>design.validate(proposal(style('color','#123456',['missing'])),scene));
 assert.throws(()=>design.validate(proposal({kind:'text',targets:['label'],property:'',value:'New'}),scene));
});
test('scientific numbers must remain unchanged and ordered', () => {
 const text = value => proposal({kind:'text',targets:['title'],property:'',value});
 assert.doesNotThrow(()=>design.validate(text('Participants 120; result 12.5%'),scene));
 for(const value of ['Participants 121; result 12.5%','Result 12.5%; participants 120','Participants 120; result 12.5'])
  assert.throws(()=>design.validate(text(value),scene));
});
test('apply preserves the input state and merges existing patches', () => {
 const state={order:['slide-0'],deleted:[],patches:{title:{x:12,style:{color:'#000000'}}},additions:[],actions:[]};
 const before=structuredClone(state);
 const next=design.apply(state,proposal(style('font-size','40px')),scene);
 assert.deepEqual(state,before);
 assert.notEqual(next,state);
 assert.deepEqual(next.patches.title,{x:12,style:{color:'#000000','font-size':'40px'}});
});
test('text application escapes HTML rather than inserting executable markup', () => {
 const next=design.apply({patches:{}},proposal({kind:'text',targets:['title'],property:'',value:'<b>120</b>\n12.5%'}),scene);
 assert.equal(next.patches.title.html,'&lt;b&gt;120&lt;/b&gt;<br>12.5%');
});
test('columns require a container and normalize child widths', () => {
 const op={kind:'columns',targets:['group'],property:'',value:'2'};
 assert.throws(()=>design.validate(proposal({...op,targets:['title']}),scene));
 const next=design.apply({patches:{}},proposal(op),scene);
 assert.equal(next.patches.group.style.display,'grid');
 assert.equal(next.patches.title.style.width,'auto');
 assert.equal(next.patches.label.style['min-width'],'0px');
});
test('proposal limits reject oversized operation lists and empty target lists', () => {
 assert.throws(()=>design.validate(proposal(...Array(401).fill(style('color','#123456'))),scene));
 assert.throws(()=>design.validate(proposal(style('color','#123456',[])),scene));
});
