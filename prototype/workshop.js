(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VTWorkshop = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const keys = ['skill', 'show', 'comfort'];
  const names = { skill: '실력 준비', show: '볼거리', comfort: '편안함', issues: '미해결 문제' };
  const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
  const choices = {
    practice: { name: '한 번 더 맞춰 보자', line: '“완벽하진 않아도, 아까보다는 덜 떨려요.”', effect: '실력 준비 +11 · 문제 -1 · 4만원 · 건강 -3', delta: { skill: 11, issues: -1 }, cost: 4, health: -3 },
    staging: { name: '실수도 살릴 장면을 만들자', line: '“못하면 이 멘트 하는 거죠? 벌써 웃긴데요.”', effect: '볼거리 +11 · 편안함 -2 · 4만원 · 방송 중 애드리브 1회', delta: { show: 11, comfort: -2 }, cost: 4, health: 0, cue: true },
    protect: { name: '부담을 덜고 정리하자', line: '“전부 잘하려고 안 해도 되는 거네요.”', effect: '편안함 +10 · 문제 -2 · 실력 준비 -3 · 건강 +3', delta: { comfort: 10, issues: -2, skill: -3 }, cost: 0, health: 3 },
    delegate: { name: '현재 계획대로 맡긴다', line: '“정해 둔 대로 해 볼게요. 다녀올게요!”', effect: '각 강점 +2 · 문제 -1 · 추가 비용 없음', delta: { skill: 2, show: 2, comfort: 2, issues: -1 }, cost: 0, health: 0 }
  };
  function archiveTarget(s) {
    return [...(s.career?.broadcasts || [])].reverse().find(b => s.q > b.q && s.q - b.q <= 2 && !b.editedQ &&
      (b.echoes.reduce((n, e) => n + e.fans, 0) < b.fanCap || b.echoes.reduce((n, e) => n + e.cash, 0) < b.cashCap)) || null;
  }
  function create(s, info, effort, rng) {
    const target = effort === 'archive' ? archiveTarget(s) : null;
    if (!['next', 'archive'].includes(effort) || effort === 'archive' && !target) throw new Error('편집할 지난 방송이 없습니다');
    const base = info.axes;
    return { version: 1, title: info.title, art: info.art, step: 0, choice: null, effort, archiveQ: target?.q || 0,
      base: { ...base }, axes: Object.fromEntries(keys.map(k => [k, Math.round(base[k] * .7)])),
      issues: 1 + Math.floor(rng('issues') * 3) + (s.pending.ambitious ? 1 : 0),
      cost: 0, health: 0, cue: false, cueUsed: false, log: [] };
  }
  function add(w, source, text, delta, kind = 'work') {
    const actual = {};
    for (const [key, value] of Object.entries(delta)) {
      const before = key === 'issues' ? w.issues : w.axes[key];
      const after = clamp(before + value, 0, key === 'issues' ? 6 : 100);
      if (key === 'issues') w.issues = after; else w.axes[key] = after;
      actual[key] = after - before;
    }
    w.log.push({ id: w.log.length, source, text, delta: actual, kind });
  }
  function tick(w, s, fit, rng) {
    if (w.step >= 6 || w.step === 3 && !w.choice) throw new Error('중간 제작 방침을 먼저 골라 주세요');
    const i = w.step++, key = keys[i % 3], p = s.pending.plan;
    // Six actual contributions. Ability changes their size; the draw is fixed per step, never per click/reload.
    const ability = key === 'skill' ? s.pending.preview.skill : key === 'show' ? s.skills.talk : (s.health + s.trust) / 2;
    const staff = key === 'skill' ? s.staff[s.pending.topic === 'song' ? 'vocal' : 'gamecoach'] : key === 'show' ? s.staff.editor : s.staff.chat;
    const source = staff ? key === 'skill' ? s.pending.topic === 'song' ? '보컬 트레이너' : '게임 코치' : key === 'show' ? '편집자' : '채팅 매니저' : key === 'skill' ? '루미의 연습' : key === 'show' ? '루미의 아이디어' : '매니저의 점검';
    const gain = Math.round(2 + ability * .045 + rng(`gain-${i}`) * 3 + (staff ? 2 : 0) + (key === 'skill' ? p.train : 0));
    if (i === 4 && w.effort === 'archive') {
      add(w, '클립 편집', `${w.archiveQ}분기 방송의 장면을 골랐다. 이번 볼거리 준비 시간은 양보했다.`, {}, 'archive');
    } else {
      add(w, source, { skill: '어려운 부분을 나눠 연습했다.', show: '방송에서 살릴 장면을 큐시트에 적었다.', comfort: '빈 구간과 장비 상태를 함께 확인했다.' }[key], { [key]: gain });
    }
    if (i === 1 && rng('incident') < .35 + (s.pending.ambitious ? .15 : 0))
      add(w, '리허설의 걸림돌', '도입부가 길어지고 음향 점검이 밀렸다.', { issues: 1 }, 'problem');
    if (i === 4 && rng('idea') < .12 + fit * .045 + s.skills.talk * .001)
      add(w, '뜻밖의 발견', '연습 중 나온 한마디가 콘셉트와 딱 맞았다!', { show: 5 }, 'idea');
    if (i === 5 && (s.gear > 0 || s.staff.chat))
      add(w, s.staff.chat ? '채팅 매니저' : '장비 점검', '불안한 부분 하나를 미리 정리했다.', { issues: -1 }, 'repair');
  }
  function choose(w, id, cash) {
    if (w.step !== 3 || w.choice) throw new Error('중간 제작 방침은 한 번만 고릅니다');
    const c = choices[id];
    if (!c) throw new Error('알 수 없는 제작 방침');
    if (c.cost > 0 && cash < c.cost) throw new Error('추가 제작비가 부족합니다');
    w.choice = id; w.cost = c.cost; w.health = c.health; w.cue = !!c.cue;
    add(w, '함께 정한 방향', c.name, c.delta, 'choice');
  }
  function modifiers(w) {
    return { chance: clamp((w.axes.skill - w.base.skill) * .0015 - w.issues * .012, -.1, .06),
      quality: keys.reduce((n, k) => n + (w.axes[k] - w.base[k]) * .15, 0) - w.issues * 1.5 };
  }
  function axes(w, original) {
    return Object.fromEntries(keys.map(k => [k, Math.round(clamp(original[k] + w.axes[k] - w.base[k] - (k === 'comfort' ? w.issues * 2 : 0) + (k === 'show' && w.cueUsed ? 4 : 0)))]));
  }
  function valid(w) {
    const bounded = (v, hi) => Number.isFinite(v) && v >= 0 && v <= hi;
    return !!(w && w.version === 1 && typeof w.title === 'string' && /^prep_(game|song|talk)$/.test(w.art) &&
      Number.isInteger(w.step) && bounded(w.step, 6) && (w.choice === null || Object.hasOwn(choices, w.choice)) &&
      (w.step <= 3 || w.choice) && (w.step >= 3 || w.choice === null) && ['next', 'archive'].includes(w.effort) &&
      Number.isInteger(w.archiveQ) && bounded(w.archiveQ, 40) && (w.effort === 'archive' ? w.archiveQ > 0 : w.archiveQ === 0) &&
      bounded(w.issues, 6) && w.axes && w.base && keys.every(k => bounded(w.axes[k], 100) && bounded(w.base[k], 100)) &&
      [0, 4].includes(w.cost) && [-3, 0, 3].includes(w.health) && typeof w.cue === 'boolean' && typeof w.cueUsed === 'boolean' &&
      (!w.cueUsed || w.cue) && (w.choice ? w.cost === choices[w.choice].cost && w.health === choices[w.choice].health && w.cue === !!choices[w.choice].cue : !w.cost && !w.health && !w.cue) &&
      Array.isArray(w.log) && w.log.length <= 12 && w.log.every((e, i) => e && e.id === i && typeof e.source === 'string' && typeof e.text === 'string' && e.delta && Object.entries(e.delta).every(([k, v]) => Object.hasOwn(names, k) && Number.isFinite(v) && Math.abs(v) <= 100)));
  }
  return { names, choices, archiveTarget, create, tick, choose, modifiers, axes, valid };
});
