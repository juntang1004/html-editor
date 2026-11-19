import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
const directory=path.resolve('artifacts/HTML-Slide-Studio-Windows-x64');
const listener=net.createServer();
await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
const port=listener.address().port;
await new Promise(resolve=>listener.close(resolve));
const child=spawn(path.join(directory,'HTML Slide Studio.exe'),[],{cwd:directory,windowsHide:true,stdio:'ignore',env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
let browser;
let backendPid;
try{
  let ready=false;
  for(let i=0;i<60;i++){
    if(child.exitCode!==null)throw Error('Desktop exited before WebView2 was ready: '+child.exitCode);
    try{const response=await fetch(`http://127.0.0.1:${port}/json/version`);if(response.ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert(ready,'WebView2 debugging endpoint did not start');
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context=browser.contexts()[0];
  const page=context.pages()[0]||await context.waitForEvent('page');
  await page.waitForURL('http://tauri.localhost/**');
  await page.locator('#canvas').waitFor();
  await page.waitForFunction(()=>Boolean(window.studioDesktop));
  const session=await page.evaluate(async()=>{const r=await fetch('/api/session');return {status:r.status,body:await r.json()};});
  assert.equal(session.status,200);assert.equal(session.body.app,'HTML Slide Studio');
  backendPid=Number(session.body.instance?.replace(/^desktop-/,''));
  // Do not print tokens or credential status. Only a local GET occurs.
  await page.evaluate(()=>window.studioDesktop.resetDocument());
  const rejected=await page.evaluate(async()=>{try{await window.studioDesktop.acceptDocument('C:\\not-selected.html');return false;}catch{return true;}});
  assert(rejected,'An arbitrary path must not become a save destination');
  const canvas=page.frames().find(frame=>frame!==page.mainFrame()&&frame.url()==='about:srcdoc');
  assert(canvas,'Slide sandbox missing');
  const access=await canvas.evaluate(async()=>{if(!window.__TAURI__?.core?.invoke)return 'unavailable';return Promise.race([window.__TAURI__.core.invoke('reset_document_paths').then(()=>'allowed',()=>'denied'),new Promise(resolve=>setTimeout(()=>resolve('blocked'),1500))]);});
  assert.notEqual(access,'allowed','Imported slide must not get native permissions');
  fs.mkdirSync('artifacts/qa',{recursive:true});
  await page.screenshot({path:'artifacts/qa/desktop-smoke.png'});
  console.log('DESKTOP_SMOKE_OK: editor rendered, local API proxy, selected-path validation, imported-frame IPC denial');
}finally{
  if(browser)await browser.close().catch(()=>{});
  child.kill();
  if(backendPid){
    let alive=true;
    for(let i=0;i<30;i++){
      try{process.kill(backendPid,0);}catch{alive=false;break;}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert(!alive,'Owned backend should exit when desktop closes');
    console.log('DESKTOP_BACKEND_CLEANUP_OK');
  }
}
