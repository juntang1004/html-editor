import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/effects.js';
import '../public/animation.js';

// [animation-ai] contract tests: registry, validation, pure apply, local Korean interpreter, gallery recipes.
const A = globalThis.StudioAnimation, FX = A.Effects;
const blank = { name: null, trigger: null, triggerId: null, targetId: null, effect: null, duration: null, delay: null, value: null, initialHidden: null, afterId: null };
const ctx = (extra = {}) => ({
  currentSlide: 'slide-0', selectedIds: [],
  scene: [{ id: 'slide-0', tag: 'slide', text: '요약' }, { id: 't', tag: 'h1', text: 'GLP-1 효과 요약' }, { id: 'b', tag: 'p', text: '체중 변화' }, { id: 'g', tag: 'svg', text: '10 0 -5' }],
  actions: [], native: [], ...extra });
const nativeGrow = { id: 'motion:grow', name: '막대 그래프 늘어나기', motionName: 'grow', duration: 200, delay: 0, targets: ['bar'], elements: [{ id: 'bar', names: ['grow'], durations: ['0.2s'], delays: ['0s'] }] };
const fade = { id: 'a1', slideId: 'slide-0', name: '본문 나타나기', trigger: 'enter', triggerId: '', targetId: 'b', effect: 'fade-in', duration: 200, delay: 0, value: '', initialHidden: true, afterId: '' };

test('registry: unique ids, Korean names, categories, ≥50 offline effects, serializable factory', () => {
  const ids = FX.list.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 50, `only ${ids.length} effects`);
  for (const e of FX.list) { assert.ok(/[가-힣]/.test(e.name), e.id); assert.ok(FX.categories.includes(e.category), e.id); assert.ok(e.duration > 0); }
  for (const id of ['fade-in', 'black-reveal', 'grow-bars', 'draw-line', 'count-up', 'typewriter', 'stagger-items', 'recipe-black-graph']) assert.ok(FX.get(id), id);
  // The factory is injected into exported HTML via toString(): it must be self-contained.
  const rebuilt = new Function('return (' + globalThis.StudioEffects.toString() + ')()')();
  assert.equal(rebuilt.list.length, FX.list.length);
});

test('schema is strict-compatible: every property required, no extra properties', () => {
  const item = A.schema.properties.operations.items;
  assert.equal(item.additionalProperties, false);
  assert.deepEqual([...item.required].sort(), Object.keys(item.properties).sort());
  assert.ok(item.properties.effect.enum.includes('black-reveal') && item.properties.effect.enum.includes(null));
});

test('update op retimes an existing action 200→2000ms without duplicating; input state unchanged', () => {
  const c = ctx({ actions: [fade] }), st = { actions: [fade], patches: {} }, before = structuredClone(st);
  const v = A.validate({ explanation: 'x', operations: [{ ...blank, op: 'update', id: 'a1', duration: 2000 }] }, c);
  const r = A.apply(st, v.operations, c);
  assert.deepEqual(r.state.actions, [{ ...fade, duration: 2000 }]);
  assert.deepEqual(st, before);
});

test('validation gives specific Korean errors: unknown action, bad target, ranges, missing hover source, cycles', () => {
  const c = ctx({ actions: [fade] });
  const bad = (op, re) => assert.throws(() => A.validate({ explanation: '', operations: [{ ...blank, ...op }] }, c), err => err instanceof A.ProposalError && re.test(err.message));
  bad({ op: 'update', id: 'missing', duration: 1 }, /기존 액션/);
  bad({ op: 'native', id: 'motion:none', duration: 1 }, /원본 애니메이션/);
  bad({ op: 'add', id: 'n1', name: 'x', trigger: 'enter', triggerId: '', targetId: 'nope', effect: 'fade-in', duration: 1, delay: 0, value: '', initialHidden: true, afterId: '' }, /대상 개체/);
  bad({ op: 'update', id: 'a1', duration: 10001 }, /0~10초/);
  bad({ op: 'add', id: 'n1', name: 'x', trigger: 'hover', triggerId: '', targetId: 't', effect: 'pulse', duration: 1, delay: 0, value: '', initialHidden: false, afterId: '' }, /마우스/);
  bad({ op: 'add', id: 'n1', name: 'x', trigger: 'enter', triggerId: '', targetId: 't', effect: 'eval', duration: 1, delay: 0, value: '', initialHidden: false, afterId: '' }, /지원하지 않는 효과/);
  const loop = { ...fade, id: 'a2', trigger: 'after', afterId: 'a1' };
  assert.throws(() => A.validate({ explanation: '', operations: [{ ...blank, op: 'update', id: 'a1', trigger: 'after', afterId: 'a2' }] }, ctx({ actions: [fade, loop] })), /순환/);
});

test('add ops chain via refs; apply maps refs to new ids', () => {
  const c = ctx();
  const ops = [{ ...blank, op: 'add', id: 'r1', name: '검은 화면', trigger: 'enter', triggerId: '', targetId: 'slide-0', effect: 'black-reveal', duration: 1000, delay: 0, value: '', initialHidden: true, afterId: '' },
    { ...blank, op: 'add', id: 'r2', name: '막대', trigger: 'after', triggerId: '', targetId: 'g', effect: 'grow-bars', duration: 1200, delay: 0, value: '', initialHidden: true, afterId: 'r1' }];
  const r = A.apply({ actions: [], patches: {} }, A.validate({ explanation: '', operations: ops }, c).operations, c);
  const [a, b] = r.state.actions;
  assert.equal(b.afterId, a.id); assert.notEqual(a.id, 'r1'); assert.equal(a.slideId, 'slide-0');
});

test('legacy {actions} responses still validate (backward-compatible contract)', () => {
  const legacy = { explanation: 'x', actions: [{ name: 'n', trigger: 'enter', triggerId: '', targetId: 't', effect: 'fade', duration: 2000, delay: 0, value: '', initialHidden: true }] };
  assert.equal(A.validate(legacy, ctx()).operations[0].op, 'add');
  assert.throws(() => A.validate({ explanation: 'x', actions: Array(9).fill(legacy.actions[0]) }, ctx()));
});

test('native batch edits compose on the accumulated patch (multi-name elements)', () => {
  const el = { id: 'e', names: ['a', 'b'], durations: ['0.2s', '0.3s'], delays: ['0s', '0s'] };
  const native = [{ id: 'motion:a', name: 'A', motionName: 'a', duration: 200, delay: 0, targets: ['e'], elements: [el] }, { id: 'motion:b', name: 'B', motionName: 'b', duration: 300, delay: 0, targets: ['e'], elements: [el] }];
  const c = ctx({ native });
  const r = A.apply({ actions: [], patches: { e: { x: 5, style: { color: '#000' } } } }, [{ ...blank, op: 'native', id: 'motion:a', duration: 2000 }, { ...blank, op: 'native', id: 'motion:b', duration: 2000 }], c);
  assert.equal(r.state.patches.e.style['animation-duration'], '2s, 2s');
  assert.equal(r.state.patches.e.style.color, '#000'); assert.equal(r.state.patches.e.x, 5);
  const d = A.apply({ actions: [], patches: {} }, [{ ...blank, op: 'delete', id: 'motion:a' }, { ...blank, op: 'delete', id: 'motion:b' }], c);
  assert.equal(d.state.patches.e.style['animation-name'], 'none, none');
});

test('local interpreter: "0.2초를 2초로" targets existing native and managed actions by duration', () => {
  const c = ctx({ native: [nativeGrow], actions: [fade, { ...fade, id: 'a9', duration: 700, name: '다른 효과' }] });
  for (const prompt of ['0.2초 애니메이션을 2초로 바꿔줘', '0.2s를 2s로 변경', '200ms 애니메이션을 2초로 늘려줘']) {
    const r = A.validate(A.interpret(prompt, c), c);
    assert.deepEqual(r.operations.map(o => [o.op, o.id, o.duration]).sort(), [['native', 'motion:grow', 2000], ['update', 'a1', 2000]].sort(), prompt);
  }
  assert.throws(() => A.interpret('0.5초를 2초로 바꿔줘', c), /찾지 못했습니다.*현재 길이/);
  // Name-based when only target duration given
  const named = A.interpret('막대 애니메이션을 2초로 바꿔줘', c);
  assert.deepEqual(named.operations.map(o => o.id), ['motion:grow']);
  // Ambiguous: asks for clarification with current names/durations
  assert.throws(() => A.interpret('애니메이션을 3초로 바꿔줘', ctx({ actions: [fade, { ...fade, id: 'a9', duration: 700, name: '다른 효과' }] })), /어느 것을/);
});

test('local interpreter: black fade-in then graph growth is a completion chain on slide + chart', () => {
  const c = ctx();
  for (const prompt of ['검은 화면에서 서서히 밝아진 다음 그래프가 자라나게 해줘', '검정 화면이 밝아지고 나서 막대가 성장하게', '암전에서 밝아진 후에 그래프 막대가 늘어나게']) {
    const r = A.validate(A.interpret(prompt, c), c);
    assert.deepEqual(r.operations.map(o => [o.effect, o.targetId, o.trigger]), [['black-reveal', 'slide-0', 'enter'], ['grow-bars', 'g', 'after']], prompt);
    assert.equal(r.operations[1].afterId, r.operations[0].id);
  }
  // delay vs sequence: "1초 후에" is a delay, not a split
  const d = A.interpret('제목을 1초 후에 왼쪽에서 들어오게 해줘', c);
  assert.deepEqual(d.operations.map(o => [o.effect, o.targetId, o.delay]), [['slide-in-left', 't', 1000]]);
});

test('local interpreter: hover source resolved, delete, and helpful error for unknown requests', () => {
  const h = A.interpret('“GLP-1 효과 요약”에 마우스를 올리면 가볍게 커졌다 복귀', ctx());
  assert.equal(h.operations[0].trigger, 'hover'); assert.equal(h.operations[0].triggerId, 't');
  const del = A.interpret('막대 애니메이션 삭제해줘', ctx({ native: [nativeGrow], actions: [fade] }));
  assert.deepEqual(del.operations.map(o => [o.op, o.id]), [['delete', 'motion:grow']]);
  assert.throws(() => A.interpret('멋지게', ctx()), err => err instanceof A.ProposalError && err.hint.includes('예:'));
});

test('gallery operations: selection required, sequential chain, hover source, recipes', () => {
  assert.throws(() => A.galleryOperations('fade-in', ctx()), /선택/);
  const seq = A.galleryOperations('rise-in', ctx({ selectedIds: ['t', 'b'] }), { trigger: 'enter' });
  assert.deepEqual(seq.operations.map(o => [o.trigger, o.afterId]), [['enter', ''], ['after', 'new1']]);
  assert.equal(A.galleryOperations('pulse', ctx({ selectedIds: ['t'] }), { trigger: 'hover' }).operations[0].triggerId, 't');
  assert.equal(A.galleryOperations('black-reveal', ctx()).operations[0].targetId, 'slide-0');
  const rec = A.galleryOperations('recipe-title-body-graph', ctx());
  assert.deepEqual(rec.operations.map(o => o.effect), ['rise-in', 'fade-in', 'grow-bars']);
  assert.doesNotThrow(() => A.validate(rec, ctx()));
});
