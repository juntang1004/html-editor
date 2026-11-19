// Deliberately excluded from npm test. Uses synthetic content and at most two paid requests.
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createStudioServer,loadConfiguration} from '../server.mjs';
if(!process.argv.includes('--run-live'))throw Error('Pass --run-live to explicitly run two real API requests.');
const configuration=loadConfiguration({directory:path.join(process.env.APPDATA,'com.slidestudio.editor'),env:{}});
assert(configuration.apiKey,'Application API configuration missing');
const server=createStudioServer(configuration);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const {token}=await (await fetch(base+'/api/session')).json();
const scene=[{id:'slide-0',tag:'slide',text:'그래프 발표'},{id:'caption',tag:'p',text:'결과 제목'},{id:'chart',tag:'svg',text:'세 그룹 막대그래프'}];
const cases=[
 {name:'native-duration-edit',prompt:'기존 원본 등장 애니메이션 appear의 재생 시간을 0.2초에서 2초로 바꿔줘. 새 효과는 추가하지 마.',native:[{id:'motion:appear',name:'appear',duration:200,delay:0,targets:['caption']}],check(ops){assert.equal(ops.length,1);assert.equal(ops[0].op,'native');assert.equal(ops[0].id,'motion:appear');assert.equal(ops[0].duration,2000);}},
 {name:'black-then-chart',prompt:'페이지 진입 시 검은 화면에서 1초 동안 밝아지고, 다 밝아지면 막대그래프가 2초 동안 자라게 해줘. 그래프 축과 숫자는 그대로 유지해줘.',native:[],check(ops){const first=ops.find(o=>o.effect==='black-reveal');const second=ops.find(o=>['grow-bars','grow-bars-stagger'].includes(o.effect));assert(first&&second);assert.equal(first.trigger,'enter');assert.equal(first.targetId,'slide-0');assert.equal(first.duration,1000);assert.equal(second.trigger,'after');assert.equal(second.afterId,first.id);assert.equal(second.targetId,'chart');assert.equal(second.duration,2000);}}
];
const results=[];
try{
 for(const item of cases){
  const started=Date.now();
  const response=await fetch(base+'/api/action',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Studio-Token':token},body:JSON.stringify({prompt:item.prompt,scene,actions:[],native:item.native,currentSlide:'slide-0',selectedIds:['chart']})});
  const data=await response.json();
  const result={name:item.name,status:response.status,elapsedMs:Date.now()-started,model:data.model,usage:data.usage,operations:data.operations,explanation:data.explanation};
  try{assert.equal(response.status,200,data.code||'API request failed');item.check(data.operations);result.passed=true;}catch(error){result.passed=false;result.failure=error.message;process.exitCode=1;}
  results.push(result);console.log(JSON.stringify({name:result.name,status:result.status,passed:result.passed,elapsedMs:result.elapsedMs}));
 }
 await fs.mkdir('artifacts/qa',{recursive:true});await fs.writeFile('artifacts/qa/live-ai.json',JSON.stringify(results,null,2));
}finally{await new Promise(resolve=>server.close(resolve));}
