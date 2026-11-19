import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const fixture = fileURLToPath(new URL('../fixtures/two-slides.html', import.meta.url));
const layoutFixture = fileURLToPath(new URL('../fixtures/layout-and-animation.html', import.meta.url));
const canvas = page => page.frameLocator('#canvas');

test.beforeEach(async ({page}) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === 'http://127.0.0.1:4417' ? route.continue() : route.abort();
  });
  await page.goto('/');
});

test('Delete inside a text input does not delete the selected slide object', async ({page}) => {
  await page.locator('#file-input').setInputFiles(fixture);
  await expect(canvas(page).locator('#alpha')).toBeVisible();
  await canvas(page).locator('#alpha').click();
  await page.locator('#doc-name').fill('ABCDE');
  await page.locator('#doc-name').press('Home');
  await page.locator('#doc-name').press('Delete');
  await expect(page.locator('#doc-name')).toHaveValue('BCDE');
  await expect(canvas(page).locator('#alpha')).toBeVisible();
});

test('imported HTML cannot access editor globals through the iframe parent', async ({page}) => {
  const html = `<!doctype html><html><body><section class="slide"><h1>Sandbox check</h1><p id="result">pending</p></section><script>
  try { parent.__qaParentExecuted = true; document.getElementById('result').textContent = 'escaped'; }
  catch { document.getElementById('result').textContent = 'blocked'; }
  </script></body></html>`;
  await page.locator('#file-input').setInputFiles({name:'sandbox.html',mimeType:'text/html',buffer:Buffer.from(html)});
  await expect(canvas(page).locator('#result')).toHaveText('blocked');
  expect(await page.evaluate(() => window.__qaParentExecuted)).toBeUndefined();
});

test('untrusted slide metadata cannot inject script into the privileged editor', async ({page}) => {
  const html = `<!doctype html><html><body><section class="slide"><h1>Metadata boundary</h1></section><script>
  setTimeout(() => {
    const runtime = document.getElementById('ss-runtime').textContent;
    const channel = runtime.match(/"channel":"([^"]+)"/)[1];
    const count = '<img src="/qa-missing-image" onerror="window.__qaParentExecuted=true">';
    parent.postMessage({studio:true,channel,type:'meta',current:'qa-slide',state:{order:[],deleted:[],patches:{},additions:[],actions:[]},slides:[{id:'qa-slide',title:'Adversarial metadata',actions:count,thumbnail:'<html><body>Safe thumbnail</body></html>'}],objects:[],nativeActions:[],actions:[]}, '*');
    document.body.dataset.qaSent = 'yes';
  }, 150);
  </script></body></html>`;
  await page.locator('#file-input').setInputFiles({name:'metadata-boundary.html',mimeType:'text/html',buffer:Buffer.from(html)});
  await expect(canvas(page).locator('body')).toHaveAttribute('data-qa-sent','yes');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__qaParentExecuted)).toBeUndefined();
  await expect(page.locator('img[src="/qa-missing-image"]')).toHaveCount(0);
});

test('parent-dependent grid layout is preserved in the editor and thumbnail', async ({page}) => {
  await page.locator('#file-input').setInputFiles(layoutFixture);
  await expect(canvas(page).locator('#layout-left')).toBeVisible();
  const geometry = locator => locator.evaluate(el => {
    const slide = el.closest('.slide');
    const r = el.getBoundingClientRect(), s = slide.getBoundingClientRect();
    return {display:getComputedStyle(slide).display,x:r.x-s.x,y:r.y-s.y,width:r.width,height:r.height,color:getComputedStyle(el).color};
  });
  const editor = await geometry(canvas(page).locator('#layout-left'));
  expect(editor.display).toBe('grid');
  expect(editor.width).toBeGreaterThan(400);
  const thumbnail = page.frameLocator('#slides .slide-card iframe').first();
  await expect(thumbnail.locator('#layout-left')).toBeVisible();
  const thumb = await geometry(thumbnail.locator('#layout-left'));
  expect(thumb.display).toBe('grid');
  for (const key of ['x','y','width','height']) expect(thumb[key]).toBeCloseTo(editor[key],0);
  expect(thumb.color).toBe(editor.color);
});

for (const outcome of ['cancel','error']) {
  test(`native save ${outcome} keeps the document dirty and does not silently download`, async ({page}) => {
    const errors = [], downloads = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('download', download => downloads.push(download.suggestedFilename()));
    await page.locator('#file-input').setInputFiles(fixture);
    await expect(canvas(page).locator('#alpha')).toBeVisible();
    await canvas(page).locator('#alpha').click();
    await page.locator('#delete').click();
    await expect(canvas(page).locator('#alpha')).toBeHidden();
    await page.evaluate(outcome => {
      window.__qaSaveCalls = 0;
      window.studioDesktop = {
        save: async () => {
          window.__qaSaveCalls++;
          if (outcome === 'error') throw Error('QA disk full');
          return false;
        }
      };
    }, outcome);
    await page.locator('#file-tab').click();
    await page.locator('#project-save').click();
    await expect.poll(() => page.evaluate(() => window.__qaSaveCalls)).toBe(1);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => {
      const event = new Event('beforeunload',{cancelable:true});
      window.dispatchEvent(event);
      return event.defaultPrevented;
    })).toBe(true);
    expect(downloads).toEqual([]);
    expect(errors).toEqual([]);
    await expect(canvas(page).locator('#alpha')).toBeHidden();
  });
}

test('two native animation edits on one element compose without reverting each other', async ({page}) => {
  const patch = await page.evaluate(() => {
    const native = ['a','b'].map(name => ({id:name,motionName:name,elements:[{id:'element',names:['a','b'],durations:['0.2s','0.3s'],delays:['0s']}]}));
    const operations = native.map(n => ({op:'native',id:n.id,duration:2000}));
    return window.StudioAnimation.apply({actions:[],patches:{}},operations,{native,currentSlide:'slide'}).state.patches.element.style;
  });
  expect(patch['animation-duration']).toBe('2s, 2s');
});

test('chart line animation preserves axes and leaves the chart visible', async ({page}) => {
  const result = await page.evaluate(async () => {
    const holder = document.createElement('div');
    holder.innerHTML = '<svg width="400" height="300"><g id="qa-axes"><path d="M20 20V250H380" stroke="black" fill="none"/></g><path id="qa-data-line" d="M30 240L100 150L200 190L300 40" stroke="red" fill="none"/></svg>';
    document.body.append(holder);
    const svg=holder.firstElementChild, axis=svg.querySelector('#qa-axes path'), fx=window.StudioEffects(), action={effect:'draw-line',duration:80};
    const before={opacity:getComputedStyle(axis).opacity,dash:getComputedStyle(axis).strokeDasharray};
    const classified=fx.chartMarks(svg).lines.map(el=>el.id || el.parentElement.id);
    fx.prepare(svg,action);
    const playback=fx.play(svg,action);
    const during={opacity:getComputedStyle(axis).opacity,dash:getComputedStyle(axis).strokeDasharray};
    await playback.finished;
    const after={opacity:getComputedStyle(axis).opacity,dash:getComputedStyle(axis).strokeDasharray};
    const opacity=getComputedStyle(svg).opacity;
    holder.remove();
    return {before,during,after,opacity,classified};
  });
  expect(result.classified).toEqual(['qa-data-line']);
  expect(result.during).toEqual(result.before);
  expect(result.after).toEqual(result.before);
  expect(result.opacity).toBe('1');
});

test('reduced-motion graph growth finishes visibly at its final state', async ({page}) => {
  const result = await page.evaluate(async () => {
    const holder=document.createElement('div');
    holder.innerHTML='<svg width="400" height="300"><rect x="40" y="100" width="40" height="160" fill="red"/><rect x="140" y="40" width="40" height="220" fill="blue"/></svg>';
    document.body.append(holder);
    const svg=holder.firstElementChild,fx=window.StudioEffects(),action={effect:'grow-bars',duration:80},scope=fx.scope();
    fx.prepare(svg,action,{reduced:true,remember:scope.remember});
    await fx.play(svg,action,{reduced:true,remember:scope.remember}).finished;
    const result={opacity:getComputedStyle(svg).opacity,scales:[...svg.querySelectorAll('rect')].map(e=>getComputedStyle(e).scale)};
    scope.restore();holder.remove();return result;
  });
  expect(result.opacity).toBe('1');
  expect(result.scales.every(scale=>scale==='none'||scale==='1'||scale==='1 1')).toBe(true);
});

test('a click-triggered effect completes before its dependent effect starts', async ({page}) => {
  const sourceHtml=await readFile(fixture,'utf8');
  const action=(id,targetId,trigger,afterId='')=>({id,slideId:'slide-0',name:id,trigger,triggerId:'',targetId,effect:'fade-in',duration:180,delay:0,value:'',initialHidden:true,afterId});
  const project={format:'html-slide-studio',version:1,name:'Click sequence QA',sourceHtml,state:{order:['slide-0','slide-1'],deleted:[],patches:{},additions:[],actions:[action('first','s0-n1','click'),action('second','s0-n2','after','first')]}};
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.locator('#file-input').setInputFiles({name:'click-sequence.studio.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  await expect(canvas(page).locator('#alpha')).toBeVisible();
  await page.locator('#present').click();
  await expect(canvas(page).locator('#beta')).toHaveCSS('opacity','0');
  await canvas(page).locator('.slide').first().click({position:{x:20,y:600}});
  await expect(canvas(page).locator('#alpha')).toHaveCSS('opacity','1');
  await expect(canvas(page).locator('#beta')).toHaveCSS('opacity','1');
  expect(errors).toEqual([]);
});

test('natural-language hover proposal resolves a valid event source', async ({page}) => {
  const result=await page.evaluate(()=>{
    const ctx={currentSlide:'s',selectedIds:['target'],actions:[],native:[],scene:[{id:'s',tag:'slide',text:'Slide'},{id:'target',tag:'p',text:'Target'}]};
    const proposal=window.StudioAnimation.interpret('선택한 개체에 마우스를 올리면 서서히 나타나게 해줘',ctx);
    const validated=window.StudioAnimation.validate(proposal,ctx);
    return window.StudioAnimation.apply({actions:[],patches:{}},validated.operations,ctx).state.actions[0];
  });
  expect(result.trigger).toBe('hover');
  expect(result.triggerId).toBe('target');
});

test('PDF source preserves grid layout and includes every slide without editor overlays', async ({page}) => {
  await page.locator('#file-input').setInputFiles(layoutFixture);
  await expect(canvas(page).locator('#layout-left')).toBeVisible();
  const html=await page.evaluate(()=>window.SlideStudio.getPrintHtml());
  const output=await page.context().newPage();
  try {
    await output.setContent(html);
    await output.emulateMedia({media:'print'});
    await expect(output.locator('[data-ss-slide]:visible')).toHaveCount(2);
    await expect(output.locator('#layout-slide')).toHaveCSS('display','grid');
    await expect(output.locator('#chart-axes')).toBeVisible();
    await expect(output.locator('script,#ss-overlay,.ss-outline,.ss-box,.ss-marquee')).toHaveCount(0);
    const left=await output.locator('#layout-left').boundingBox(),right=await output.locator('#layout-right').boundingBox();
    expect(right.x).toBeGreaterThan(left.x+left.width);
    expect(right.y).toBeCloseTo(left.y,0);
  } finally {await output.close();}
});
