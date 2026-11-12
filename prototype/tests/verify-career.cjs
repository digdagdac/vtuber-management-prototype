'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../core.js');
const checks = [];
const copy = x => JSON.parse(JSON.stringify(x));
const rest = { stream: 0, train: 1, charm: 0, rest: 3 };
const plan = { stream: 1, train: 1, charm: 0, rest: 2 };
function check(name, fn) { fn(); checks.push(name); console.log('PASS ' + name); }
function play(s, p = plan, topic = 'game') {
  const e = G.start(s, p, topic, false, false, topic === 'game' ? 'horror' : 'cozy');
  const ids = e.pending.event.options.map(o => o.id);
  return G.resolve(e, ['natural', 'protect', 'listen', 'compromise', 'refund', 'private'].find(id => ids.includes(id)) || ids[0]);
}
function offer(kind) {
  for (let i = 0; i < 300; i++) {
    let s = G.create('slots', 'CAREER-' + i);
    s.cash = 2000; s.skills = { talk: 85, game: kind === 'variety' ? 8 : 60, song: 75 };
    const r = play(s, plan, kind === 'music' ? 'song' : kind === 'community' ? 'talk' : 'game');
    if (r.career.broadcasts[0].kind !== kind) continue;
    const n = G.advance(r);
    if (G.followup(n)) return n;
  }
  throw new Error('후일담 시나리오를 찾지 못했습니다: ' + kind);
}

check('방송만 실적을 남기고, 세 평가 축과 평가가 기록된다', () => {
  const n = play(G.create());
  assert.equal(n.career.broadcasts.length, 1);
  assert.deepEqual(n.last.axes, n.career.broadcasts[0].axes);
  assert.equal(n.last.score, n.last.reviews.reduce((sum, r) => sum + r.score, 0));
  assert.equal(play(G.create(), rest).career.broadcasts.length, 0);
  assert.equal(G.validSave(n), true);
});
check('이전 방송 반응은 휴식 중에도 두 분기에 걸쳐 도착하고 원방송 예산을 넘지 않는다', () => {
  let s = play(G.create()); const cap = copy(s.career.broadcasts[0]);
  for (let q = 2; q <= 4; q++) {
    s = play(G.advance(s), rest);
    assert.equal(s.career.broadcasts.length, 1);
    assert.equal(s.last.echoes.length, q <= 3 ? 1 : 0);
    if (q <= 3) {
      assert.equal(s.last.echoes[0].sourceQ, 1);
      assert.ok(s.last.notes.some(n => n.includes('1분기')));
    }
  }
  const b = s.career.broadcasts[0];
  assert.equal(b.echoes.length, 2);
  assert.ok(b.echoes.reduce((n, e) => n + e.fans, 0) <= cap.fanCap);
  assert.ok(b.echoes.reduce((n, e) => n + e.cash, 0) <= cap.cashCap);
  assert.throws(() => G.resolve(s, 'natural'), /단계/);
});
check('편집자는 후속 반응을 돕고 저장·재실행은 동일한 결과를 낸다', () => {
  const source = G.advance(play(G.create('slots', 'EDITOR'))), edited = copy(source);
  edited.staff.editor = edited.q;
  const a = play(source, rest), b = play(edited, rest);
  assert.ok(b.last.echoes[0].fans >= a.last.echoes[0].fans);
  assert.ok(b.last.echoes[0].cash >= a.last.echoes[0].cash);
  assert.equal(b.last.echoes[0].editor, true);
  assert.deepEqual(play(copy(source), rest), a);
});
check('리액션·노래·단골 이야기 모두 출처 있는 제안→다음 분기 대화로 이어진다', () => {
  for (const kind of ['variety', 'music', 'community']) {
    let s = offer(kind), e = G.followup(s);
    assert.equal(e.stage, 'invite'); assert.ok(e.origin.includes('1분기'));
    const before = JSON.stringify(s), fee = e.options[0].cost;
    const accepted = G.respondFollowup(s, 'accept');
    assert.equal(JSON.stringify(s), before); assert.equal(accepted.cash, s.cash - fee);
    assert.throws(() => G.respondFollowup(accepted, 'accept'), /후일담/);
    s = G.advance(play(accepted, rest)); e = G.followup(s);
    assert.equal(e.kind, kind); assert.equal(e.stage, 'return'); assert.ok(e.body.length > 40);
    s = G.respondFollowup(s, e.options[0].id);
    assert.equal(s.career.threads[0].status, 'complete');
    assert.equal(s.career.focus.sourceQ, 1);
    assert.equal(G.validSave(copy(s)), true);
  }
});
check('자금 부족·잘못된 단계·중복 클릭은 원상태에 보상을 주지 않는다', () => {
  const s = offer('community'), poor = { ...copy(s), cash: 0 }, before = JSON.stringify(poor);
  assert.throws(() => G.respondFollowup(poor, 'accept'), /자금/);
  assert.equal(JSON.stringify(poor), before);
  assert.throws(() => G.respondFollowup(s, 'unknown'), /후일담/);
  assert.throws(() => G.respondFollowup(play(s), 'accept'), /계획/);
  const n = G.respondFollowup(s, 'decline');
  assert.equal(n.trust, Math.min(100, s.trust + 1));
  assert.throws(() => G.respondFollowup(n, 'decline'), /후일담/);
  assert.equal(n.career.threads.length, 0);
});
check('적자에서도 무료 제안 거절과 후일담 대화는 가능하고 유료 수락은 막는다', () => {
  for (const kind of ['variety', 'music', 'community']) {
    const invitation = offer(kind), poor = copy(invitation); poor.cash = -100;
    assert.throws(() => G.respondFollowup(poor, 'accept'), /자금/);
    const declined = G.respondFollowup(poor, 'decline');
    assert.equal(declined.cash, -100); assert.equal(G.followup(declined), null);
    let next = G.respondFollowup(invitation, 'accept'); next = G.advance(play(next, rest));
    next.cash = -100;
    const option = G.followup(next).options[0].id;
    const done = G.respondFollowup(next, option);
    assert.equal(done.cash, -100); assert.ok(G.validSave(done)); assert.equal(G.followup(done), null);
  }
});
check('대화 보너스는 맞는 주제의 방송 한 번에만 쓰이고 다른 주제·휴식에는 소모되지 않는다', () => {
  let s = offer('music'); s = G.respondFollowup(s, 'accept');
  s = G.advance(play(s, rest)); s = G.respondFollowup(s, 'demo');
  const q = s.q, f = copy(s.career.focus);
  const waiting = play(s, rest); assert.deepEqual(waiting.career.focus, f);
  const other = play(s, plan, 'game'); assert.deepEqual(other.career.focus, f);
  const atLast = G.advance(waiting); assert.equal(atLast.q, q + 1);
  const withBonus = play(atLast, plan, 'song'), without = copy(atLast); without.career.focus = null;
  const normal = play(without, plan, 'song');
  // The multiplier precedes integer rounding in settlement.
  assert.ok(Math.abs(withBonus.last.fans - normal.last.fans * 1.12) <= 1);
  assert.equal(withBonus.last.focus.bonus, .12);
  assert.equal(withBonus.career.focus, null);
  const expired = G.advance(play(atLast, rest)); assert.equal(expired.career.focus, null);
});
check('답하지 않고 계획하면 제안은 보류되고 본래 분기 사건은 유지된다', () => {
  const s = offer('community'), e = G.start(s, plan, 'game');
  assert.equal(e.pending.event.id, G.start({ ...copy(s), career: undefined }, plan, 'game').pending.event.id);
  assert.equal(e.career.lead, null); assert.equal(e.career.broadcasts[0].offer, 'passed');
  assert.equal(e.trust, s.trust);
});
check('기존 v4 저장에는 과거 방송 보상을 소급하지 않고 손상된 새 저장은 거부한다', () => {
  const legacy = play(G.create()); delete legacy.career;
  assert.ok(G.validSave(legacy));
  const resumed = G.advance(legacy); assert.equal(resumed.career.broadcasts.length, 0);
  assert.equal(play(resumed, rest).last.echoes.length, 0);
  const good = offer('community');
  const invalid = [null, [], { ...copy(good.career), broadcasts: null }];
  for (const career of invalid) assert.equal(G.validSave({ ...copy(good), career }), false);
  const duplicate = copy(good); duplicate.career.broadcasts.push(copy(duplicate.career.broadcasts[0]));
  assert.equal(G.validSave(duplicate), false);
  const overpaid = copy(good), b = overpaid.career.broadcasts[0];
  b.echoes = [{ q: 2, sourceQ: 1, fans: b.fanCap + 1, cash: 0 }];
  assert.equal(G.validSave(overpaid), false);
});
check('40분기 전체에서 후일담에 응답해도 저장·엔딩·실적 한도가 유지된다', () => {
  let s = G.create('slots', 'CAREER-FULL'), answered = 0;
  for (;;) {
    const e = G.followup(s);
    if (e) { s = G.respondFollowup(s, e.stage === 'invite' ? (s.cash >= e.options[0].cost ? 'accept' : 'decline') : e.options[0].id); answered++; }
    s = play(s, s.health < 45 ? rest : plan, ['talk', 'game', 'song'][s.q % 3]);
    assert.ok(G.validSave(copy(s)), 'Q' + s.q);
    if (s.ending) break;
    s = G.advance(s); assert.ok(G.validSave(s), 'Q' + s.q);
  }
  assert.equal(s.q, 40); assert.ok(answered >= 4); assert.ok(s.career.broadcasts.length <= 40);
  assert.ok(s.career.broadcasts.every(b => b.echoes.length <= 2));
});
fs.writeFileSync(path.join(__dirname, '../qa/career-results.json'), JSON.stringify({ checkedAt: new Date().toISOString(), passed: checks.length, checks }, null, 2));
console.log(`\n${checks.length}개 후속 반응 규칙 확인 통과`);
