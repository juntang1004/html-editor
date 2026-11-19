import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createStudioServer,loadConfiguration,validateProposal} from '../server.mjs';

const scene=[{id:'title',tag:'h1',text:'120 people',textEditable:true,fontSize:24}];
const action={name:'나타나기',trigger:'enter',triggerId:'',targetId:'title',effect:'fade',duration:2000,delay:0,value:'',initialHidden:true};
const proposal={explanation:'2초 동안 나타납니다.',actions:[action]};
const input={prompt:'2초 동안 나타나게',scene,selectedId:'title'};
const response = value => new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
const output = value => ({output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});

async function fixture(t,options={}) {
 let calls=0;
 const mock=options.apiClient || (async()=>{throw new Error('No mock response configured; real API access is forbidden');});
 const server=createStudioServer({...options,apiKey:options.apiKey??'test-only-not-a-secret',token:'test-token',
  apiClient:async(...args)=>{calls++;return mock(...args);}});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const base=`http://127.0.0.1:${server.address().port}`;
 async function request(route='/api/action',body=input,headers={}) {
  const result=await fetch(base+route,{method:'POST',headers:{Origin:base,'X-Studio-Token':'test-token','Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
  return {status:result.status,data:await result.json()};
 }
 return {server,base,request,calls:()=>calls};
}

test('action validation accepts supported duration and rejects invalid target/type/ranges',()=>{
 assert.doesNotThrow(()=>validateProposal(proposal,scene));
 for(const patch of [{targetId:'missing'},{triggerId:'missing'},{effect:'eval'},{duration:-1},{duration:10001},{delay:NaN},{initialHidden:'yes'},{name:3}])
  assert.throws(()=>validateProposal({...proposal,actions:[{...action,...patch}]},scene));
 assert.throws(()=>validateProposal({...proposal,actions:Array(9).fill(action)},scene));
 assert.throws(()=>validateProposal({...proposal,actions:[null]},scene));
});

test('importing the server neither reads configuration nor starts a listener',async t=>{
 const read=fs.readFileSync;
 t.mock.method(fs,'readFileSync',function(file,...args){
  assert.notEqual(path.basename(String(file)),'.env.local','Import must not read local configuration');
  return read.call(this,file,...args);
 });
 t.mock.method(http,'createServer',()=>{throw new Error('Import must not create a server');});
 const module=await import('../server.mjs?import-contract');
 assert.equal(typeof module.createStudioServer,'function');
});

test('configuration reads only the explicitly supplied directory/environment',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'studio-config-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 await writeFile(path.join(directory,'.env.local'),'OPENAI_API_KEY="fake-local"\nOPENAI_MODEL=local-model\n');
 const local=loadConfiguration({directory,env:{}});
 assert.equal(local.apiKey,'fake-local');assert.equal(local.model,'local-model');
 const override=loadConfiguration({directory,env:{OPENAI_API_KEY:'fake-env',PORT:'4417'}});
 assert.equal(override.apiKey,'fake-env');assert.equal(override.port,4417);
});

test('session exposes configuration status but no API key',async t=>{
 const f=await fixture(t);const r=await fetch(f.base+'/api/session');const data=await r.json();
 assert.equal(r.status,200);assert.equal(data.configured,true);assert.equal(data.token,'test-token');
 assert.equal(JSON.stringify(data).includes('test-only-not-a-secret'),false);assert.equal(f.calls(),0);
});

test('static files work and private files/traversal are denied',async t=>{
 const f=await fixture(t);
 for(const [route,status] of [['/',200],['/app.js',200],['/.env.local',404],['/%2eenv.local',404],['/..%2fserver.mjs',404],['/missing',404]]) {
  const r=await fetch(f.base+route);await r.arrayBuffer();assert.equal(r.status,status,route);
 }
 assert.equal(f.calls(),0);
});

test('host, origin and token checks reject requests before API invocation',async t=>{
 const f=await fixture(t);
 assert.equal((await f.request('/api/action',input,{'X-Studio-Token':'wrong'})).status,403);
 assert.equal((await f.request('/api/action',input,{Origin:'https://untrusted.invalid'})).status,403);
 const session=await fetch(f.base+'/api/session',{headers:{Origin:'https://untrusted.invalid'}});await session.arrayBuffer();assert.equal(session.status,403);
 const status=await new Promise((resolve,reject)=>{const r=http.get(f.base+'/',{headers:{Host:'untrusted.invalid'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});r.on('error',reject);});
 assert.equal(status,403);assert.equal(f.calls(),0);
});

test('no configured key and invalid requests do not call the API',async t=>{
 const disabled=await fixture(t,{apiKey:''});assert.equal((await disabled.request()).status,503);assert.equal(disabled.calls(),0);
 const f=await fixture(t);
 for(const body of ['{broken','null',{prompt:'',scene},{prompt:'test',scene:Array(161).fill(scene[0])}]) assert.equal((await f.request('/api/action',body)).status,400);
 assert.equal((await f.request('/api/design',{...input,scope:'invalid'})).status,400);
 assert.equal((await f.request('/api/action','x'.repeat(128001))).status,413);
 assert.equal(f.calls(),0);
});

test('mock action success sends structured contract and returns validated proposal',async t=>{
 let payload;
 const f=await fixture(t,{apiClient:async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');payload=JSON.parse(options.body);
  assert.equal(options.headers.Authorization,'Bearer test-only-not-a-secret');
  return response({...output(proposal),usage:{total_tokens:0}});
 }});
 const r=await f.request();assert.equal(r.status,200);
 // [animation-ai] legacy {actions} model output is normalized into add operations; `actions` mirrors the adds.
 assert.deepEqual(r.data.operations.map(({op,id,afterId,...rest})=>rest),proposal.actions);assert.equal(r.data.operations[0].op,'add');assert.equal(r.data.source,'api');
 assert.equal(r.data.actions.length,1);
 assert.equal(payload.store,false);assert.equal(payload.text.format.strict,true);assert.equal(payload.text.format.name,'slide_animation_edit');assert.equal(f.calls(),1);
});

// [animation-ai] richer action contract
const blank={name:null,trigger:null,triggerId:null,targetId:null,effect:null,duration:null,delay:null,value:null,initialHidden:null,afterId:null};
const existing={id:'a1',name:'나타나기',trigger:'enter',triggerId:'',targetId:'title',effect:'fade',duration:200,delay:0,value:'',initialHidden:true,afterId:''};
const animInput={prompt:'0.2초를 2초로 바꿔줘',scene,selectedIds:['title'],currentSlide:'slide-0',actions:[existing],native:[{id:'motion:grow',name:'막대',duration:200,delay:0,targets:['title']}]};
test('action request forwards existing action/native context and validates update/native operations',async t=>{
 let sent;
 const f=await fixture(t,{apiClient:async(url,options)=>{const body=JSON.parse(options.body);sent=JSON.parse(body.input);assert.match(body.instructions,/black-reveal/);assert.match(body.instructions,/never say the language is unsupported/);
  return response(output({explanation:'2초로 바꿉니다.',operations:[{...blank,op:'update',id:'a1',duration:2000},{...blank,op:'native',id:'motion:grow',duration:2000}]}));}});
 const r=await f.request('/api/action',animInput);assert.equal(r.status,200,JSON.stringify(r.data));
 assert.deepEqual(sent.actions.map(a=>a.id),['a1']);assert.deepEqual(sent.native.map(n=>n.id),['motion:grow']);assert.equal(sent.currentSlide,'slide-0');
 assert.deepEqual(r.data.operations.map(o=>[o.op,o.id,o.duration]),[['update','a1',2000],['native','motion:grow',2000]]);assert.deepEqual(r.data.actions,[]);
});
test('invalid animation proposals return specific Korean messages, not generic/unsupported-language text',async t=>{
 const f=await fixture(t,{apiClient:async()=>response(output({explanation:'x',operations:[{...blank,op:'update',id:'ghost',duration:2000}]}))});
 const r=await f.request('/api/action',animInput);assert.equal(r.status,422);assert.equal(r.data.code,'invalid_proposal');assert.match(r.data.error,/기존 액션/);
});
test('network failure of the provider maps to api_unreachable so the client can fall back locally',async t=>{
 const f=await fixture(t,{apiClient:async()=>{throw new TypeError('fetch failed');}});
 const r=await f.request('/api/action',animInput);assert.equal(r.status,502);assert.equal(r.data.code,'api_unreachable');
 const s=await (await fetch(f.base+'/api/session')).json();assert.equal(s.animation.contract,'slide_animation_edit');assert.equal(s.animation.localInterpreter,true);
});

test('mock design success and invalid scientific-number changes are validated',async t=>{
 let bad=false;
 const f=await fixture(t,{apiClient:async()=>response(output({explanation:'test',operations:[bad?{kind:'text',targets:['title'],property:'',value:'121 people'}:{kind:'style',targets:['title'],property:'color',value:'#123456'}]}))});
 assert.equal((await f.request('/api/design',{...input,scope:'current'})).status,200);
 bad=true;const r=await f.request('/api/design',{...input,scope:'current'});
 assert.equal(r.status,422);assert.equal(r.data.code,'invalid_proposal');
});

test('model refusal and empty output have distinguishable error codes',async t=>{
 let refused=true;
 const f=await fixture(t,{apiClient:async()=>response({output:refused?[{content:[{type:'refusal',refusal:'mock refusal'}]}]:[]})});
 const first=await f.request();assert.equal(first.status,502);assert.equal(first.data.code,'model_refusal');
 refused=false;assert.equal((await f.request()).data.code,'empty_output');
});

test('malformed model JSON and out-of-scope proposals are rejected',async t=>{
 let malformed=true;
 const f=await fixture(t,{apiClient:async()=>response(malformed?{output:[{content:[{type:'output_text',text:'{bad'}]}]}:output({...proposal,actions:[{...action,targetId:'missing'}]}))});
 for(let i=0;i<2;i++){const r=await f.request();assert.equal(r.status,422);assert.equal(r.data.code,'invalid_proposal');malformed=false;}
});

test('upstream rate-limit and server failures are mapped without leaking provider messages',async t=>{
 let status=429;
 const f=await fixture(t,{apiClient:async()=>new Response(JSON.stringify({error:{code:'mock_error',message:'sensitive provider detail'}}),{status})});
 const first=await f.request();assert.equal(first.status,429);assert.equal(first.data.code,'mock_error');
 status=500;const second=await f.request();assert.equal(second.status,502);assert.equal(JSON.stringify(second.data).includes('sensitive provider detail'),false);
});

test('timeout aborts the injected client and releases busy state',async t=>{
 let hang=true;
 const f=await fixture(t,{timeoutMs:{action:15,design:15},apiClient:async(url,{signal})=>{
  if(!hang)return response(output(proposal));
  return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
 }});
 const first=await f.request();assert.equal(first.status,422);assert.equal(first.data.code,'timeout');
 hang=false;assert.equal((await f.request()).status,200);
});

test('concurrent request is rejected while a proposal is in progress',async t=>{
 let release;let began;
 const started=new Promise(resolve=>{began=resolve;});
 const f=await fixture(t,{apiClient:()=>{began();return new Promise(resolve=>{release=()=>resolve(response(output(proposal)));});}});
 const pending=f.request();await started;
 try {assert.equal((await f.request()).status,429);} finally {release();}
 assert.equal((await pending).status,200);assert.equal(f.calls(),1);
});
