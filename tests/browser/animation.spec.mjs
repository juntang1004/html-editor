import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

// [animation-ai] AI animation editing, local interpreter, effects gallery, chaining, reduced motion, export.
const fixture = fileURLToPath(new URL('../fixtures/animated-chart.html', import.meta.url));
const origin = `http://127.0.0.1:${process.env.STUDIO_TEST_PORT || 4417}`;
const canvas = page => page.frameLocator('#canvas');
const state = page => page.evaluate(() => window.SlideStudio.getDocument().state);
const animCount = locator => locator.evaluate(el => el.getAnimations().length);

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
  await page.goto('/');
  await page.locator('#file-input').setInputFiles(fixture);
  await expect(page.locator('#slides .slide-card')).toHaveCount(2);
  await expect(canvas(page).locator('#title')).toBeVisible();
});

async function ask(page, prompt, { localOnly = true } = {}) {
  await page.locator('[data-panel="ai"]').click();
  await page.locator('#ai-mode').selectOption('action');
  await page.locator('#ai-local-only').setChecked(localOnly);
  await page.locator('#ai-prompt').fill(prompt);
  await page.locator('#ai-generate').click();
  await expect(page.locator('#ai-generate')).toBeEnabled();
}

test('native CSS animations are detected from computed styles (rule, inline, cascade override)', async ({ page }) => {
  const native = await page.evaluate(() => window.SlideStudio.getMeta().nativeActions.filter(n => n.kind === 'animation'));
  const grow = native.find(n => n.motionName === 'grow'), appear = native.find(n => n.motionName === 'appear');
  expect(grow.duration).toBe(200);
  expect(appear.duration).toBe(200); // inline style="animation: appear .2s"
  expect(grow.elements.map(e => e.durations[0]).sort()).toEqual(['0.2s', '2s']); // .slow override wins
  await page.locator('[data-panel="actions"]').click();
  await expect(page.locator(`[data-native-duration="${grow.id}"]`)).toHaveValue('0.2');
});

test('local Korean request retimes existing 0.2s animations to 2s without adding actions; undo restores', async ({ page }) => {
  await ask(page, '0.2초 애니메이션을 2초로 바꿔줘');
  await expect(page.locator('#ai-result [data-source="local"]')).toBeVisible();
  await expect(page.locator('#ai-result')).toContainText('0.2초 → 2초');
  expect(Object.keys((await state(page)).patches)).toHaveLength(0);
  await page.locator('#ai-apply').click();
  await expect.poll(async () => Object.values((await state(page)).patches).map(p => p.style['animation-duration']).sort()).toEqual(['2s', '2s', '2s']);
  expect((await state(page)).actions).toHaveLength(0);
  await page.locator('#undo').click();
  await expect.poll(async () => Object.keys((await state(page)).patches)).toHaveLength(0);
});

test('native duration control in action panel edits the original animation', async ({ page }) => {
  await page.locator('[data-panel="actions"]').click();
  const input = page.locator('[data-native-duration="motion:appear"]');
  await input.fill('1.5'); await input.dispatchEvent('change');
  await expect.poll(async () => Object.values((await state(page)).patches)[0]?.style['animation-duration']).toBe('1.5s');
});

test('mock API proposal receives action/native context and updates an existing action in place', async ({ page }) => {
  // Create an existing managed action through the gallery first.
  await canvas(page).locator('#body').click();
  await page.locator('[data-panel="effects"]').click();
  await page.locator('#fx-duration').fill('0.2');
  await page.locator('.fx-card[data-effect="fade-in"] [data-apply]').click();
  await expect.poll(async () => (await state(page)).actions).toHaveLength(1);
  const existing = (await state(page)).actions[0];
  expect(existing.duration).toBe(200);
  let body;
  await page.route('**/api/action', async route => {
    body = route.request().postDataJSON();
    await route.fulfill({ json: { explanation: '본문 효과를 2초로 늘립니다.', operations: [
      { op: 'update', id: existing.id, name: null, trigger: null, triggerId: null, targetId: null, effect: null, duration: 2000, delay: null, value: null, initialHidden: null, afterId: null },
      { op: 'native', id: 'motion:appear', name: null, trigger: null, triggerId: null, targetId: null, effect: null, duration: 2000, delay: null, value: null, initialHidden: null, afterId: null }] } });
  });
  await ask(page, '본문 0.2초 효과를 2초로', { localOnly: false });
  expect(body.actions.map(a => a.id)).toEqual([existing.id]);
  expect(body.native.map(n => n.id).sort()).toEqual(['motion:appear', 'motion:grow']);
  expect(body.native[0].elements).toBeUndefined();
  await expect(page.locator('#ai-result [data-source="api"]')).toBeVisible();
  await page.locator('#ai-apply').click();
  await expect.poll(async () => (await state(page)).actions.map(a => [a.id, a.duration])).toEqual([[existing.id, 2000]]);
});

test('API failure falls back to the local interpreter with a visible note', async ({ page }) => {
  await page.route('**/api/action', route => route.fulfill({ status: 502, json: { code: 'api_unreachable', error: 'AI 서버에 연결하지 못했습니다.' } }));
  await ask(page, '0.2초 애니메이션을 2초로 바꿔줘', { localOnly: false });
  await expect(page.locator('#ai-result [data-source="local"]')).toBeVisible();
  await expect(page.locator('#ai-result')).toContainText('AI 요청이 실패해 기본 해석기로');
});

test('unmappable request gives a specific, helpful Korean error', async ({ page }) => {
  await ask(page, '음… 멋지게 해줘');
  await expect(page.locator('#ai-result')).toContainText('효과 이름·대상·시간');
  await expect(page.locator('#ai-result')).toContainText('예:');
  await expect(page.locator('#ai-buttons')).toBeHidden();
});

test('black fade-in then graph growth: chained by completion, axes and labels stay fixed', async ({ page }) => {
  await ask(page, '검은 화면에서 서서히 밝아진 다음 그래프가 자라나게 해줘');
  await expect(page.locator('#ai-result')).toContainText('끝난 뒤');
  await page.locator('#ai-apply').click();
  await expect.poll(async () => (await state(page)).actions.map(a => a.effect)).toEqual(['black-reveal', 'grow-bars']);
  const [black, grow] = (await state(page)).actions;
  expect(grow).toMatchObject({ trigger: 'after', afterId: black.id });
  const frame = canvas(page), axis = frame.locator('#axis-path'), label = frame.locator('#label-y'), bar = frame.locator('#neg-bar');
  // Frame-local geometry (independent of editor zoom), captured once presentation starts.
  const rect = l => l.evaluate(e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); });
  await page.locator('#present').click();
  await expect(frame.locator('[data-ss-fx-temp="black"]')).toHaveCount(1);
  const axisBox = await rect(axis), labelBox = await rect(label);
  // While black overlay fades, bars wait at zero height (not yet animating).
  expect(await bar.evaluate(e => e.style.scale)).toBe('1 0');
  expect(await animCount(bar)).toBe(0);
  await expect.poll(() => animCount(bar), { timeout: 4000 }).toBeGreaterThan(0);
  await expect(frame.locator('[data-ss-fx-temp="black"]')).toHaveCount(0);
  // Negative bar grows from the baseline downward (origin at its top edge = baseline).
  expect(await bar.evaluate(e => e.style.transformOrigin)).toContain('top');
  expect(await animCount(axis)).toBe(0);
  expect(await animCount(label)).toBe(0);
  expect(await rect(axis)).toEqual(axisBox);
  expect(await rect(label)).toEqual(labelBox);
  await expect.poll(() => animCount(bar), { timeout: 4000 }).toBe(0);
  expect(await rect(axis)).toEqual(axisBox);
  // Replay: leaving and re-entering the slide re-arms the chain.
  await page.locator('#presentation-next').click();
  await page.locator('#presentation-prev').click();
  await expect(frame.locator('[data-ss-fx-temp="black"]')).toHaveCount(1);
  await expect.poll(() => animCount(bar), { timeout: 4000 }).toBeGreaterThan(0);
});

test('click-triggered chain: second effect starts only after the first finishes', async ({ page }) => {
  await page.route('**/api/action', async route => {
    const { scene } = route.request().postDataJSON();
    const title = scene.find(x => x.text === 'GLP-1 효과 요약'), body = scene.find(x => x.text === '체중 변화 비교 그래프');
    const blank = { name: null, trigger: null, triggerId: null, targetId: null, effect: null, duration: null, delay: null, value: null, initialHidden: null, afterId: null };
    await route.fulfill({ json: { explanation: '클릭하면 제목 강조 후 본문 등장', operations: [
      { ...blank, op: 'add', id: 'new1', name: '제목 강조', trigger: 'click', triggerId: '', targetId: title.id, effect: 'pulse', duration: 800, delay: 0, value: '', initialHidden: false, afterId: '' },
      { ...blank, op: 'add', id: 'new2', name: '본문 등장', trigger: 'after', triggerId: '', targetId: body.id, effect: 'fade-in', duration: 600, delay: 0, value: '', initialHidden: true, afterId: 'new1' }] } });
  });
  await ask(page, '클릭하면 제목 강조 후 본문 나타나게', { localOnly: false });
  await page.locator('#ai-apply').click();
  await expect.poll(async () => (await state(page)).actions).toHaveLength(2);
  await page.locator('#present').click();
  const frame = canvas(page), title = frame.locator('#title'), body = frame.locator('#body');
  await expect.poll(() => body.evaluate(e => e.style.opacity)).toBe('0');
  await frame.locator('#chart').click({ position: { x: 500, y: 30 } }); // background area of slide content
  const t0 = Date.now();
  await expect.poll(() => animCount(title)).toBeGreaterThan(0);
  expect(await body.evaluate(e => e.style.opacity)).toBe('0');
  await expect.poll(() => body.evaluate(e => e.style.opacity), { timeout: 4000 }).toBe('1');
  expect(Date.now() - t0).toBeGreaterThanOrEqual(600);
});

test('hover request resolves the hover source to the target object', async ({ page }) => {
  await ask(page, '“GLP-1 효과 요약”에 마우스를 올리면 가볍게 커졌다 복귀하게 해줘');
  await page.locator('#ai-apply').click();
  await expect.poll(async () => (await state(page)).actions).toHaveLength(1);
  const [a] = (await state(page)).actions;
  expect(a).toMatchObject({ trigger: 'hover', effect: 'pulse' });
  expect(a.triggerId).toBe(a.targetId);
  await page.locator('#present').click();
  const title = canvas(page).locator('#title');
  await title.hover();
  await expect.poll(() => animCount(title)).toBeGreaterThan(0);
});

test('effects gallery: search/category filter, card preview, apply to selection, slide preview', async ({ page }) => {
  await page.locator('[data-panel="effects"]').click();
  expect(await page.locator('#fx-list .fx-card').count()).toBeGreaterThanOrEqual(50);
  await page.locator('#fx-search').fill('왼쪽');
  await expect(page.locator('.fx-card[data-effect="slide-in-left"]')).toBeVisible();
  expect(await page.locator('#fx-list .fx-card').count()).toBeLessThan(6);
  await page.locator('#fx-search').fill('');
  await page.locator('[data-category="그래프"]').click();
  await expect(page.locator('.fx-card[data-effect="grow-bars"]')).toBeVisible();
  await expect(page.locator('.fx-card[data-effect="fade-in"]')).toHaveCount(0);
  const card = page.locator('.fx-card[data-effect="grow-bars"]');
  await card.locator('[data-play]').click();
  await expect.poll(() => card.locator('rect').first().evaluate(e => e.getAnimations().length)).toBeGreaterThan(0);
  expect(await card.locator('.axes path').evaluate(e => e.getAnimations().length)).toBe(0);
  // Apply to selected objects (two, sequential)
  await page.locator('[data-category="전체"]').click();
  await canvas(page).locator('#title').click();
  await canvas(page).locator('#body').click({ modifiers: ['Shift'] });
  await page.locator('.fx-card[data-effect="slide-in-left"] [data-apply]').click();
  await expect.poll(async () => (await state(page)).actions.map(a => [a.effect, a.trigger])).toEqual([['slide-in-left', 'enter'], ['slide-in-left', 'after']]);
  // In-place slide preview plays without changing state
  const before = await state(page);
  await page.locator('#fx-play-slide').click();
  await expect.poll(() => animCount(canvas(page).locator('#title'))).toBeGreaterThan(0);
  expect(await state(page)).toEqual(before);
  await page.locator('#undo').click();
  await expect.poll(async () => (await state(page)).actions).toHaveLength(0);
});

test('reduced motion: card and chain use opacity only and the chain still completes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-panel="effects"]').click();
  const card = page.locator('.fx-card[data-effect="slide-in-left"]');
  await card.locator('[data-play]').click();
  const keys = await card.locator('[data-fx-stage] > *').evaluate(e => e.getAnimations().flatMap(a => a.effect.getKeyframes().flatMap(k => Object.keys(k))));
  expect(keys).toContain('opacity');
  expect(keys).not.toContain('translate');
  await ask(page, '검은 화면에서 밝아진 다음 그래프가 자라나게 해줘');
  await page.locator('#ai-apply').click();
  await page.locator('#present').click();
  const bar = canvas(page).locator('#neg-bar');
  await expect.poll(() => bar.evaluate(e => e.style.scale), { timeout: 4000 }).toBe('');
  await expect.poll(() => bar.evaluate(e => getComputedStyle(e).opacity), { timeout: 4000 }).toBe('1');
});

test('standalone export embeds the effects engine and replays the chain without editor globals', async ({ page, browser }) => {
  await ask(page, '검은 화면에서 밝아진 다음 그래프가 자라나게 해줘');
  await page.locator('#ai-apply').click();
  await expect.poll(async () => (await state(page)).actions).toHaveLength(2);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#file-tab').click();
  await page.locator('#export').click();
  const html = await readFile(await (await downloadPromise).path(), 'utf8');
  expect(html).toContain('id="ss-effects"');
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const fresh = await context.newPage();
  await fresh.route('**/*', route => route.request().url() === 'http://export.invalid/' ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
  const errors = []; fresh.on('pageerror', e => errors.push(e.message));
  await fresh.goto('http://export.invalid/');
  expect(await fresh.evaluate(() => typeof window.SlideStudio + typeof window.StudioEffects + typeof window.__ssEffects)).toBe('undefinedundefinedobject');
  await expect(fresh.locator('[data-ss-fx-temp="black"]')).toHaveCount(1);
  const bar = fresh.locator('#neg-bar'), axis = fresh.locator('#axis-path');
  await expect.poll(() => animCount(bar), { timeout: 4000 }).toBeGreaterThan(0);
  expect(await animCount(axis)).toBe(0);
  await fresh.locator('#ss-export-next').click();
  await fresh.locator('#ss-export-prev').click();
  await expect(fresh.locator('[data-ss-fx-temp="black"]')).toHaveCount(1);
  expect(errors).toEqual([]);
  // Reimport preserves the chain
  await page.locator('#file-input').setInputFiles({ name: 'export.html', mimeType: 'text/html', buffer: Buffer.from(html) });
  await expect.poll(async () => (await state(page)).actions.map(a => a.trigger)).toEqual(['enter', 'after']);
  await context.close();
});
