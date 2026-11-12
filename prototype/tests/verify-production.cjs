'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../core.js'), C = require('../career.js');
const checks = [];
const copy = x => JSON.parse(JSON.stringify(x));
const plan = { stream: 1, train: 1, charm: 0, rest: 2 }, rest = { stream: 0, train: 1, charm: 0, rest: 3 };
const check = (name, fn) => { fn(); checks.push(name); console.log('PASS ' + name); };
function play(s, topic, program = 'regular', p = plan) {
  const start = G.start(s, p, topic, false, false, 'cozy', program);
  const ids = start.pending.event.options.map(o => o.id);
  return G.resolve(start, ['natural', 'protect', 'listen', 'compromise', 'refund', 'private'].find(x => ids.includes(x)) || ids[0]);
}
function unlock(kind, choiceIndex = 0) {
  const topic = C.programs[kind].topic;
  for (let i = 0; i < 300; i++) {
    let s = G.create('slots', 'PRODUCTION-' + i); s.cash = 2000;
    s.skills = { talk: 85, game: kind === 'variety' ? 8 : 60, song: 75 };
    s = play(s, topic);
    if (s.career.broadcasts[0].kind !== kind) continue;
    s = G.advance(s);
    if (!G.followup(s)) continue;
    s = G.respondFollowup(s, 'accept'); s = G.advance(play(s, topic, 'regular', rest));
    return G.respondFollowup(s, G.followup(s).options[choiceIndex].id);
  }
  throw new Error(kind + ' 개방 경로 없음');
}
check('평가 구간은 성장에 따라 높아지고 이웃 구간이 겹친다', () => {
  const bounds = [0, 25, 40, 55, 70, 85, 95].map(C.reviewRange);
  for (let i = 1; i < bounds.length; i++) {
    assert.ok(bounds[i][0] >= bounds[i - 1][0]); assert.ok(bounds[i][1] >= bounds[i - 1][1]);
    assert.ok(bounds[i][0] <= bounds[i - 1][1]);
  }
  for (let value = 0; value <= 100; value++) for (const random of [0, .49, .99999]) {
    const r = C.reviews(G.critics, { skill: value, show: value, comfort: value }, false, false, () => random);
    for (const v of r) assert.ok(v.score >= v.low && v.score <= v.high && v.score >= 1 && v.score <= 10);
  }
});
check('평가자마다 선호하는 강점이 달라 같은 방송을 다르게 본다', () => {
  const technical = C.reviews(G.critics, { skill: 100, show: 10, comfort: 10 }, false, false, () => 0);
  const funny = C.reviews(G.critics, { skill: 10, show: 100, comfort: 10 }, false, false, () => 0);
  assert.ok(technical[3].score > technical[1].score);
  assert.ok(funny[1].score > funny[3].score);
});
check('높은 평가가 더 큰 기회를 열되 중간 구간은 겹치고 저장하면 고정된다', () => {
  assert.equal(C.opportunity(18, .9999), 1);
  assert.equal(C.opportunity(24, 0), 1); assert.equal(C.opportunity(24, .9999), 2);
  assert.equal(C.opportunity(32, 0), 2); assert.equal(C.opportunity(32, .9999), 3);
  assert.equal(C.opportunity(36, 0), 3);
  const a = play(G.create(), 'song'), b = play(G.create(), 'song');
  assert.equal(a.last.opportunityGrade, b.last.opportunityGrade);
  assert.equal(a.career.broadcasts[0].grade, a.last.opportunityGrade);
});
check('세 후일담 모두 새로운 프로그램을 열고 등급에 따라 초기 완성도가 달라진다', () => {
  for (const kind of Object.keys(C.programs)) {
    const s = unlock(kind), p = s.career.programs[kind];
    assert.ok(G.validSave(s)); assert.equal(p.uses, 0);
    assert.equal(p.level, s.career.broadcasts[0].grade);
    const view = G.programInfo(s, C.programs[kind].topic, kind);
    assert.equal(view.bonus, Math.min(8, p.level * 2));
    assert.throws(() => G.programInfo(G.create(), C.programs[kind].topic, kind), /프로그램/);
  }
});
check('프로그램 비용과 강점은 미리 표시되며 방송 한 번당 제작 경험 한 번만 쌓인다', () => {
  const s = unlock('music'), normal = G.production(s, plan, 'song'), special = G.production(s, plan, 'song', false, 'cozy', 'music');
  assert.equal(special.pre.cost, normal.pre.cost + 6);
  assert.ok(special.axes.skill > normal.axes.skill);
  assert.equal(special.art, 'prep_song'); assert.match(special.title, /작은 음악실/);
  const original = JSON.stringify(s), n = play(s, 'song', 'music');
  assert.equal(JSON.stringify(s), original); assert.equal(n.career.programs.music.uses, 1);
  assert.equal(n.last.program, 'music'); assert.match(n.last.productionTitle, /작은 음악실/);
  assert.deepEqual(play(copy(s), 'song', 'music'), n);
  assert.throws(() => G.resolve(n, 'natural'), /단계/);
  assert.equal(play(s, 'song', 'music', rest).career.programs.music.uses, 0);
});
check('대화의 다른 선택은 다음 프로그램의 이름과 평가 강점도 바꾼다', () => {
  for (const [kind, axis] of [['variety', 'skill'], ['music', 'comfort'], ['community', 'show']]) {
    const s = unlock(kind, 1), p = G.programInfo(s, C.programs[kind].topic, kind);
    assert.equal(p.axis, axis); assert.notEqual(p.name, C.programs[kind].name);
    assert.ok(G.validSave(copy(s)));
  }
});
check('잘못된 프로그램은 거부하고 제작 보너스는 +8을 넘지 않는다', () => {
  const s = unlock('music'), original = JSON.stringify(s);
  assert.throws(() => G.start(s, plan, 'game', false, false, 'cozy', 'music'), /프로그램/);
  assert.throws(() => G.start(s, plan, 'song', false, false, 'cozy', 'typo'), /프로그램/);
  assert.equal(JSON.stringify(s), original);
  s.career.programs.music.uses = 30; assert.equal(G.programInfo(s, 'song', 'music').bonus, 8);
  s.career.programs.music.uses = -1; assert.equal(G.validSave(s), false);
});
check('기존 저장은 프로그램 없이 계속되고 40분기 새 프로그램 운영도 완주한다', () => {
  const old = G.create(); delete old.career.programs; assert.ok(G.validSave(old));
  let s = unlock('community'); s.seed = 'PRODUCTION-LONG';
  for (;;) {
    if (G.followup(s)) s = G.respondFollowup(s, G.followup(s).stage === 'invite' ? 'decline' : G.followup(s).options[0].id);
    s = play(s, 'talk', 'community'); assert.ok(G.validSave(copy(s)), 'Q' + s.q);
    if (s.ending) break;
    s = G.advance(s);
  }
  assert.equal(s.q, 40); assert.ok(s.career.programs.community.uses > 30);
});
fs.writeFileSync(path.join(__dirname, '../qa/production-results.json'), JSON.stringify({ checkedAt: new Date().toISOString(), passed: checks.length, checks }, null, 2));
console.log('\n' + checks.length + '개 제작·평가 규칙 확인 통과');
