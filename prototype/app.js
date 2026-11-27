(function () {
  'use strict';
  const params = new URLSearchParams(location.search), CLASSIC = params.get('flow') === 'v7';
  const G = window.VT, KEY = CLASSIC ? 'vtuber-core-lab-v7-comparison' : 'vtuber-core-lab-v5', MODE = 'slots', MAXQ = G.MAX_Q;
  // Art is optional: without assets/art/art.js the game still runs as text.
  const A = window.VT_ART || { rooms: [], roomAlt: [], roomNew: [], events: {}, alt: {}, icons: {} };
  const $ = id => document.getElementById(id);
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = v => Math.round(v).toLocaleString('ko-KR');
  const signed = v => `${v >= 0 ? '+' : ''}${Math.round(v * 10) / 10}`;
  // Test hook: ?test=1 freezes the broadcast clock so automated checks can step it with window.__vtTest.advance(ms).
  const TEST = params.get('test') === '1';
  const skillName = { talk: '방송감', game: '게임', song: '노래' };
  const defaults = () => ({ slots: ['stream', 'stream', 'train', 'rest'], topic: 'game', concept: 'cozy', program: 'regular', effort: 'next', ambitious: false, leap: false });
  const validDraft = d => !!d && Array.isArray(d.slots) && d.slots.length === 4 && d.slots.every(k => !!G.actions[k]) && !!G.topics[d.topic] && typeof d.ambitious === 'boolean';
  // storySeen: chapters already shown; endingsSeen: ending collection kept across runs.
  // panel: which in-game menu is open over the stage ('' = none). storyStep: line index of the open story chapter.
  let panel = '', storyStep = 0;
  let productionTimer = 0;
  let run = null, draft = null, feedback = {}, archive = [], storySeen = [], endingsSeen = [], timer = performance.now(), reveal = false, upgraded = false, loadNote = '', live = null;
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (data && data.version === G.VERSION) {
      if (G.validSave(data.run) && data.run.mode === MODE) run = data.run;
      if (validDraft(data.draft)) draft = data.draft;
      if (data.feedback && typeof data.feedback === 'object') feedback = data.feedback;
      if (Array.isArray(data.archive)) archive = data.archive.slice(-30);
      if (Array.isArray(data.storySeen)) storySeen = data.storySeen;
      if (Array.isArray(data.endingsSeen)) endingsSeen = data.endingsSeen.filter(id => G.endings.some(e => e.id === id));
      if (data.combos && typeof data.combos === 'object') window.__vtCombos = data.combos;
    }
  } catch (_) { loadNote = '저장된 기록을 읽지 못해 처음부터 시작합니다.'; }
  run ||= G.create(MODE); draft ||= defaults(); draft.leap = !!draft.leap; if (!G.concepts[draft.concept]) draft.concept = 'cozy';
  if (!['next', 'archive'].includes(draft.effort) || !G.archiveTarget(run)) draft.effort = 'next';
  try { G.programInfo(run, draft.topic, draft.program || 'regular'); } catch (_) { draft.program = 'regular'; }
  // Combos found in any run: the hidden topic × concept fit, revealed once broadcast (kept across runs like the ending collection).
  let combos = window.__vtCombos || {};
  if (run.phase === 'live') loadNote = '새로고침해서 방송 채팅을 처음부터 다시 보여줍니다. 결산은 한 번만 적용됩니다.';

  function notice(text) { $('notice').textContent = text; }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ version: G.VERSION, run, draft, feedback, archive, storySeen, endingsSeen, combos })); }
    catch (_) { notice('이 브라우저에서는 자동 저장이 되지 않습니다. 창을 닫기 전에 ‘플레이 기록 저장’으로 내려받아 주세요.'); }
  }
  const plan = () => G.planFrom(MODE, draft);
  const planText = p => Object.keys(G.actions).filter(k => p[k] > 0).map(k => `${G.actions[k].name} ${Math.round(p[k] * 25)}%`).join(' · ');
  const bestRank = s => Math.min(G.chartRank(s.fans), ...s.history.map(r => r.rank));
  const bestScore = s => Math.max(0, ...s.history.map(r => r.score || 0));
  const criticIcons = ['critic-chat', 'critic-clip', 'critic-community', 'critic-industry'];
  const icon = key => A.icons[key] ? `<img class="ico" src="${A.icons[key]}" alt="" aria-hidden="true">` : '';
  const picture = (key, cls) => A.events[key] ? `<figure class="${cls}"><img src="${A.events[key]}" alt="${esc(A.alt[key] || '')}"></figure>` : '';
  const slotsOf = p => Object.entries(p).flatMap(([a, n]) => Array(n).fill(a));
  // A policy lights up whenever the four slots add up to its mix, whether it was clicked or built by hand.
  const presetOf = slots => { const p = G.planFrom(MODE, { slots }); return Object.keys(G.policies).find(k => Object.keys(G.actions).every(a => G.policies[k].plan[a] === p[a])) || ''; };
  // Which sprite row fits the moment. Presentation only; the rules never read it.
  function mood(s) {
    if (s.phase === 'live') return 'talk';
    const r = s.phase === 'result' ? s.last : null;
    if (!r) return s.health < 30 ? 'hurt' : 'idle';
    if (['burnout', 'bankrupt', 'independent'].includes(s.ending && s.ending.cause) || r.notes.some(n => n.includes('건강이 바닥나'))) return 'hurt';
    if (!r.plan.stream) return 'idle';
    if (r.viral || r.legend || r.reaction || (r.leap && r.leap.ok) || (r.success && r.score >= 28)) return 'celebrate';
    return r.success ? 'talk' : 'hurt';
  }
  function lumiStyle(m) {
    const sp = A.sprite, row = sp && sp.rows[m], rows = sp ? Object.keys(sp.rows).length : 1;
    if (!row) return '';
    return `background-image:url('${sp.src}');background-size:${sp.columns * 100}% ${rows * 100}%;background-position-y:${rows > 1 ? row.row / (rows - 1) * 100 : 0}%;--dur:${(row.frames / row.fps).toFixed(2)}s;--steps:${row.frames};--iter:${row.loop ? 'infinite' : m === 'celebrate' ? 3 : 1}`;
  }
  // Lumi's room grows with the equipment level, Kairosoft style.
  function studio(s) {
    const level = Math.min(s.gear, A.rooms.length - 1), tierRoom = s.tier >= 2 && A.tierRooms && A.tierRooms[s.tier - 2];
    const room = tierRoom || A.rooms[level];
    const m = mood(s), style = lumiStyle(m), r = s.phase === 'result' ? s.last : null;
    const lumi = style ? `<div class="lumi" id="lumi" data-mood="${m}" aria-hidden="true" style="${style}"></div>` : '';
    const gain = (text, v, cls, delay) => `<span class="gain ${cls}${v < 0 ? ' neg' : ''}" style="--d:${delay}s" aria-hidden="true">${text}</span>`;
    const gains = r && reveal ? gain(`팬 ${signed(r.deltaFans)}`, r.deltaFans, 'fans', .3) + gain(`${signed(r.deltaCash)}만원`, r.deltaCash, 'money', .7) : '';
    const onAir = s.phase === 'live';
    const extra = s.phase === 'live' ? `<span class="viewers" id="viewers">시청자 ${fmt(s.pending.live.viewers)}명</span><div class="say" id="lumi-say" role="status" aria-live="polite"></div>` : '';
    const alt = tierRoom ? (A.tierRoomAlt || [])[s.tier - 2] || '' : A.roomAlt[level] || '';
    return `${room ? `<img class="room" src="${room}" alt="${esc(alt)}">` : ''}${lumi}${onAir ? '<span class="on-air">ON AIR</span>' : ''}${extra}${gains}<span class="room-tag">${G.tiers[s.tier].name} · 장비 ${level}단계</span>`;
  }

  const bar = (label, value, cls = '') => { const v = Math.round(value); return `<div class="hud-bar ${cls}${value < 30 ? ' low' : ''}" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}"><span>${label}</span><i style="width:${v}%"></i><b>${v}</b></div>`; };
  // Top HUD: always visible over the stage, like a management sim status bar.
  function hud(s) {
    const t = G.tiers[s.tier], m = G.market(s);
    return `<header class="hud"><div class="hud-who">${A.face ? `<img class="face-icon" src="${A.face}" alt="" width="40" height="40">` : ''}<div><strong>루미</strong><small>${s.tier + 1}. ${esc(t.name)}${s.exposed ? ' · 정체 공개' : ''}</small></div></div>
      <div class="hud-money"><span>자금</span><b>${fmt(s.cash)}</b><small>만원</small></div><div class="hud-money"><span>팬</span><b>${fmt(s.fans)}</b><small>명</small></div><div class="hud-money"><span>차트</span><b>${G.chartRank(s.fans)}</b><small>위</small></div>
      <div class="hud-bars">${bar('건강', s.health)}${bar('신뢰', s.trust, 'trust')}</div>
      <div class="hud-skills">${Object.keys(G.topics).map(k => `<span>${skillName[k]} <b>${Math.round(s.skills[k])}</b></span>`).join('')}<span>매력 <b>${Math.round(s.charm)}</b></span></div>
      <div class="hud-time"><small>${Math.ceil(s.q / 4)}년차 ${(s.q - 1) % 4 + 1}분기</small><b aria-label="${MAXQ}분기 중 ${s.q}분기">${String(s.q).padStart(2, '0')}<small>/${MAXQ}</small></b></div></header>
      <div class="ticker" aria-hidden="true"><span>${icon(m.key)}이번 분기 유행: <b>${m.name}</b> (팬 +25%)</span>${s.goal ? `<span>🎯 올해 목표: <b>${esc(G.goals[s.goal.id].name)}</b> · ${esc(G.goals[s.goal.id].desc(s))}</span>` : ''}${s.debt ? `<span class="warn">⚠ 적자 ${s.debt}/3분기</span>` : ''}${s.conflicts ? `<span class="warn">갈등 ${s.conflicts}회</span>` : ''}</div>`;
  }
  const quoteOf = s => s.ending ? '우리의 첫 챕터, 여기까지네요.' : s.phase === 'live' ? '매니저님, 오늘도 같이 만들어봐요!' : s.health < 30 ? '다음 방송 전에 조금만 쉬면 안 될까요?' : s.trust < 35 ? '제 이야기도 듣고 있는 거죠?' : s.flags.songPromise && s.q === 6 ? '이번 분기엔 노래하기로 했죠?' : s.skills.song >= 50 ? '이번엔 제 목소리로 기억되고 싶어요.' : '작아도, 우리 방송답게 해봐요.';
  // Bottom dock: in-game menu buttons. Menus open as windows over the stage, never below the page.
  function dock(s) {
    const can = s.phase === 'plan' && !s.ending, liveLocked = ['live', 'production'].includes(s.phase);
    const b = (id, label, ico, dis) => `<button class="dock-btn${panel === id ? ' on' : ''}" data-panel="${id}" ${dis ? 'disabled' : ''}>${ico}<span>${label}</span></button>`;
    return `<nav class="dock" aria-label="게임 메뉴">${b('team', `스태프 ${Object.keys(s.staff).length}/${G.tiers[s.tier].slots}`, '👥', !can)}${b('shop', '장비·프로젝트', '🛠', !can)}${b('log', '기록', '📒', liveLocked)}${b('dex', `엔딩 도감 ${endingsSeen.length}/${G.endings.length}`, '📚', liveLocked)}${b('help', '도움말', '❔', liveLocked)}</nav>`;
  }
  // The stage: Lumi's room fills the screen; every phase opens as a window on top of it.
  function stage(s, body, cls) {
    const chat = s.phase === 'live' ? liveChat(s) + liveMini(s) : '';
    const making = cls === 'plan' && !G.goalOpen(s) ? productionBoard(s) : s.phase === 'result' && !s.ending ? resultPoster(s) : '';
    return `<div class="stage${s.phase === 'live' ? ' is-live' : ''}${s.phase === 'production' ? ' is-producing' : ''}">${studio(s)}${making}${chat}<div class="quote" aria-hidden="true">“${esc(quoteOf(s))}”</div>${body ? `<section class="win ${cls || ''}" aria-labelledby="phase-title">${body}</section>` : ''}${panel ? `<section class="win menu${panel === 'career' ? ' career-menu' : ''}" aria-label="메뉴">${menuView(s)}</section>` : ''}</div>`;
  }

  function productionBoard(s) {
    const p = plan(), info = G.production(s, p, draft.topic, draft.ambitious, draft.concept, draft.program || 'regular');
    const unlocked = G.careerView(s).programs || {};
    const program = info.pre.program;
    const target = G.archiveTarget(s);
    const effort = !CLASSIC && target && p.stream ? `<fieldset class="editing-effort"><legend>편집 시간을 어디에 쓸까</legend><button data-effort="next" aria-pressed="${draft.effort !== 'archive'}">이번 방송 준비</button><button data-effort="archive" aria-pressed="${draft.effort === 'archive'}">${target.q}분기 클립 편집</button><small>${draft.effort === 'archive' ? '이번 볼거리 기여 1회를 양보하고 지난 클립 반응을 높여요.' : '이번 방송의 볼거리를 더 다듬어요.'}</small></fieldset>` : '';
    const choices = Object.entries(G.programs).filter(([, x]) => x.topic === draft.topic).map(([id, x]) => `<option value="${id}" ${program.id === id ? 'selected' : ''} ${unlocked[id] ? '' : 'disabled'}>${esc(unlocked[id] ? G.programInfo(s, draft.topic, id).name : x.name)}${unlocked[id] ? '' : ' · 후일담으로 개방'}</option>`).join('');
    const axes = Object.entries(G.axisNames).map(([id, label]) => `<div class="prep-axis"><span>${label}</span><meter data-production-axis="${id}" min="0" max="100" value="${info.axes[id]}"></meter><b>${info.axes[id]}</b></div>`).join('');
    return `<aside class="production-board" aria-label="이번 방송 제작 보드"><div class="production-photo" data-scene="${info.art}">${picture(info.art, 'production-art')}<span class="production-status">${p.stream ? '방송 준비 중' : 'OFF DAY'}</span></div><div class="production-copy"><small class="label">ON THE DESK · 나의 방송 기획</small><h2>${esc(info.title)}</h2><ol class="production-steps"><li class="done">기획</li><li class="active">준비</li><li>ON AIR</li><li>클립</li></ol><label class="program-label" for="program">방송 프로그램<select id="program"><option value="regular" ${program.id === 'regular' ? 'selected' : ''}>자유 기획 · 기본 비용</option>${choices}</select></label><p class="program-effect">${program.id === 'regular' ? '후일담을 마치면 우리만의 대표 프로그램이 열려요.' : `제작비 +${program.cost}만원 · 평가 ${G.axisNames[program.axis]} +${program.bonus} · 제작 경험 ${program.uses}회 (최대 +8)`}</p><div class="prep-axes" aria-label="준비한 방송의 예상 강점">${axes}</div>${effort}<p class="production-note">계획 확정 뒤 실제 준비 과정에서 달라져요.</p><div class="production-recipe">${Object.entries(p).filter(([, n]) => n).map(([k, n]) => `<span>${G.actions[k].name} ${n}칸</span>`).join('')}</div></div></aside>`;
  }
  function clipArt(r) { return r.viral || r.reaction || r.score >= 30 ? 'clip_breakout' : r.score < 22 ? 'clip_quiet' : `prep_${r.topic}`; }
  function workDelta(delta) {
    return Object.entries(delta).filter(([, v]) => v).map(([k, v]) => `${G.workNames[k]} ${signed(v)}`).join(' · ');
  }
  function productionView(s) {
    const w = s.pending.workshop, waiting = w.step === 3 && !w.choice, last = w.log[w.log.length - 1];
    const title = waiting ? '남은 준비 시간, 어디에 쓸까요?' : w.step === 6 ? '이제 우리 방송을 만나러 가요' : w.choice ? '정한 방향대로 마무리하는 중' : '한 편의 방송을 만드는 중';
    const line = waiting ? w.issues >= 3 ? '“할 게 남았네요… 다 해내려다 방송 전에 지치는 건 아닐까요?”' : w.axes.skill < w.axes.show ? '“재밌을 것 같긴 한데, 이 부분에서 자꾸 막혀요.”' : '“연습은 했는데… 사람들이 어느 장면을 좋아할까요?”' : w.choice ? G.workChoices[w.choice].line : '“매니저님, 지금 이 장면은 어때요?”';
    const meters = Object.entries(w.axes).map(([k, v]) => `<div class="work-meter ${k}"><span>${G.workNames[k]}</span><meter min="0" max="100" value="${v}" aria-label="${G.workNames[k]}"></meter><b>${v}</b></div>`).join('');
    const choices = waiting ? `<div class="work-choices">${Object.entries(G.workChoices).filter(([id]) => id !== 'delegate').map(([id, c]) => `<button class="choice" data-work-choice="${id}" ${c.cost > 0 && s.cash < c.cost ? 'disabled' : ''}><strong>${c.name}</strong><small>${c.effect}</small></button>`).join('')}</div>` : `<div class="work-current"><span class="work-pulse"></span><b>${esc(last ? last.source : '루미와 함께 준비해요')}</b><p>${esc(last ? last.text : '능력과 일정에 따라 이번 방송에 작은 기여가 쌓입니다.')}</p>${last ? `<em>${esc(workDelta(last.delta))}</em>` : ''}</div>`;
    return `<div class="work-scene">${picture(w.art, 'work-art')}<span class="work-scene-tag">REHEARSAL · ${G.topics[s.pending.topic]}</span><div class="work-paper"><span>이번 방송의 큐시트</span><b>${esc(w.title)}</b><div class="work-stickers">${w.log.filter(e => ['idea', 'repair', 'choice'].includes(e.kind)).map(e => `<i>${e.kind === 'idea' ? '✦' : e.kind === 'repair' ? '✓' : '↗'} ${esc(e.source)}</i>`).join('')}</div></div><blockquote>${esc(line)}</blockquote></div><div class="work-desk">${head('MAKING OUR SHOW · 이번 방송만의 제작 상태', title)}<div class="work-progress"><span>${w.step < 3 ? '리허설' : waiting ? '중간 점검' : '방송 직전'}</span><progress max="6" value="${w.step}" aria-label="방송 준비 진행"></progress><b>${Math.round(w.step / 6 * 100)}%</b></div><div class="work-meters">${meters}<div class="work-issues${w.issues >= 3 ? ' warning' : ''}"><span>미해결 문제</span><b>${w.issues}개</b><small>남으면 방송 안정성과 편안함에 부담</small></div></div>${choices}<div class="work-log" aria-live="polite">${w.log.slice(-3).reverse().map(e => `<p class="${e.kind}"><b>${esc(e.source)}</b><span>${esc(e.text)}</span><small>${esc(workDelta(e.delta))}</small></p>`).join('')}</div><div class="work-foot"><span>${w.effort === 'archive' ? `${w.archiveQ}분기 클립 편집에 시간 배분 중` : '영구 능력치는 그대로 · 이번 방송에만 쌓여요'}</span><button id="work-delegate" class="quiet">${w.choice ? '마무리 맡기고 방송 →' : '계획대로 맡기고 방송 →'}</button></div></div>`;
  }
  function advanceProduction() {
    if (run.phase !== 'production') return;
    const w = run.pending.workshop;
    if (w.step === 3 && !w.choice) return;
    act(w.step === 6 ? G.launchProduction : G.productionTick, '');
  }
  function scheduleProduction() {
    const w = run.pending.workshop;
    if (w.step === 3 && !w.choice || TEST || document.hidden) return;
    productionTimer = setTimeout(() => { if (!$('modal').open && !document.hidden) advanceProduction(); else scheduleProduction(); }, 650);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && run.phase === 'production') { clearTimeout(productionTimer); scheduleProduction(); } });
  function resultPoster(s) {
    const r = s.last, art = r.plan.stream ? clipArt(r) : 'clip_quiet';
    const lines = r.plan.stream ? (r.reaction ? ['“못 깼는데… 왜 다들 좋아해요?”', '“이 장면, 다음에는 같이 봐요.”'] : r.score >= 30 || r.viral ? ['“이 방송은 오래 기억할 것 같아요.”', '“우리 준비가 전해졌나 봐요.”'] : ['“오늘 남은 한 사람의 인사도 기억할래요.”', '“다음에는 어떤 방송을 해 볼까요?”']) : ['“쉬는 동안에도 지난 방송을 찾아주는군요.”'];
    const line = lines[Math.floor(G.roll(s.seed, s.q, 'presentation-line') * lines.length)];
    return `<aside class="production-board result-poster" aria-label="완성된 방송 클립"><div class="production-photo" data-scene="${art}">${picture(art, 'production-art')}<span class="production-status">${r.plan.stream ? 'BROADCAST COMPLETE' : 'RECHARGING'}</span></div><div class="production-copy"><small class="label">${r.plan.stream ? 'OUR ARCHIVE · 오늘 남긴 한 장면' : 'NEXT ON AIR'}</small><h2>${esc(r.productionTitle || r.broadcastTitle || '다음 방송을 준비하며')}</h2><p class="production-quote">${esc(line)}</p>${r.workshop ? `<div class="work-receipt"><b>이 장면을 만든 준비</b><span>${esc(G.workChoices[r.workshop.choice].name)}</span><small>${r.workshop.log.filter(e => ['idea', 'choice', 'repair'].includes(e.kind)).slice(-2).map(e => esc(e.source + ' · ' + workDelta(e.delta))).join('<br>')}${r.workshop.cueUsed ? '<br>준비한 애드리브 사용 · 볼거리 +4' : ''}</small></div>` : ''}${r.opportunityGrade ? `<span class="opportunity-badge">${G.opportunityNames[r.opportunityGrade]} 후보</span><p class="production-note">이번 평가는 이런 규모의 연락으로 이어질 수 있어요. 제안 발생은 별도입니다.</p>` : ''}${r.echoes && r.echoes.length ? `<p class="production-echo">지난 ${r.echoes.map(e => e.sourceQ).join('·')}분기 방송도 반응이 이어지고 있어요.</p>` : ''}<button class="mini-btn" data-panel="career">방송 실적과 후일담 보기 →</button></div></aside>`;
  }
  const head = (tag, title) => `<div class="win-head"><span class="label">${tag}</span><h2 id="phase-title" tabindex="-1">${esc(title)}</h2></div>`;
  function allocationBar(p) { return `<div class="allocation" aria-hidden="true">${Object.keys(G.actions).map(k => `<span style="width:${p[k] * 25}%;background:${G.actions[k].color}"></span>`).join('')}</div>`; }
  // Planning fits two columns in one studio window: schedule on the left, costs and confirmation on the right.
  function careerPlan(s) {
    const c = G.careerView(s), e = G.followup(s), f = c.focus;
    if (!c.broadcasts.length) return '';
    const waiting = c.threads.find(t => t.status === 'waiting');
    const title = e ? e.title : f ? f.name : waiting ? '함께 준비한 기획, 다음 분기에 이야기가 이어져요' : '끝난 방송에도 다음 이야기가 남아요';
    const desc = e ? `${e.origin} · 답하지 않고 계획을 확정하면 이번에는 보류해요.` : f ? `Q${f.sourceQ}의 후일담 · ${f.topic ? G.topics[f.topic] : '모든'} 방송 1회 팬 +${Math.round(f.bonus * 100)}% · Q${f.until}까지` : '방송 실적 · 최대 두 분기 동안 클립·입소문 반응';
    return `<aside class="career-strip${e ? ' has-story' : ''}" aria-label="지난 방송의 뒷이야기"><div><small>${e ? '새로운 후일담' : '방송은 끝나도'}</small><b>${esc(title)}</b><span>${esc(desc)}</span></div><button class="mini-btn" data-panel="career">${e ? '루미와 상의 →' : '방송 실적'}</button></aside>`;
  }
  function careerPanel(s) {
    const c = G.careerView(s), e = G.followup(s);
    const records = [...c.broadcasts].reverse().slice(0, 8).map(b => {
      const fans = b.echoes.reduce((n, x) => n + x.fans, 0), cash = b.echoes.reduce((n, x) => n + x.cash, 0);
      return `<li class="career-record">${picture(clipArt(b), 'career-thumb')}<div><b>Q${b.q} · ${esc(b.title)}</b><small>${G.topics[b.topic]} · ${esc(G.concepts[b.concept] || '')} · ${b.score}/40 · ${G.opportunityNames[b.grade || 1]}</small><span>${Object.entries(G.axisNames).map(([k, v]) => `${v} ${b.axes[k]}`).join(' · ')}</span><small>후속 반응: 팬 +${fans}명 · +${cash}만원${s.q > b.q + 2 ? ' · 반응 기간 종료' : ' · 공개 후 두 분기까지'}</small></div></li>`;
    }).join('');
    const threads = c.threads.filter(t => t.status === 'complete').slice(-3).reverse().map(t => `<li><b>${esc(t.title)}</b><small>Q${t.sourceQ} 방송 → Q${t.finishedQ} 대화 · ${esc(t.choice)}</small></li>`).join('');
    return `${e ? picture(e.art, 'scene') : ''}<div class="win-head"><span class="label">AFTER ON AIR · 지난 선택의 다음 장면</span><h3 tabindex="-1" id="career-title">${esc(e ? e.title : '방송이 남긴 것들')}</h3></div><div class="win-body">${e ? `<p class="career-origin">${esc(e.origin)}</p><p class="event-body">${esc(e.body)}</p><div class="choices">${e.options.map(o => `<button class="choice" data-followup="${o.id}" ${o.cost > 0 && o.cost > s.cash ? 'disabled' : ''}><strong>${esc(o.label)}</strong><small>${esc(o.effect)}</small></button>`).join('')}</div><p class="subtle">실적에서 시작된 이야기입니다. 방송 일정과 미니게임은 원래 흐름대로 이어져요.</p>` : '<p class="event-body">끝난 방송은 두 분기 동안 클립이나 입소문으로 돌아옵니다. 좋은 실적은 새로운 연락의 계기가 되지만, 제안이 항상 오는 것은 아니에요.</p>'}<details ${e ? '' : 'open'}><summary>방송 실적 ${c.broadcasts.length}개 · 최근 8개</summary><ul class="career-records">${records || '<li>첫 방송을 마치면 실적이 남습니다.</li>'}</ul></details>${threads ? `<h4>루미와 함께 정한 방향</h4><ul class="career-records">${threads}</ul>` : ''}</div>`;
  }
  function qualityAxes(r) {
    if (!r.axes) return '';
    return `<div class="quality-axes" aria-label="방송의 세 가지 강점">${Object.entries(G.axisNames).map(([k, label]) => `<div><span>${label}</span><meter min="0" max="100" value="${r.axes[k]}" aria-label="${label}"></meter><b>${r.axes[k]}</b></div>`).join('')}</div><p class="career-result"><b>${esc(r.broadcastTitle || '')}</b> · 방송 실적으로 남았어요.${run.ending ? ' 함께 쌓은 실적은 기록에서 돌아볼 수 있어요.' : ' 다음 두 분기 동안 후속 반응을 확인해 보세요.'}</p>`;
  }
  function editor(s) {
    const d = draft, trend = G.market(s).key, active = presetOf(d.slots);
    if (G.goalOpen(s)) return goalView(s);
    const topicRow = `<div class="topic-row" role="group" aria-label="방송 주제">${Object.entries(G.topics).map(([k, name]) => `<button id="topic-${k}" class="chip ${d.topic === k ? 'selected' : ''}" data-topic="${k}" aria-pressed="${d.topic === k}">${icon(k)}${name}${trend === k ? ' ↗' : ''}</button>`).join('')}</div>`;
    const presets = `<div class="policies">${Object.entries(G.policies).map(([k, p]) => `<button id="policy-${k}" class="policy ${active === k ? 'selected' : ''}" data-policy="${k}" aria-pressed="${active === k}"><span class="units" aria-hidden="true">${slotsOf(p.plan).map(icon).join('')}</span><b>${p.name}</b></button>`).join('')}</div>`;
    const slots = `<div class="slots">${d.slots.map((k, i) => `<label class="slot" for="slot-${i}"><span class="slot-top">${icon(k)}<span class="sr-only">일정 칸 ${i + 1}</span></span><select id="slot-${i}" data-slot="${i}">${Object.keys(G.actions).map(a => `<option value="${a}" ${a === k ? 'selected' : ''}>${G.actions[a].name}</option>`).join('')}</select></label>`).join('')}</div>`;
    const known = k => combos[d.topic + ':' + k];
    const conceptRow = `<div class="concept-row" role="group" aria-label="방송 콘셉트">${Object.entries(G.concepts).map(([k, name]) => `<button id="concept-${k}" class="chip small ${d.concept === k ? 'selected' : ''}" data-concept="${k}" aria-pressed="${d.concept === k}">${esc(name)}<span class="stars">${known(k) ? '★'.repeat(known(k)) : '?'}</span></button>`).join('')}</div>`;
    return `${head('PLAN · 이번 분기 계획', '우리의 다음 계획')}${careerPlan(s)}<div class="win-body plan-grid"><div><div class="section-label">주제</div>${topicRow}<div class="section-label">콘셉트 <small class="subtle">방송해 보면 궁합(★)이 밝혀져요</small></div>${conceptRow}<div class="section-label">운영 방침</div>${presets}<div class="section-label">네 칸 ${active ? '' : '<span class="badge">나만의 계획</span>'}</div>${slots}</div>
      <div><label class="ambitious"><input id="ambitious" type="checkbox" ${d.ambitious ? 'checked' : ''}><span>대형 기획에 도전<small>+8만원 · 성공 보상↑ · 성공 가능성↓</small></span></label>${leapBox(s)}<div id="preview"></div><button id="commit" class="primary">계획 확정 · 루미와 이야기하기 →</button></div></div>`;
  }
  function goalView(s) {
    const ids = G.yearGoals(s), year = Math.ceil(s.q / 4);
    return `${picture('newyear', 'scene')}${head(`NEW YEAR · ${year}년차`, '올해의 목표를 정하자')}<div class="win-body"><p class="event-body">새해 아침. 루미가 큰 종이를 펼친다. “올해는 뭘 목표로 할까요? 하나만 골라요. 연말에 같이 확인해요.”</p>
      <div class="choices">${ids.map(id => `<button class="choice" data-goal="${id}"><strong>${esc(G.goals[id].name)}</strong><small>${esc(G.goals[id].desc(s))} · ${esc(G.goals[id].reward)}</small></button>`).join('')}</div></div>`;
  }
  function leapBox(s) {
    const li = G.leapInfo(s), t = G.tiers[s.tier];
    if (li.top) return '<div class="leap-box done"><b>레전드 도달</b><small>가장 높은 단계입니다. 남은 분기는 이야기를 마무리하는 시간입니다.</small></div>';
    if (!li.open) {
      const why = s.fans < li.need ? `팬 ${fmt(li.need)}명 필요(현재 ${fmt(s.fans)}명)` : `연말에 열림 · 다음 기회 ${li.next}분기`;
      return `<div class="leap-box"><b>도약 무대 · ${esc(li.to)}</b><small>${why}. 도약하지 않으면 팬 증가가 약 ${fmt(t.ceiling)}명 근처에서 느려집니다.</small></div>`;
    }
    const d = draft, p = plan(), pre = G.preview(s, p, d.topic, d.ambitious, true, d.concept), short = s.cash < li.cost;
    return `<label class="leap-box open"><input id="leap" type="checkbox" ${d.leap && !short ? 'checked' : ''} ${short || !p.stream ? 'disabled' : ''}><span><b>${li.retry ? '도약 무대 재도전' : '도약 무대 참가'} · ${esc(li.to)}</b><small>참가비 ${fmt(li.cost)}만원 · 방송 성공 시 약 ${Math.round(pre.leapChance * 100)}%, 실패 시 약 ${Math.round(pre.leapChanceFail * 100)}%. 떨어지면 다음 분기 1.5배로 재도전.${short ? ' ⚠ 자금 부족' : !p.stream ? ' ⚠ 방송 칸 필요' : ''}</small></span></label>`;
  }
  // In-game menus (dock). Staff and shop only change things while planning.
  function menuView(s) {
    const close = '<button class="win-close" data-panel="" aria-label="닫기">✕</button>';
    const t = G.tiers[s.tier], used = Object.keys(s.staff).length, can = s.phase === 'plan' && !s.ending;
    if (panel === 'career') return close + careerPanel(s);
    if (panel === 'team') {
      const staff = Object.entries(G.staff).map(([id, st]) => {
        const on = !!s.staff[id], pay = Math.round(st.salary * t.pay), autoKind = st.auto;
        const face = A.staff && A.staff[id] ? `<img class="staff-face" src="${A.staff[id]}" alt="">` : '<span class="staff-face"></span>';
        return `<li class="card${on ? ' on' : ''}">${face}<div><b>${st.name}</b><small>${esc(st.desc)}</small><small>분기 ${pay}만원</small>${on && autoKind ? `<label class="auto-toggle"><input type="checkbox" data-auto="${autoKind}" ${s.auto[autoKind] ? 'checked' : ''} ${can ? '' : 'disabled'}> 자동 처리 (직접보다 보상 낮음)</label>` : ''}</div><button class="mini-btn" data-${on ? 'fire' : 'hire'}="${id}" ${!can || (!on && used >= t.slots) ? 'disabled' : ''}>${on ? '내보내기' : '고용'}</button></li>`;
      }).join('');
      return `${close}<div class="win-head"><span class="label">TEAM</span><h3>스태프 ${used}/${t.slots}</h3></div><p class="subtle">분기 운영비 ${fmt(G.upkeep(s))}만원 (사무실 ${t.rent}만원 포함). 단계가 오르면 칸과 급여가 함께 늘어요.</p><ul class="cards">${staff}</ul>`;
    }
    if (panel === 'shop') {
      const gearBtn = `<li class="card"><div><b>방송 장비 ${s.gear}/${G.maxGear}</b><small>${A.roomNew[s.gear + 1] ? `다음: ${esc(A.roomNew[s.gear + 1])} · ` : ''}품질·성공 가능성·매출 상승, 유지비 +3만원</small>${s.gear >= G.gearCap(s) && s.gear < G.maxGear ? `<small>다음 장비는 ${G.tiers[s.tier + 1].name} 단계에서 열려요.</small>` : ''}</div><button class="mini-btn" id="upgrade" ${!can || s.gear >= G.gearCap(s) || s.cash < G.gearPrice(s) ? 'disabled' : ''}>${s.gear >= G.maxGear ? '완료' : s.gear >= G.gearCap(s) ? '잠김' : `${G.gearPrice(s)}만원`}</button></li>`;
      const projects = Object.entries(G.projects).map(([id, pj]) => {
        const done = !!s.projects[id], locked = s.tier < pj.tier;
        return `<li class="card${done ? ' on' : ''}"><div><b>${pj.name}</b><small>${locked ? `${G.tiers[pj.tier].name} 단계에서 열림` : esc(pj.desc)}</small></div><button class="mini-btn" data-project="${id}" ${!can || done || locked || s.cash < pj.price ? 'disabled' : ''}>${done ? '완료' : `${fmt(pj.price)}만원`}</button></li>`;
      }).join('');
      return `${close}<div class="win-head"><span class="label">SHOP</span><h3>장비 · 프로젝트</h3></div><ul class="cards">${gearBtn}${projects}</ul>`;
    }
    if (panel === 'log') {
      const logs = [...s.history].reverse().slice(0, 8);
      const goals = (s.goals || []).map(g => `<span class="badge${g.ok ? '' : ' miss'}">${g.year}년차 ${esc(g.name)} ${g.ok ? '✓' : '✗'}</span>`).join(' ');
      return `${close}<div class="win-head"><span class="label">ARCHIVE</span><h3>우리의 기록</h3></div><button class="quiet" data-panel="career">방송 실적과 후일담 →</button>${goals ? `<p>${goals}</p>` : ''}${s.story.length ? `<p class="subtle">지나온 이야기: ${s.story.map(k => esc(G.story[k].title)).join(' → ')}</p>` : ''}${logs.length ? `<ul class="timeline">${logs.map(r => `<li><small>Q${String(r.q).padStart(2, '0')} · ${G.topics[r.topic]}${r.score ? ` · 평가 ${r.score}/40` : ''}</small>${esc(r.event)}<small>${esc(r.choice)} · 팬 ${signed(r.deltaFans)} · 자금 ${signed(r.deltaCash)}만원</small></li>`).join('')}</ul>` : '<p class="subtle">아직 첫 방송 전입니다.</p>'}<button class="quiet" id="history-button">전체 기록 보기 ↗</button>`;
    }
    if (panel === 'dex') return `${close}<div class="win-head"><span class="label">ENDINGS · COMBOS</span><h3>엔딩 도감 ${endingsSeen.length}/${G.endings.length}</h3></div><h4 class="dex-h">방송 궁합표 ${Object.keys(combos).length}/${Object.keys(G.topics).length * Object.keys(G.concepts).length}</h4><table class="combo-table"><tr><th></th>${Object.values(G.concepts).map(c => `<th>${esc(c)}</th>`).join('')}</tr>${Object.entries(G.topics).map(([t, tn]) => `<tr><th>${tn}</th>${Object.keys(G.concepts).map(c => `<td>${combos[t + ':' + c] ? '★'.repeat(combos[t + ':' + c]) : '?'}</td>`).join('')}</tr>`).join('')}</table><ul class="collection">${G.endings.map(x => `<li class="${endingsSeen.includes(x.id) ? 'got' : ''}">${endingsSeen.includes(x.id) ? esc(x.title) : '???'}</li>`).join('')}</ul><p class="subtle">커리어 4단계 × 관계 3종, 특별 엔딩 5종, 조기 엔딩 3종. 도감은 회차가 바뀌어도 남아요.</p>`;
    return `${close}${picture('title_key', 'menu-cover')}${helpHtml}`;
  }
  // Story chapter: a visual-novel scene, one line at a time, over its own picture.
  function storyView(key) {
    const c = G.story[key], line = c.scenes[Math.min(storyStep, c.scenes.length - 1)], last = storyStep >= c.scenes.length - 1;
    const art = key === 'ch1' && storyStep >= 3 && storyStep <= 4 ? 'story_notebook' : key === 'ch2' && storyStep <= 1 ? 'story_waitroom' : key === 'ch4' && storyStep >= 2 && storyStep <= 3 ? 'story_backstage' : key === 'ch5' ? 'story_ten' : c.art;
    const guide = key === 'ch1' && storyStep === 0 ? `<aside class="first-guide" aria-label="플레이 방법"><b>세 편만 해 보면 됩니다</b><ol><li>올해 목표를 고릅니다.</li><li>주제와 일정을 정하고 계획을 확정합니다.</li><li>제작 중 방향을 고르거나 맡기고, 생방송은 직접 하거나 건너뜁니다.</li><li>결과에서 다음 분기로 갑니다.</li></ol></aside>` : '';
    return `<div class="vn" data-story="${key}" data-story-line="${storyStep}">${guide}${picture(A.events[art] ? art : c.art, 'vn-art')}<div class="vn-box"><span class="label">STORY · ${esc(c.title)}</span><h2 id="phase-title" tabindex="-1" class="sr-only">${esc(c.title)}</h2>${line[0] ? `<b class="vn-name">${esc(line[0])}</b>` : ''}<p class="vn-line${line[0] ? '' : ' narration'}">${esc(line[1])}</p><div class="vn-foot"><span>${storyStep + 1}/${c.scenes.length}</span><button id="story-skip" class="quiet">건너뛰기</button><button id="story-next" class="primary">${last ? '이야기 닫기' : '다음 ▶'}</button></div></div></div>`;
  }
  function eventView(s) {
    const e = s.pending.event;
    const tone = e.card ? ' tone-' + e.card.kind : '';
    return `<div class="event-wrap${tone}">${picture(s.pending.leap && A.events.leap_stage ? 'leap_stage' : e.art || e.id, 'scene')}${head(s.pending.leap ? 'LEAP STAGE · 도약 무대가 걸린 분기' : e.card && e.card.kind === 'good' ? '✨ GOOD NEWS · 좋은 일이 생겼다' : e.card && e.card.kind === 'bad' ? '⚠ TROUBLE · 문제가 생겼다' : 'EVENT · 작은 방송국의 하루', e.title)}<div class="win-body"><p class="event-body">${esc(e.body)}</p>
      <div class="choices">${e.options.map(o => `<button class="choice" data-choice="${esc(o.id)}"><strong>${esc(o.label)}</strong><small>${esc(o.effect)}</small></button>`).join('')}</div><p class="subtle">${G.topics[s.pending.topic]} · ${planText(s.pending.plan)}${s.pending.ambitious ? ' · 대형 기획' : ''}${s.pending.plan.stream ? ' · 선택 후 방송 준비' : ''}</p>${e.card && e.card.kind === 'bad' ? `<p class="guard-line">${e.card.guard > 0 ? `🛡 ${esc(e.card.by)} 덕분에 피해가 ${Math.round(e.card.guard * 100)}% 줄어든 상태예요.` : `대비책(${esc(e.card.by)})이 없어 피해를 그대로 받아요.`}</p>` : ''}</div></div>`;
  }
  const speedLabel = h => h >= .66 ? '매우 빠름' : h >= .33 ? '빠름' : '느긋함';
  const pads = [['left', '←'], ['jump', '↑'], ['right', '→']];
  // During the broadcast the chat runs down the right side of the stage.
  function liveChat(s) {
    const L = s.pending.live;
    return `<section class="chat-box" aria-labelledby="chat-title"><div class="chat-head"><b id="chat-title">실시간 채팅</b><span id="live-count">${L.kind === 'chat' ? '차단 0 · 언급 0' : `속도 ${speedLabel(L.heat)}`}</span></div><ol id="chat" class="chat" aria-label="방송 채팅"${L.kind === 'chat' ? '' : ' aria-live="off"'}></ol><div class="chat-end" id="chat-end" hidden><b>방송이 종료되었습니다</b><small>채팅 기록은 남지 않습니다</small></div></section>`;
  }
  // All live interactions stay on the studio stage, alongside Lumi and the chat feed.
  function liveMini(s) {
    const L = s.pending.live;
    const boost = (L.boosts || []).length ? '<button class="boost" id="boost" hidden aria-live="assertive">🔥 <b id="boost-text"></b><small>지금 눌러요!</small></button>' : '';
    const w = s.pending.workshop;
    const cue = w && w.cue ? `<button class="prepared-cue" id="prepared-cue" ${w.cueUsed ? 'disabled' : ''}>${w.cueUsed ? '✓ 준비한 멘트를 이어 갔어요' : '✦ 준비한 애드리브 · 1회'}<small>방송 볼거리 +4 · 게임 결과와 별개</small></button>` : '';
    return boost + cue + liveMiniGame(L);
  }
  function liveMiniGame(L) {
    if (L.kind === 'assist') return `<div class="mini assist" id="mini" data-kind="assist"><div class="game-screen">${A.events.game_screen ? `<img src="${A.events.game_screen}" alt="">` : ''}<div class="cue" id="cue" aria-live="polite">루미가 게임을 켰다…</div><div class="cue-timer" aria-hidden="true"><i id="cue-bar"></i></div></div><div class="pad">${pads.map(([k, l]) => `<button class="pad-btn" data-pad="${k}" aria-label="${({ left: '왼쪽', jump: '점프', right: '오른쪽' })[k]}">${l}</button>`).join('')}</div></div>`;
    if (L.kind === 'sing') return `<div class="mini sing" id="mini" data-kind="sing">${picture('mg_booth', 'mini-backdrop')}<div class="rhythm-title">♪ 루미의 라이브 스테이지</div><div class="lane" id="lane" aria-hidden="true"><span class="target"></span></div><div class="sing-row"><span id="judge" class="judge" aria-live="polite"></span><button class="pad-btn beat" id="beat" aria-label="박자 맞추기">♪ <small>SPACE</small></button></div></div>`;
    if (!L.rounds) return '';
    const kind = L.kind, imageKey = { reaction: 'mg_booth', prompt: 'mg_booth', aim: 'mg_aim', raid: 'mg_raid', lyrics: 'mg_karaoke', pitch: 'mg_booth' }[kind];
    const sprite = (key, fallback) => A.sprites && A.sprites[key] ? `<img src="${A.sprites[key]}" alt="">` : `<span aria-hidden="true">${fallback}</span>`;
    const choices = kind === 'reaction' ? [['smile', '웃음', 'sp_face_smile', '😊'], ['surprise', '놀람', 'sp_face_surprise', '😮'], ['sad', '슬픔', 'sp_face_sad', '😢']]
      : kind === 'raid' ? [['left', '← 왼쪽'], ['guard', '↓ 방어'], ['right', '오른쪽 →']]
      : kind === 'pitch' ? [['low', '낮게'], ['mid', '중간'], ['high', '높게']] : [[0, '대기 중'], [1, '대기 중'], [2, '대기 중']];
    const controls = kind === 'aim' ? '<div id="target-field" class="target-field"></div>' : `<div class="round-choices ${kind === 'reaction' ? 'faces' : ''}">${choices.map(([answer, label, face, fallback], i) => `<button class="round-answer" data-round-answer="${answer}" disabled>${face ? sprite(face, fallback) : ''}<span class="answer-label">${label}</span><kbd>${kind === 'raid' ? ['←', '↓', '→'][i] : i + 1}</kbd></button>`).join('')}</div>`;
    return `<section class="mini round-mini ${kind}" id="mini" data-kind="${kind}" aria-label="${esc(G.liveNames[kind] || '방송 미니게임')}">${picture(imageKey, 'mini-backdrop')}<div class="round-top"><span class="round-mode">${esc(G.liveNames[kind] || '')}</span><span id="round-number">준비 중</span></div>${kind === 'raid' ? `<div class="raid-boss" aria-hidden="true">${sprite('sp_boss', '👾')}</div><div class="raid-lanes" aria-hidden="true"><span>왼쪽</span><span>정면</span><span>오른쪽</span></div>` : ''}${kind === 'reaction' ? `<div class="reaction-face" id="reaction-face" aria-hidden="true">${sprite('sp_face_smile', '😊')}</div>` : ''}<div class="round-cue" id="round-cue" role="status" aria-live="polite">곧 시작해요. 신호를 기다려 주세요!</div>${kind === 'pitch' ? '<div class="pitch-meter" aria-hidden="true"><span>낮은 음</span><span>중간 음</span><span>높은 음</span><i id="pitch-target"></i><b id="pitch-marker">♪</b></div>' : ''}${controls}<div class="round-footer"><span id="round-feedback" role="status" aria-live="polite">${kind === 'aim' ? '빨간 적만 클릭 · 초록 아군은 기다리기' : '한 번의 선택, 함께 만드는 방송'}</span><div class="round-timer" aria-hidden="true"><i id="round-bar"></i></div></div></section>`;
  }
  function liveView(s) {
    const pend = s.pending, L = pend.live;
    const guide = { chat: '악플 <b>차단</b> · 좋은 채팅 <b>언급</b> · 최근 채팅 1/2키', assist: '상황에 맞게 <b>← ↑ →</b>를 눌러요.', sing: '음표가 원에 닿을 때 <b>♪ · SPACE</b>', reaction: '이야기에 맞는 표정 <b>1 · 2 · 3</b>', prompt: '가장 센스 있는 답 <b>1 · 2 · 3</b>', aim: '빨간 적 클릭 · <b>SPACE</b> · 초록 아군은 기다리기', raid: '공격 반대쪽으로 <b>← →</b> · 정면 공격은 <b>↓ · SPACE</b>', lyrics: '빈칸에 이어질 가사 <b>1 · 2 · 3</b>', pitch: '음 높이에 맞게 <b>낮게 · 중간 · 높게</b> · 1/2/3키' }[L.kind];
    return `<div class="live-hud"><div class="live-status"><span class="label">LIVE · ${G.topics[pend.topic]} · ${G.liveNames[L.kind]}${L.big ? ' · 중요한 방송' : ''}</span><h2 id="phase-title" tabindex="-1" class="sr-only">생방송 중</h2><div class="live-progress" aria-hidden="true"><i id="live-bar"></i></div><small>${guide}</small></div><div class="live-actions"><button id="live-skip" class="quiet">건너뛰기</button><button id="live-end" class="primary" disabled>방송 중…</button></div></div>`;
  }
  function reviewBoard(r) {
    if (!r.reviews.length) return '<div class="review-board empty"><p>방송이 없는 분기라 평가는 없습니다. 준비한 만큼 다음 방송에 반영됩니다.</p></div>';
    return `<div class="review-board${reveal ? ' reveal' : ''}" role="group" aria-label="방송 평가 40점 만점에 ${r.score}점">${r.reviews.map((v, i) => `<div class="review" style="--i:${i}">${icon(criticIcons[i])}<small>${esc(v.name)}</small><strong>${v.score}</strong>${v.low ? `<small class="review-range">범위 ${v.low}~${v.high}</small>` : ''}</div>`).join('')}<div class="review total${r.legend ? ' legend' : ''}" style="--i:4"><small>종합</small><strong>${r.score}<span>/40</span></strong>${r.legend ? '<em>전설의 방송</em>' : ''}</div></div>`;
  }
  function rankLine(r) {
    const move = r.prevRank - r.rank;
    return `<p class="rank-line">주간 버추얼 차트 <b>${r.rank}위</b> <span class="${move > 0 ? 'up' : move < 0 ? 'down' : ''}">${move > 0 ? `▲ ${move}` : move < 0 ? `▼ ${-move}` : '변동 없음'}</span></p>`;
  }
  const option = (list, v) => list.map(t => `<option ${v === t ? 'selected' : ''}>${t}</option>`).join('');
  function endingView(s, f) {
    const e = s.ending, memories = e.memories || [];
    return `<div class="ending">${picture('end_' + e.art, 'scene')}<div class="eyebrow">${e.cause ? 'EARLY ENDING' : '10 YEARS / ENDING'}</div><h3>${esc(e.title)}</h3><p>${esc(e.text)}</p>
      <div class="ending-stats"><div><small>최고 평가</small><b>${e.best ? `${e.best}/40` : '-'}</b></div><div><small>전설의 방송</small><b>${e.legends || 0}회</b></div><div><small>클립 흥행</small><b>${e.virals || 0}회</b></div><div><small>최고 순위</small><b>${e.bestRank || bestRank(s)}위</b></div></div>
      ${memories.length ? `<h4>루미와의 기록</h4><ul class="memories">${memories.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${(e.chapters || []).length ? `<h4>지나온 이야기</h4><p class="subtle">${e.chapters.map(esc).join(' → ')}</p>` : ''}<h4>엔딩 도감 ${endingsSeen.length}/${G.endings.length}</h4><ul class="collection">${G.endings.map(x => `<li class="${endingsSeen.includes(x.id) ? 'got' : ''}${x.id === e.id ? ' now' : ''}">${endingsSeen.includes(x.id) ? esc(x.title) : '???'}</li>`).join('')}</ul>
      <span class="badge">${e.cause ? `${e.quarter}분기 조기 종료` : '10년 결산'}</span></div>
      <div class="feedback"><label>선택할 때 고민이 되었나요?<select id="feedback-interest"><option value="">선택해 주세요</option>${option(['1 · 거의 없었음', '2 · 조금', '3 · 보통', '4 · 자주', '5 · 계속 고민됨'], f.interest)}</select></label><label>생방송 미니게임은 어땠나요?<select id="feedback-live"><option value="">선택해 주세요</option>${option(['1 · 귀찮았음', '2 · 가끔 재밌음', '3 · 보통', '4 · 방송하는 느낌이 남', '5 · 매번 기다려짐'], f.live)}</select></label><label>지루했던 구간이 있었나요?<select id="feedback-pace"><option value="">선택해 주세요</option>${option(['1~2년차', '3~4년차', '5~6년차', '7~8년차', '9~10년차', '없었음'], f.pace)}</select></label><label>다시 한다면 바꿔보고 싶은 계획<textarea id="feedback-note" placeholder="예: 노래를 먼저 훈련하고 콘서트에 투자해보고 싶다.">${esc(f.note || '')}</textarea></label><span class="saved">입력은 이 브라우저에 자동 저장됩니다.</span></div>
      <button class="primary orange" id="new-run">기록 보관하고 새 회차 시작 →</button>`;
  }
  function resultView(s) {
    const r = s.last, lv = r.live;
    const why = r.plan.stream ? `${r.chance}%${lv && !lv.skipped ? ` (준비 ${r.baseChance}% · ${esc(lv.name || '방송 미니게임')} ${signed(lv.chance)}%p)` : ''}` : '방송 없음';
    const cards = [['팬', r.deltaFans, '명'], ['자금', r.deltaCash, '만원'], ['건강', r.deltaHealth, ''], ['신뢰', r.deltaTrust, '']].map(([name, val, unit]) => `<div><small>${name}</small><strong class="${val < 0 ? 'negative' : ''}">${signed(val)}<span> ${unit}</span></strong></div>`).join('');
    return `${r.leap && !r.leap.ok ? picture('leap_fail', 'scene') : ''}${head(`REPORT · ${G.topics[r.topic]} ${r.plan.stream ? '방송' : '준비'}`, r.status)}<div class="win-body">${r.leap ? `<div class="leap-result ${r.leap.ok ? 'ok' : 'fail'}"><b>${r.leap.ok ? '도약 성공' : '도약 실패'}</b> · ${esc(r.leap.from)} → ${esc(r.leap.to)} · 가능성 ${r.leap.chance}%</div>` : ''}${r.goal ? `<div class="leap-result ${r.goal.ok ? 'ok' : 'fail'}"><b>${r.goal.year}년차 목표 ${r.goal.ok ? '달성' : '실패'}</b> · ${esc(r.goal.name)}</div>` : ''}
      ${reviewBoard(r)}${qualityAxes(r)}${rankLine(r)}<div class="result-grid">${cards}</div>
      ${r.notes.length ? `<ul class="result-notes">${r.notes.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      <details><summary>자세히</summary><p class="subtle">${esc(r.event)} → ${esc(r.choice)}<br>방송 매출 ${fmt(r.income)}만원 · 운영/훈련 지출 ${fmt(r.cost)}만원 · 성공 확률 ${why} · 클립 ${r.viral ? '발생' : '없음'}</p></details>
      ${s.ending ? endingView(s, feedback) : ''}</div>${s.ending ? '' : '<button id="advance" class="primary">다음 분기로 →</button>'}`;
  }
  function render(focusId) {
    clearTimeout(productionTimer);
    stopLive();
    // Remember discovered combos from every finished broadcast.
    for (const r of run.history) if (r.fit && r.concept && !combos[r.topic + ':' + r.concept]) combos[r.topic + ':' + r.concept] = r.fit;
    if (run.ending && !endingsSeen.includes(run.ending.id)) endingsSeen.push(run.ending.id);
    const s = run;
    // A newly reached story chapter is shown before anything else, once.
    const chapter = s.phase === 'plan' ? s.story.find(k => !storySeen.includes(k)) : '';
    if (chapter) panel = '';
    const body = chapter ? storyView(chapter) : s.phase === 'production' ? productionView(s) : s.phase === 'plan' ? editor(s) : s.phase === 'event' ? eventView(s) : s.phase === 'live' ? liveView(s) : resultView(s);
    const cls = chapter ? 'story' : s.phase === 'live' ? 'live' : s.phase === 'result' && s.ending ? 'wide' : s.phase;
    $('game').innerHTML = `<div class="game-shell">${hud(s)}${stage(s, body, cls)}${dock(s)}</div>`;
    reveal = upgraded = false;
    bind(); if (s.phase === 'plan' && !chapter && !G.goalOpen(s)) updatePreview(); if (s.phase === 'live') startLive(s); if (s.phase === 'production') scheduleProduction();
    save();
    const el = focusId && $(focusId);
    if (el && !el.disabled) el.focus(); else if (focusId && $('phase-title')) $('phase-title').focus({ preventScroll: true });
  }
  function updatePreview() {
    const s = run, d = draft, p = plan(), pre = G.preview(s, p, d.topic, d.ambitious, false, d.concept, d.program || 'regular');
    $('preview').innerHTML = `${allocationBar(p)}<div class="forecast"><div><small>지출</small><strong>${fmt(pre.cost)}만원</strong></div><div><small>예상 매출</small><strong>${p.stream > 0 ? `${pre.incomeLow}~${pre.incomeHigh}` : '없음'}</strong></div><div><small>실패 위험</small><strong>${p.stream > 0 ? pre.risk : '-'}</strong></div></div><p class="subtle">결산 후 건강 ${Math.round(pre.health)} · ${G.topics[d.topic]} 실력 ${Math.round(pre.skill)}${pre.trend && p.stream > 0 ? ' · 유행 +25%' : ''}${s.cash < pre.cost ? '<br>⚠ 자금보다 지출이 큽니다.' : ''}${pre.health <= 0 ? '<br>⚠ 건강이 바닥납니다.' : ''}</p>`;
  }


  // Broadcast minigames. The engine fixed every message, cue and note when the broadcast started; the page reveals them on a clock.
  const test = { frozen: TEST, speed: 1 };
  function startLive(s) {
    const L = s.pending.live;
    live = { L, gt: 0, last: performance.now(), shown: 0, blocked: [], mentioned: [], misses: 0, hits: 0, wrong: 0, perfect: 0, good: 0, extra: 0, streak: 0,
      cue: -1, round: -1, roundHits: [], roundMisses: 0, done: {}, notes: {}, boostOn: -1, boostsHit: 0, raf: 0, sayTimer: 0, moodTimer: 0, judgeTimer: 0, ended: false };
    const frame = now => {
      if (!live) return;
      // Capped step: a hidden tab pauses the broadcast instead of skipping ahead.
      if (!test.frozen && !$('modal').open) live.gt += Math.min(100, now - live.last) * test.speed;
      live.last = now; tick();
      if (live && !live.ended) live.raf = requestAnimationFrame(frame);
    };
    tick(); live.raf = requestAnimationFrame(frame);
  }
  function tick() {
    const L = live.L, t = live.gt;
    while (live.shown < L.chat.length && L.chat[live.shown].at <= t) addMessage(L.chat[live.shown++]);
    if (L.kind === 'assist') tickAssist(t);
    if (L.kind === 'sing') tickSing(t);
    if (L.rounds) tickRounds(t);
    tickBoost(t);
    $('live-bar').style.width = `${Math.min(100, t / L.duration * 100)}%`;
    if (t >= L.duration) endBroadcast();
  }
  // When the broadcast ends the chat is gone for good; only the result remains.
  function endBroadcast() {
    if (live.ended) return;
    if (live.L.kind === 'assist') tickAssist(Infinity);
    if (live.L.kind === 'sing') tickSing(Infinity);
    if (live.L.rounds) tickRounds(Infinity);
    if ($('boost')) $('boost').hidden = true;
    live.ended = true; cancelAnimationFrame(live.raf);
    $('chat').innerHTML = ''; $('chat-end').hidden = false;
    const air = document.querySelector('.on-air'); if (air) { air.textContent = 'OFF AIR'; air.classList.add('off'); }
    const bubble = $('lumi-say'); if (bubble) bubble.classList.remove('on');
    if ($('mini')) { $('mini').classList.add('ended'); document.querySelectorAll('.pad-btn, .round-answer, [data-round-target]').forEach(b => b.disabled = true); }
    $('live-skip').hidden = true;
    if ($('prepared-cue')) $('prepared-cue').disabled = true;
    const b = $('live-end'); b.disabled = false; b.textContent = '방송 결과 보기 →'; b.focus({ preventScroll: true });
  }
  // Boost moments: a hot moment pops up on stage for a short window. Catch it for extra fans.
  function tickBoost(t) {
    const bs = live.L.boosts || [], el = $('boost'); if (!el) return;
    const i = bs.findIndex(b => t >= b.at && t < b.at + b.win && !live.done[b.id]);
    if (i !== live.boostOn) { live.boostOn = i; el.hidden = i < 0; if (i >= 0) $('boost-text').textContent = bs[i].text; }
    if (i < 0) { bs.forEach(b => { if (t >= b.at + b.win && !live.done[b.id]) live.done[b.id] = 'miss'; }); }
  }
  function useCue() {
    if (!live || live.ended) return;
    try {
      run = G.usePreparedCue(run); save();
      $('prepared-cue').disabled = true; $('prepared-cue').textContent = '✓ 준비한 멘트를 이어 갔어요';
      say({ game: '이 장면도 우리 방송의 일부죠! 다음에는 꼭 깰 거예요.', song: '조금 떨려도 제 목소리니까요. 이 노래, 같이 끝까지 들어 줘요.', talk: '이 이야기는 여기 있는 분들한테 먼저 하고 싶었어요.' }[run.pending.topic]); setMood('celebrate', 1000);
    } catch (e) { notice(e.message); }
  }
  function catchBoost() {
    if (!live || live.ended) return;
    const b = (live.L.boosts || [])[live.boostOn]; if (!b || live.done[b.id]) return;
    live.done[b.id] = 'hit'; live.boostsHit++; $('boost').hidden = true; live.boostOn = -1;
    setMood('celebrate', 1000); say(`${b.text} 매니저님 나이스 타이밍!`);
  }
  function stopLive() { if (live) { cancelAnimationFrame(live.raf); clearTimeout(live.sayTimer); clearTimeout(live.moodTimer); clearTimeout(live.judgeTimer); } live = null; }
  const MAX_CHAT = 7;
  function addMessage(c) {
    const li = document.createElement('li'), act = live.L.kind === 'chat';
    li.className = 'msg'; li.dataset.id = c.id;
    li.innerHTML = `<span class="nick">${esc(c.nick)}</span><span class="text">${esc(c.text)}</span>${act ? `<span class="acts"><button class="act block" data-block="${c.id}" aria-label="${esc(c.nick)}: ${esc(c.text)} 차단">차단</button><button class="act mention" data-mention="${c.id}" aria-label="${esc(c.nick)}: ${esc(c.text)} 언급">언급</button></span>` : ''}`;
    if (act) { li.querySelector('[data-block]').onclick = () => handle(c, 'block', li); li.querySelector('[data-mention]').onclick = () => handle(c, 'mention', li); }
    const box = $('chat'); box.append(li);
    // Old lines scroll away for good: no scrollback, so a missed troll stays missed.
    while (box.children.length > MAX_CHAT) {
      const old = box.firstElementChild, moving = old.contains(document.activeElement);
      old.remove(); if (moving) { const next = box.querySelector('button'); if (next) next.focus({ preventScroll: true }); }
    }
  }
  function setMood(m, ms) {
    const el = $('lumi'); if (!el || !A.sprite) return;
    const apply = k => { el.dataset.mood = k; el.setAttribute('style', lumiStyle(k)); };
    clearTimeout(live.moodTimer); apply(m); live.moodTimer = setTimeout(() => apply('talk'), ms);
  }
  function say(text) {
    const el = $('lumi-say'); if (!el) return;
    el.textContent = text; el.classList.add('on');
    clearTimeout(live.sayTimer); live.sayTimer = setTimeout(() => el.classList.remove('on'), 2600);
  }
  const count = text => { $('live-count').textContent = text; };
  // Chat management: instant feedback on every click, Kairosoft style.
  function handle(c, kind, li) {
    if (!live || live.ended) return;
    const next = li.nextElementSibling && li.nextElementSibling.querySelector('button');
    li.querySelector('.acts').remove();
    if (kind === 'block') {
      live.blocked.push(c.id);
      const right = c.kind === 'toxic'; if (!right) live.misses++;
      li.classList.add('blocked', right ? 'right' : 'wrong');
      li.querySelector('.text').textContent = right ? '차단 완료 · 방송 분위기를 지켰다' : '앗, 나쁜 채팅이 아니었어요';
      if (!right) setMood('hurt', 1100);
    } else {
      live.mentioned.push(c.id);
      const right = c.kind !== 'toxic'; if (!right) live.misses++;
      li.classList.add('mentioned', right ? 'right' : 'wrong');
      say(`@${c.nick} ${c.reply}`);
      setMood(c.kind === 'good' ? 'celebrate' : right ? 'talk' : 'hurt', 1300);
    }
    count(`차단 ${live.blocked.length} · 언급 ${live.mentioned.length}${live.misses ? ` · 실수 ${live.misses}` : ''}`);
    (next || $('live-skip')).focus({ preventScroll: true });
  }
  // Game assist: one situation at a time, read it and press the right way before the bar runs out.
  function showCue(text, cls) { const el = $('cue'); el.textContent = text; el.className = 'cue ' + cls; }
  function tickAssist(t) {
    const cues = live.L.cues;
    if (live.cue >= 0) {
      const c = cues[live.cue];
      if (t >= c.at + c.win) {
        if (!live.done[c.id]) { live.done[c.id] = 'miss'; showCue('놓쳤다… 루미가 한 대 맞았다', 'miss'); setMood('hurt', 900); }
        live.cue = -1; $('cue-bar').style.width = '0%';
      } else $('cue-bar').style.width = `${Math.max(0, 100 - (t - c.at) / c.win * 100)}%`;
    }
    if (live.cue < 0) {
      const i = cues.findIndex(c => t >= c.at && t < c.at + c.win && !live.done[c.id]);
      if (i >= 0) { live.cue = i; showCue(cues[i].text, 'on'); $('cue-bar').style.width = '100%'; }
    }
  }
  const nice = ['나이스! 매니저님 최고', '방금 거 클립각!', '살았다… 고마워요!', '호흡 완벽했다!'];
  function press(k) {
    if (!live || live.ended || live.L.kind !== 'assist') return;
    const c = live.L.cues[live.cue];
    if (!c || live.done[c.id]) return;
    const right = k === c.answer;
    live.done[c.id] = right ? 'hit' : 'wrong';
    if (right) { live.hits++; showCue('성공! 루미가 해냈다', 'hit'); setMood('celebrate', 900); say(nice[live.hits % nice.length]); }
    else { live.wrong++; showCue('앗, 반대로 갔다…', 'wrong'); setMood('hurt', 900); }
    count(`성공 ${live.hits} · 실수 ${live.wrong}`);
  }
  // The next six games share timed rounds. A choice consumes its round, so repeated clicks cannot add rewards.
  const roundWindow = r => r.window || r.win;
  function roundFeedback(text, state) {
    const el = $('round-feedback'); el.textContent = text; el.className = state || '';
    $('mini').dataset.feedback = state || '';
  }
  function roundControls(enabled) {
    document.querySelectorAll('.round-answer, [data-round-target]').forEach(b => b.disabled = !enabled);
  }
  function bindPressButton(el, action) {
    el.onpointerdown = e => { e.preventDefault(); action(); };
    el.onclick = e => { if (e.detail === 0) action(); };
  }
  function showRound(r, index) {
    const kind = live.L.kind;
    $('mini').dataset.roundId = r.id;
    $('round-number').textContent = `${index + 1} / ${live.L.rounds.length}`;
    $('round-cue').textContent = r.prompt || r.text || '신호를 보고 선택해 주세요.';
    document.querySelectorAll('.round-answer').forEach(b => b.classList.remove('chosen'));
    roundFeedback(kind === 'aim' ? (r.answer === 'ally' ? '초록 아군! 누르지 말고 기다려요.' : '빨간 적! 지금 클릭해요.') : '지금 골라 주세요!', 'ready');
    if (r.choices) document.querySelectorAll('[data-round-answer]').forEach(b => { b.querySelector('.answer-label').textContent = r.choices[Number(b.dataset.roundAnswer)]; });
    if (kind === 'raid') $('mini').dataset.attack = r.attack;
    if (kind === 'lyrics') $('round-cue').innerHTML = esc(r.prompt).replace('□', '<span class="lyric-gap">?</span>');
    if (kind === 'reaction') $('reaction-face').classList.remove('chosen');
    if (kind === 'pitch') {
      $('pitch-target').style.left = `${({ low: 16.66, mid: 50, high: 83.33 })[r.answer]}%`;
      $('pitch-marker').style.left = '50%';
      $('round-cue').textContent = r.prompt;
    }
    if (kind === 'aim') {
      const isAlly = r.answer === 'ally', key = isAlly ? 'sp_ally' : 'sp_enemy', art = A.sprites && A.sprites[key];
      $('target-field').innerHTML = `<button class="aim-target ${isAlly ? 'ally' : 'enemy'}" data-round-target="${esc(r.id)}" data-round-answer="${r.answer}" aria-label="${isAlly ? '초록 아군 · 누르지 마세요' : '빨간 적 · 클릭하세요'}" style="left:${r.x}%;top:${r.y}%">${art ? `<img src="${art}" alt="">` : `<span aria-hidden="true">${isAlly ? '🛡' : '👾'}</span>`}<b>${isAlly ? '아군' : '적'}</b></button>`;
      bindPressButton($('target-field').querySelector('button'), () => answerRound(r.answer));
    }
    roundControls(true);
  }
  function tickRounds(t) {
    const rounds = live.L.rounds, prior = live.round;
    for (const r of rounds) if (t >= r.at + roundWindow(r) && !live.done[r.id]) {
      const safe = live.L.kind === 'aim' && r.answer === 'ally';
      live.done[r.id] = safe ? 'safe' : 'miss';
      if (!safe) { live.roundMisses++; live.streak = 0; }
      if (prior >= 0 && rounds[prior].id === r.id) { roundFeedback(safe ? '아군을 지켰어요!' : '시간이 지나갔어요. 다음 신호를 기다려요.', safe ? 'hit' : 'miss'); if (!safe) setMood('hurt', 700); }
    }
    const next = rounds.findIndex(r => t >= r.at && t < r.at + roundWindow(r) && !live.done[r.id]);
    if (next !== prior) {
      live.round = next;
      if (next >= 0) showRound(rounds[next], next);
      else { roundControls(false); if ($('target-field')) $('target-field').innerHTML = ''; }
    }
    const r = rounds[live.round];
    $('round-bar').style.width = r ? `${Math.max(0, 100 - (t - r.at) / roundWindow(r) * 100)}%` : '0%';
  }
  function answerRound(value) {
    if (!live || live.ended || !live.L.rounds) return;
    const r = live.L.rounds[live.round];
    if (!r || live.done[r.id] || live.gt < r.at || live.gt >= r.at + roundWindow(r)) return;
    const right = String(value) === String(r.answer) && !(live.L.kind === 'aim' && r.answer === 'ally');
    live.done[r.id] = right ? 'hit' : 'wrong';
    roundControls(false);
    document.querySelectorAll('.round-answer').forEach(b => b.classList.toggle('chosen', b.dataset.roundAnswer === String(value)));
    if (live.L.kind === 'reaction') {
      const key = right ? `sp_face_${value}` : 'sp_face_angry', src = A.sprites && A.sprites[key];
      $('reaction-face').innerHTML = src ? `<img src="${src}" alt="">` : `<span>${right ? ({ smile: '😊', surprise: '😮', sad: '😢' })[value] : '😣'}</span>`;
      $('reaction-face').classList.add('chosen');
    }
    if (live.L.kind === 'pitch') $('pitch-marker').style.left = `${({ low: 16.66, mid: 50, high: 83.33 })[value]}%`;
    if (live.L.kind === 'lyrics' && r.choices[Number(value)]) $('round-cue').innerHTML = esc(r.prompt).replace('□', `<span class="lyric-gap filled">${esc(r.choices[Number(value)])}</span>`);
    if (right) {
      live.roundHits.push(r.id); live.streak++;
      roundFeedback(live.streak >= 3 ? `성공! ${live.streak}연속으로 호흡이 맞아요` : '성공! 루미와 호흡이 맞았어요', 'hit');
      setMood('celebrate', 850); if (live.streak % 3 === 0) say(nice[live.roundHits.length % nice.length]);
    } else {
      live.wrong++; live.streak = 0;
      roundFeedback(live.L.kind === 'aim' ? '앗, 아군이에요! 초록색은 기다려 주세요.' : '아쉽다! 다음 신호에서 다시 맞춰봐요.', 'wrong'); setMood('hurt', 850);
    }
    count(`성공 ${live.roundHits.length} · 실수 ${live.wrong}${live.roundMisses ? ` · 놓침 ${live.roundMisses}` : ''}`);
    if ($('target-field')) $('target-field').innerHTML = '';
  }
  // Song rhythm: notes slide toward the circle; judged on game time so speed and reloads stay fair.
  const LOOK = 2200, PERFECT = 110, GOOD = 230, TARGET = 9;
  function tickSing(t) {
    const lane = $('lane');
    for (const n of live.L.notes) {
      const dt = n.at - t, st = live.notes[n.id] || (live.notes[n.id] = { el: null, judged: false, gone: false });
      if (st.gone) continue;
      if (!st.judged && dt < -GOOD) { st.judged = true; if (st.el) st.el.classList.add('miss'); live.streak = 0; }
      if (!st.el && dt <= LOOK && dt > -600) { st.el = document.createElement('span'); st.el.className = 'note'; st.el.textContent = '♪'; lane.append(st.el); }
      if (st.el) {
        if (dt < -600) { st.el.remove(); st.el = null; st.gone = true; continue; }
        st.el.style.left = `${TARGET + Math.max(-4, dt) / LOOK * (100 - TARGET - 6)}%`;
      }
    }
  }
  function judge(text, cls) { const el = $('judge'); el.textContent = text; el.className = 'judge ' + cls; clearTimeout(live.judgeTimer); live.judgeTimer = setTimeout(() => { el.textContent = ''; }, 700); }
  function beat() {
    if (!live || live.ended || live.L.kind !== 'sing') return;
    const t = live.gt; let best = null, gap = Infinity;
    for (const n of live.L.notes) { const st = live.notes[n.id]; if (st && st.judged) continue; const g = Math.abs(n.at - t); if (g < gap) { gap = g; best = n; } }
    if (best && gap <= GOOD) {
      const st = live.notes[best.id] || (live.notes[best.id] = { el: null, gone: false }); st.judged = true; if (st.el) st.el.classList.add('hit');
      if (gap <= PERFECT) { live.perfect++; judge('PERFECT', 'perfect'); } else { live.good++; judge('GOOD', 'good'); }
      live.streak++;
      if (live.streak % 5 === 0) { setMood('celebrate', 800); say(`${live.streak}연속! 목소리 잘 나온다!`); }
    } else { live.extra++; live.streak = 0; judge('헛박자', 'extra'); }
    count(`완벽 ${live.perfect} · 좋음 ${live.good}${live.extra ? ` · 헛박자 ${live.extra}` : ''}`);
  }
  const keyPad = { ArrowLeft: 'left', ArrowUp: 'jump', ArrowRight: 'right' };
  document.addEventListener('keydown', e => {
    if (!live || live.ended || e.repeat || $('modal').open) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const bst = $('boost');
    if (bst && !bst.hidden && (e.key === 'b' || e.key === 'B' || e.key === 'Enter')) { e.preventDefault(); catchBoost(); return; }
    if (live.L.kind === 'assist' && keyPad[e.key]) { e.preventDefault(); press(keyPad[e.key]); }
    else if (live.L.kind === 'sing' && e.code === 'Space') { e.preventDefault(); beat(); }
    else if (live.L.kind === 'chat' && (e.key === '1' || e.key === '2')) {
      const buttons = document.querySelectorAll(e.key === '1' ? '[data-block]' : '[data-mention]');
      if (buttons.length) { e.preventDefault(); buttons[buttons.length - 1].click(); }
    } else if (live.L.rounds) {
      const kind = live.L.kind, keys = kind === 'raid' ? { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'guard', ' ': 'guard', '1': 'left', '2': 'guard', '3': 'right' }
        : kind === 'reaction' ? { '1': 'smile', '2': 'surprise', '3': 'sad' }
        : kind === 'pitch' ? { '1': 'low', '2': 'mid', '3': 'high', ArrowLeft: 'low', ArrowDown: 'mid', ArrowUp: 'high' }
        : kind === 'aim' ? { ' ': 'enemy', '1': 'enemy' } : { '1': 0, '2': 1, '3': 2 };
      if (Object.prototype.hasOwnProperty.call(keys, e.key)) { e.preventDefault(); answerRound(keys[e.key]); }
    }
  });
  if (TEST) window.__vtTest = { productionStep: advanceProduction, clock: () => live ? live.gt : -1, advance: ms => { if (live && !live.ended) { live.gt += ms; tick(); } return live ? live.gt : -1; }, freeze: v => { test.frozen = !!v; }, speed: v => { test.speed = v; } };
  function liveInput() {
    const k = live.L.kind;
    const base = live.L.rounds ? { hits: [...live.roundHits], wrong: live.wrong } : k === 'assist' ? { hits: live.hits, wrong: live.wrong } : k === 'sing' ? { perfect: live.perfect, good: live.good, extra: live.extra } : { blocked: live.blocked, mentioned: live.mentioned };
    return { ...base, boosts: live.boostsHit };
  }
  const secs = () => { const v = Math.round((performance.now() - timer) / 1000); timer = performance.now(); return v; };
  const stamp = (n, times) => { Object.assign(n.last, times); n.history[n.history.length - 1] = n.last; return n; };
  function finish(input) {
    const liveSeconds = secs();
    reveal = true;
    act(s => stamp(G.finishLive(s, input), { planSeconds: s.pending.planSeconds || 0, choiceSeconds: s.pending.choiceSeconds || 0, liveSeconds }));
  }

  function act(fn, focusId = 'phase-title') { try { run = fn(run); notice(''); render(focusId); } catch (e) { reveal = upgraded = false; notice(e.message); } }
  function bind() {
    document.querySelectorAll('[data-slot]').forEach(el => el.onchange = () => { draft.slots[Number(el.dataset.slot)] = el.value; render(el.id); });
    document.querySelectorAll('[data-policy]').forEach(el => el.onclick = () => { draft.slots = slotsOf(G.policies[el.dataset.policy].plan); render(el.id); });
    document.querySelectorAll('[data-topic]').forEach(el => el.onclick = () => { draft.topic = el.dataset.topic; draft.program = 'regular'; render(el.id); });
    document.querySelectorAll('[data-concept]').forEach(el => el.onclick = () => { draft.concept = el.dataset.concept; render(el.id); });
    if ($('boost')) bindPressButton($('boost'), catchBoost);
    document.querySelectorAll('[data-effort]').forEach(el => el.onclick = () => { draft.effort = el.dataset.effort; render(); });
    document.querySelectorAll('[data-work-choice]').forEach(el => el.onclick = () => act(s => G.chooseProduction(s, el.dataset.workChoice)));
    if ($('work-delegate')) $('work-delegate').onclick = () => act(G.delegateProduction);
    if ($('prepared-cue')) $('prepared-cue').onclick = useCue;
    if ($('program')) $('program').onchange = e => { draft.program = e.target.value; render('program'); };
    if ($('ambitious')) $('ambitious').onchange = e => { draft.ambitious = e.target.checked; render('ambitious'); };
    if ($('commit')) $('commit').onclick = () => { panel = ''; act(s => { const li = G.leapInfo(s), n = G.start(s, plan(), draft.topic, draft.ambitious, draft.leap && li.open, draft.concept, draft.program || 'regular'); n.pending.planSeconds = secs(); draft.leap = false; return n; }); };
    if ($('leap')) $('leap').onchange = e => { draft.leap = e.target.checked; save(); };
    const closeStory = () => { const k = run.story.find(x => !storySeen.includes(x)); if (k) storySeen.push(k); storyStep = 0; render('phase-title'); };
    if ($('story-next')) $('story-next').onclick = () => { const k = run.story.find(x => !storySeen.includes(x)); if (k && storyStep < G.story[k].scenes.length - 1) { storyStep++; render('story-next'); } else closeStory(); };
    if ($('story-skip')) $('story-skip').onclick = closeStory;
    document.querySelectorAll('[data-panel]').forEach(el => el.onclick = () => { if (['live', 'production'].includes(run.phase)) return; panel = panel === el.dataset.panel ? '' : el.dataset.panel; render(); });
    document.querySelectorAll('[data-goal]').forEach(el => el.onclick = () => act(s => G.setGoal(s, el.dataset.goal)));
    document.querySelectorAll('[data-followup]').forEach(el => el.onclick = () => act(s => { const n = G.respondFollowup(s, el.dataset.followup); panel = ''; return n; }));
    document.querySelectorAll('[data-hire]').forEach(el => el.onclick = () => act(s => G.hire(s, el.dataset.hire), ''));
    document.querySelectorAll('[data-fire]').forEach(el => el.onclick = () => act(s => G.fire(s, el.dataset.fire), ''));
    document.querySelectorAll('[data-auto]').forEach(el => el.onchange = () => act(s => G.setAuto(s, el.dataset.auto, el.checked), ''));
    document.querySelectorAll('[data-project]').forEach(el => el.onclick = () => act(s => G.buyProject(s, el.dataset.project), ''));
    document.querySelectorAll('[data-choice]').forEach(el => el.onclick = () => {
      const choiceSeconds = secs(); panel = '';
      act(s => {
        const effort = draft.effort === 'archive' && G.archiveTarget(s) ? 'archive' : 'next';
        const n = CLASSIC ? G.goLive(s, el.dataset.choice) : G.beginProduction(s, el.dataset.choice, effort);
        if (['production', 'live'].includes(n.phase)) { n.pending.choiceSeconds = choiceSeconds; return n; }
        reveal = true; return stamp(n, { planSeconds: s.pending.planSeconds || 0, choiceSeconds });
      });
    });
    if ($('live-end')) $('live-end').onclick = () => finish(live ? liveInput() : null);
    document.querySelectorAll('[data-pad]').forEach(el => bindPressButton(el, () => press(el.dataset.pad)));
    document.querySelectorAll('.round-answer').forEach(el => bindPressButton(el, () => answerRound(el.dataset.roundAnswer)));
    if ($('beat')) bindPressButton($('beat'), beat);
    if ($('live-skip')) $('live-skip').onclick = () => finish({ skipped: true });
    if ($('advance')) $('advance').onclick = () => { timer = performance.now(); act(G.advance); };
    if ($('upgrade')) $('upgrade').onclick = () => { upgraded = true; act(G.upgrade, 'upgrade'); };
    if ($('history-button')) $('history-button').onclick = showHistory;
    if ($('new-run')) $('new-run').onclick = newRun;
    for (const id of ['feedback-interest', 'feedback-live', 'feedback-pace', 'feedback-note']) if ($(id)) $(id).oninput = () => { feedback = { interest: $('feedback-interest').value, live: $('feedback-live').value, pace: $('feedback-pace').value, note: $('feedback-note').value }; save(); };
  }
  function newRun() {
    if (run.history.length) archive.push({ run, feedback });
    archive = archive.slice(-30);
    run = G.create(MODE); draft = defaults(); feedback = {}; storySeen = []; storyStep = 0; panel = ''; timer = performance.now();
    if ($('modal').open) $('modal').close();
    render('phase-title');
  }
  function modal(html) { $('modal-content').innerHTML = html; if (!$('modal').open) $('modal').showModal(); }
  const liveLine = r => r.live ? `<br>${esc(r.live.summary || '')}` : '';
  function showHistory() {
    const h = run.history;
    modal(`<h2>우리의 기록</h2>${h.length ? h.map(r => `<h3>${r.q}분기 · ${esc(r.event)}</h3><p>${esc(r.choice)}<br>${G.topics[r.topic]} · ${planText(r.plan)}${r.ambitious ? ' · 대형 기획' : ''}<br>${esc(r.status)}${r.score ? ` · 평가 ${r.score}/40` : ''} / 팬 ${signed(r.deltaFans)}, 자금 ${signed(r.deltaCash)}만원 · 차트 ${r.rank}위${liveLine(r)}</p>`).join('') : '<p>첫 분기를 진행하면 기록이 쌓입니다.</p>'}`);
  }
  // This run next to the last archived runs. Every run starts from the same conditions, so differences come from the player.
  function showCompare() {
    const cols = [{ name: '이번 회차', s: run, f: feedback }, ...archive.slice(-4).reverse().map((a, i) => ({ name: `지난 회차 ${i + 1}`, s: a.run, f: a.feedback || {} }))];
    const liveAvg = s => { const xs = s.history.filter(r => r.live && !r.live.skipped).map(r => r.live.score); return xs.length ? `${Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 100)}점 (${xs.length}회)` : '-'; };
    const row = (title, cb) => `<tr><th scope="row">${title}</th>${cols.map(c => `<td>${cb(c.s, c.f)}</td>`).join('')}</tr>`;
    modal(`<h2>회차 비교</h2><p>모든 회차는 같은 주인공·시작 자금·기본 사건·분기별 추첨값으로 시작합니다. 같은 계획과 선택이면 결과도 거의 같으므로, 달라진 결과는 계획·선택·채팅 관리의 차이입니다.</p><div class="table-wrap"><table class="comparison"><thead><tr><th scope="col">기록</th>${cols.map(c => `<th scope="col">${c.name}</th>`).join('')}</tr></thead><tbody>${row('진행', s => `${s.history.length}/${MAXQ}분기${s.ending ? ' · 종료' : ''}`)}${row('팬 / 최고 순위', s => `${fmt(s.fans)}명 / ${bestRank(s)}위`)}${row('최고 평가', s => bestScore(s) ? `${bestScore(s)}/40` : '-')}${row('자금', s => `${fmt(s.cash)}만원`)}${row('건강 / 신뢰', s => `${Math.round(s.health)} / ${Math.round(s.trust)}`)}${row('서로 다른 계획 수', s => new Set(s.history.map(r => JSON.stringify([r.plan, r.topic, r.ambitious]))).size)}${row('방송 미니게임 평균', liveAvg)}${row('고민 점수', (_, f) => esc(f.interest || '미입력'))}${row('미니게임 소감', (_, f) => esc(f.live || '미입력'))}${row('다음에 바꿀 계획', (_, f) => esc(f.note || '미입력'))}${row('결말', s => esc(s.ending?.title || '진행 중'))}</tbody></table></div><p>팬이 가장 많은 회차가 가장 재미있었던 회차라는 뜻은 아닙니다. 고민한 선택과 다시 해보고 싶은 전략을 함께 비교하세요.</p>`);
  }
  const helpHtml = `<h2>작은 방송국에 오신 것을 환영합니다</h2><p>당신은 버튜버 루미의 매니저입니다. 방송으로 돈과 팬을 모으고, 훈련·본체 관리·휴식과 장비에 다시 투자해 다음 방송을 준비하세요.</p><ol><li>새해 첫 분기에는 올해 목표를 하나 고릅니다. 연말에 달성하면 보상이 있어요.</li><li>방송과 훈련의 주제, 그리고 방송 콘셉트를 고릅니다. 주제 × 콘셉트에는 숨은 궁합이 있고 방송해 보면 ★로 밝혀집니다. 궁합표는 회차가 바뀌어도 남아요.</li><li>운영 방침을 눌러 네 칸을 한 번에 채우고, 필요하면 칸을 직접 바꿉니다.</li><li>계획을 확정하면 사건이 벌어집니다. 3년차부터는 좋은 일과 나쁜 일이 무작위로 찾아오는데, 신뢰·건강·실력·스태프가 확률과 피해를 바꿉니다. 결과 창에서 “행운이 온 이유”와 “대비 효과”를 확인하세요.</li><li>방송을 준비하는 동안 실력 준비·볼거리·편안함이 쌓이고 문제가 발견되기도 합니다. 중간에 연습·연출·컨디션 중 한 방향을 고릅니다. 맡기기를 누르면 기본 방침으로 바로 진행해요. 연출에서 준비한 애드리브는 생방송 중 한 번 쓸 수 있습니다. 다음 계획에서 지난 클립을 편집하면 이번 볼거리 준비 한 번을 양보합니다.</li><li>방송이 있는 분기에는 약 20초 생방송이 열립니다. 같은 주제의 방송을 이어가면 세 가지 놀이가 돌아가며 열려요. 잡담은 채팅·표정·드립, 게임은 방향·조준·보스 패턴, 노래는 박자·가사·음 높이입니다. 시청자가 많고 중요한 방송일수록 빨라집니다. 결과에 작은 보정이 붙고, 건너뛰어도 손해는 없습니다. 방송 중 🔥 부스트가 뜨면 바로 눌러(B키) 팬을 더 모으세요.</li><li>결산에서 채팅창·클립 채널·커뮤니티·업계 관계자의 평가와 차트 순위를 보고 다음 계획을 조정합니다.</li><li>번 돈은 장비·스태프·프로젝트에 다시 투자합니다. 스태프를 두면 미니게임을 자동으로 맡길 수 있지만 직접 할 때보다 보상이 낮습니다.</li><li>연말에 팬이 충분하면 <b>도약 무대</b>가 열립니다. 넘으면 기획사 확장 → 전성기로 올라 새 장비·스태프 칸·프로젝트와 다음 이야기가 열립니다. 실패하면 다음 분기에 비용을 더 내고 바로 재도전할 수 있어요.</li><li>게임 방송에서 실패해도 방송감이 높으면 ‘레전드 리액션’으로 오히려 흥할 수 있습니다.</li></ol><p>엔딩은 커리어 4단계 × 관계 3종, 특별 엔딩 5종, 조기 엔딩 3종(총 20종)이 있습니다. 엔딩 도감은 회차가 바뀌어도 남아요.</p><p>훈련·관리·휴식은 그 분기 방송 전에 반영됩니다. 실력·컨디션·장비가 성공 가능성을 올리고, 유행·신뢰·본체 매력이 평가에 더해집니다. 준비해도 흥행은 보장되지 않습니다.</p><p>3분기 연속 적자, 두 번의 건강 고갈, 또는 갈등 3 이상 + 신뢰 35 미만이면 일찍 끝납니다.</p><p>진행과 작성 중인 계획은 이 브라우저에 자동 저장됩니다. 40분기(10년) 플레이테스트판이며, 수치와 사건, 루미라는 이름은 검증용 임시값입니다. 화면 아래 메뉴에서 스태프·장비·기록·엔딩 도감을 열 수 있어요.</p>`;
  $('help-button').onclick = () => modal(helpHtml + `<h3>첫 방송 3편 비교하기</h3><p>같은 일정으로 첫 3편을 해 보세요. 기존 흐름은 별도 저장으로 열립니다. 순서를 바꿔 다시 해 보면 숙련도의 영향도 줄일 수 있어요.</p><p><a href="?flow=v7&build=v8" target="_blank">기존 v7 흐름 비교판 열기 ↗</a> · <a href="?build=v8" target="_blank">v8 방송 제작판 열기 ↗</a></p>`);
  $('compare-button').onclick = showCompare;
  $('reset-button').onclick = () => {
    modal('<h2>처음부터 다시 할까요?</h2><p>지금 기록은 회차 비교용으로 보관하고 같은 시작 조건으로 돌아갑니다.</p><button class="primary orange" id="confirm-reset">기록 보관하고 다시 시작</button>');
    $('confirm-reset').onclick = newRun;
  };
  $('export-button').onclick = () => {
    const payload = { exportedAt: new Date().toISOString(), version: G.VERSION, seed: 'STUDIO-01', run, feedback, archive, note: '수치 결과는 재미의 증거가 아닙니다. 계획·선택·방송 시간은 현재 탭에서 잰 값이며 자리 비움의 영향을 받습니다.' };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = '작은방송국-플레이기록.json'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); notice('플레이 기록 JSON 저장을 요청했습니다.');
  };
  if (A.icons.brand) { const b = document.querySelector('.brand-icon'); b.innerHTML = icon('brand'); b.classList.add('art'); }
  if (CLASSIC) { document.querySelector('.sysbar').children[1].textContent = '작은 방송국 · 기존 v7 흐름 비교 · 별도 저장'; loadNote = '기존 흐름 비교판입니다. 제작 중간 과정 없이 방송하며, 본편 저장과 분리됩니다.'; }
  render();
  if (loadNote) notice(loadNote);
})();










