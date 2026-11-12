(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VTCareer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
  const types = {
    variety: { name: '잊지 못할 리액션', art: 'dk_meme', topic: 'game', concept: 'horror' },
    music: { name: '목소리로 남은 방송', art: 'song_request', topic: 'song', concept: 'latenight' },
    community: { name: '다시 오고 싶은 밤', art: 'dk_fanart', topic: 'talk', concept: 'cozy' }
  };
  const axisNames = { skill: '실력', show: '볼거리', comfort: '편안함' };
  const programs = {
    variety: { name: '루미의 겁쟁이 도전장', topic: 'game', axis: 'show', art: 'prep_game' },
    music: { name: '루미의 작은 음악실', topic: 'song', axis: 'skill', art: 'prep_song' },
    community: { name: '밤편지 라디오', topic: 'talk', axis: 'comfort', art: 'prep_talk' }
  };
  const programPaths = {
    variety: { embrace: {}, practice: { name: '루미의 재도전 노트', axis: 'skill' } },
    music: { demo: {}, slow: { name: '루미의 새벽 라이브', axis: 'comfort' } },
    community: { home: {}, explore: { name: '단골들과 처음 해 보는 날', axis: 'show' } }
  };
  const grades = { 1: '작은 채널 교류', 2: '채널 공동 기획', 3: '외부 초청 무대' };
  const create = () => ({ broadcasts: [], threads: [], lead: null, focus: null, programs: {}, nextOfferQ: 2 });
  const view = s => s.career || create();
  const ensure = s => { s.career ||= create(); s.career.programs ||= {}; return s.career; };
  function program(s, topic, id = 'regular') {
    if (id === 'regular') return { id, name: '자유 기획', cost: 0, bonus: 0 };
    const p = programs[id], earned = view(s).programs && view(s).programs[id];
    if (!p || !earned || p.topic !== topic) throw new Error('아직 열리지 않았거나 주제가 다른 방송 프로그램입니다');
    return { ...p, ...(programPaths[id][earned.path] || {}), id, cost: 6, bonus: Math.min(8, earned.level * 2 + earned.uses), uses: earned.uses };
  }
  function reviewRange(prepared) {
    return prepared < 25 ? [2, 4] : prepared < 40 ? [3, 5] : prepared < 55 ? [4, 6] : prepared < 70 ? [5, 7] : prepared < 85 ? [6, 8] : prepared < 95 ? [8, 9] : [9, 10];
  }
  function opportunity(score, random) {
    const range = score < 22 ? [1, 1] : score < 30 ? [1, 2] : score < 35 ? [2, 3] : [3, 3];
    return range[0] + Math.min(range[1] - range[0], Math.floor(random * (range[1] - range[0] + 1)));
  }

  // Preparation determines the floor; live play and a funny failure offer small, different upsides.
  function axes(s, pre, topic, reaction, ambitious, live) {
    const result = {
      skill: Math.round(clamp(pre.skill * .85 + s.gear * 3 + s.charm * .08)),
      show: Math.round(clamp(s.skills.talk * .62 + pre.quality * .3 + (reaction ? 24 : 0) + (ambitious ? 6 : 0) + Math.max(0, live) * 4)),
      comfort: Math.round(clamp(s.trust * .6 + s.health * .3 + (s.pending.concept === 'cozy' || s.pending.concept === 'latenight' ? 10 : 0)))
    };
    if (pre.program && pre.program.axis) result[pre.program.axis] = Math.round(clamp(result[pre.program.axis] + pre.program.bonus));
    return result;
  }
  function reviews(names, a, success, viral, rng) {
    const weights = [[.15, .35, .5], [.1, .75, .15], [.2, .15, .65], [.65, .25, .1]];
    return names.map((name, i) => {
      const [sk, sh, co] = weights[i];
      const prepared = clamp(a.skill * sk + a.show * sh + a.comfort * co + (success ? 3 : 0) + (viral ? 3 : 0));
      const [low, high] = reviewRange(prepared);
      return { name, score: low + Math.min(high - low, Math.floor(rng(`review${i}`) * (high - low + 1))), low, high };
    });
  }
  function record(s, r, a, rng) {
    const c = ensure(s);
    const kind = r.reaction ? 'variety' : r.topic === 'song' && a.skill >= 35 ? 'music' : a.comfort >= 50 ? 'community' : 'variety';
    const grade = opportunity(r.score, rng ? rng('opportunity-grade') : .5);
    const b = { q: r.q, topic: r.topic, concept: r.concept, title: r.productionTitle || types[kind].name, kind, axes: a, grade, program: r.program || 'regular',
      score: r.score, reaction: r.reaction, offer: 'new', echoes: [],
      // These budgets belong to one recording. Repeated publicity never creates an unlimited multiplier.
      fanCap: Math.max(0, Math.round(r.fans * .2)), cashCap: Math.max(0, Math.round(r.income * .12)) };
    c.broadcasts.push(b);
    if (b.program !== 'regular' && c.programs[b.program]) c.programs[b.program].uses++;
    return b;
  }
  function settleEchoes(s, rng) {
    const c = ensure(s), arrivals = [];
    for (const b of c.broadcasts) {
      const age = s.q - b.q;
      if (age < 1 || age > 2 || b.echoes.some(e => e.q === s.q)) continue;
      const usedFans = b.echoes.reduce((n, e) => n + e.fans, 0), usedCash = b.echoes.reduce((n, e) => n + e.cash, 0);
      const edited = b.editedQ && b.editedQ <= s.q;
      const reach = .7 + rng(`echo-${b.q}`) * .3 + (s.staff.editor ? .15 : 0) + (edited ? .4 : 0);
      const fans = Math.min(b.fanCap - usedFans, Math.round(b.fanCap * .5 * reach));
      const cash = Math.min(b.cashCap - usedCash, Math.round(b.cashCap * .5 * reach));
      const reason = b.kind === 'music' ? '노래 클립을 타고 새 청취자가 찾아왔다' : b.kind === 'variety' ? '리액션 클립이 뒤늦게 퍼졌다' : '지난 방송을 추천한 팬들이 친구와 돌아왔다';
      const echo = { q: s.q, sourceQ: b.q, title: b.title, fans, cash, reason: edited ? reason + ' (다시 편집한 클립)' : reason, editor: !!s.staff.editor, edited: !!edited };
      b.echoes.push(echo); s.fans += fans; s.cash += cash;
      if (fans || cash) arrivals.push(echo);
    }
    return arrivals;
  }
  function focus(s, topic) {
    const f = view(s).focus;
    return f && s.q <= f.until && (!f.topic || f.topic === topic) ? f : null;
  }
  function followup(s) {
    const c = view(s), lead = c.lead;
    if (!lead || lead.q !== s.q || s.phase !== 'plan' || s.ending) return null;
    const b = c.broadcasts.find(x => x.q === lead.sourceQ), t = types[lead.kind];
    if (!b) return null;
    const origin = `${b.q}분기 ‘${b.title}’에서 이어진 이야기`;
    const grade = b.grade || 1, scope = grades[grade];
    const fee = 10 * (s.tier + 1) * grade;
    if (lead.stage === 'invite') {
      const title = { variety: '그 장면, 같이 이어 가 볼까요?', music: '노래 한 곡에서 시작된 연락', community: '채팅창 밖에서도 이어진 인사' }[lead.kind];
      const body = {
        variety: `루미의 ${b.reaction ? '게임 실패 리액션' : '방송 중 표정과 입담'}을 본 합방 채널에서 연락이 왔다. 루미가 메시지를 읽다가 웃는다. “또 놀림받는 건 조금 무섭지만… 그날 재밌긴 했죠. 어디까지 할지 같이 정해요.”`,
        music: '지난 노래 방송을 들은 작은 음악 채널에서 공동 무대를 제안했다. 루미가 녹음 파일을 다시 튼다. “큰 무대보다, 제 노래를 끝까지 들어 준 게 좋아요. 한 번 해 볼까요?”',
        community: '지난 방송을 추천한 팬들이 작은 사연 모임을 제안했다. 루미는 오래된 닉네임을 가리킨다. “그날 퇴근했다던 분도 있네요. 우리, 너무 큰 행사 말고 편하게 만날 수 없을까요?”'
      }[lead.kind];
      const invitation = grade === 3 ? {
        variety: '리액션 클립을 본 공개 방송 행사에서 게임 코너 출연을 제안했다. 객석 앞에서 다시 도전하는 자리다. 루미가 무대 사진을 들여다본다. “많이 웃어 주면 좋겠지만, 제가 싫다고 할 때는 멈춰 줄 수 있겠죠?”',
        music: '음악 행사 제작진이 루미의 노래 클립을 듣고 초청 무대를 제안했다. 집의 마이크를 벗어나 관객 앞에서 부르는 기회다. “무섭긴 한데… 제 노래를 듣고 불러 준 거잖아요. 같이 준비해 줘요.”',
        community: '방송의 사연 코너가 알려져 공개 라디오 행사에서 연락이 왔다. 익숙한 닉네임 너머로 처음 보는 관객도 만나는 자리다. 루미가 행사장을 검색한다. “무대가 커져도 한 사람의 이야기를 끝까지 들을 수 있을까요?”'
      }[lead.kind] : grade === 2 ? `다른 채널과 함께 정규 코너를 만드는 제안이다. ${body}` : body;
      return { ...lead, title, body: `${scope} 제안이다. ${invitation}`, origin, grade, scope, art: grade === 3 ? 'offer_spotlight' : t.art, options: [
        { id: 'accept', label: '범위를 정하고 함께 준비하자', effect: `${fee}만원 · 건강 -3 · 신뢰 +2 · 다음 분기에 후일담`, cost: fee },
        { id: 'decline', label: '이번에는 쉬어 가자', effect: '비용 없음 · 신뢰 +1 · 이 제안 마무리', cost: 0 }
      ] };
    }
    const stories = {
      variety: { title: '웃기는 루미, 잘하는 루미', body: '합방 뒤, 루미가 자신의 절규 장면을 한 번 더 돌려 본다. “이게 저를 좋아하는 걸까요, 못하는 저를 좋아하는 걸까요?” 매니저가 다음 기획서의 제목을 지운다. 두 가지 길 모두 방송이 될 수 있다.', options: [
        { id: 'embrace', label: '루미가 즐거운 만큼만, 웃음을 이어 가자', effect: '신뢰 +4 · 이번·다음 분기 중 게임 방송 1회 팬 +12%', delta: { trust: 4 }, boost: { topic: 'game', bonus: .12, name: '함께 정한 리액션 합방' } },
        { id: 'practice', label: '다음에는 실력으로 놀라게 해 보자', effect: '게임 +5 · 신뢰 +3', delta: { game: 5, trust: 3 } }
      ] },
      music: { title: '무대가 끝나고 남은 목소리', body: '작은 무대는 끝났지만 루미는 마이크를 정리하지 않는다. “남의 노래만 부르니까, 제 얘기도 한 줄쯤 넣어 보고 싶어요.” 메모장에는 가사 두 줄과 지워진 제목이 남아 있다.', options: [
        { id: 'demo', label: '짧은 데모부터 같이 만들어 보자', effect: '노래 +4 · 신뢰 +3 · 이번·다음 분기 중 노래 방송 1회 팬 +12%', delta: { song: 4, trust: 3 }, boost: { topic: 'song', bonus: .12, name: '처음 만든 두 줄의 노래' } },
        { id: 'slow', label: '완성보다 편하게 부르는 시간이 먼저야', effect: '건강 +7 · 신뢰 +5', delta: { health: 7, trust: 5 } }
      ] },
      community: { title: '작은 방을 계속 열어 둘까', body: '모임이 끝난 뒤 루미가 의자를 세어 본다. 많이 모이지는 않았다. 그래도 모두의 이름을 기억한다. “이런 밤을 계속하면 작게 남을까요?” 다음 일정표에는 아직 빈칸이 있다.', options: [
        { id: 'home', label: '돌아올 수 있는 밤을 남겨 두자', effect: '신뢰 +5 · 이번·다음 분기 중 잡담 방송 1회 팬 +10%', delta: { trust: 5 }, boost: { topic: 'talk', bonus: .1, name: '돌아올 곳이 된 잡담방' } },
        { id: 'explore', label: '이 사람들과 새로운 것도 해 보자', effect: '방송감 +4 · 신뢰 +3 · 이번·다음 분기 중 방송 1회 팬 +8%', delta: { talk: 4, trust: 3 }, boost: { topic: '', bonus: .08, name: '단골들과의 새로운 도전' } }
      ] }
    };
    const chosen = stories[lead.kind];
    const aftermath = grade === 3 ? {
      variety: '무대 뒤에서 루미가 객석의 웃음소리를 담은 영상을 멈춘다. “놀라는 장면이 제일 많이 퍼졌네요. 다음에는 멋있게 깨는 모습도 보여 주고 싶어요.” 웃음을 이어 갈지, 재도전을 준비할지 다음 프로그램을 함께 정한다.',
      music: '초청 무대가 끝나고 루미가 접어 둔 악보를 편다. “제 목소리로 이렇게 큰 공간을 채웠네요. 다음에는 제 이야기도 노래에 넣고 싶어요.” 첫 데모를 만들지, 편안한 라이브를 이어 갈지 메모장에 적는다.',
      community: '공개 라디오를 마친 루미에게 처음 보는 사람들의 사연이 도착했다. “아는 이름도, 모르는 이름도 있네요. 앞으로 어떤 시간을 같이 만들면 좋을까요?” 돌아올 자리를 지킬지, 단골들과 새로운 도전을 할지 이야기한다.'
    }[lead.kind] : chosen.body;
    return { ...lead, ...chosen, body: `${scope}을 마친 뒤. ${aftermath}`, origin, grade, scope, art: grade === 3 ? 'offer_spotlight' : programs[lead.kind].art,
      options: chosen.options.map(o => { const next = { ...programs[lead.kind], ...programPaths[lead.kind][o.id] }; return { ...o, effect: `${o.effect} · 대표 프로그램 ‘${next.name}’ 개방 · ${axisNames[next.axis]} 중심` }; }) };
  }
  function respond(s, id) {
    const e = followup(s), option = e && e.options.find(o => o.id === id);
    if (!option) throw new Error('지금 답할 수 있는 후일담 선택이 아닙니다');
    if (option.cost > 0 && s.cash < option.cost) throw new Error('함께 준비할 자금이 부족합니다');
    const c = ensure(s), b = c.broadcasts.find(x => x.q === e.sourceQ);
    if (e.stage === 'invite') {
      b.offer = id === 'accept' ? 'accepted' : 'declined';
      if (id === 'accept') {
        s.cash -= option.cost; s.health = clamp(s.health - 3); s.trust = clamp(s.trust + 2);
        c.threads.push({ sourceQ: e.sourceQ, kind: e.kind, acceptedQ: s.q, dueQ: s.q + 1, status: 'waiting', title: e.title });
      } else s.trust = clamp(s.trust + 1);
    } else {
      const thread = c.threads.find(t => t.sourceQ === e.sourceQ && t.status === 'waiting');
      if (!thread) throw new Error('이미 마무리한 이야기입니다');
      for (const [k, v] of Object.entries(option.delta)) {
        if (k in s.skills) s.skills[k] = clamp(s.skills[k] + v);
        else s[k] = clamp(s[k] + v);
      }
      if (option.boost) c.focus = { ...option.boost, sourceQ: e.sourceQ, until: s.q + 1 };
      thread.status = 'complete'; thread.choice = option.label; thread.title = e.title; thread.finishedQ = s.q;
      const old = c.programs[e.kind];
      c.programs[e.kind] = { q: old ? old.q : s.q, level: Math.max(old ? old.level : 1, e.grade), uses: old ? old.uses : 0, path: option.id };
    }
    c.lead = null;
    return option.label;
  }
  function defer(s) {
    const c = ensure(s);
    if (!c.lead) return;
    const b = c.broadcasts.find(x => x.q === c.lead.sourceQ);
    if (b && c.lead.stage === 'invite') b.offer = 'passed';
    const thread = c.threads.find(t => t.sourceQ === c.lead.sourceQ && t.status === 'waiting');
    if (thread && c.lead.stage === 'return') thread.status = 'passed';
    c.lead = null;
  }
  function advance(s, rng) {
    const c = ensure(s);
    defer(s);
    if (c.focus && c.focus.until < s.q) c.focus = null;
    const waiting = c.threads.find(t => t.status === 'waiting' && t.dueQ <= s.q);
    if (waiting) {
      c.lead = { kind: waiting.kind, stage: 'return', sourceQ: waiting.sourceQ, q: s.q };
      return;
    }
    if (s.q < c.nextOfferQ || s.q >= 40) return;
    for (const b of [...c.broadcasts].reverse()) {
      const age = s.q - b.q;
      if (b.offer !== 'new' || age < 1 || age > 2) continue;
      const strength = b.kind === 'music' ? b.axes.skill : b.kind === 'variety' ? b.axes.show : b.axes.comfort;
      if (strength < 40) continue;
      const chance = clamp(.2 + strength * .005 + Math.max(0, b.score - 20) * .008 + (s.staff.editor ? .1 : 0), .2, .85);
      if (rng(`offer-${b.q}`) >= chance) continue;
      b.offer = 'offered'; c.nextOfferQ = s.q + 3;
      c.lead = { kind: b.kind, stage: 'invite', sourceQ: b.q, q: s.q };
      return;
    }
  }
  function valid(c) {
    if (c === undefined) return true; // Version 4 saves acquire empty career state, never retroactive rewards.
    const q = n => Number.isInteger(n) && n >= 1 && n <= 41;
    const positive = n => Number.isFinite(n) && n >= 0;
    if (!c || !Array.isArray(c.broadcasts) || c.broadcasts.length > 40 || !Array.isArray(c.threads) || c.threads.length > 40 || !q(c.nextOfferQ) && c.nextOfferQ !== 42) return false;
    const seen = new Set();
    if (!c.broadcasts.every(b => {
      if (!b || !q(b.q) || seen.has(b.q) || !types[b.kind] || !['talk', 'game', 'song'].includes(b.topic) || typeof b.title !== 'string' || typeof b.concept !== 'string' || !b.axes || !Object.keys(axisNames).every(k => positive(b.axes[k]) && b.axes[k] <= 100) || !positive(b.score) || (b.grade !== undefined && !grades[b.grade]) || !['new', 'offered', 'accepted', 'declined', 'passed'].includes(b.offer) || !positive(b.fanCap) || !positive(b.cashCap) || !Array.isArray(b.echoes) || b.echoes.length > 2) return false;
      seen.add(b.q);
      if (b.editedQ !== undefined && (!q(b.editedQ) || b.editedQ <= b.q || b.editedQ > b.q + 2)) return false;
      return new Set(b.echoes.map(e => e && e.q)).size === b.echoes.length && b.echoes.every(e => e && q(e.q) && e.q > b.q && e.q <= b.q + 2 && e.sourceQ === b.q && positive(e.fans) && positive(e.cash)) && b.echoes.reduce((n, e) => n + e.fans, 0) <= b.fanCap && b.echoes.reduce((n, e) => n + e.cash, 0) <= b.cashCap;
    })) return false;
    if (!c.threads.every(t => t && seen.has(t.sourceQ) && types[t.kind] && q(t.acceptedQ) && q(t.dueQ) && t.dueQ === t.acceptedQ + 1 && ['waiting', 'complete', 'passed'].includes(t.status) && typeof t.title === 'string')) return false;
    if (c.lead !== null && (!c.lead || !seen.has(c.lead.sourceQ) || !types[c.lead.kind] || !['invite', 'return'].includes(c.lead.stage) || !q(c.lead.q))) return false;
    if (c.programs !== undefined && (!c.programs || typeof c.programs !== 'object' || Array.isArray(c.programs) || !Object.entries(c.programs).every(([id, p]) => programs[id] && p && q(p.q) && Number.isInteger(p.level) && grades[p.level] && Number.isInteger(p.uses) && p.uses >= 0 && p.uses <= 40 && (p.path === undefined || Object.hasOwn(programPaths[id], p.path))))) return false;
    return c.focus === null || !!(c.focus && seen.has(c.focus.sourceQ) && q(c.focus.until) && ['', 'talk', 'game', 'song'].includes(c.focus.topic) && positive(c.focus.bonus) && c.focus.bonus <= .12 && typeof c.focus.name === 'string');
  }
  return { create, view, ensure, axes, axisNames, reviews, reviewRange, opportunity, grades, programs, program, record, settleEchoes, focus, followup, respond, defer, advance, valid, types };
});
