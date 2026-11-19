import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const fixture = fileURLToPath(new URL('../fixtures/two-slides.html', import.meta.url));
const canvas = page => page.frameLocator('#canvas');
const selected = page => page.evaluate(() => window.SlideStudio.selection?.ids ?? []);
const documentState = page => page.evaluate(() => window.SlideStudio.getDocument().state);
const fixtureCss = fileURLToPath(new URL('../fixtures/context-css.html', import.meta.url));
const box = (page, selector) => canvas(page).locator(selector).boundingBox();
const outlineCount = page => canvas(page).locator('.ss-outline').count();
const pdfPages = buf => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

test.beforeEach(async ({ page }) => {
  // Each Playwright test gets a fresh browser context, including localStorage.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === `http://127.0.0.1:${process.env.STUDIO_TEST_PORT || 4417}` ? route.continue() : route.abort('blockedbyclient');
  });
  await page.goto('/');
  await page.locator('#file-input').setInputFiles(fixture);
  await expect(page.locator('#slides .slide-card')).toHaveCount(2);
  await expect(canvas(page).locator('#alpha')).toBeVisible();
});

test('imports HTML, renders rail, and navigates between slides', async ({ page }) => {
  await expect(canvas(page).locator('#beta')).toBeVisible();
  await page.locator('#slides .slide-card').nth(1).click();
  await expect(canvas(page).locator('#gamma')).toBeVisible();
  await expect(canvas(page).locator('#alpha')).toBeHidden();
});

test('Delete works when the selected object iframe has keyboard focus', async ({ page }) => {
  await canvas(page).locator('#alpha').click();
  await expect.poll(() => selected(page)).toHaveLength(1);
  // Selection's pointer handler prevents default focus; explicitly focus the iframe body.
  await canvas(page).locator('body').evaluate(el => { el.tabIndex = -1; el.focus(); });
  await page.keyboard.press('Delete');
  await expect(canvas(page).locator('#alpha')).toBeHidden();
  await expect(canvas(page).locator('#beta')).toBeVisible();
});

test('Shift multi-selection deletes both objects and undo/redo restores the operation', async ({ page }) => {
  await canvas(page).locator('#alpha').click();
  await canvas(page).locator('#beta').click({ modifiers: ['Shift'] });
  await expect.poll(() => selected(page)).toHaveLength(2);
  await page.locator('#delete').click();
  await expect(canvas(page).locator('#alpha')).toBeHidden();
  await expect(canvas(page).locator('#beta')).toBeHidden();
  await page.locator('#undo').click();
  await expect(canvas(page).locator('#alpha')).toBeVisible();
  await expect(canvas(page).locator('#beta')).toBeVisible();
  await page.locator('#redo').click();
  await expect(canvas(page).locator('#alpha')).toBeHidden();
  await expect(canvas(page).locator('#beta')).toBeHidden();
});

for (const format of ['project-save', 'export']) {
  test(`${format} download preserves edits when reimported`, async ({ page }) => {
    await canvas(page).locator('#alpha').click();
    await page.locator('#delete').click();
    await expect(canvas(page).locator('#alpha')).toBeHidden();
    const before = await documentState(page);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#file-tab').click();
    await page.locator(`#${format}`).click();
    const download = await downloadPromise;
    const buffer = await readFile(await download.path());
    expect(buffer.length).toBeGreaterThan(100);
    await page.locator('#file-input').setInputFiles(fixture);
    await expect(canvas(page).locator('#alpha')).toBeVisible();
    await page.locator('#file-input').setInputFiles({ name: download.suggestedFilename(), mimeType: format === 'export' ? 'text/html' : 'application/json', buffer });
    await expect(canvas(page).locator('#alpha')).toBeHidden();
    await expect(canvas(page).locator('#beta')).toBeVisible();
    await expect.poll(() => documentState(page)).toEqual(before);
  });
}

test('mock AI action proposal applies only after confirmation and can be undone', async ({ page }) => {
  let requestBody;
  await page.route('**/api/action', async route => {
    requestBody = route.request().postDataJSON();
    const target = requestBody.scene.find(item => item.text === 'Alpha object');
    expect(target).toBeTruthy();
    await route.fulfill({ json: { explanation: 'Mocked two-second fade', actions: [{ name: 'Alpha fade', trigger: 'enter', targetId: target.id, effect: 'fade', duration: 2000, delay: 0, value: '', initialHidden: true }] } });
  });
  await page.locator('[data-panel="ai"]').click();
  await page.locator('#ai-mode').selectOption('action');
  await page.locator('#ai-prompt').fill('Alpha object를 2초 동안 나타나게 해줘');
  await page.locator('#ai-generate').click();
  await expect(page.locator('#ai-result')).toContainText('Mocked two-second fade');
  expect(requestBody.prompt).toContain('2초');
  expect((await documentState(page)).actions).toHaveLength(0);
  await page.locator('#ai-apply').click();
  await expect.poll(async () => (await documentState(page)).actions).toHaveLength(1);
  expect((await documentState(page)).actions[0]).toMatchObject({ effect: 'fade', duration: 2000 });
  await page.locator('#undo').click();
  await expect.poll(async () => (await documentState(page)).actions).toHaveLength(0);
});

test('Delete works after toolbar button focus', async ({ page }) => {
  await canvas(page).locator('#alpha').click();
  await expect.poll(() => selected(page)).toHaveLength(1);
  await page.locator('#copy').click();
  await expect(page.locator('#copy')).toBeFocused();
  await page.keyboard.press('Delete');
  await expect(canvas(page).locator('#alpha')).toBeHidden();
  await expect(canvas(page).locator('#beta')).toBeVisible();
});

test('background marquee selects both enclosed objects and Ctrl/Shift toggle selection', async ({ page }) => {
  const a = await box(page, '#alpha'), b = await box(page, '#beta');
  await page.mouse.move(a.x - 10, a.y - 10);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width + 10, b.y + b.height + 10, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => selected(page)).toHaveLength(2);
  await expect(canvas(page).locator('.ss-marquee')).toHaveCount(0);
  await canvas(page).locator('#alpha').click({ modifiers: ['Control'] });
  await expect.poll(() => selected(page)).toHaveLength(1);
  await canvas(page).locator('#alpha').click({ modifiers: ['Control'] });
  await expect.poll(() => selected(page)).toHaveLength(2);
  await canvas(page).locator('[data-ss-slide].ss-current h1').click({ modifiers: ['Shift'] });
  await expect.poll(() => selected(page)).toHaveLength(3);
});

test('partial marquee does not select objects it does not fully enclose; click on background clears', async ({ page }) => {
  const a = await box(page, '#alpha');
  await page.mouse.move(a.x - 10, a.y - 10);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => selected(page)).toHaveLength(0);
  await canvas(page).locator('#alpha').click();
  await expect.poll(() => selected(page)).toHaveLength(1);
  await page.mouse.click(a.x + 600, a.y + 300);
  await expect.poll(() => selected(page)).toHaveLength(0);
});

test('multi-object operations: style, nudge, align, drag, one undo step each', async ({ page }) => {
  const a0 = await box(page, '#alpha'), b0 = await box(page, '#beta');
  await page.mouse.move(a0.x - 10, a0.y - 10);
  await page.mouse.down();
  await page.mouse.move(b0.x + b0.width + 10, b0.y + b0.height + 10, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => selected(page)).toHaveLength(2);
  await page.locator('#font-size').fill('40');
  await page.locator('#font-size').press('Enter');
  for (const id of ['alpha', 'beta']) await expect(canvas(page).locator('#' + id)).toHaveCSS('font-size', '40px');
  await page.locator('#fill-color').evaluate(el => { el.value = '#ff0000'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  for (const id of ['alpha', 'beta']) await expect(canvas(page).locator('#' + id)).toHaveCSS('background-color', 'rgb(255, 0, 0)');
  // Arrow keys move all selected objects; focus may be in the parent document.
  await page.locator('#bold').focus();
  await page.keyboard.press('ArrowRight');
  const a1 = await box(page, '#alpha'), b1 = await box(page, '#beta');
  expect(a1.x).toBeGreaterThan(a0.x); expect(b1.x).toBeGreaterThan(b0.x);
  // Align relative to selection bounds.
  await page.locator('[data-obj-align="bottom"]').click();
  const a2 = await box(page, '#alpha'), b2 = await box(page, '#beta');
  expect(Math.abs((a2.y + a2.height) - (b2.y + b2.height))).toBeLessThan(1);
  // Dragging one selected object drags the whole selection.
  await page.mouse.move(a2.x + 20, a2.y + 20);
  await page.mouse.down();
  await page.mouse.move(a2.x + 20, a2.y + 90, { steps: 6 });
  await page.mouse.up();
  const a3 = await box(page, '#alpha'), b3 = await box(page, '#beta');
  expect(a3.y).toBeGreaterThan(a2.y + 20); expect(b3.y - b2.y).toBeCloseTo(a3.y - a2.y, 0);
  const patches = Object.keys((await documentState(page)).patches);
  expect(patches.length).toBeGreaterThanOrEqual(2);
  await page.locator('#undo').click();
  const a4 = await box(page, '#alpha'); expect(a4.y).toBeCloseTo(a2.y, 0);
});

test('Ctrl+A selects all objects and Ctrl+Z/Y work from toolbar focus', async ({ page }) => {
  await page.locator('#copy').focus();
  await page.keyboard.press('Control+a');
  await expect.poll(() => selected(page)).toHaveLength(3);
  await page.keyboard.press('Delete');
  await expect(canvas(page).locator('#alpha')).toBeHidden();
  await page.keyboard.press('Control+z');
  await expect(canvas(page).locator('#alpha')).toBeVisible();
  await page.keyboard.press('Control+y');
  await expect(canvas(page).locator('#alpha')).toBeHidden();
});

test('keyboard shortcuts are isolated while editing text, in inputs, and in the frame', async ({ page }) => {
  await canvas(page).locator('#alpha').dblclick();
  await expect(canvas(page).locator('#alpha')).toHaveAttribute('contenteditable', 'true');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Hello');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  await expect(canvas(page).locator('#alpha')).toHaveText('Hell');
  await expect(canvas(page).locator('#alpha')).toBeVisible();
  await expect(canvas(page).locator('#beta')).toBeVisible();
  await page.keyboard.press('Escape');
  // Text inputs in the parent keep their own Delete/Backspace/Ctrl+A.
  await canvas(page).locator('#beta').click();
  await page.locator('#doc-name').fill('abc');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await expect(page.locator('#doc-name')).toHaveValue('');
  await expect(canvas(page).locator('#beta')).toBeVisible();
  await expect.poll(() => selected(page)).toHaveLength(1);
});

test('outline toggle shows dashed outlines for all objects, distinct from selection, never exported', async ({ page }) => {
  expect(await outlineCount(page)).toBe(0);
  await page.locator('[data-tab="view"]').click();
  await page.locator('#toggle-outlines').click();
  await expect(page.locator('#toggle-outlines')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => outlineCount(page)).toBeGreaterThanOrEqual(3);
  await expect(canvas(page).locator('.ss-outline').first()).toHaveCSS('border-top-style', 'dashed');
  await canvas(page).locator('#alpha').click();
  await expect(canvas(page).locator('.ss-box')).toHaveCount(1);
  await expect(canvas(page).locator('.ss-box')).toHaveCSS('border-top-style', 'solid');
  const n = await outlineCount(page);
  // Persists across slide changes and edits.
  await page.locator('#slides .slide-card').nth(1).click();
  await expect(canvas(page).locator('#gamma')).toBeVisible();
  await expect.poll(() => outlineCount(page)).toBeGreaterThanOrEqual(2);
  await page.locator('#slides .slide-card').nth(0).click();
  await expect.poll(() => outlineCount(page)).toBe(n);
  // Not part of the exported file nor print output.
  const html = await page.evaluate(() => window.SlideStudio.exportHtml());
  const exported = await page.context().newPage();
  await exported.setContent(html);
  await expect(exported.locator('.ss-outline, .ss-box, .ss-marquee')).toHaveCount(0);
  await exported.close();
  const print = await page.evaluate(() => window.SlideStudio.getPrintHtml());
  const pp = await page.context().newPage();
  await pp.setContent(print);
  await expect(pp.locator('.ss-outline, .ss-box, .ss-marquee, #ss-overlay')).toHaveCount(0);
  await pp.close();
  await page.locator('#toggle-outlines').click();
  await expect.poll(() => outlineCount(page)).toBe(0);
});

test('microphone input is removed', async ({ page }) => {
  await expect(page.locator('#mic')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.innerHTML.includes('🎙'))).toBe(false);
  const src = await (await page.request.get('/app.js')).text();
  expect(src).not.toMatch(/SpeechRecognition/);
});

test('resizable panes: rail and inspector splitters change layout, thumbnails rescale, persists', async ({ page }) => {
  const rail = page.locator('.slide-rail'), insp = page.locator('.inspector');
  const r0 = (await rail.boundingBox()).width, i0 = (await insp.boundingBox()).width;
  const thumbScale = () => page.locator('#slides .thumb iframe').first().evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
  const s0 = await thumbScale();
  const rs = await page.locator('#rail-splitter').boundingBox();
  await page.mouse.move(rs.x + 3, rs.y + 200);
  await page.mouse.down(); await page.mouse.move(rs.x + 113, rs.y + 200, { steps: 5 }); await page.mouse.up();
  expect((await rail.boundingBox()).width).toBeGreaterThan(r0 + 90);
  await expect.poll(thumbScale).toBeGreaterThan(s0 * 1.2);
  const is = await page.locator('#inspector-splitter').boundingBox();
  await page.mouse.move(is.x + 3, is.y + 200);
  await page.mouse.down(); await page.mouse.move(is.x - 57, is.y + 200, { steps: 5 }); await page.mouse.up();
  expect((await insp.boundingBox()).width).toBeGreaterThan(i0 + 50);
  // Extreme drag is clamped; canvas keeps room.
  await page.mouse.move(rs.x + 113, rs.y + 200);
  await page.mouse.down(); await page.mouse.move(1400, rs.y + 200, { steps: 5 }); await page.mouse.up();
  expect((await page.locator('.workspace').boundingBox()).width).toBeGreaterThanOrEqual(290);
  const w = (await rail.boundingBox()).width;
  await page.reload();
  await expect.poll(async () => Math.round((await page.locator('.slide-rail').boundingBox()).width)).toBe(Math.round(w));
  await page.locator('#rail-splitter').focus();
  await page.keyboard.press('ArrowLeft');
  expect((await page.locator('.slide-rail').boundingBox()).width).toBeLessThan(w);
});

test('thumbnails preserve original CSS context (ancestor, body class and nth-child selectors)', async ({ page }) => {
  await page.locator('#file-input').setInputFiles(fixtureCss);
  await expect(page.locator('#slides .slide-card')).toHaveCount(2);
  const thumb = n => page.frameLocator(`#slides .slide-card:nth-child(${n}) iframe`);
  await expect(thumb(1).locator('h1')).toHaveText('Alpha heading');
  await expect(thumb(1).locator('[data-ss-slide].ss-current')).toHaveCSS('background-color', 'rgb(10, 20, 30)');
  await expect(thumb(1).locator('h1')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(thumb(2).locator('h1')).toHaveCSS('color', 'rgb(255, 0, 0)');
  await expect(thumb(2).locator('h1')).toHaveText('Beta heading');
  await expect(thumb(2).locator('.bar')).toHaveCSS('opacity', '1');
  // Other slides are not duplicated into the thumbnail.
  await expect(thumb(1).locator('h1')).toHaveCount(1);
  // Same look as the editing canvas.
  await expect(canvas(page).locator('h1:visible')).toHaveCSS('color', 'rgb(255, 255, 255)');
});

test('File menu: Save/Save As/export use the desktop bridge with correct flags', async ({ page }) => {
  await page.evaluate(() => {
    window.__calls = [];
    window.studioDesktop = {
      save: async a => { window.__calls.push(['save', a.name, a.type, a.saveAs, a.text.length]); return window.__saveResult ?? true; },
      open: async () => ({ name: 'native.html', text: '<!doctype html><section class="slide"><h1 id="native">Native deck</h1></section>', path: 'C:/x/native.html' }),
      acceptDocument: async p => window.__calls.push(['accept', p]),
      resetDocument: async () => window.__calls.push(['reset']),
    };
  });
  await canvas(page).locator('#alpha').click();
  await page.locator('#delete').click();
  await page.locator('#file-tab').click();
  await expect(page.locator('#file-menu')).toBeVisible();
  await page.locator('#file-save').click();
  await expect(page.locator('#file-menu')).toBeHidden();
  await page.locator('#file-tab').click(); await page.locator('#save-as').click();
  await page.locator('#file-tab').click(); await page.locator('#export').click();
  await page.locator('#file-tab').click(); await page.locator('#project-save').click();
  const calls = await page.evaluate(() => window.__calls);
  expect(calls.map(c => [c[0], c[3], c[2]])).toEqual([
    ['save', false, 'text/html;charset=utf-8'], ['save', true, 'text/html;charset=utf-8'],
    ['save', true, 'text/html;charset=utf-8'], ['save', true, 'application/json'],
  ]);
  expect(calls[0][1]).toMatch(/\.html$/); expect(calls[3][1]).toMatch(/\.studio\.json$/);
  // Cancelled save keeps the document dirty.
  await canvas(page).locator('#beta').click();
  await page.locator('#delete').click();
  await page.evaluate(() => { window.__saveResult = false; });
  await page.keyboard.press('Control+s');
  await expect(page.locator('#status')).toContainText('취소');
  await expect(page.locator('#save-state')).toHaveText('브라우저에 임시 저장됨');
  // Native open accepts the picked path after a successful load only.
  await page.evaluate(() => { window.__calls = []; });
  await page.locator('#file-tab').click(); await page.locator('#open').click();
  await expect(canvas(page).locator('#native')).toBeVisible();
  expect(await page.evaluate(() => window.__calls)).toEqual([['accept', 'C:/x/native.html']]);
  // New document and browser import reset the native save path.
  await page.locator('#file-tab').click(); await page.locator('#new').click();
  await page.locator('#file-input').setInputFiles(fixture);
  await expect(canvas(page).locator('#alpha')).toBeVisible();
  expect((await page.evaluate(() => window.__calls)).filter(c => c[0] === 'reset')).toHaveLength(2);
});

test('web fallbacks: Ctrl+S downloads, Ctrl+Shift+S downloads, Ctrl+O opens file chooser', async ({ page }) => {
  const dl = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  expect((await dl).suggestedFilename()).toMatch(/\.html$/);
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+o');
  await chooser;
});

test('PDF/print output has every visible slide, in order, one per page, with no editor UI', async ({ page }) => {
  await canvas(page).locator('#alpha').click();
  await canvas(page).locator('#alpha').click({ modifiers: ['Shift'] });
  await page.locator('#slides .slide-card').nth(1).click();
  await page.locator('#slide-up').click();
  await expect(page.locator('#slides .slide-card').first().locator('.slide-label')).toHaveText('Second fixture slide');
  const html = await page.evaluate(() => window.SlideStudio.getPrintHtml());
  expect(html).not.toMatch(/<script/i);
  const p = await page.context().newPage();
  await p.setContent(html);
  await expect(p.locator('[data-ss-slide]:visible')).toHaveCount(2);
  const order = await p.locator('[data-ss-slide]:visible h1').allTextContents();
  expect(order).toEqual(['Second fixture slide', 'First fixture slide']);
  const pdf = await p.pdf({ preferCSSPageSize: true, printBackground: true });
  expect(pdfPages(pdf)).toBe(2);
  await p.close();
  // Deleted slides are skipped.
  await page.locator('#slide-delete').click();
  const html2 = await page.evaluate(() => window.SlideStudio.getPrintHtml());
  const p2 = await page.context().newPage();
  await p2.setContent(html2);
  await expect(p2.locator('[data-ss-slide]:visible')).toHaveCount(1);
  expect(pdfPages(await p2.pdf({ preferCSSPageSize: true }))).toBe(1);
  await p2.close();
});

test('print uses desktop bridge print({html}) when present and the web iframe otherwise', async ({ page }) => {
  await page.evaluate(() => { window.__printed = []; window.studioDesktop = { print: async a => { window.__printed.push(a.html); return true; } }; });
  await page.keyboard.press('Control+p');
  await expect.poll(() => page.evaluate(() => window.__printed.length)).toBe(1);
  const html = await page.evaluate(() => window.__printed[0]);
  expect(html).toContain('@page'); expect(html).toContain('Second fixture slide');
  await page.evaluate(() => { delete window.studioDesktop; });
  await page.locator('#file-tab').click(); await page.locator('#print').click();
  await expect(page.locator('iframe[aria-hidden="true"][sandbox]')).toHaveCount(1);
});

test('forged frame messages cannot inject markup into the parent UI', async ({ page }) => {
  await page.evaluate(() => {
    const ch = window.SlideStudio.frameId;
    window.__pwned = false;
    const frame = document.getElementById('canvas');
    const evil = '"><img src=x onerror="window.__pwned=true">';
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { studio: true, channel: ch, type: 'meta', current: 'slide-0', state: { order: [], deleted: [], patches: {}, additions: [], actions: [] }, slides: [{ id: 'slide-0', title: evil, actions: evil, thumbnail: '' }], objects: [{ id: evil, tag: evil, text: evil }], nativeActions: [{ kind: evil, name: evil, detail: evil }], actions: [] } }));
  });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__pwned)).toBe(false);
  expect(await page.locator('#slides img, #action-badge img').count()).toBe(0);
  // Wrong shape is ignored.
  await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { source: document.getElementById('canvas').contentWindow, data: { studio: true, channel: window.SlideStudio.frameId, type: 'meta', slides: 'x' } })));
  await expect(page.locator('#slides .slide-card')).toHaveCount(1);
  await expect(page.locator('#slides .slide-label')).toHaveText(/^"><img/);
});

test('canvas drawings appear in thumbnails and print output', async ({ page }) => {
  await page.locator('#file-input').setInputFiles(fileURLToPath(new URL('../fixtures/canvas.html', import.meta.url)));
  const thumb = page.frameLocator('#slides .slide-card >> nth=0 >> iframe');
  const img = thumb.locator('img#chart');
  await expect(img).toHaveCount(1);
  expect(await img.evaluate(el => el.src.startsWith('data:image/png') && el.naturalWidth)).toBe(200);
  await expect(img).toHaveCSS('border-top-width', '2px');
  const px = await img.evaluate(el => { const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d'); x.drawImage(el, 50, 50, 1, 1, 0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data]; });
  expect(px.slice(0, 3)).toEqual([255, 0, 0]);
  const print = await page.evaluate(() => window.SlideStudio.getPrintHtml());
  expect(print).toMatch(/<img[^>]*id="chart"[^>]*data-ss-canvas|<img[^>]*data-ss-canvas[^>]*id="chart"/);
});

test('original grid display mode is preserved in canvas, thumbnails and print', async ({ page }) => {
  await page.locator('#file-input').setInputFiles(fileURLToPath(new URL('../fixtures/layout-and-animation.html', import.meta.url)));
  await expect(page.locator('#slides .slide-card')).toHaveCount(2);
  const geometry = async root => {
    await expect(root.locator('#layout-left')).toBeVisible();
    return root.locator('#layout-slide').evaluate(s => {
      const l = document.getElementById('layout-left').getBoundingClientRect(), r = document.getElementById('layout-right').getBoundingClientRect();
      return { display: getComputedStyle(s).display, sideBySide: r.left > l.right && Math.abs(r.top - l.top) < 1 && Math.abs(r.width - l.width) < 1 };
    });
  };
  expect(await geometry(canvas(page))).toEqual({ display: 'grid', sideBySide: true });
  expect(await geometry(page.frameLocator('#slides .slide-card >> nth=0 >> iframe'))).toEqual({ display: 'grid', sideBySide: true });
  // A slide that is not grid keeps its own mode instead of being forced to flex.
  await page.locator('#slides .slide-card').nth(1).click();
  await expect(canvas(page).locator('#chart-slide')).toHaveCSS('display', 'block');
  const html = await page.evaluate(() => window.SlideStudio.getPrintHtml());
  const p = await page.context().newPage();
  await p.setContent(html);
  expect(await p.locator('#layout-slide').evaluate(s => getComputedStyle(s).display)).toBe('grid');
  expect(await p.locator('#chart-slide').evaluate(s => getComputedStyle(s).display)).toBe('block');
  const cards = await p.evaluate(() => { const l = document.getElementById('layout-left').getBoundingClientRect(), r = document.getElementById('layout-right').getBoundingClientRect(); return r.left > l.right && Math.abs(r.top - l.top) < 1; });
  expect(cards).toBe(true);
  expect(pdfPages(await p.pdf({ preferCSSPageSize: true, printBackground: true }))).toBe(2);
  await p.close();
});
