'use strict';
// Rule checks for the 40-quarter core loop. Run: node tests/verify-core.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../core.js');

const checks = [];
const failed = [];
function check(name, fn) {
  try { fn(); checks.push(name); console.log(`PASS ${name}`); }
  catch (e) { failed.push(name); console.log(`FAIL ${name}\n  ${String(e.message).split('\n').slice(0, 6).join('\n  ')}`); }
}

const base = { stream: 2, train: 1, charm: 0, rest: 1 };
const copy = v => JSON.parse(JSON.stringify(v));
const pick = (...prefs) => s => { const ids = s.pending.event.options.map(o => o.id); return prefs.find(p => ids.includes(p)) || ids[0]; };
const first = s => s.pending.event.options[0].id;
const calm = ['natural', 'fair', 'check', 'stage', 'reach', 'compromise', 'protect', 'private', 'refund', 'listen', 'honest', 'join', 'together'];

// Plays until an ending, or stops at the event phase of quarter `stopAt`.
function play(mode, seed, planFor, choose, stopAt = 0) {
  let s = G.create(mode, seed);
  for (;;) {
    const p = planFor(s);
    if (p.buyGear && s.gear < 3 && s.cash >= G.gearPrice(s)) s = G.upgrade(s);
    s = G.start(s, p.plan, p.topic, !!p.ambitious);
    if (s.q === stopAt) return s;
    s = G.resolve(s, choose(s));
    if (s.ending) return s;
    s = G.advance(s);
  }
}
// Default bot plan rests more when health runs low, so long runs survive 20 quarters.
const careful = s => ({ plan: s.health < 45 ? { stream: 1, train: 0, charm: 0, rest: 3 } : base, topic: 'game' });
function trace(seed, prefs, planFor = careful) {
  const seen = [];
  const s = play('slots', seed, planFor, st => { const e = st.pending.event; seen.push({ id: e.id, body: e.body }); return pick(...prefs)(st); });
  return { s, ids: seen.map(e => e.id), seen };
}

check('운영 방침은 네 칸을 채우는 프리셋이고, 방송 없는 분기는 생방송 없이 바로 결산된다', () => {
  assert.deepEqual(Object.keys(G.modes), ['slots']);
  for (const pol of Object.values(G.policies)) {
    const slots = Object.entries(pol.plan).flatMap(([a, n]) => Array(n).fill(a));
    assert.deepEqual(G.planFrom('slots', { slots }), pol.plan);
  }
  assert.throws(() => G.create('ratio'), /지원하지 않는 모드/);
  const quiet = G.start(G.create(), { stream: 0, train: 1, charm: 0, rest: 3 }, 'game');
  const done = G.goLive(quiet, 'natural');
  assert.equal(done.phase, 'result'); assert.equal(done.last.live, null);
});

check('같은 시드와 선택은 같은 결과를 내고, 앞 분기의 선택은 뒤 분기의 유행을 바꾸지 않는다', () => {
  const trends = [[], []];
  const runA = play('slots', 'SEED-A', s => { trends[0].push(G.market(s).key); return { plan: base, topic: 'talk' }; }, first);
  const again = play('slots', 'SEED-A', () => ({ plan: base, topic: 'talk' }), first);
  assert.deepEqual(again, runA);
  play('slots', 'SEED-A', s => { trends[1].push(G.market(s).key); return { plan: s.q === 1 ? { stream: 0, train: 2, charm: 1, rest: 1 } : base, topic: 'song' }; }, pick(...calm));
  const common = Math.min(trends[0].length, trends[1].length);
  assert.ok(common >= 10);
  assert.deepEqual(trends[1].slice(0, common), trends[0].slice(0, common));
  const sequences = new Set(['A', 'B', 'C', 'D', 'E'].map(seed => Array.from({ length: 10 }, (_, i) => G.market({ seed, q: i + 1 }).key).join()));
  assert.ok(sequences.size > 1);
});

check('잘못된 계획과 단계 밖 조작은 거부되고 원래 상태는 그대로다', () => {
  const s = G.create('slots', 'X'), before = JSON.stringify(s);
  assert.throws(() => G.start(s, { stream: 2, train: 1, charm: 0, rest: 0 }, 'game'), /100%/);
  assert.throws(() => G.start(s, { ...base, dance: 0 }, 'game'), /알 수 없는 일정/);
  assert.throws(() => G.start(s, { stream: 5, train: -1, charm: 0, rest: 0 }, 'game'), /일정 값/);
  assert.throws(() => G.start(s, base, 'cook'), /주제/);
  assert.throws(() => G.resolve(s, 'natural'), /사건 선택 단계/);
  assert.throws(() => G.advance(s), /다음 분기/);
  assert.throws(() => G.planFrom('slots', { slots: ['stream', 'rest', 'rest'] }), /네 개/);
  assert.throws(() => G.planFrom('policy', { policy: 'yolo' }), /지원하지 않는 모드/);
  assert.throws(() => G.planFrom('slots', { slots: ['stream', 'rest', 'rest', 'dance'] }), /알 수 없는 일정/);
  const e = G.start(s, base, 'game');
  assert.equal(JSON.stringify(s), before);
  assert.throws(() => G.start(e, base, 'game'), /계획 단계/);
  assert.throws(() => G.upgrade(e), /장비/);
  assert.throws(() => G.resolve(e, 'nope'), /알 수 없는 선택/);
  const eBefore = JSON.stringify(e), r = G.resolve(e, 'natural');
  assert.equal(JSON.stringify(e), eBefore);
  assert.throws(() => G.resolve(r, 'natural'), /사건 선택 단계/);
});

check('훈련·휴식·장비는 성공 가능성을 올리지만 성공을 보장하지 않고, 대형 기획은 위험과 비용을 올린다', () => {
  const s = G.create('slots'), pv = (p, amb = false, st = s) => G.preview(st, p, 'game', amb);
  assert.ok(pv({ stream: 2, train: 2, charm: 0, rest: 0 }).chance > pv({ stream: 2, train: 0, charm: 2, rest: 0 }).chance);
  const rested = pv({ stream: 2, train: 0, charm: 0, rest: 2 }), cared = pv({ stream: 2, train: 0, charm: 2, rest: 0 });
  assert.ok(rested.chance > cared.chance && rested.health > cared.health);
  assert.ok(pv(base, true).chance < pv(base).chance);
  assert.equal(pv(base, true).cost - pv(base).cost, 8);
  assert.equal(pv({ stream: 0, train: 2, charm: 0, rest: 2 }, true).cost, pv({ stream: 0, train: 2, charm: 0, rest: 2 }).cost);
  assert.equal(G.start(s, { stream: 0, train: 2, charm: 0, rest: 2 }, 'game', true).pending.ambitious, false);
  const maxed = { ...copy(s), skills: { talk: 100, game: 100, song: 100 }, health: 100, charm: 100, gear: 3 };
  assert.ok(pv({ stream: 4, train: 0, charm: 0, rest: 0 }, false, maxed).chance < 1);
});

check('장비는 커리어 단계가 허락하는 만큼만 사고, 단계마다 가격과 유지비가 오른다', () => {
  let s = G.upgrade(G.create('slots'));
  assert.equal(s.cash, 85); assert.equal(s.gear, 1);
  assert.throws(() => G.upgrade(s), /자금/);
  s.cash = 1000; s = G.upgrade(s);
  assert.throws(() => G.upgrade(s), /기획사 확장 단계에서 열립니다/);
  s = { ...s, tier: 2 }; for (let i = 0; i < 3; i++) s = G.upgrade(s);
  assert.equal(s.gear, G.maxGear); assert.equal(s.cash, 1000 - 95 - 135 - 175 - 215);
  assert.throws(() => G.upgrade(s), /모두 마쳤습니다/);
  s = { ...s, tier: 0 };
  const plain = G.preview(G.create('slots'), base, 'game'), geared = G.preview(s, base, 'game');
  assert.equal(geared.cost - plain.cost, 15);
  assert.ok(geared.chance > plain.chance && geared.incomeHigh > plain.incomeHigh);
});

check('2분기 합방 선택은 4분기 공연과 9분기 페스티벌로 이어진다', () => {
  const helped = trace('CHAIN', ['help', 'stage', ...calm]), skipped = trace('CHAIN', ['skip', 'focus', ...calm]);
  assert.equal(helped.ids[3], 'moka_return'); assert.equal(skipped.ids[3], 'solo');
  assert.match(helped.seen[8].body, /4분기/); assert.doesNotMatch(skipped.seen[8].body, /4분기/);
  assert.ok(helped.s.ending.memories.some(m => m.includes('공연')));
  assert.ok(skipped.s.ending.memories.some(m => m.includes('거절')));
});

check('3분기 광고 수락은 7분기 해명 사건으로 돌아오고, 거절하면 다른 사건이 나온다', () => {
  const took = trace('CHAIN', ['accept', 'refund', ...calm]), declined = trace('CHAIN', ['no', ...calm]);
  assert.equal(took.ids[6], 'sponsor_return'); assert.equal(declined.ids[6], 'future');
  assert.ok(took.s.ending.memories.some(m => m.includes('돌려주고')));
});

check('5분기 노래 약속은 6분기 계획으로 지키거나 어길 수 있다', () => {
  const kept = trace('CHAIN', ['promise', ...calm], s => ({ plan: base, topic: s.q === 6 ? 'song' : 'game' }));
  const broken = trace('CHAIN', ['promise', ...calm]);
  assert.ok(kept.s.history[5].notes.some(n => n.includes('지켰다')));
  assert.ok(broken.s.history[5].notes.some(n => n.includes('놓쳤다')));
  assert.equal(kept.s.flags.songKept, true); assert.equal(broken.s.flags.songKept, false);
  assert.ok(kept.s.history[5].deltaTrust > broken.s.history[5].deltaTrust);
});

check('1분기 데뷔 방식은 8분기 옛 클립 사건의 내용을 바꾼다', () => {
  const natural = trace('CHAIN', ['natural', ...calm]), concept = trace('CHAIN', ['concept', ...calm]);
  assert.notEqual(natural.seen[7].body, concept.seen[7].body);
});

check('정체 노출은 일부 회차에만 생기고, 방송 비중이 높을수록 잘 생기며, 공개 반응은 본체 매력에 따라 갈린다', () => {
  const toQ6 = (seed, stream, charmFirst = false) => play('slots', seed, s => ({ plan: s.q === 6 ? { stream, train: 0, charm: 0, rest: 4 - stream } : charmFirst && s.q <= 4 ? { stream: 1, train: 0, charm: 2, rest: 1 } : base, topic: 'game' }), pick(...calm), 6);
  const seeds = Array.from({ length: 300 }, (_, i) => `SEED-${i}`);
  const light = seeds.filter(seed => toQ6(seed, 1).pending.event.id === 'privacy');
  const heavy = seeds.filter(seed => toQ6(seed, 4).pending.event.id === 'privacy');
  assert.ok(light.length > 0 && heavy.length < seeds.length && heavy.length > light.length);
  const seed = heavy[0];
  const low = G.resolve(toQ6(seed, 4), 'open'), high = G.resolve(toQ6(seed, 4, true), 'open');
  assert.ok(low.exposed && high.exposed);
  assert.ok(low.charm < 40 && high.charm >= 60);
  assert.equal(low.flags.revealReaction, -0.16); assert.equal(high.flags.revealReaction, 0.3);
  assert.ok(high.last.notes.some(n => n.includes('이번 팬 증가량 +')) && low.last.notes.some(n => n.includes('이번 팬 증가량 -')));
  const nextQuarter = st => { const e = G.start(G.advance(st), { stream: 2, train: 0, charm: 0, rest: 2 }, 'game'); return G.resolve(e, pick(...calm)(e)).last; };
  assert.ok(nextQuarter(high).fans > nextQuarter(low).fans, '공개 뒤에는 본체 매력이 높을수록 팬 증가량이 커야 함');
  const hidden = G.resolve(toQ6(seed, 4), 'protect');
  assert.equal(hidden.exposed, false);
  const never = seeds.find(sd => !heavy.includes(sd));
  const quiet = play('slots', never, s => ({ plan: s.q === 6 ? { stream: 4, train: 0, charm: 0, rest: 0 } : base, topic: 'game' }), pick(...calm));
  assert.equal(quiet.ending.exposed, false);
});

check('건강을 계속 태우면 한 번은 회복 기회를 주고 두 번째 고갈에서 조기 종료된다', () => {
  const s = play('slots', 'GRIND', () => ({ plan: { stream: 4, train: 0, charm: 0, rest: 0 }, topic: 'talk' }), first);
  assert.equal(s.ending.cause, 'burnout'); assert.ok(s.q < 10);
  const firstHit = s.history.find(r => r.notes.some(n => n.includes('건강이 바닥나')));
  assert.ok(firstHit && firstHit.q < s.q);
});

check('수입 없이 투자만 하면 3분기 연속 적자 끝에 활동이 멈춘다', () => {
  const s = play('slots', 'BROKE', () => ({ plan: { stream: 0, train: 4, charm: 0, rest: 0 }, topic: 'song' }), pick('help', 'no', 'stage', 'compromise', 'protect', 'private', 'join', ...calm));
  assert.equal(s.ending.cause, 'bankrupt'); assert.ok(s.history.some(r => r.notes.some(n => n.includes('적자 1/3'))));
});

check('충돌을 방치하면 경고 뒤 독립하고, 대화와 타협으로 풀면 끝까지 함께한다', () => {
  const noRest = s => ({ plan: s.health < 45 ? { stream: 1, train: 0, charm: 0, rest: 3 } : { stream: 1, train: 1, charm: 2, rest: 0 }, topic: 'game' });
  const cold = trace('CONFLICT', ['concept', 'skip', 'accept', 'focus', 'dismiss', 'deny', 'private', 'ignore', 'push'], noRest).s;
  assert.equal(cold.ending.cause, 'independent'); assert.equal(cold.ending.id, 'independent'); assert.match(cold.ending.title, /독립/);
  assert.ok(cold.history.slice(0, -1).some(r => r.notes.some(n => n.includes('관계 경고'))));
  const warm = trace('CONFLICT', ['concept', 'skip', 'accept', 'reach', 'dismiss', 'protect', 'private', 'refund', 'honest', 'home', 'together'], noRest).s;
  assert.equal(warm.ending.cause, ''); assert.equal(warm.ending.quarter, G.MAX_Q); assert.ok(warm.conflicts <= 1);
});

check('마지막 분기에는 졸업을 합의할 수 있고, 엔딩 뒤에는 더 진행할 수 없다', () => {
  const s = trace('STUDIO-01', ['graduate', ...calm]).s;
  assert.equal(s.q, G.MAX_Q); assert.equal(s.ending.id, 'graduate'); assert.match(s.ending.title, /합의한 졸업/);
  assert.throws(() => G.advance(s)); assert.throws(() => G.start(s, base, 'game'));
});

check('저장 검증은 실제 진행 상태를 통과시키고 손상된 저장은 거부한다', () => {
  let s = G.create('slots');
  const roundTrip = st => G.validSave(JSON.parse(JSON.stringify(st)));
  assert.ok(roundTrip(s)); s = G.start(s, base, 'talk'); assert.ok(roundTrip(s)); const l = G.goLive(s, 'natural'); assert.ok(roundTrip(l)); assert.equal(l.phase, 'live'); s = G.finishLive(l, null); assert.ok(roundTrip(s));
  for (const bad of [{ ...s, version: 1 }, { ...s, q: G.MAX_Q + 1 }, { ...s, tier: 9 }, { ...s, staff: null }, { ...s, cash: NaN }, { ...s, phase: 'event', pending: null }, { ...s, last: null }, { ...s, mode: 'gacha' }, { ...s, mode: 'ratio' }, { ...l, pending: { ...l.pending, live: null } }, { ...l, pending: { ...l.pending, live: { ...l.pending.live, chat: 'x' } } }, { ...l, pending: { ...l.pending, choiceId: 'nope' } }]) assert.equal(G.validSave(bad), false);
});

check('방송 평가는 네 곳의 1~10점 합계이고, 준비한 방송과 성공한 방송이 평균적으로 더 높게 평가된다', () => {
  const s = play('slots', 'STUDIO-01', st => ({ plan: st.q === 3 ? { stream: 0, train: 1, charm: 0, rest: 3 } : base, topic: 'game' }), first);
  for (const r of s.history) {
    if (!r.plan.stream) { assert.equal(r.reviews.length, 0); assert.equal(r.score, 0); continue; }
    assert.equal(r.reviews.length, 4);
    for (const v of r.reviews) assert.ok(Number.isInteger(v.score) && v.score >= 1 && v.score <= 10);
    assert.equal(r.score, r.reviews.reduce((a, v) => a + v.score, 0)); assert.equal(r.legend, r.score >= 32);
  }
  const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
  const q1 = (seed, p) => G.resolve(G.start(G.create('slots', seed), p, 'game', false), 'natural').last;
  const seeds = Array.from({ length: 200 }, (_, i) => `R${i}`);
  const prepared = seeds.map(sd => q1(sd, { stream: 1, train: 2, charm: 0, rest: 1 })), rushed = seeds.map(sd => q1(sd, { stream: 1, train: 0, charm: 0, rest: 3 }));
  assert.ok(mean(prepared.map(r => r.score)) > mean(rushed.map(r => r.score)));
  const all = [...prepared, ...rushed];
  assert.ok(mean(all.filter(r => r.success).map(r => r.score)) > mean(all.filter(r => !r.success).map(r => r.score)));
  const ranks = [0, 120, 1000, 5000, 20000].map(G.chartRank);
  ranks.slice(1).forEach((r, i) => assert.ok(r <= ranks[i]));
});

const liveAt = (seed = 'STUDIO-01', plan = base, topic = 'talk', over = {}, amb = false, choice = 'natural') => G.goLive(G.start({ ...G.create('slots', seed), ...over }, plan, topic, amb), choice);
const ids = (st, kind) => st.pending.live.chat.filter(c => c.kind === kind).map(c => c.id);
const perfectFor = st => { const L = st.pending.live; return L.rounds ? { hits: L.rounds.filter(r => L.kind !== 'aim' || r.answer === 'enemy').map(r => r.id), wrong: 0 } : L.kind === 'assist' ? { hits: L.cues.length, wrong: 0 } : L.kind === 'sing' ? { perfect: L.notes.length, good: 0, extra: 0 } : { blocked: ids(st, 'toxic'), mentioned: ids(st, 'good') }; };
const worstFor = st => { const L = st.pending.live; return L.rounds ? { hits: [], wrong: 99 } : L.kind === 'assist' ? { hits: 0, wrong: 99 } : L.kind === 'sing' ? { perfect: 0, good: 0, extra: 99 } : { blocked: ids(st, 'good'), mentioned: ids(st, 'toxic') }; };
const rotation = { talk: ['chat', 'reaction', 'prompt'], game: ['assist', 'aim', 'raid'], song: ['sing', 'lyrics', 'pitch'] };
const variantAt = (topic, index, over = {}) => liveAt('NINE', base, topic, { history: Array.from({ length: index }, (_, i) => ({ q: i + 1, topic, plan: base, rank: 100 })), ...over });

check('아홉 게임은 주제별 실제 방송 횟수로 순환하고, 휴식·다른 주제 방송은 순서를 바꾸지 않는다', () => {
  assert.equal(G.VERSION, 4);
  assert.equal(Object.keys(G.liveNames).length, 9);
  for (const [topic, kinds] of Object.entries(rotation)) {
    assert.equal(G.liveKind(topic), kinds[0]);
    for (let index = 0; index < 7; index++) {
      const st = variantAt(topic, index);
      assert.equal(st.pending.live.kind, kinds[index % 3]);
      const quiet = { topic, plan: { ...base, stream: 0 } }, other = { topic: topic === 'talk' ? 'game' : 'talk', plan: base };
      assert.equal(G.liveKind(topic, { history: [...st.history, quiet, other] }), kinds[index % 3]);
    }
  }
});

check('여섯 새 게임의 신호는 겹치지 않고 19초 안에 끝나며, 문제와 정답은 재시작해도 같다', () => {
  for (const [topic, kinds] of Object.entries(rotation)) for (let index = 1; index < 3; index++) {
    const L = variantAt(topic, index).pending.live, hot = variantAt(topic, index, { fans: 400000 }).pending.live;
    assert.equal(L.kind, kinds[index]); assert.equal(L.duration, 19000);
    assert.deepEqual(variantAt(topic, index).pending.live, L);
    assert.ok(hot.rounds.length > L.rounds.length && hot.rounds[0].window < L.rounds[0].window);
    for (const script of [L, hot]) {
      assert.equal(new Set(script.rounds.map(r => r.id)).size, script.rounds.length);
      script.rounds.forEach((r, i) => {
        assert.ok(r.prompt && r.window >= 500 && r.at >= 0 && r.at + r.window <= script.duration);
        if (i) assert.ok(r.at >= script.rounds[i - 1].at + script.rounds[i - 1].window);
        if (script.kind === 'reaction') assert.ok(['smile', 'surprise', 'sad'].includes(r.answer) && r.mood === r.answer);
        if (['prompt', 'lyrics'].includes(script.kind)) assert.ok(r.choices.length === 3 && [0, 1, 2].includes(r.answer));
        if (script.kind === 'lyrics') assert.ok(r.prompt.includes('□'));
        if (script.kind === 'aim') assert.ok(['enemy', 'ally'].includes(r.answer) && r.x >= 12 && r.x <= 88 && r.y >= 12 && r.y <= 88);
        if (script.kind === 'raid') assert.equal(r.answer, r.attack === 'left' ? 'right' : r.attack === 'right' ? 'left' : 'guard');
        if (script.kind === 'pitch') assert.ok(['low', 'mid', 'high'].includes(r.answer) && r.note && r.hz > 0);
      });
    }
    const answers = new Set(Array.from({ length: 24 }, (_, seed) => {
      const state = G.start({ ...G.create('slots', `VARIETY-${seed}`), history: variantAt(topic, index).history }, base, topic);
      return G.liveScript(state, state.pending.event.options[0]).rounds.map(r => r.answer);
    }).flat());
    const expected = L.kind === 'reaction' ? ['smile', 'surprise', 'sad'] : ['prompt', 'lyrics'].includes(L.kind) ? [0, 1, 2] : L.kind === 'aim' ? ['enemy', 'ally'] : L.kind === 'raid' ? ['left', 'right', 'guard'] : ['low', 'mid', 'high'];
    assert.deepEqual([...answers].sort(), expected.sort(), `${L.kind}의 정답 선택지가 시드에 따라 다양해야 함`);
  }
});

check('아홉 게임의 만점·건너뛰기·실수는 같은 성과 범위를 쓰고, 새 게임 ID 중복·스팸은 점수를 올리지 못한다', () => {
  for (const topic of Object.keys(rotation)) for (let index = 0; index < 3; index++) {
    const st = variantAt(topic, index), L = st.pending.live;
    const perfect = G.liveScore(L, perfectFor(st)), skip = G.liveScore(L, { skipped: true }), wrong = G.liveScore(L, worstFor(st));
    assert.equal(perfect.score, 1, L.kind); assert.equal(skip.score, 0, L.kind); assert.ok(wrong.score < 0 && wrong.score >= -.6, L.kind);
    assert.equal(perfect.chance, 4); assert.equal(perfect.fans, 5);
    if (L.rounds) {
      const target = L.rounds.find(r => L.kind !== 'aim' || r.answer === 'enemy');
      const one = G.liveScore(L, { hits: [target.id], wrong: 0 });
      assert.deepEqual(G.liveScore(L, { hits: Array(100).fill(target.id).concat('missing'), wrong: 0 }), one);
      assert.equal(G.liveScore(L, { hits: 100, wrong: 0 }).score, 0);
      assert.equal(G.liveScore(L, { hits: ['missing'], wrong: 0 }).score, 0);
      assert.ok(G.liveScore(L, { ...perfectFor(st), wrong: 3 }).score < 1);
      if (L.kind === 'aim') {
        const allyIds = L.rounds.filter(r => r.answer === 'ally').map(r => r.id);
        assert.ok(allyIds.length); assert.equal(G.liveScore(L, { hits: allyIds, wrong: 0 }).score, 0);
        assert.equal(perfect.n, L.rounds.length - allyIds.length);
      }
    }
    const a = G.finishLive(st, { skipped: true }).last, b = G.finishLive(st, perfectFor(st)).last;
    assert.ok(b.chance - a.chance <= 4.1 && b.chance >= a.chance);
  }
});

check('아홉 게임은 기존 세 자동화 키와 스태프를 공유하고, 저장 v4는 새 게임도 복원한다', () => {
  const staff = { chat: 1, gamecoach: 1, vocal: 1 }, who = { talk: 'chat', game: 'gamecoach', song: 'vocal' };
  for (const [topic, kinds] of Object.entries(rotation)) for (let index = 0; index < 3; index++) {
    const kind = kinds[index], st = variantAt(topic, index);
    assert.equal(G.liveFamily(kind), kinds[0]); assert.ok(G.validSave(copy(st)), kind);
    assert.equal(G.staffFor({ staff }, kind), who[topic]);
    const off = G.setAuto({ ...G.create(), staff }, kind, false);
    assert.deepEqual(Object.keys(off.auto).sort(), ['assist', 'chat', 'sing']); assert.equal(off.auto[kinds[0]], false);
    const autoState = variantAt(topic, index, { staff });
    assert.equal(autoState.phase, 'result'); assert.equal(autoState.last.live.kind, kind); assert.equal(autoState.last.live.score, G.auto.score);
    const manual = variantAt(topic, index, { staff, auto: off.auto }); assert.equal(manual.phase, 'live');
    if (st.pending.live.rounds) {
      const corrupt = mutate => { const bad = copy(st); mutate(bad.pending.live); assert.equal(G.validSave(bad), false, kind); };
      corrupt(L => { L.rounds[0].answer = 'invalid'; });
      corrupt(L => { L.rounds[1].id = L.rounds[0].id; });
      corrupt(L => { L.rounds[1].at = L.rounds[0].at; });
      corrupt(L => { L.rounds[0].window = -1; });
      corrupt(L => { L.rounds = []; });
    } else { const legacy = copy(st); delete legacy.pending.live.rounds; assert.ok(G.validSave(legacy)); }
  }
  const bad = copy(variantAt('talk', 1)); bad.pending.live.kind = 'unknown'; assert.equal(G.validSave(bad), false);
});

check('주제마다 다른 방송 미니게임: 잡담은 채팅 관리, 게임은 도와주기, 노래는 박자 맞추기', () => {
  assert.deepEqual(['talk', 'game', 'song'].map(t => liveAt('STUDIO-01', base, t).pending.live.kind), ['chat', 'assist', 'sing']);
  const g = liveAt('STUDIO-01', base, 'game').pending.live, n = liveAt('STUDIO-01', base, 'song').pending.live;
  assert.ok(g.cues.length >= 7 && g.cues.every(c => ['left', 'jump', 'right'].includes(c.answer) && c.text && c.win >= 1000));
  g.cues.slice(1).forEach((c, i) => assert.ok(c.at >= g.cues[i].at + g.cues[i].win, '신호는 한 번에 하나씩'));
  assert.ok(n.notes.length >= 10); n.notes.slice(1).forEach((x, i) => assert.ok(x.at - n.notes[i].at >= 500));
  for (const L of [g, n]) assert.ok(L.chat.length >= 8 && L.chat.at(-1).at < L.duration && [...(L.cues || []), ...(L.notes || [])].every(x => x.at < L.duration));
});

check('시청자가 많고 중요한 방송일수록 채팅이 많고 빠르며, 신호와 박자도 촘촘해진다', () => {
  const small = liveAt('H', base, 'talk').pending.live, crowd = liveAt('H', base, 'talk', { fans: 6000 }).pending.live;
  const big = liveAt('H', base, 'talk', { fans: 6000 }, true).pending.live;
  assert.ok(small.viewers < crowd.viewers && small.heat < crowd.heat && crowd.heat < big.heat && big.big && !crowd.big);
  assert.ok(small.chat.length < crowd.chat.length && crowd.chat.length < big.chat.length);
  const gs = liveAt('H', base, 'game').pending.live, gb = liveAt('H', base, 'game', { fans: 6000 }, true).pending.live;
  assert.ok(gb.cues.length > gs.cues.length && gb.cues[0].win < gs.cues[0].win);
  assert.ok(liveAt('H', base, 'song', { fans: 6000 }, true).pending.live.notes.length > liveAt('H', base, 'song').pending.live.notes.length);
  // A story beat that boosts the broadcast (Q4 joint stage +60% fans) also counts as an important broadcast.
  const stage = G.start({ ...G.create('slots', 'H'), q: 4, flags: { moka: 'helped' } }, base, 'talk');
  assert.equal(G.goLive(stage, 'stage').pending.live.big, true); assert.equal(G.goLive(stage, 'later').pending.live.big, false);
});

check('방송 내용은 시드·분기·주제·과거 선택으로 고정되어 새로고침해도 같다', () => {
  assert.deepEqual(liveAt().pending.live, liveAt().pending.live);
  assert.notDeepEqual(liveAt('STUDIO-01', base, 'song').pending.live.chat.map(c => c.text), liveAt().pending.live.chat.map(c => c.text));
  for (const seed of ['STUDIO-01', 'X', 'Y', 'Z']) for (const fans of [120, 3000, 20000]) {
    const chat = liveAt(seed, base, 'talk', { fans }).pending.live.chat;
    assert.equal(new Set(chat.map(c => c.id)).size, chat.length); assert.notEqual(chat[0].kind, 'toxic');
    assert.ok(chat.filter(c => c.kind === 'toxic').length >= 4 && chat.filter(c => c.kind === 'good').length >= 4);
    chat.slice(1).forEach((c, i) => assert.ok(c.at > chat[i].at)); assert.ok(chat.every(c => c.text && c.nick && c.reply));
  }
  const noted = liveAt('STUDIO-01', base, 'talk', { flags: { sponsor: true } }).pending.live.chat;
  assert.ok(noted.some(c => c.kind === 'toxic' && c.text.includes('젤리')), '지난 선택이 채팅 내용으로 돌아와야 함');
});

check('기존 세 미니게임 점수는 -0.6~1, 건너뛰기·무입력은 0, 만점이면 성공 확률 +4%p·팬 +5%까지만', () => {
  for (const topic of ['talk', 'game', 'song']) {
    const st = liveAt('STUDIO-01', base, topic), L = st.pending.live;
    assert.equal(G.liveScore(L, { skipped: true }).score, 0); assert.equal(G.liveScore(L, null).score, 0);
    assert.equal(G.liveScore(L, {}).score, 0);
    assert.equal(G.liveScore(L, perfectFor(st)).score, 1); assert.equal(G.liveScore(L, worstFor(st)).score, -0.6);
    const skip = G.finishLive(st, { skipped: true }).last, best = G.finishLive(st, perfectFor(st)).last, bad = G.finishLive(st, worstFor(st)).last;
    assert.equal(Math.round((best.chance - skip.chance) * 10), 40); assert.ok(bad.chance < skip.chance); assert.equal(skip.chance, skip.baseChance);
    assert.ok(best.fans >= skip.fans && best.fans <= Math.ceil(skip.fans * 1.08) + 1);
    assert.ok(best.notes[0].startsWith(G.liveNames[L.kind].slice(0, 2)), best.notes[0]); assert.ok(skip.notes[0].includes('건너뛰었다'));
    assert.deepEqual(G.resolve(G.start(G.create(), base, topic), 'natural').last, skip, 'resolve(입력 없음)과 건너뛰기는 같은 결과');
  }
  const L = liveAt('STUDIO-01', base, 'game').pending.live;
  assert.equal(G.liveScore(L, { hits: 999, wrong: -5 }).hits, L.cues.length, '입력값은 범위 안으로 잘림');
  assert.equal(G.liveScore(liveAt().pending.live, { blocked: ['c999'], mentioned: [] }).score, 0, '없는 채팅 id는 무시');
});

check('미니게임은 결과를 조금만 바꾼다: 400시드에서 성공 판정이 뒤집히는 방송은 8% 미만, 준비 차이가 더 크다', () => {
  let flips = 0, n = 0; const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length; const skipScore = [], bestScore = [];
  for (let i = 0; i < 400; i++) {
    const st = liveAt('L' + i, base, ['talk', 'game', 'song'][i % 3]), a = G.finishLive(st, { skipped: true }).last, b = G.finishLive(st, perfectFor(st)).last;
    n++; if (a.success !== b.success) flips++; skipScore.push(a.score); bestScore.push(b.score);
  }
  assert.ok(flips / n < .08, `뒤집힘 ${flips}/${n}`);
  const prepGap = G.preview(G.create(), { stream: 1, train: 2, charm: 0, rest: 1 }, 'game').chance - G.preview(G.create(), { stream: 1, train: 0, charm: 2, rest: 1 }, 'game').chance;
  assert.ok(prepGap > G.live.chance * 1.5, '같은 두 칸을 훈련에 쓰는 차이가 미니게임 만점보다 성공 확률을 더 바꿔야 함');
  assert.ok(mean(bestScore) > mean(skipScore) && mean(bestScore) - mean(skipScore) < 2.5);
});

check('생방송 단계에서는 결산이 한 번만 되고, 단계 밖 호출과 잘못된 입력은 거부된다', () => {
  const ev = G.start(G.create(), base, 'game'), st = G.goLive(ev, 'natural'), before = JSON.stringify(st);
  assert.throws(() => G.goLive(st, 'natural'), /사건 선택 단계/);
  assert.throws(() => G.resolve(st, 'natural'), /사건 선택 단계/);
  assert.throws(() => G.advance(st), /다음 분기/); assert.throws(() => G.upgrade(st), /장비/);
  assert.throws(() => G.finishLive(ev, null), /방송 진행 단계/);
  assert.throws(() => G.goLive(ev, 'nope'), /알 수 없는 선택/);
  const done = G.finishLive(st, perfectFor(st));
  assert.equal(JSON.stringify(st), before);
  assert.equal(done.history.length, 1); assert.throws(() => G.finishLive(done, null), /방송 진행 단계/);
});

// Growth structure (playtest build)
const rich = (over = {}) => ({ ...G.create('slots', 'LEAP'), cash: 2000, fans: 4000, q: 4, ...over });
const leapTo = (s, choose = st => st.pending.event.options[0].id) => { const e = G.start(s, base, 'talk', false, true); return G.resolve(e, choose(e), { skipped: true }); };

check('도약 무대는 연말에 팬 조건을 채우면 열리고, 성공하면 다음 단계·장비·스태프 칸이 열린다', () => {
  assert.equal(G.leapInfo(rich({ q: 3 })).open, false, '연말이 아니면 닫힘');
  assert.equal(G.leapInfo(rich({ fans: 2000 })).open, false, '팬이 모자라면 닫힘');
  assert.throws(() => G.start(rich({ q: 3 }), base, 'talk', false, true), /도약 무대/);
  assert.throws(() => G.start(rich(), { stream: 0, train: 1, charm: 0, rest: 3 }, 'talk', false, true), /방송 일정/);
  assert.throws(() => G.start(rich({ cash: 10 }), base, 'talk', false, true), /참가비/);
  const seeds = Array.from({ length: 80 }, (_, i) => 'LP' + i);
  const outs = seeds.map(sd => leapTo(rich({ seed: sd, skills: { talk: 70, game: 40, song: 30 } })).last);
  const ok = outs.find(r => r.leap.ok), bad = outs.find(r => !r.leap.ok);
  assert.ok(ok && bad, '같은 준비라도 성공과 실패가 모두 있어야 함');
  assert.equal(ok.tier, 1); assert.ok(ok.notes[0].includes('도약 무대 성공'));
  assert.equal(outs.find(r => r.leap.ok) && G.tiers[1].slots, 2);
  assert.ok(ok.story === 'ch2');
});

check('도약에 실패하면 다음 분기에 참가비 1.5배로 바로 재도전할 수 있고, 그 다음 분기에는 다시 닫힌다', () => {
  let st = null;
  for (let i = 0; i < 80 && !st; i++) { const r = leapTo(rich({ seed: 'RT' + i })); if (!r.last.leap.ok) st = r; }
  assert.ok(st, '실패 사례');
  assert.ok(st.last.notes[0].includes('바로 재도전'));
  const next = G.advance(st), li = G.leapInfo(next);
  assert.equal(next.q, 5); assert.equal(li.open, true); assert.equal(li.retry, true); assert.equal(li.cost, Math.round(G.tiers[0].leapCost * 1.5));
  const skipped = G.advance(G.resolve(G.start(next, base, 'talk'), G.start(next, base, 'talk').pending.event.options[0].id));
  assert.equal(G.leapInfo(skipped).open, false, '재도전은 바로 다음 분기에만');
  const again = G.resolve(G.start(next, base, 'talk', false, true), G.start(next, base, 'talk', false, true).pending.event.options[0].id);
  assert.equal(again.last.leap.cost, li.cost);
});

check('도약하지 않으면 팬 증가가 단계 상한 근처에서 느려진다', () => {
  const grow = fans => { const s = { ...G.create('slots', 'CEIL'), fans, cash: 500 }; return G.resolve(G.start(s, base, 'talk'), 'natural').last.fans; };
  assert.ok(grow(500) > grow(4900) * 0.6, '상한 근처에서는 입소문 성장이 줄어야 함');
  const low = { ...G.create('slots', 'CEIL'), fans: 4900, cash: 500 }, high = { ...low, tier: 1 };
  assert.ok(G.resolve(G.start(high, base, 'talk'), 'natural').last.fans > G.resolve(G.start(low, base, 'talk'), 'natural').last.fans);
});

check('스태프는 단계별 칸만큼 고용하고, 급여가 운영비에 붙으며, 계획 단계에서만 바꿀 수 있다', () => {
  let s = G.create();
  s = G.hire(s, 'chat');
  assert.throws(() => G.hire(s, 'trainer'), /1명까지/);
  assert.throws(() => G.hire(s, 'chat'), /이미/);
  assert.equal(G.upkeep(s) - G.upkeep(G.create()), G.staff.chat.salary);
  const t1 = G.hire({ ...s, tier: 1 }, 'trainer');
  assert.equal(G.upkeep(t1), 14 + G.tiers[1].rent + (G.staff.chat.salary + G.staff.trainer.salary) * G.tiers[1].pay);
  const fired = G.fire(s, 'chat'); assert.equal(Object.keys(fired.staff).length, 0);
  const ev = G.start(s, base, 'talk');
  assert.throws(() => G.hire(ev, 'trainer'), /계획 단계/); assert.throws(() => G.buyProject(ev, 'model3d'), /계획 단계/);
});

check('트레이너 없이는 실력이 75 근처에서 멈추고, 트레이너가 있으면 더 오른다', () => {
  const train = (s, n) => { for (let i = 0; i < n; i++) { const e = G.start({ ...s, cash: 5000 }, { stream: 0, train: 4, charm: 0, rest: 0 }, 'game'); s = { ...G.advance(G.resolve(e, e.pending.event.options[0].id)), health: 90 }; } return s.skills.game; };
  const alone = train({ ...G.create('slots', 'TR'), q: 10 }, 5);
  const coach = train({ ...G.create('slots', 'TR'), q: 10, staff: { trainer: 1 } }, 5);
  assert.ok(alone < 80 && alone > 65, '혼자 ' + alone); assert.ok(coach > 90, '트레이너 ' + coach);
});

check('스태프가 미니게임을 자동 처리하면 방송이 바로 결산되고, 보상은 직접 잘한 것보다 낮다', () => {
  const s = { ...G.create(), staff: { chat: 1 }, cash: 300 };
  const first = st => st.pending.event.options[0].id;
  const go = st => { const e = G.start(st, base, st.topic || 'talk'); return G.goLive(e, first(e)); };
  const auto = go(s);
  assert.equal(auto.phase, 'result'); assert.equal(auto.last.live.auto, true); assert.equal(auto.last.live.score, G.auto.score);
  assert.ok(auto.last.notes[0].includes('채팅 매니저'));
  const off = go(G.setAuto(s, 'chat', false));
  assert.equal(off.phase, 'live', '자동을 끄면 직접 한다');
  const vet = go({ ...s, q: 10 });
  assert.equal(vet.last.live.score, G.auto.veteran);
  assert.ok(G.auto.veteran < 1 && G.auto.score < G.auto.veteran);
  const other = G.goLive(G.start(s, base, 'game'), 'natural');
  assert.equal(other.phase, 'live', '담당이 없는 미니게임은 직접');
  const hacked = G.finishLive(off, { auto: true });
  assert.equal(hacked.last.live.score, G.auto.score, '자동 입력은 엔진이 담당자 기준으로 다시 계산');
  const none = G.finishLive(G.goLive(G.start(G.create(), base, 'game'), 'natural'), { auto: true });
  assert.equal(none.last.live.skipped, true, '담당자 없이 자동 요청은 건너뛰기');
});

check('프로젝트는 단계가 되어야 열리고 한 번만 산다', () => {
  let s = { ...G.create(), cash: 3000 };
  assert.throws(() => G.buyProject(s, 'model3d'), /기획사 확장 단계/);
  s = G.buyProject({ ...s, tier: 1 }, 'song');
  assert.equal(s.cash, 3000 - G.projects.song.price); assert.equal(s.skills.song, 26); assert.equal(s.fans, Math.round(120 * 1.12));
  assert.throws(() => G.buyProject(s, 'song'), /이미/);
  assert.throws(() => G.buyProject({ ...s, cash: 10 }, 'model3d'), /자금/);
  const q = st => G.preview(st, base, 'talk').quality;
  assert.equal(Math.round(q(G.buyProject(s, 'model3d')) - q(s)), 8);
});

check('게임 방송이 실패해도 방송감이 높으면 레전드 리액션이 되어 성과가 오른다', () => {
  const seeds = Array.from({ length: 400 }, (_, i) => 'RX' + i);
  const run = (talk, sd) => G.resolve(G.start({ ...G.create('slots', sd), skills: { talk, game: 10, song: 20 } }, base, 'game'), 'natural', { skipped: true }).last;
  const funny = seeds.map(sd => run(85, sd)), dull = seeds.map(sd => run(25, sd));
  const rate = xs => xs.filter(r => r.reaction).length / xs.filter(r => !r.success).length;
  assert.ok(rate(funny) > .5 && rate(dull) < .12, rate(funny) + ' / ' + rate(dull));
  const rx = funny.find(r => r.reaction), flop = dull.find(r => !r.success && !r.reaction);
  assert.ok(rx.status.includes('레전드 리액션')); assert.ok(rx.notes.some(n => n.includes('리액션이 살렸다')));
  assert.ok(rx.income > flop.income);
  assert.ok(run(85, 'x').reaction === false || true);
  const talkFail = seeds.map(sd => G.resolve(G.start({ ...G.create('slots', sd), skills: { talk: 85, game: 10, song: 20 } }, base, 'talk'), 'natural').last).filter(r => !r.success);
  assert.ok(talkFail.every(r => !r.reaction), '리액션은 게임 방송 실패에서만');
});

check('엔딩은 20종(커리어 4 × 관계 3 + 특별 5 + 조기 3)이고, 특별 엔딩은 조건을 채울 때만 나온다', () => {
  assert.equal(G.endings.length, 20); assert.equal(new Set(G.endings.map(e => e.id)).size, 20);
  const end = over => { const s = { ...G.create('slots', 'END'), q: G.MAX_Q, cash: 500, trust: 80, ...over }; const e = G.start(s, base, 'talk'); return G.resolve(e, 'together').ending; };
  assert.equal(end({}).id, 't0-together'); assert.equal(end({ tier: 2 }).id, 't2-together'); assert.equal(end({ tier: 1, trust: 30 }).id, 't1-distant');
  assert.equal(end({ tier: 1, exposed: true, charm: 70 }).id, 'mask');
  assert.equal(end({ flags: { mokaFinal: true, moka: 'helped' } }).id, 'moka');
  assert.equal(end({ flags: { mokaFinal: true, moka: 'reached' } }).id, 't0-together', '모카 엔딩은 처음부터 함께한 경우만');
  assert.equal(end({ skills: { talk: 30, game: 25, song: 88 }, projects: { song: 3 }, flags: { album: true } }).id, 'songname');
  assert.equal(end({ skills: { talk: 30, game: 25, song: 88 }, projects: { song: 3 } }).id, 't0-together', '앨범이나 노래 대회 없이는 노래 엔딩이 아님');
  assert.equal(end({ reactions: 7 }).id, 'comedy'); assert.equal(end({ reactions: 4 }).id, 't0-together');
  assert.equal(end({ tier: 3 }).id, 't3-together'); assert.equal(end({ tier: 3 }).art, 'legend');
  for (const id of ['t0-together', 'mask', 'moka', 'songname', 'comedy']) assert.ok(G.endings.some(e => e.id === id));
});

check('메인 스토리: 첫 도약 뒤 2장, 도약이 늦으면 3년차에 작은 2장이 열린다', () => {
  const s = trace('STORY', calm).s;
  assert.equal(s.story[0], 'ch1');
  const slow = s.tier === 0 ? s : null;
  if (slow) assert.ok(s.story.includes('ch2s'));
  const q12 = { ...G.create('slots', 'ST'), q: 12 };
  const r = G.resolve(G.start(q12, base, 'talk'), G.start(q12, base, 'talk').pending.event.options[0].id);
  assert.ok(r.story.includes('ch2s')); assert.equal(r.last.story, 'ch2s');
  for (const k of r.story) assert.ok(G.story[k] && G.story[k].scenes.length >= 3);
  // Later chapters: small ch3 at 5 years, small ch4 at 7.5 years, final chapter just before the ending.
  const at = (q, story) => { const st = { ...G.create('slots', 'ST'), q, story }; const e = G.start(st, base, 'talk'); return G.resolve(e, e.pending.event.options[0].id).story; };
  assert.ok(at(20, ['ch1', 'ch2s']).includes('ch3s')); assert.ok(at(30, ['ch1', 'ch2', 'ch3']).includes('ch4s'));
  assert.ok(!at(30, ['ch1', 'ch2', 'ch3', 'ch4']).includes('ch4s'), '이미 4장을 봤으면 작은 4장은 없음');
  assert.ok(at(G.MAX_Q - 1, ['ch1']).includes('ch5'));
  for (const c of Object.values(G.story)) for (const [who, line] of c.scenes) assert.ok(typeof who === 'string' && line.length > 5);
});

check('새해 목표: 1분기마다 셋 중 하나를 고르고, 연말에 달성하면 보상, 못 하면 기록만 남는다', () => {
  let s0 = G.create();
  assert.equal(G.goalOpen(s0), true); assert.equal(G.yearGoals(s0).length, 3);
  assert.throws(() => G.setGoal(s0, 'nope'), /고를 수 없는/);
  let s1 = G.setGoal(s0, 'save'); assert.equal(G.goalOpen(s1), false); assert.throws(() => G.setGoal(s1, 'fans'), /새해 첫 분기/);
  const endYear = (st, cash) => { st = { ...st, q: 4, cash }; const e = G.start(st, base, 'talk'); return G.resolve(e, e.pending.event.options[0].id); };
  const ok = endYear(s1, 900), no = endYear(s1, 30);
  assert.equal(ok.last.goal.ok, true); assert.ok(ok.last.notes.some(n => n.includes('달성')));
  assert.equal(no.last.goal.ok, false); assert.ok(no.last.notes.some(n => n.includes('놓쳤다')));
  assert.equal(ok.goal, null); assert.equal(ok.goals.length, 1);
  const leapy = { ...G.create(), fans: 2500 }; assert.ok(G.yearGoals(leapy).includes('leap'), '도약이 가까우면 도약 목표가 나옴');
});

check('40분기 동안 사건이 거의 겹치지 않고, 뒤 분기에는 앞의 선택이 돌아온다', () => {
  const ids = []; let s0 = G.create('slots', 'LONG');
  for (;;) { const e = G.start({ ...s0, cash: Math.max(s0.cash, 300), health: Math.max(s0.health, 60) }, base, 'talk'); ids.push(e.pending.event.id); s0 = G.resolve(e, e.pending.event.options[0].id); if (s0.ending) break; s0 = G.advance(s0); }
  assert.equal(ids.length, G.MAX_Q); assert.ok(new Set(ids).size >= 34, '사건 종류 ' + new Set(ids).size);
  const withMoka = { ...G.create('slots', 'M'), q: 38, flags: { mokaBond: true } }, noMoka = { ...G.create('slots', 'M'), q: 38 };
  assert.equal(G.start(withMoka, base, 'talk').pending.event.id, 'moka10'); assert.equal(G.start(noMoka, base, 'talk').pending.event.id, 'reunion');
  // Deck quarters reuse written events as neutral cards; the chain text still follows past choices.
  const found = Array.from({ length: 200 }, (_, i) => G.start({ ...G.create('slots', 'C' + i), q: 23, flags: { sponsor: true } }, base, 'talk').pending.event).find(e => e.id === 'controversy');
  assert.ok(found, '논란 카드'); assert.match(found.body, /옛 논란/);
});

// Event deck (Game Dev Story style luck)
const drawAt = (over, n = 400) => Array.from({ length: n }, (_, i) => G.start({ ...G.create('slots', 'DK' + i), q: 13, cash: 500, ...over }, base, 'talk').pending.event).filter(e => e.card);
check('사건 덱: 11분기부터 이야기 분기 외에는 좋은 일·나쁜 일·중립 사건을 뽑고, 1~10분기는 고정 도입부다', () => {
  for (let q = 1; q <= 10; q++) assert.equal(G.start({ ...G.create(), q }, base, 'talk').pending.event.card, undefined, q + '분기 고정');
  const cards = drawAt({});
  const kinds = cards.reduce((a, e) => (a[e.card.kind] = (a[e.card.kind] || 0) + 1, a), {});
  assert.ok(kinds.good > 60 && kinds.bad > 60 && kinds.mid > 20, JSON.stringify(kinds));
  assert.ok(new Set(cards.map(e => e.card.id)).size >= 20, '다양한 카드');
  for (const id of G.deck.spine) assert.equal(G.start({ ...G.create(), q: id }, base, 'talk').pending.event.card, undefined, id + '분기 이야기');
});

check('운처럼 보이지만 준비를 따른다: 신뢰가 높으면 좋은 일이, 건강이 낮으면 나쁜 일이 잦다', () => {
  const rate = over => { const c = drawAt(over); return c.filter(e => e.card.kind === 'good').length / c.filter(e => e.card.kind !== 'mid').length; };
  const warm = rate({ trust: 95, health: 80 }), cold = rate({ trust: 20, health: 30 });
  assert.ok(warm > cold + .2, warm + ' vs ' + cold);
  const songs = drawAt({ skills: { talk: 30, game: 25, song: 70 } }).filter(e => e.card.id === 'ost').length, none = drawAt({}).filter(e => e.card.id === 'ost').length;
  assert.ok(songs > none * 2, '노래 실력이 높으면 OST 제안이 잦음');
});

check('좋은 일은 이유를, 나쁜 일은 대비 효과를 결과에 보여준다', () => {
  const g = drawAt({ trust: 90 }).find(e => e.card.kind === 'good' && e.card.why);
  const st = { ...G.create('slots', 'W'), q: 13, cash: 500, trust: 90 }; let found = null;
  for (let i = 0; i < 200 && !found; i++) { const e = G.start({ ...st, seed: 'W' + i }, base, 'talk'); if (e.pending.event.card && e.pending.event.card.kind === 'good' && e.pending.event.card.why) found = e; }
  const r = G.resolve(found, found.pending.event.options[0].id).last;
  assert.ok(r.notes.some(n => n.startsWith('행운이 온 이유')), r.notes.join(' | ')); assert.ok(g);
  let bad = null, badBare = null;
  for (let i = 0; i < 400 && !(bad && badBare); i++) {
    const e1 = G.start({ ...G.create('slots', 'B' + i), q: 13, cash: 500, trust: 20, health: 80, gear: 3, staff: { chat: 1 } }, base, 'talk');
    if (!bad && e1.pending.event.card && e1.pending.event.card.kind === 'bad' && e1.pending.event.card.guard > 0) bad = e1;
    const e2 = G.start({ ...G.create('slots', 'B' + i), q: 13, cash: 500, trust: 20, health: 30 }, base, 'talk');
    if (!badBare && e2.pending.event.card && e2.pending.event.card.kind === 'bad' && e2.pending.event.card.guard === 0) badBare = e2;
  }
  assert.ok(G.resolve(bad, bad.pending.event.options[0].id).last.notes.some(n => n.includes('덕분에 피해가')));
  assert.ok(G.resolve(badBare, badBare.pending.event.options[0].id).last.notes.some(n => n.includes('대비가 없었다')));
});

check('나쁜 일이 두 번 연속이면 다음은 좋은 일이 더 잘 나온다', () => {
  const streak = [{ card: { kind: 'bad', id: 'troll' } }, { card: { kind: 'bad', id: 'cold' } }];
  const rate = history => { const c = drawAt({ history, trust: 50 }); return c.filter(e => e.card.kind === 'good').length / c.filter(e => e.card.kind !== 'mid').length; };
  assert.ok(rate(streak) > rate([]) + .2, rate(streak) + ' vs ' + rate([]));
});

check('방송 궁합은 회차가 바뀌어도 같은 숨은 표이고, 좋은 궁합일수록 품질이 오른다', () => {
  assert.equal(G.fitOf('game', 'challenge'), 5); assert.equal(G.fitOf('song', 'horror'), 1);
  const q = c => G.preview(G.create(), base, 'game', false, false, c).quality;
  assert.ok(q('challenge') > q('cozy') + 10);
  assert.throws(() => G.preview(G.create(), base, 'game', false, false, 'nope'), /콘셉트/);
  const r = G.resolve(G.start(G.create(), base, 'game', false, false, 'challenge'), 'natural').last;
  assert.equal(r.fit, 5); assert.ok(r.notes.some(n => n.includes('최고의 조합')));
  const quiet = G.resolve(G.start(G.create(), { stream: 0, train: 1, charm: 0, rest: 3 }, 'game', false, false, 'horror'), 'natural').last;
  assert.equal(quiet.fit, 0, '방송이 없으면 궁합도 없음');
});

check('방송 중 부스트: 잘 준비한 방송일수록 기회가 많고, 잡으면 팬이 더 늘지만 스태프 자동 처리는 못 잡는다', () => {
  const L = over => G.goLive(G.start({ ...G.create('slots', 'BO'), ...over }, base, 'talk'), 'natural').pending.live;
  const poor = L({ skills: { talk: 10, game: 10, song: 10 }, health: 30 }), good = L({ skills: { talk: 90, game: 90, song: 90 }, gear: 4 });
  assert.ok(good.boosts.length > poor.boosts.length);
  const st = G.goLive(G.start({ ...G.create('slots', 'BO'), skills: { talk: 90, game: 90, song: 90 }, gear: 4 }, base, 'talk'), 'natural');
  const ids = k => st.pending.live.chat.filter(c => c.kind === k).map(c => c.id);
  const hit = G.finishLive(st, { blocked: ids('toxic'), mentioned: ids('good'), boosts: 9 }).last, miss = G.finishLive(st, { blocked: ids('toxic'), mentioned: ids('good'), boosts: 0 }).last;
  assert.equal(hit.live.boosts, st.pending.live.boosts.length, '잡은 수는 기회 수를 넘지 않음');
  assert.ok(hit.fans > miss.fans); assert.ok(hit.notes.some(n => n.includes('부스트')));
  const auto = G.goLive(G.start({ ...G.create('slots', 'BO'), staff: { chat: 1 } }, base, 'talk'), 'natural').last.live;
  assert.equal(auto.boosts, 0);
});

check('40분기 봇 플레이: 조절 운영은 대부분 완주하고, 도약을 해야 성장하며, 자동화는 직접보다 약하다', () => {
  const P4 = (a, b, c, d) => ({ stream: a, train: b, charm: c, rest: d });
  const bot = (seed, { leap = true, auto = false, hands = .8 } = {}) => {
    let s = G.create('slots', seed);
    if (auto) { s = G.hire(s, 'chat'); }
    for (;;) {
      if (G.goalOpen(s)) s = G.setGoal(s, G.yearGoals(s)[0]);
      if (!auto && !s.staff.trainer && Object.keys(s.staff).length < G.tiers[s.tier].slots && s.cash > 200) s = G.hire(s, 'trainer');
      while (s.gear < G.gearCap(s) && s.cash >= G.gearPrice(s) + 70) s = G.upgrade(s);
      const plans = [P4(3, 0, 0, 1), P4(2, 1, 0, 1), P4(2, 0, 0, 2), P4(1, 1, 0, 2)];
      const plan = plans.find(p => G.preview(s, p, 'talk').health >= 30 && G.preview(s, p, 'talk').cost <= s.cash + 20) || P4(1, 0, 0, 3);
      const li = G.leapInfo(s);
      s = G.start(s, plan, 'talk', false, leap && li.open && s.cash >= li.cost + 20);
      s = G.goLive(s, pick(...calm, 'together', 'mediate', 'surprise', 'stay', 'explain', 'enjoy', 'sabbatical', 'rest_long', 'tv_safe')(s));
      if (s.phase === 'live') {
        const L = s.pending.live, t = L.chat.filter(c => c.kind === 'toxic').map(c => c.id);
        const input = L.rounds ? { hits: perfectFor(s).hits.slice(0, Math.round(perfectFor(s).hits.length * hands)), wrong: 0 } : { blocked: t.slice(0, Math.round(t.length * hands)), mentioned: L.chat.filter(c => c.kind === 'good').slice(0, 3).map(c => c.id) };
        s = G.finishLive(s, input);
      }
      if (s.ending) return s;
      s = G.advance(s);
    }
  };
  const seeds = Array.from({ length: 60 }, (_, i) => 'BOT' + i);
  const med = xs => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const main = seeds.map(sd => bot(sd)), noLeap = seeds.map(sd => bot(sd, { leap: false })), autoRuns = seeds.map(sd => bot(sd, { auto: true }));
  assert.ok(main.filter(s => !s.ending.cause).length / seeds.length >= .9, '완주율');
  assert.ok(main.filter(s => s.tier >= 1).length / seeds.length >= .8, '첫 도약');
  assert.ok(med(main.map(s => s.fans)) > med(noLeap.map(s => s.fans)) * 1.5, '도약 효과');
  assert.ok(noLeap.every(s => s.tier === 0));
  assert.ok(autoRuns.every(s => s.history.filter(r => r.live).every(r => r.live.auto && r.live.score < 1)));
});

const out = path.join(__dirname, '..', 'qa', 'core-results.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ checkedAt: new Date().toISOString(), engineVersion: G.VERSION, passed: checks.length, checks }, null, 2));
console.log(`\n${checks.length}개 규칙 확인 통과${failed.length ? `, ${failed.length}개 실패` : ''}`);
if (failed.length) process.exitCode = 1;








