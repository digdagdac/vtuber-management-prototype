'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../core.js');
const checks = [];
const copy = s => JSON.parse(JSON.stringify(s));
const plan = { stream: 1, train: 1, charm: 0, rest: 2 };
const check = (name, fn) => { fn(); checks.push(name); console.log('PASS ' + name); };
function start(seed = 'WORK-1', topic = 'game', state, effort = 'next', p = plan) {
  const s = G.start(state || G.create('slots', seed), p, topic, false, false, 'cozy');
  return G.beginProduction(s, s.pending.event.options[0].id, effort);
}
function middle(s) { while (s.pending.workshop.step < 3) s = G.productionTick(s); return s; }
function complete(s, choice = 'protect', cue = false) {
  s = middle(s); s = G.chooseProduction(s, choice); s = G.delegateProduction(s);
  if (s.phase === 'live') { if (cue) s = G.usePreparedCue(s); s = G.finishLive(s, { skipped: true }); }
  return s;
}
check('영구 능력과 방송 제작 상태가 분리되고 기여마다 저장·재접속해도 난수가 고정된다', () => {
  let s = start(), baseline = copy(s), initial = copy(s.pending.workshop.axes);
  for (let i = 0; i < 3; i++) {
    const previous = copy(s); const next = G.productionTick(s);
    assert.deepEqual(s, previous); assert.deepEqual(G.productionTick(copy(s)), next);
    s = next; assert.ok(G.validSave(copy(s)));
  }
  assert.deepEqual(s.skills, baseline.skills); assert.equal(s.cash, baseline.cash);
  assert.notDeepEqual(s.pending.workshop.axes, initial); assert.equal(s.history.length, 0);
  assert.throws(() => G.productionTick(s), /방침/); assert.throws(() => G.launchProduction(s), /준비/);
});
check('서로 다른 중간 선택이 장단점·실제 평가·비용·건강을 바꾸며 한 번만 적용된다', () => {
  const s = middle(start());
  const a = complete(copy(s), 'practice'), b = complete(copy(s), 'staging', true), c = complete(copy(s), 'protect');
  assert.ok(a.last.axes.skill > b.last.axes.skill); assert.ok(b.last.axes.show > a.last.axes.show);
  assert.ok(c.health > a.health); assert.equal(a.last.cost - c.last.cost, 4);
  assert.ok(c.last.axes.comfort > b.last.axes.comfort);
  assert.equal(b.last.workshop.cueUsed, true); assert.ok(b.last.notes.some(n => /애드리브/.test(n)));
  const chosen = G.chooseProduction(s, 'practice'); assert.throws(() => G.chooseProduction(chosen, 'practice'), /한 번/);
  assert.throws(() => G.chooseProduction(s, 'typo'), /알 수/);
  const poor = copy(s); poor.cash = 0; assert.throws(() => G.chooseProduction(poor, 'practice'), /부족/);
  assert.ok(G.chooseProduction(poor, 'protect'));
});
check('적자·잔액 0에서도 무료 방침과 맡기기로 진행하고 유료 방침은 잔액을 검사한다', () => {
  for (const cash of [-100, -.1, 0, 3.9, 4]) {
    const s = middle(start()); s.cash = cash;
    const before = copy(s);
    for (const id of ['protect', 'delegate']) {
      const chosen = G.chooseProduction(copy(s), id);
      assert.equal(chosen.pending.workshop.cost, 0);
      assert.equal(chosen.cash, cash);
      const live = G.delegateProduction(chosen);
      assert.equal(live.phase, 'live'); assert.ok(G.validSave(copy(live)));
      const result = G.finishLive(live, { skipped: true });
      assert.equal(result.history.length, 1); assert.ok(G.validSave(result));
    }
    for (const id of ['practice', 'staging']) {
      if (cash < 4) assert.throws(() => G.chooseProduction(s, id), /부족/);
      else assert.equal(G.chooseProduction(s, id).pending.workshop.cost, 4);
    }
    assert.deepEqual(s, before);
    assert.equal(G.delegateProduction(copy(s)).phase, 'live');
    const early = start(); early.cash = cash;
    assert.equal(G.delegateProduction(early).phase, 'live');
  }
});
check('준비한 멘트는 생방송에서 한 번만 쓰고 재접속 후에도 소모 상태를 지킨다', () => {
  let s = G.delegateProduction(G.chooseProduction(middle(start()), 'staging'));
  const before = copy(s); s = G.usePreparedCue(s); assert.deepEqual(before.pending.workshop.cueUsed, false);
  assert.ok(G.validSave(copy(s))); assert.throws(() => G.usePreparedCue(copy(s)), /사용/);
  const a = G.finishLive(before, { skipped: true }), b = G.finishLive(s, { skipped: true });
  assert.ok(b.last.axes.show >= a.last.axes.show && b.last.axes.show - a.last.axes.show <= 4);
  assert.throws(() => G.finishLive(b, { skipped: true }), /단계/);
  assert.throws(() => G.usePreparedCue(G.delegateProduction(start())), /사용/);
});
check('능력·스태프가 기여량에 영향을 주고 제작 중 행운과 문제는 출처를 남긴다', () => {
  const weak = G.create('slots', 'ABILITY'), strong = copy(weak); strong.skills = { game: 85, talk: 85, song: 85 };
  const a = middle(start('ABILITY', 'game', weak)), b = middle(start('ABILITY', 'game', strong));
  assert.ok(b.pending.workshop.axes.skill > a.pending.workshop.axes.skill);
  let issues = false, ideas = false, staff = false;
  for (let i = 0; i < 60; i++) {
    const state = G.create('slots', 'INCIDENT-' + i); state.staff.editor = 1;
    const done = complete(start('', 'game', state), 'protect');
    issues ||= done.last.workshop.log.some(e => e.kind === 'problem'); ideas ||= done.last.workshop.log.some(e => e.kind === 'idea');
    staff ||= done.last.workshop.log.some(e => e.source === '편집자');
  }
  assert.ok(issues && ideas && staff);
});
check('지난 클립 편집은 이번 볼거리 기여를 양보하고 한도 내 후속 반응을 높인다', () => {
  const initial = G.advance(complete(start('EDIT'))), target = G.archiveTarget(initial);
  assert.ok(target);
  const a = complete(start('', 'game', copy(initial), 'next'));
  const b = complete(start('', 'game', copy(initial), 'archive'));
  assert.ok(a.last.workshop.axes.show > b.last.workshop.axes.show);
  assert.ok(b.last.echoes[0].fans >= a.last.echoes[0].fans); assert.ok(b.last.echoes[0].cash >= a.last.echoes[0].cash);
  assert.equal(b.career.broadcasts[0].editedQ, 2); assert.ok(G.validSave(copy(b)));
  const later = complete(start('', 'game', G.advance(b), 'next'));
  const old = later.career.broadcasts[0];
  assert.ok(old.echoes.reduce((n, e) => n + e.fans, 0) <= old.fanCap);
  assert.ok(old.echoes.reduce((n, e) => n + e.cash, 0) <= old.cashCap);
  assert.notEqual(G.archiveTarget(G.advance(later))?.q, 1);
  assert.throws(() => start('NEW', 'game', undefined, 'archive'), /편집/);
});
check('모든 주제의 자동 제작·스태프 자동 방송과 휴식 분기가 중복 결산 없이 이어진다', () => {
  for (const [topic, id] of [['talk', 'chat'], ['game', 'gamecoach'], ['song', 'vocal']]) {
    const state = G.create(); state.staff[id] = 1;
    let s = start('', topic, state); s = G.delegateProduction(s);
    assert.equal(s.phase, 'result'); assert.equal(s.last.live.auto, true); assert.ok(G.validSave(s));
    assert.equal(s.last.workshop.choice, 'delegate'); assert.throws(() => G.delegateProduction(s), /단계/);
  }
  const s = start('', 'talk', undefined, 'next', { stream: 0, train: 1, charm: 0, rest: 3 });
  assert.equal(s.phase, 'result'); assert.equal(s.last.workshop, null); assert.ok(G.validSave(s));
});
check('못한 게임도 리액션으로 흥하고 준비 방침은 성공을 보장하지 않는다', () => {
  let reaction = 0, fail = 0;
  for (let i = 0; i < 100; i++) {
    const state = G.create('slots', 'FAIL-' + i); state.skills.talk = 90; state.skills.game = 3;
    const s = complete(start('', 'game', state), 'staging', true);
    if (!s.last.success) fail++;
    if (!s.last.success && s.last.reaction) reaction++;
  }
  assert.ok(reaction > 0 && fail > reaction);
});
check('제작 중 손상된 저장과 불가능한 진행 상태를 거부하고 기존 v4는 그대로 받는다', () => {
  assert.ok(G.validSave(G.create()));
  const good = middle(start());
  for (const edit of [w => w.step = 7, w => w.step = 4, w => w.axes.show = NaN, w => w.choice = 'fake', w => w.issues = -1, w => w.log = null, w => w.cueUsed = true, w => w.cost = 9000]) {
    const s = copy(good); edit(s.pending.workshop); assert.equal(G.validSave(s), false);
  }
  const e = G.start(G.create(), plan, 'game', false); assert.ok(G.validSave(e));
  const live = G.goLive(e, e.pending.event.options[0].id); assert.ok(G.validSave(live));
});
check('새 제작 루프로 40분기를 완주해도 상태·편집 예산·저장 호환을 유지한다', () => {
  let s = G.create('slots', 'WORK-LONG'); s.cash = 1000;
  while (true) {
    if (G.followup(s)) s = G.respondFollowup(s, G.followup(s).options.at(-1).id);
    const p = s.health < 50 ? { stream: 1, train: 0, charm: 0, rest: 3 } : plan;
    const effort = G.archiveTarget(s) && s.q % 2 === 0 ? 'archive' : 'next';
    s = complete(start('', ['talk', 'game', 'song'][(s.q - 1) % 3], s, effort, p), ['practice', 'staging', 'protect'][s.q % 3]);
    assert.ok(G.validSave(copy(s)), 'Q' + s.q); assert.equal(s.history.length, s.q);
    if (s.ending) break;
    s = G.advance(s);
  }
  assert.equal(s.q, 40);
});
fs.writeFileSync(path.join(__dirname, '../qa/workshop-results.json'), JSON.stringify({ checkedAt: new Date().toISOString(), passed: checks.length, checks }, null, 2));
console.log(`\n${checks.length}개 방송 제작 규칙 확인 통과`);
