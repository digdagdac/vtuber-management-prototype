(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./career.js') : root.VTCareer, node ? require('./workshop.js') : root.VTWorkshop);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Career, Workshop) {
  'use strict';
  const VERSION = 4;
  // Full career: 40 quarters (10 years), four career stages.
  const MAX_Q = 40;
  // One planning screen: four action slots, with the five policies as one-click presets that fill them.
  const modes = { slots: '행동 칸 + 운영 방침' };
  const actions = {
    stream: { name: '방송', short: 'ON AIR', detail: '돈·팬 증가 / 칸당 건강 -11', color: '#dd7457' },
    train: { name: '훈련', short: 'LESSON', detail: '선택 주제 실력 +8 / 칸당 8만원', color: '#6976bd' },
    charm: { name: '본체 관리', short: 'CARE', detail: '매력 +9 / 칸당 7만원', color: '#b4779b' },
    rest: { name: '휴식', short: 'REST', detail: '건강 +13 / 신뢰 +1', color: '#5f9880' }
  };
  const topics = { talk: '잡담', game: '게임', song: '노래' };
  const policies = {
    income: { name: '수익 집중', desc: '방송 75% · 휴식 25%', plan: { stream: 3, train: 0, charm: 0, rest: 1 } },
    talent: { name: '실력 성장', desc: '방송 25% · 훈련 50% · 휴식 25%', plan: { stream: 1, train: 2, charm: 0, rest: 1 } },
    balance: { name: '꾸준한 활동', desc: '방송 50% · 훈련 25% · 휴식 25%', plan: { stream: 2, train: 1, charm: 0, rest: 1 } },
    image: { name: '이미지 준비', desc: '방송 25% · 본체 관리 50% · 휴식 25%', plan: { stream: 1, train: 0, charm: 2, rest: 1 } },
    recover: { name: '재충전', desc: '훈련 25% · 휴식 75%', plan: { stream: 0, train: 1, charm: 0, rest: 3 } }
  };
  const clamp = (v, min = 0, max = 100) => Math.min(max, Math.max(min, v));
  // Broadcast concept. Topic × concept has a hidden fit (1~5 stars) that is the same in every run,
  // so finding a great combo feels like the player's own discovery. Revealed after the broadcast.
  const CONCEPTS = { cozy: '아늑한 수다', challenge: '도전·내기', horror: '공포·긴장', latenight: '새벽 감성', retro: '추억·레트로', event: '이벤트·참여형' };
  const FIT = {
    talk: { cozy: 4, challenge: 3, horror: 2, latenight: 5, retro: 3, event: 4 },
    game: { cozy: 2, challenge: 5, horror: 4, latenight: 3, retro: 4, event: 3 },
    song: { cozy: 3, challenge: 2, horror: 1, latenight: 4, retro: 5, event: 3 }
  };
  const FIT_Q = [0, -10, -5, 0, 6, 12];
  const fitOf = (topic, concept) => (FIT[topic] && FIT[topic][concept]) || 3;
  const round = v => Math.round(v * 10) / 10;
  const clone = v => JSON.parse(JSON.stringify(v));
  const MAX_GEAR = 5;
  // Career stages rise on a leap stage, not with time. need = fans required to enter the next leap stage.
  const TIERS = [
    { name: '개인 방송', ceiling: 5000, rent: 0, gearMax: 2, slots: 1, leapCost: 80, pay: 1, need: 3000 },
    { name: '기획사 확장', ceiling: 25000, rent: 30, gearMax: 4, slots: 2, leapCost: 300, pay: 1.6, need: 15000 },
    { name: '전성기', ceiling: 100000, rent: 90, gearMax: 5, slots: 3, leapCost: 1500, pay: 2.5, need: 95000 },
    { name: '레전드', ceiling: 400000, rent: 180, gearMax: 5, slots: 4, leapCost: 0, pay: 3.5, need: 0 }
  ];
  const STAFF = {
    chat: { name: '채팅 매니저', salary: 10, auto: 'chat', desc: '채팅 관리를 대신 맡는다' },
    gamecoach: { name: '게임 코치', salary: 16, auto: 'assist', desc: '게임 도와주기를 대신 맡는다' },
    vocal: { name: '보컬 트레이너', salary: 16, auto: 'sing', desc: '노래 박자를 대신 맡는다' },
    trainer: { name: '트레이너', salary: 24, desc: '훈련 효율 +25%, 실력 한계 75 → 100' },
    editor: { name: '편집자', salary: 20, desc: '클립 흥행 +6%p, 팬 +8% · 지난 방송 반응·제안 발견 지원' },
    sales: { name: '영업 담당', salary: 26, desc: '방송 수입 +20%' }
  };
  const PROJECTS = {
    model3d: { name: '3D 모델', tier: 1, price: 300, desc: '방송 품질 +8' },
    song: { name: '오리지널 곡', tier: 1, price: 220, desc: '팬 +12% · 노래 +6' },
    goods: { name: '굿즈', tier: 2, price: 700, desc: '방송 수입 +15%' },
    concert: { name: '단독 콘서트', tier: 2, price: 1500, desc: '팬 +25%' },
    studio: { name: '개인 스튜디오', tier: 3, price: 3000, desc: '방송 품질 +10 · 수입 +10%' },
    worldtour: { name: '월드 투어', tier: 3, price: 4000, desc: '팬 +20% · 노래 +5' }
  };
  // Staff can run a minigame, always a little worse than doing it well yourself.
  const AUTO = { score: .5, veteran: .65, veteranAfter: 8 };
  const staffCount = s => Object.keys(s.staff || {}).length;
  const salaries = s => Object.keys(s.staff).reduce((a, k) => a + STAFF[k].salary, 0) * TIERS[s.tier].pay;
  const upkeep = s => 14 + s.gear * 3 + TIERS[s.tier].rent + salaries(s);
  // Self-training stalls near 75; a trainer lifts the ceiling to 100.
  function trainGain(s, skill) {
    const coach = !!s.staff.trainer, cap = coach ? 105 : 78;
    return 8 * (coach ? 1.25 : 1) * clamp((cap - skill) / (cap - 45), 0, 1);
  }
  function trainedSkill(s, skill, slots) { let v = skill; for (let i = 0; i < Math.floor(slots); i++) v += trainGain(s, v); return clamp(v); }
  const incomeBoost = s => (s.staff.sales ? .2 : 0) + (s.projects.goods ? .15 : 0) + (s.projects.studio ? .1 : 0);
  // Leap stage: open at year end (every 4th quarter) once fans reach the stage requirement, or the quarter right after a failed try.
  function leapInfo(s) {
    const t = TIERS[s.tier];
    if (s.tier >= TIERS.length - 1) return { open: false, top: true, need: 0, cost: 0, retry: false };
    const retry = s.leap.retryQ === s.q, yearEnd = s.q % 4 === 0;
    const cost = retry ? s.leap.retryCost : t.leapCost;
    const nextYearEnd = Math.ceil(s.q / 4) * 4 === s.q ? s.q : Math.ceil(s.q / 4) * 4;
    return { open: (retry || yearEnd) && s.fans >= t.need, retry, yearEnd, need: t.need, cost, next: nextYearEnd, to: TIERS[s.tier + 1].name };
  }
  // Each stage asks more of the broadcast; the Legend stage needs top quality and a lucky night.
  const leapChance = (s, quality, success, viral = false) => clamp(.25 + (quality - 50 - s.tier * 20 - (s.tier >= 2 ? 22 : 0)) / 55 + (success ? .12 : -.12) + (viral ? .08 : 0), .05, s.tier >= 2 ? .5 : .92);
  const critics = ['채팅창', '클립 채널', '커뮤니티', '업계 관계자'];
  // Live chat minigame. Its effect stays small so preparation keeps deciding the broadcast.
  // Over 20 quarters these compound, so the per-broadcast fan bonus stays small.
  const LIVE = { chance: .04, fans: .05, review: 1.2 };
  const chatNicks = ['감자튀김장인', '새벽세시', '루미네고양이', '출근하기싫다', '모니터뒤먼지', '편의점요정', '무한리필', '방구석평론가', '한입만', '퇴근요정', '치즈볼', '택배기다림', '알람다섯개', '수면부족', '물만먹음', '고인물', '뉴비1호', '월요병'];
  // Mild trolling only: spam, backseating, leak threats. Satire, no slurs.
  const chatLines = {
    toxic: ['구독자 1만 3일 보장 ▶ 프로필 링크 클릭', '노잼. 채널 돌림 ㅂㅂ', '방송 접고 알바나 해라 ㅋㅋ', '목소리 AI 아님? ㅋㅋ', '옆 방송이 백배 나음', '본체 누군지 앎ㅋ 곧 푼다', '광고 문의는 나한테 ㅋ 싸게 해줌', '답답해서 내가 켠다 진짜'],
    toxicBy: {
      talk: ['썰 지어낸 거 다 티남', '어제 한 얘기 또 하네 ㅡㅡ'],
      game: ['왼쪽!! 아 그거 아니라고 ㅡㅡ', '공략 좀 보고 해라 ㅋㅋ'],
      song: ['음이탈 클립 따감 ㅋㅋ', '노래 끄고 게임이나 해']
    },
    good: [['첫 방송부터 봤어요! 늘 응원해요', '처음부터요? 그럼 우리 고인물 동지네요. 고마워요!'], ['오늘 목소리 컨디션 좋다', '들켰다! 오늘 물 두 컵 마셨거든요.'], ['퇴근하고 이거 보는 낙으로 살아요', '오늘도 퇴근 축하드려요. 여기서 쉬다 가세요!'], ['루미 웃음소리 중독됨 ㅋㅋ', '에헤헤… 아, 방금 그거 또 나왔다!'], ['밥 먹으면서 보는 중! 같이 먹어요', '메뉴 뭐예요? 저는 편의점 삼각김밥이요.']],
    goodBy: {
      talk: [['편의점 알바 썰 2탄 해주세요', '2탄은… 매니저님 허락이 필요해요 ㅋㅋ'], ['이 얘기 클립각이다', '클립 따주시면 제가 조회수 1 올릴게요!']],
      game: [['방금 컨트롤 미쳤다 ㄷㄷ', '연습한 보람이 있네요! 클립 부탁해요!'], ['보스 2페이즈 조심! 스포 아님', '힌트만 주는 착한 채팅… 고마워요!']],
      song: [['고음에서 소름 돋았어요', '녹음 파일로 백 번 연습한 부분이에요!'], ['다음 곡 신청해도 돼요?', '신청곡 메모해둘게요. 다음 노래 방송에서!']]
    },
    normal: ['ㅋㅋㅋㅋㅋㅋ', '안녕하세요~', 'ㅎㅇㅎㅇ', '방금 들어옴', '8282', '오늘 몇 시까지 해요?', 'ㄷㄷ', '와', '배고프다', '과제하다 도망옴', '화질 좋네', '소리 잘 들려요']
  };
  const LIVE_MS = 19000;
  const liveNames = { chat: '채팅 관리', reaction: '표정 리액션', prompt: '드립 선택', assist: '게임 도와주기', aim: '타깃 조준', raid: '보스 패턴 대응', sing: '노래 박자 맞추기', lyrics: '가사 이어 부르기', pitch: '음 높이 맞추기' };
  const liveRotations = { talk: ['chat', 'reaction', 'prompt'], game: ['assist', 'aim', 'raid'], song: ['sing', 'lyrics', 'pitch'] };
  // Only actual broadcasts advance a topic's rotation. Version 4 histories already hold these fields.
  const liveKind = (topic, s) => {
    const rotation = liveRotations[topic] || liveRotations.talk;
    const count = s ? (s.history || []).filter(r => r.topic === topic && r.plan && r.plan.stream > 0).length : 0;
    return rotation[count % rotation.length];
  };
  const liveFamily = kind => Object.values(liveRotations).find(kinds => kinds.includes(kind))?.[0] || '';
  const assistCues = {
    left: ['아이템 상자는 왼쪽!', '왼쪽 벽에 비밀 통로가 있어', '오른쪽에서 화살! 왼쪽으로 피해'],
    jump: ['발밑에 가시 함정! 점프', '구덩이다, 뛰어!', '굴러오는 통나무, 넘어!'],
    right: ['출구는 오른쪽 문', '회복 포션이 오른쪽에 있어', '왼쪽에서 보스 돌진! 오른쪽으로']
  };
  // Presentation only: the chart rank is a readable view of fan count and never feeds back into the rules.
  const chartRank = fans => Math.max(1, Math.round(12000 / Math.pow(Math.max(1, fans), .75)));
  // Independent random channels mean changing one choice does not shift all later draws.
  function roll(seed, q, channel) {
    let h = 2166136261;
    for (const c of `${seed}:${q}:${channel}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  function create(mode = 'slots', seed = 'STUDIO-01') {
    if (!modes[mode]) throw new Error('지원하지 않는 모드');
    return { version: VERSION, mode, seed: String(seed), q: 1, phase: 'plan', cash: 140, fans: 120,
      health: 80, trust: 65, skills: { talk: 30, game: 25, song: 20 }, charm: 25, gear: 0,
      flags: {}, debt: 0, burnout: 0, conflicts: 0, exposed: false, history: [], pending: null, last: null, ending: null,
      tier: 0, staff: {}, auto: { chat: true, assist: true, sing: true }, projects: {}, leap: { retryQ: 0, retryCost: 0, attempts: 0 }, story: ['ch1'], reactions: 0,
      goal: null, goals: [], yearFans: 120, career: Career.create() };
  }
  function planFrom(mode, draft) {
    if (!draft) throw new Error('일정 초안이 없습니다');
    if (mode === 'slots') {
      if (!Array.isArray(draft.slots) || draft.slots.length !== 4) throw new Error('일정 칸은 네 개입니다');
      return draft.slots.reduce((a, k) => { if (!actions[k]) throw new Error('알 수 없는 일정'); a[k]++; return a; }, { stream: 0, train: 0, charm: 0, rest: 0 });
    }
    throw new Error('지원하지 않는 모드');
  }
  function market(s) {
    const key = Object.keys(topics)[Math.floor(roll(s.seed, s.q, 'market') * 3)];
    return { key, name: topics[key], boost: 1.25 };
  }
  function normalize(plan) {
    if (!plan || Object.keys(plan).some(k => !actions[k])) throw new Error('알 수 없는 일정');
    const result = {};
    for (const k of Object.keys(actions)) {
      if (!Number.isFinite(plan[k]) || plan[k] < 0 || plan[k] > 4) throw new Error('일정 값 오류');
      result[k] = plan[k];
    }
    if (Math.abs(Object.values(result).reduce((a, b) => a + b, 0) - 4) > .00001) throw new Error('일정 합계는 100%여야 합니다');
    return result;
  }
  function preview(s, plan, topic, ambitious = false, leap = false, concept = 'cozy', programId = 'regular') {
    const p = normalize(plan);
    if (!topics[topic]) throw new Error('방송 주제를 골라주세요');
    if (!CONCEPTS[concept]) throw new Error('방송 콘셉트를 골라주세요');
    const program = Career.program(s, topic, p.stream > 0 ? programId : 'regular');
    const skill = trainedSkill(s, s.skills[topic], p.train);
    const health = clamp(s.health + p.rest * 13 + p.charm - p.train);
    const charm = clamp(s.charm + p.charm * 9);
    const chance = clamp(.28 + skill * .0045 + health * .002 + s.gear * .025 - (ambitious ? .15 : 0), .12, .93);
    const cost = round(upkeep(s) + (p.train * 8 + p.charm * 7) * (1 + s.tier * .5) + (ambitious && p.stream > 0 ? 8 : 0) + program.cost);
    // 방송감 carries every broadcast a little, so an entertainer build is not locked to talk shows.
    const quality = (topic === 'talk' ? skill * .68 : skill * .53 + s.skills.talk * .15) + charm * .12 + health * .2 + s.gear * 4 + (s.projects.model3d ? 8 : 0) + (s.projects.studio ? 10 : 0) + FIT_Q[fitOf(topic, concept)];
    const baseIncome = p.stream * (16 + s.gear * 4 + .8 * Math.sqrt(s.fans)) * (1 + incomeBoost(s)) * (1 + s.tier * 0.22);
    const li = leap ? leapInfo(s) : null;
    return { cost, skill: round(skill), health: round(clamp(health - p.stream * 11)), chance, quality, program,
      leapCost: li ? li.cost : 0, leapChance: li ? leapChance(s, quality, true) : 0, leapChanceFail: li ? leapChance(s, quality, false) : 0,
      risk: chance >= .7 ? '낮음' : chance >= .5 ? '보통' : '높음',
      incomeLow: Math.floor(baseIncome * (ambitious ? .35 : .7)),
      incomeHigh: Math.ceil(baseIncome * (ambitious ? 1.65 : 1.12)),
      trend: market(s).key === topic };
  }
  const eventArtIds = new Set(['moka_worry', 'brand', 'moka_tour', 'moka10', 'moka_rival', 'rival_final', 'moka_rival2', 'reunion', 'song_contest', 'song_request', 'album', 'song_memory', 'leak', 'rumor', 'reveal_choice', 'fanmeet', 'photo2', 'face_years', 'brand_wary', 'goodluck', 'team', 'solo_mgr', 'slump_comedy', 'slump', 'burnout9', 'senior', 'year3', 'duo_final', 'anniv', 'halfway', 'raise', 'contract5', 'overseas', 'model3d_offer', 'award8', 'first_fan', 'newface', 'juniors', 'concert_offer', 'goods_offer']);
  const E = (id, title, body, options, art, extra) => ({ id, title, body, options, art: eventArtIds.has(id) ? id : art || id, ...(extra || {}) });
  const O = (id, label, effect, delta = {}, flags = {}) => ({ id, label, effect, delta, flags });
  // Story-spine events, one per quarter. Quarters in DECK_Q draw from the event deck instead,
  // and the deck reuses the events written for those quarters as its 'mid' cards.
  function fixedEvent(s, q) {
    const topic = s.pending.topic;
    switch (q) {
      case 1: return E('debut', '첫 방송, 어디까지 꾸밀까?', '루미: “완벽한 설정도 좋은데… 말하다가 제 성격이 새어 나오면 어떡하죠?”', [
        O('natural', '조금 서툴러도 우리 말투로', '신뢰 +6 / 이번 방송 수익 변화 없음', { trust: 6 }, { persona: 'natural' }),
        O('concept', '이번엔 콘셉트를 끝까지 지키자', '이번 방송 수익·팬 +15% / 신뢰 -4', { trust: -4, multiplier: .15 }, { persona: 'concept' })]);
      case 2: return E('collab', '시청자 42명의 합방 제안', '동기 버튜버 모카가 합방을 제안했다. 팬은 적지만 준비한 기획서는 놀랄 만큼 꼼꼼하다.', [
        O('help', '우리도 준비비를 보태자', '15만원 지출 / 신뢰 +5 / 이번 방송 팬 +20%', { cash: -15, trust: 5, fanBonus: .2 }, { moka: 'helped' }),
        O('fair', '비용을 나누고 가볍게 해보자', '5만원 지출 / 이번 방송 팬 +10%', { cash: -5, fanBonus: .1 }, { moka: 'met' }),
        O('skip', '지금은 우리 방송에 집중', '즉시 비용 없음', {}, { moka: 'missed' })]);
      case 3: return E('sponsor', '“효과는 개인차입니다”', '정체불명의 집중력 젤리 광고. 루미는 성분표가 제품명보다 짧다는 사실을 발견했다.', [
        O('accept', '조건 확인은 나중에, 계약부터', '45만원 수입 / 신뢰 -10 / 갈등 +1', { cash: 45, trust: -10, conflicts: 1 }, { sponsor: true }),
        O('check', '검증된 제품으로 다시 협상', '15만원 수입 / 신뢰 +3', { cash: 15, trust: 3 }, { adClean: true }),
        O('no', '우리도 안 먹는 건 광고하지 말자', '신뢰 +7', { trust: 7 }, { adClean: true })]);
      case 4:
        if (s.flags.moka === 'helped' || s.flags.moka === 'met') return E('moka_return', '모카가 가져온 답장', `2분기에 ${s.flags.moka === 'helped' ? '준비비를 보태줬던' : '함께 방송했던'} 모카의 클립이 떴다. “이번 무대는 같이 올라가요.”`, [
          O('stage', '함께 작은 공연을 준비', '12만원 지출 / 이번 방송 팬 +60% / 신뢰 +5', { cash: -12, fanBonus: .6, trust: 5 }, { stage: true }),
          O('later', '고맙지만 다음을 기약하자', '신뢰 +2', { trust: 2 })]);
        return E('solo', '모니터 밖의 동기들', '지난번 합방을 거절했던 모카의 클립이 뜨고 있다. 루미는 축하 메시지를 쓰다가 지운다.', [
          O('reach', '먼저 축하 연락을 보내보자', '신뢰 +4 / 갈등 -1', { trust: 4, conflicts: -1 }, { moka: 'reached' }),
          O('focus', '우리에게도 다음 기회가 있어', '이번 방송 팬 +10%', { fanBonus: .1 })]);
      case 5: return E('song', '저, 노래 한 곡 내보고 싶어요', '루미가 휴대폰 녹음 파일을 건넨다. 장비 잡음 사이로 제법 오래 연습한 목소리가 들린다.', [
        O('promise', '다음 분기에는 노래에 집중하자', '신뢰 +8 / 다음 분기 노래 활동 약속', { trust: 8 }, { songPromise: true }),
        O('compromise', '작은 커버부터 함께 준비하자', '12만원 지출 / 노래 +6 / 신뢰 +4', { cash: -12, song: 6, trust: 4 }),
        O('dismiss', '지금 잘 팔리는 방송부터 하자', '이번 방송 수익 +20% / 신뢰 -12 / 갈등 +1', { multiplier: .2, trust: -12, conflicts: 1 })]);
      case 6:
        if (!s.exposed && roll(s.seed, 6, 'privacy') < .35 + s.pending.plan.stream * .07 + (s.pending.ambitious ? .1 : 0)) return E('privacy', '배송 상자에 비친 얼굴', '방송 화면 구석에 실제 모습이 잠깐 비쳤다. 아직 작은 커뮤니티의 이야기지만 대응을 정해야 한다.', [
          O('protect', '클립 정리와 보호 조치를 지원', '25만원 지출 / 신뢰 +6 / 이번 노출 차단', { cash: -25, trust: 6 }, { secret: 'protected' }),
          O('open', '본인과 상의해 공개로 전환', '신뢰 +3 / 본체 매력에 따라 팬 반응 변화', { trust: 3 }, { reveal: true }),
          O('deny', '일단 부인하고 방송을 밀어붙임', '신뢰 -10 / 갈등 +1 / 루머로 팬 12% 감소', { trust: -10, conflicts: 1, fanLoss: .12 }, { secret: 'denied' })]);
        return E('camera', '화면 밖에서도 괜찮은 나', '프로필 촬영 제안이 왔다. 공개 범위는 루미가 정할 수 있다.', [
          O('private', '얼굴은 숨기고 스타일만 살리자', '8만원 지출 / 매력 +5 / 신뢰 +4', { cash: -8, charm: 5, trust: 4 }),
          O('rest', '지금은 컨디션부터 챙기자', '건강 +8 / 신뢰 +3', { health: 8, trust: 3 })]);
      case 7:
        if (s.flags.sponsor) return E('sponsor_return', '젤리 회사의 해명문', '3분기에 받은 광고의 과장 문구가 논란이 됐다. 루미: “그때 같이 확인하자고 했잖아요.”', [
          O('refund', '광고비를 돌려주고 책임을 설명', '35만원 지출 / 신뢰 +8 / 갈등 -1', { cash: -35, trust: 8, conflicts: -1 }, { sponsorResolved: true }),
          O('ignore', '회사 문제라고 선을 긋자', '팬 18% 감소 / 신뢰 -12 / 갈등 +1', { fanLoss: .18, trust: -12, conflicts: 1 })]);
        return E('future', '이번 분기엔 숨을 좀 돌릴까요', `루미: “${topics[topic]}도 좋지만, 쉬는 날까지 방송 생각을 하게 돼요.”`, [
          O('listen', '빈 시간을 함께 지키자', '건강 +10 / 신뢰 +6 / 갈등 -1', { health: 10, trust: 6, conflicts: -1 }),
          O('push', '이번 기회만 잡고 쉬자', '이번 방송 수익·팬 +25% / 건강 -8 / 신뢰 -8 / 갈등 +1', { multiplier: .25, health: -8, trust: -8, conflicts: 1 })]);
      case 8: return E('oldclip', '처음의 우리를 다시 보니', s.flags.persona === 'concept' ? '첫 방송의 완벽한 캐릭터와 지금의 루미를 비교한 영상이 올라왔다. “요즘은 설정을 잊은 건가요?”' : '서툴렀던 첫 방송 클립을 오래된 팬이 다시 올렸다. “여기서부터 봤어요.”', [
        O('honest', '변해온 모습을 이야기하자', '신뢰 +6 / 이번 방송 팬 +15%', { trust: 6, fanBonus: .15 }),
        O('nostalgia', '초심 콘셉트 특집을 하자', '이번 방송 수익·팬 +25% / 건강 -5', { multiplier: .25, health: -5 })]);
      case 9: return E('festival', '작지만 우리 이름이 있는 무대', s.flags.stage ? '4분기의 공동 공연을 본 기획자가 다시 연락했다. 이번엔 루미 이름으로 서는 무대다.' : '온라인 페스티벌의 빈자리에 초대받았다. 준비가 부족해도 기회는 기다려주지 않는다.', [
        O('join', '준비비를 투자하고 출연', '28만원 지출 / 이번 방송 팬 +75% / 건강 -5', { cash: -28, fanBonus: .75, health: -5 }, { festival: true }),
        O('home', '익숙한 방에서 특별 방송', '8만원 지출 / 이번 방송 팬 +20%', { cash: -8, fanBonus: .2 })]);
      case 10: return E('halfway', '2년 반, 첫 기획서를 다시 펴다', '루미가 데뷔 때 쓴 기획서를 꺼냈다. 절반은 이뤘고, 절반은 여전히 빈칸이다. “남은 칸은 어떻게 채울까요?”', [
        O('together', '남은 칸은 같이 정하자', '신뢰 +7 / 갈등 -1', { trust: 7, conflicts: -1 }),
        O('business', '숫자로 증명하자', '이번 방송 수익·팬 +20% / 신뢰 -5', { multiplier: .2, trust: -5 })], 'contract');
      case 11: {
        const first = Object.keys(s.staff)[0];
        if (first) return E('team', '새 동료의 첫 회의', `새로 온 ${STAFF[first].name}의 첫 제안은 “방송 시작 10초 안에 웃겨야 한다”였다. 루미는 회의 내내 메모만 한다.`, [
          O('mediate', '둘의 의견을 섞은 구성으로', '신뢰 +4 / 이번 방송 팬 +10%', { trust: 4, fanBonus: .1 }),
          O('staffway', '전문가 말대로 바꿔보자', '이번 방송 팬 +25% / 신뢰 -6 / 갈등 +1', { fanBonus: .25, trust: -6, conflicts: 1 })], 'future');
        return E('solo_mgr', '혼자 다 하는 매니저', '편집, 일정, 광고 메일 답장까지. 매니저의 모니터에는 탭이 서른 개 열려 있다. 루미가 말없이 커피를 두고 간다.', [
          O('honest_mgr', '루미에게 솔직하게 힘들다고 말하기', '신뢰 +5', { trust: 5 }),
          O('outsource', '편집 외주를 한 번 맡겨보자', '15만원 지출 / 이번 방송 팬 +20%', { cash: -15, fanBonus: .2 })], 'future');
      }
      case 12: return E('year3', '3년차, 채팅방의 작은 축제', '팬들이 데뷔 3주년 채팅 이벤트를 몰래 준비하고 있었다. 공지 맨 아래에 “주최: 무보수 자원봉사자 일동”이라고 적혀 있다.', [
        O('surprise', '모른 척하고 제대로 놀라주자', '신뢰 +6', { trust: 6 }),
        O('fanday', '감사 방송으로 화답하자', '10만원 지출 / 신뢰 +4 / 이번 방송 팬 +20%', { cash: -10, trust: 4, fanBonus: .2 })], 'festival');
      case 13: {
        if (s.flags.sponsor && !s.flags.sponsorResolved) return E('brand_wary', '광고주들이 망설인다', '젤리 논란 기사가 아직 검색 첫 페이지에 있다. 새 광고 제안은 번번이 “내부 검토 중”에서 멈춘다.', [
          O('apology', '늦었지만 정식으로 사과하자', '20만원 지출 / 신뢰 +6 / 갈등 -1', { cash: -20, trust: 6, conflicts: -1 }, { sponsorResolved: true }),
          O('moveon', '작은 광고부터 다시 받자', '30만원 수입 / 신뢰 -4', { cash: 30, trust: -4 })], 'sponsor_return');
        const big = 60 + 40 * s.tier, half = 30 + 20 * s.tier;
        return E('brand', '대형 게임사의 광고 제안', s.flags.adClean ? '대형 게임사에서 신작 광고를 제안했다. “예전에 광고를 까다롭게 고르시던데, 그래서 믿음이 갔어요.”' : '대형 게임사에서 신작 광고를 제안했다. 조건은 좋지만 대본에 “인생 게임”이 네 번 들어 있다.', [
          O('honest_ad', '솔직한 후기 방식으로 협상하자', `${half}만원 수입 / 신뢰 +5 / 이번 방송 팬 +15%`, { cash: half, trust: 5, fanBonus: .15 }),
          O('script', '대본대로 깔끔하게', `${big}만원 수입 / 신뢰 -3`, { cash: big, trust: -3 })], 'sponsor');
      }
      case 14:
        if (s.flags.moka === 'helped' || s.flags.moka === 'met') return E('moka_tour', '모카의 합동 투어 제안', '모카가 온라인 합동 투어 기획서를 들고 왔다. 이번에도 기획서가 루미 것보다 두껍다.', [
          O('tour', '같이 가자, 준비비는 반반', '30만원 지출 / 이번 방송 팬 +45% / 건강 -6', { cash: -30, fanBonus: .45, health: -6 }, { mokaDuo: true }),
          O('cheer', '이번엔 응원만 하자', '신뢰 +3', { trust: 3 })], 'moka_return');
        return E('moka_rival', '경쟁 기획사의 간판, 모카', s.flags.moka === 'reached' ? '먼저 축하를 건넸던 모카가 경쟁 기획사의 간판이 되었다. “연말에 대결 방송 할래요? 진심으로요.”' : '합방을 거절했던 모카가 경쟁 기획사의 간판이 되어 대결 방송을 제안했다. 댓글창은 이미 편을 나눴다.', [
          O('decline_duel', '대결 대신 축하만 보내자', '신뢰 +3 / 갈등 -1', { trust: 3, conflicts: -1 }),
          O('duel', '대결을 받아들이자', '이번 방송 팬 +35% / 건강 -4', { fanBonus: .35, health: -4 }, { mokaRival: true })], 'solo');
      case 15:
        if (s.exposed) return E('fanmeet', '공개 1년, 첫 오프라인 팬미팅', '실제 모습을 공개한 뒤 오프라인 팬미팅 요청이 쌓였다. 루미: “화면 밖에서 눈을 마주치는 건 처음이에요.”', [
          O('meet', '작게라도 열어보자', '25만원 지출 / 매력 +4 / 이번 방송 팬 +30%', { cash: -25, charm: 4, fanBonus: .3 }),
          O('online_meet', '온라인 팬미팅으로 대신하자', '신뢰 +3 / 이번 방송 팬 +10%', { trust: 3, fanBonus: .1 })], 'camera');
        if (s.flags.secret === 'denied') return E('leak', '캡처가 다시 돌기 시작했다', '부인했던 얼굴 캡처가 고화질로 다시 올라왔다. 이번엔 “합성 아님” 인증까지 붙었다.', [
          O('confess', '이제는 사실대로 말하자', '신뢰 +4 / 본체 매력에 따라 팬 반응 변화', { trust: 4 }, { reveal: true, secret: 'confessed' }),
          O('deny_again', '끝까지 부인하자', '신뢰 -10 / 갈등 +1 / 팬 10% 감소', { trust: -10, conflicts: 1, fanLoss: .1 })], 'privacy');
        if (s.flags.secret === 'protected') return E('rumor', '잊을 만하면 도는 루머', '보호 조치로 막았던 루머가 “그때 그 사람”이라는 제목으로 다시 올라왔다.', [
          O('legal', '이번엔 정식으로 대응하자', '30만원 지출 / 신뢰 +5', { cash: -30, trust: 5 }),
          O('ignore_rumor', '무시하고 방송에 집중하자', '팬 5% 감소', { fanLoss: .05 })], 'privacy');
        return E('photo2', '화보 촬영 두 번째 제안', '프로필 촬영 반응이 좋아 화보 제안이 다시 왔다. 이번엔 얼굴이 살짝 보이는 콘셉트다.', [
          O('photo_style', '얼굴은 숨기고 분위기만', '12만원 지출 / 매력 +6', { cash: -12, charm: 6 }),
          O('photo_skip', '컨디션을 먼저 챙기자', '건강 +6 / 신뢰 +2', { health: 6, trust: 2 })], 'camera');
      case 16:
        if (s.reactions >= 3) return E('slump_comedy', '리액션 클립만 뜬다', '조회수 상위 영상이 전부 게임에서 망한 순간이다. 루미: “제가 웃음거리만 되는 건 아닐까요?”', [
          O('embrace', '망하는 것도 재능이라고 말해주자', '신뢰 +2 / 이번 방송 팬 +20%', { trust: 2, fanBonus: .2 }, { comedy: true }),
          O('skillup', '실력으로도 보여주자', '게임 +6 / 신뢰 +5', { game: 6, trust: 5 })], 'future');
        return E('slump', '4년차의 권태', '매일 같은 시간, 같은 인사. 루미가 방송 시작 버튼 앞에서 한참 멈춰 있다.', [
          O('vacation', '일주일 휴가를 주자', '건강 +12 / 신뢰 +5 / 팬 3% 감소', { health: 12, trust: 5, fanLoss: .03 }),
          O('newidea', '새 콘셉트 방송을 해보자', '15만원 지출 / 이번 방송 팬 +20%', { cash: -15, fanBonus: .2 })], 'future');
      case 17:
        if (s.flags.songKept || s.projects.song) return E('song_contest', '노래 대회 초청장', s.projects.song ? '오리지널 곡을 들은 온라인 노래 대회에서 초청장이 왔다. 심사위원 명단에 루미의 우상이 있다.' : '약속대로 노래 방송을 이어온 덕에 온라인 노래 대회에서 초청장이 왔다. 심사위원 명단에 루미의 우상이 있다.', [
          O('contest', '나가자, 준비는 같이', '20만원 지출 / 노래 +4 / 이번 방송 팬 +40%', { cash: -20, song: 4, fanBonus: .4 }, { songStage: true }),
          O('pass_contest', '지금 흐름을 지키자', '신뢰 +1', { trust: 1 })], 'song');
        return E('song_request', '노래 방송 요청이 쌓였다', '“노래 한 번만”이라는 후원 메시지가 이번 달에만 마흔 개다. 루미는 반쯤 기대하는 눈치다.', [
          O('cover_song', '작은 커버 방송을 열자', '노래 +5 / 신뢰 +3', { song: 5, trust: 3 }),
          O('not_now', '지금은 주력 방송에 집중하자', '이번 방송 수익 +15% / 신뢰 -3', { multiplier: .15, trust: -3 })], 'song');
      case 18:
        if (staffCount(s) >= 2) return E('raise', '스태프들의 조용한 요청', '스태프들이 처우 개선 자료를 발표 자료로 만들어 왔다. 표지에 루미 팬아트가 들어가 있다.', [
          O('raise_pay', '처우를 올려주자', '40만원 지출 / 신뢰 +3', { cash: -40, trust: 3 }),
          O('refuse_raise', '지금은 어렵다고 설명하자', '신뢰 -4 / 갈등 +1', { trust: -4, conflicts: 1 })], 'contract');
        return E('senior', '선배 방송인의 조언', '10년차 선배 방송인이 합방 끝에 말했다. “숫자보다 오래 버티는 법을 먼저 배워요.”', [
          O('listen_senior', '조언대로 쉬는 법을 배우자', '건강 +8 / 신뢰 +3', { health: 8, trust: 3 }),
          O('learn_talk', '방송 노하우를 배우자', '방송감 +5', { talk: 5 })], 'oldclip');
      case 19:
        if (s.flags.mokaDuo) return E('duo_final', '모카와 함께 서는 마지막 무대', '투어의 마지막 도시. 모카가 무대 뒤에서 루미 손을 잡는다. “첫 합방 때 시청자 42명이었던 거 기억나요?”', [
          O('duo', '둘이서 끝까지', '30만원 지출 / 이번 방송 팬 +60%', { cash: -30, fanBonus: .6 }, { mokaFinal: true }),
          O('duo_light', '무리하지 말고 즐기자', '이번 방송 팬 +25% / 건강 +5', { fanBonus: .25, health: 5 })], 'festival');
        if (s.flags.mokaRival) return E('rival_final', '모카와의 대결 무대', '연말 대결 방송 당일. 두 기획사 팬들이 채팅창에서 이미 한 판 붙었다.', [
          O('rival_friend', '대결 대신 합동 무대로 바꾸자', '이번 방송 팬 +35% / 신뢰 +3', { fanBonus: .35, trust: 3 }, { mokaFinal: true }),
          O('rival_win', '정면 승부', '이번 방송 수익·팬 +25% / 건강 -6', { multiplier: .25, health: -6 })], 'solo');
        return E('anniv', '5년차 기념 방송', '데뷔 5년 기념 방송. 첫 방송 때 쓰던 노트북이 소품으로 무대에 올랐다.', [
          O('anniv_small', '처음처럼 작게', '신뢰 +4', { trust: 4 }),
          O('anniv_big', '크게 준비하자', '15만원 지출 / 이번 방송 팬 +30%', { cash: -15, fanBonus: .3 })], 'festival');
      case 20: return E('contract5', '5년, 반환점', '루미가 첫 기획서를 다시 펼친다. “5년 뒤에도 우리 이렇게 하고 있을까요?”', [
        O('together', '다음 5년 목표는 같이 정하자', '신뢰 +7 / 갈등 -1', { trust: 7, conflicts: -1 }),
        O('business', '더 큰 성과를 약속하자', '이번 방송 수익·팬 +20% / 신뢰 -5', { multiplier: .2, trust: -5 })], 'contract');
      case 21: {
        const c = 30 + 20 * s.tier;
        return E('poach', '경쟁 기획사의 스카우트', '카페에서 만난 대형 기획사 스카우트가 계약서를 밀어놓는다. “지금의 두 배를 드리죠.” 루미가 테이블 아래에서 휴대폰으로 매니저에게 메시지를 보낸다. “어떡해요?”', [
          O('stay', '“루미가 정해요” 결정을 맡기기', '신뢰 +8 / 갈등 -1', { trust: 8, conflicts: -1 }, { poach: 'trusted' }),
          O('counter', '우리도 조건을 맞춰 재계약하자', `${c}만원 지출 / 신뢰 +4`, { cash: -c, trust: 4 }, { poach: 'counter' }),
          O('leverage', '제안을 협상 카드로 쓰자', '40만원 수입 / 신뢰 -6 / 갈등 +1', { cash: 40, trust: -6, conflicts: 1 }, { poach: 'used' })], 'ev_poach');
      }
      case 22:
        if (s.projects.model3d) return E('showcase3d', '3D 쇼케이스 무대', '3D 모델로 처음 서는 쇼케이스. 리허설에서 루미가 손을 흔들자 화면 속 루미도 똑같이 손을 흔든다. “저 진짜 여기 있어요!”', [
          O('showcase_big', '춤까지 준비해서 제대로', '20만원 지출 / 건강 -5 / 이번 방송 팬 +45%', { cash: -20, health: -5, fanBonus: .45 }),
          O('showcase_talk', '편하게 이야기하는 쇼케이스', '이번 방송 팬 +20% / 신뢰 +3', { fanBonus: .2, trust: 3 })], 'ev_model3d');
        return E('model3d_offer', '3D 모델, 이제는 필요할까', '모션 캡처 스튜디오에서 지원금 제안이 왔다. 루미는 마커가 잔뜩 붙은 옷을 보며 반쯤 겁먹었다.', [
          O('build3d', '지원금을 받아 3D 모델을 만들자', `${Math.round(PROJECTS.model3d.price * .6)}만원 지출 / 3D 모델 완성(방송 품질 +8)`, { cash: -Math.round(PROJECTS.model3d.price * .6), project: 'model3d' }),
          O('later3d', '아직은 2D가 우리답다', '신뢰 +3', { trust: 3 })], 'ev_model3d');
      case 23: {
        const c = 20 + 15 * s.tier, worse = s.flags.secret === 'denied' || (s.flags.sponsor && !s.flags.sponsorResolved);
        return E('controversy', '잘린 클립 한 조각', worse ? '예전 방송의 한 장면이 앞뒤가 잘려 퍼졌다. 댓글에는 옛 논란까지 다시 끌려 나왔다. 알림 수가 분 단위로 늘어난다.' : '예전 방송의 한 장면이 앞뒤가 잘려 퍼졌다. 알림 수가 분 단위로 늘어난다. 루미: “저 그런 뜻 아니었는데…”', [
          O('explain', '원본을 공개하고 차분히 설명하자', `신뢰 +5 / 팬 ${worse ? 6 : 3}% 감소`, { trust: 5, fanLoss: worse ? .06 : .03 }),
          O('lawyer', '악의적 편집에 법적 대응', `${c}만원 지출 / 팬 변화 없음`, { cash: -c }),
          O('silence', '조용히 지나가길 기다리자', `팬 ${worse ? 15 : 10}% 감소 / 신뢰 -4`, { fanLoss: worse ? .15 : .1, trust: -4 })], 'ev_news');
      }
      case 24: return E('award6', '연말 시상식 초대장', s.tier >= 2 ? '‘올해의 버추얼 방송인’ 후보 명단에 루미의 이름이 있다. 루미는 초대장을 세 번 다시 읽었다.' : '시상식 객석 초대장이 왔다. 후보는 아니지만, 무대를 가까이서 볼 기회다. 루미: “언젠가는 저 위에…”', [
        O('speech', '수상 소감도 준비하자, 혹시 모르니까', '10만원 지출 / 이번 방송 팬 +30%', { cash: -10, fanBonus: .3 }, { award6: true }),
        O('enjoy', '부담 없이 즐기고 오자', '건강 +6 / 신뢰 +3', { health: 6, trust: 3 })], 'ev_award');
      case 25:
        if (s.burnout > 0 || s.health < 50) return E('clinic', '링거 한 병의 휴가', '방송 직후 루미가 어지럽다며 주저앉았다. 병원 침대에서도 루미는 휴대폰으로 채팅 반응부터 확인한다.', [
          O('rest_long', '한 달은 쉬게 하자', '건강 +20 / 신뢰 +5 / 팬 5% 감소', { health: 20, trust: 5, fanLoss: .05 }),
          O('rest_short', '일주일만 쉬고 돌아오자', '건강 +10', { health: 10 })], 'ev_hospital');
        return E('letters', '6년 치 편지 상자', '사무실 창고에서 팬레터 상자가 나왔다. 맨 위 편지에는 크레파스로 그린 루미가 있다.', [
          O('read_stream', '편지 읽는 방송을 하자', '신뢰 +4 / 이번 방송 팬 +20%', { trust: 4, fanBonus: .2 }),
          O('reply', '한 장씩 답장을 쓰자', '건강 -4 / 신뢰 +8', { health: -4, trust: 8 }, { replied: true })], 'ev_letter');
      case 26: return E('charity', '자선 방송 제안', '아동 병원에서 자선 방송 협업을 제안했다. 루미가 먼저 손을 들었다. “해요. 이건 하고 싶어요.”', [
        O('charity_full', '수익 전액을 기부하자', '이번 방송 수익 -60% / 신뢰 +8 / 이번 방송 팬 +30%', { multiplier: -.6, trust: 8, fanBonus: .3 }, { charity: true }),
        O('charity_part', '수익 일부만 기부하자', '신뢰 +3 / 이번 방송 팬 +10%', { trust: 3, fanBonus: .1 })], 'ev_charity');
      case 27:
        if (s.flags.mokaFinal) return E('moka_worry', '모카의 새벽 전화', '“요즘 방송 켜는 게 무서워요.” 투어를 함께 돌았던 모카의 목소리가 떨린다. 루미는 이미 외투를 입고 있다.', [
          O('moka_help', '합방으로 곁에 있어주자', '건강 -5 / 신뢰 +4 / 이번 방송 팬 +25%', { health: -5, trust: 4, fanBonus: .25 }, { mokaBond: true }),
          O('moka_space', '쉬어도 된다고 말해주자', '신뢰 +3', { trust: 3 }, { mokaBond: true })], 'collab');
        if (s.flags.mokaRival) return E('moka_rival2', '모카의 두 번째 도전장', '연말 대결 이후 모카가 다시 도전장을 보냈다. 이번엔 손편지다. “이번엔 진짜 친구로서 붙어요.”', [
          O('rival_team', '대결 대신 팀전으로 하자', '이번 방송 팬 +30% / 신뢰 +3', { fanBonus: .3, trust: 3 }, { mokaBond: true }),
          O('rival_again', '한 번 더 정면 승부', '이번 방송 수익·팬 +20% / 건강 -5', { multiplier: .2, health: -5 })], 'solo');
        return E('newface', '신인들의 인사', '새로 데뷔한 버튜버들이 인사하러 왔다. “선배님 첫 방송 클립 보고 시작했어요.” 루미가 매니저를 돌아본다. “저 이제 선배래요.”', [
          O('mentor', '합동 신입 응원 방송', '이번 방송 팬 +20% / 신뢰 +3', { fanBonus: .2, trust: 3 }),
          O('solo_focus', '우리 방송에 집중하자', '이번 방송 수익 +10%', { multiplier: .1 })], 'story_office');
      case 28: return E('tv', '예능 프로그램 섭외', '지상파 예능에서 섭외가 왔다. 대본 첫 장에 “벌칙: 매운 떡볶이”라고 적혀 있다. 루미: “저 매운 거 못 먹는데요…?”', [
        O('tv_go', '출연하자, 망가져도 좋다', '건강 -6 / 이번 방송 팬 +45%', { health: -6, fanBonus: .45 }, { tv: true }),
        O('tv_safe', '벌칙 없는 코너로 협상', '이번 방송 팬 +15%', { fanBonus: .15 }),
        O('tv_no', '방송은 우리 채널에서만', '신뢰 +3', { trust: 3 })], 'ev_tv');
      case 29: {
        if (s.projects.concert) return E('encore', '앙코르 투어 요청', '단독 콘서트 영상이 백만 조회를 넘었다. “다음 공연은 언제예요?”라는 댓글이 매일 쌓인다.', [
          O('encore_go', '도시 세 곳을 돌자', '40만원 지출 / 건강 -8 / 이번 방송 팬 +50%', { cash: -40, health: -8, fanBonus: .5 }, { encore: true }),
          O('encore_one', '서울에서 한 번만 더', '15만원 지출 / 이번 방송 팬 +20%', { cash: -15, fanBonus: .2 })], 'ev_concert');
        const c = 25 + 10 * s.tier;
        return E('concert_offer', '작은 공연장 대관 제안', '200석짜리 공연장에 빈 날짜가 생겼다. 루미가 좌석 배치도를 한참 들여다본다. “200명… 다 채울 수 있을까요?”', [
          O('concert_small', '작게라도 해보자', `${c}만원 지출 / 노래 +4 / 이번 방송 팬 +35%`, { cash: -c, song: 4, fanBonus: .35 }, { smallConcert: true }),
          O('concert_wait', '더 준비하고 하자', '노래 +3', { song: 3 })], 'ev_concert');
      }
      case 30:
        if (s.projects.goods) return E('goods_issue', '굿즈 품절 대란', '아크릴 스탠드가 10분 만에 품절됐다. 중고 사이트에 세 배 가격으로 올라온 걸 본 루미의 표정이 굳는다.', [
          O('restock', '재판매로 모두에게 보내자', '30만원 지출 / 신뢰 +5 / 이번 방송 팬 +10%', { cash: -30, trust: 5, fanBonus: .1 }),
          O('limited', '한정판으로 남기자', '30만원 수입 / 신뢰 -4', { cash: 30, trust: -4 })], 'ev_goods');
        return E('goods_offer', '굿즈 제작 제안', '굿즈 업체가 샘플을 들고 왔다. 루미 인형의 눈이 살짝 몰려 있다. 루미: “…귀엽긴 하네요.”', [
          O('goods_make', '샘플을 고쳐서 만들자', `${Math.round(PROJECTS.goods.price * .6)}만원 지출 / 굿즈 완성(방송 수입 +15%)`, { cash: -Math.round(PROJECTS.goods.price * .6), project: 'goods' }),
          O('goods_skip', '팬들 지갑은 소중하다', '신뢰 +2', { trust: 2 })], 'ev_goods');
      case 31:
        if (s.exposed) return E('face_years', '가면 없이 보낸 시간', '실제 모습을 공개한 뒤의 시간을 정리한 다큐 제안이 왔다. 루미: “그때 무서웠던 것까지 다 말해도 될까요?”', [
          O('face_doc', '솔직한 다큐를 찍자', '15만원 지출 / 매력 +4 / 이번 방송 팬 +25%', { cash: -15, charm: 4, fanBonus: .25 }),
          O('face_rest', '이제는 평범하게 지내자', '건강 +6 / 신뢰 +3', { health: 6, trust: 3 })], 'camera');
        return E('reveal_choice', '이제는 밝혀도 될까', '루미가 먼저 이야기를 꺼냈다. “8년 동안 숨겼잖아요. 이제는 제 얼굴로 인사해도 될 것 같아요.”', [
          O('reveal_now', '함께 준비해서 공개하자', '신뢰 +5 / 본체 매력에 따라 팬 반응 변화', { trust: 5 }, { reveal: true, secret: 'chosen' }),
          O('keep_mask', '가면도 우리의 일부야', '신뢰 +4', { trust: 4 }, { maskKept: true })], 'privacy');
      case 32: return E('award8', '올해의 버추얼 스타', s.tier >= 2 ? '시상식 사무국에서 축하 무대를 제안했다. 후보 발표 직후, 루미의 이름이 호명될 수도 있는 무대다.' : '올해도 시상식 객석 초대장이 왔다. 무대 위의 동기들을 보며 루미가 박수를 친다.', [
        O('award_perform', s.tier >= 2 ? '축하 무대까지 맡자' : '객석에서 응원 방송을 하자', s.tier >= 2 ? '20만원 지출 / 건강 -5 / 이번 방송 팬 +40%' : '이번 방송 팬 +20%', s.tier >= 2 ? { cash: -20, health: -5, fanBonus: .4 } : { fanBonus: .2 }, s.tier >= 2 ? { awardStage: true } : {}),
        O('award_seat', '조용히 박수만 치고 오자', '신뢰 +3', { trust: 3 })], 'ev_award');
      case 33: return E('juniors', '후배들의 질문 상자', '같은 기획사 후배들이 질문 상자를 들고 왔다. 첫 질문: “선배님은 그만두고 싶었던 적 없어요?”', [
        O('advice_stream', '조언 방송을 열자', '방송감 +4 / 신뢰 +3', { talk: 4, trust: 3 }),
        O('advice_private', '따로 밥 한 끼 사주자', '15만원 지출 / 신뢰 +5', { cash: -15, trust: 5 })], 'story_office');
      case 34: return E('overseas', '해외 플랫폼의 러브콜', '해외 스트리밍 플랫폼에서 동시 방송을 제안했다. 새벽 세 시 방송이 포함된 일정표를 보고 루미가 웃는다. “이건 체력 싸움이네요.”', [
        O('overseas_go', '해외 동시 방송에 도전', '건강 -8 / 이번 방송 수익·팬 +35%', { health: -8, multiplier: .35 }, { overseas: true }),
        O('overseas_sub', '자막만 달아 천천히', '15만원 지출 / 이번 방송 팬 +15%', { cash: -15, fanBonus: .15 }),
        O('overseas_no', '우리 시간대를 지키자', '신뢰 +3', { trust: 3 })], 'ev_poach');
      case 35: {
        if (s.flags.songStage || s.projects.song || s.flags.songKept) {
          const c = 40 + 20 * s.tier;
          return E('album', '첫 정규 앨범 제안', '레이블에서 정규 앨범을 제안했다. 루미가 5분기에 건넸던 녹음 파일을 아직 휴대폰에 갖고 있다.', [
            O('album_go', '열 곡, 끝까지 가보자', `${c}만원 지출 / 노래 +8 / 건강 -6 / 이번 방송 팬 +30%`, { cash: -c, song: 8, health: -6, fanBonus: .3 }, { album: true }),
            O('album_single', '싱글 한 곡만 내자', '노래 +4 / 이번 방송 팬 +15%', { song: 4, fanBonus: .15 })], 'song');
        }
        return E('song_memory', '휴대폰 속 오래된 녹음', '휴대폰 사진첩을 정리하다 5분기의 녹음 파일이 나왔다. 루미: “이거 아직도 있었어요?”', [
          O('sing_again', '지금 목소리로 다시 부르자', '노래 +5 / 신뢰 +4', { song: 5, trust: 4 }),
          O('keep_memory', '추억으로 두자', '신뢰 +2', { trust: 2 })], 'song');
      }
      case 36: return E('burnout9', '9년차의 권태', '매일 같은 시간, 같은 인사, 같은 마무리 멘트. 루미가 오프닝 멘트를 쓰다 말고 펜을 내려놓는다.', [
        O('sabbatical', '한 분기는 가볍게 가자', '건강 +15 / 신뢰 +5 / 이번 방송 수익 -30%', { health: 15, trust: 5, multiplier: -.3 }),
        O('reinvent', '새 콘셉트로 갈아엎자', '20만원 지출 / 건강 -4 / 이번 방송 팬 +30%', { cash: -20, health: -4, fanBonus: .3 })], 'future');
      case 37: return E('first_fan', '첫 방송의 시청자', '“고인물”이라는 닉네임의 편지가 왔다. 10년 전 첫 방송, 시청자 3명이던 날의 채팅 캡처가 함께 들어 있다.', [
        O('invite', '다음 방송에 초대하자', '신뢰 +5 / 이번 방송 팬 +20%', { trust: 5, fanBonus: .2 }, { firstFan: true }),
        O('read_quiet', '조용히 읽고 간직하자', '신뢰 +7', { trust: 7 }, { firstFan: true })], 'ev_letter');
      case 38:
        if (s.flags.mokaBond || s.flags.mokaFinal) return E('moka10', '모카와 함께한 10년', '모카가 두 사람의 첫 합방 썸네일을 액자로 만들어 왔다. “10주년 무대, 같이 서요. 이번엔 제가 준비비 낼게요.”', [
          O('moka10_stage', '10주년 합동 무대를 열자', '25만원 지출 / 이번 방송 팬 +45%', { cash: -25, fanBonus: .45 }, { mokaFinal: true }),
          O('moka10_talk', '둘이 옛날 이야기만 하자', '신뢰 +5', { trust: 5 })], 'moka_return');
        return E('reunion', '동기들의 10주년', '같은 해에 데뷔한 버튜버들의 단체 채팅방이 오랜만에 울렸다. 남은 사람은 절반, 모두 조금씩 다른 길을 걷고 있다.', [
          O('reunion_stream', '동기 합동 방송을 열자', '이번 방송 팬 +30% / 신뢰 +3', { fanBonus: .3, trust: 3 }),
          O('reunion_toast', '조촐한 모임으로 축하하자', '10만원 지출 / 건강 +5 / 신뢰 +4', { cash: -10, health: 5, trust: 4 })], 'solo');
      case 39: {
        const c = 40 + 30 * s.tier;
        return E('anniv10', '10주년 기념 공연', '10주년 공연 기획 회의. 화이트보드에는 “가장 큰 무대”와 “처음 그 방”이라는 두 단어가 나란히 적혀 있다.', [
          O('anniv10_big', '가장 큰 무대로 가자', `${c}만원 지출 / 건강 -6 / 이번 방송 팬 +60%`, { cash: -c, health: -6, fanBonus: .6 }, { anniv10: true }),
          O('anniv10_home', '첫 방이 있던 그 방에서', '신뢰 +6 / 이번 방송 팬 +20%', { trust: 6, fanBonus: .2 }, { homeAnniv: true })], 'story_arena');
      }
      default: return E('contract', '10년, 다음 페이지', '루미가 10년 전 첫 기획서를 다시 펼친다. 맨 위의 한 줄은 그대로다. “오래, 우리답게.” “다음 10년도 우리 이렇게 할 거예요?”', [
        O('together', '다음 목표는 같이 정하자', '신뢰 +7 / 갈등 -1', { trust: 7, conflicts: -1 }),
        O('business', '더 큰 성과를 약속하자', '이번 방송 수익·팬 +20% / 신뢰 -5', { multiplier: .2, trust: -5 }),
        O('graduate', '이번 활동을 마무리하자', '이번 분기 후 합의한 졸업으로 정리', {}, { graduate: true })]);
    }
  }
  // ===== Event deck: random good and bad events, Game Dev Story style =====
  // Story-spine quarters keep their written event. Every other quarter draws one card from the deck.
  // Weights depend on the manager's choices and state, so luck follows preparation.
  // Quarters 1-10 are the fixed introduction with its short chains (debut → old clip, Moka → stage → festival, ad → apology).
  // After that the story spine keeps its beats and every other quarter draws from the deck.
  const SPINE = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 17, 19, 20, 21, 24, 27, 31, 35, 37, 38, 39, 40]);
  const WHY = {
    trust: s => `신뢰 ${Math.round(s.trust)}로 쌓은 팬들의 입소문`,
    quality: s => `방송 품질을 꾸준히 올려온 준비`,
    moka: s => '예전에 모카와 쌓은 인연',
    editor: s => '편집자가 다듬어 둔 클립들',
    gear: s => `장비 ${s.gear}단계로 좋아진 화질`,
    charm: s => `본체 매력 ${Math.round(s.charm)}`,
    song: s => `노래 실력 ${Math.round(s.skills.song)}`,
    game: s => `게임 실력 ${Math.round(s.skills.game)}`,
    talk: s => `방송감 ${Math.round(s.skills.talk)}`
  };
  const mood = s => clamp((s.trust - 50) / 50, -1, 1);
  const bestSkill = s => Math.max(...Object.values(s.skills));
  // Good cards: w(s) is the draw weight, why is the reason shown to the player.
  const GOOD = [
    { id: 'shoutout', art: 'dk_shoutout', w: s => 1 + (s.trust >= 70 ? 1 : 0) + (s.staff.editor ? 1 : 0), why: ['trust', 'editor'],
      make: s => E('shoutout', '대형 방송인이 루미를 언급했다', '구독자 수백만의 대형 방송인이 방송 중에 루미의 클립을 틀었다. “이 사람 진짜 재밌어요.” 알림이 멈추지 않는다.', [
        O('ride', '오늘 바로 감사 방송을 켜자', '건강 -5 / 이번 방송 팬 +50%', { health: -5, fanBonus: .5 }),
        O('thank', '정중하게 감사 인사만 보내자', '신뢰 +3 / 이번 방송 팬 +25%', { trust: 3, fanBonus: .25 })]) },
    { id: 'fanart', art: 'dk_fanart', w: s => 1 + (s.fans > 3000 ? 1 : 0) + (s.trust >= 60 ? .5 : 0), why: ['trust'],
      make: s => E('fanart', '팬아트가 쏟아진다', '해시태그에 루미 팬아트가 하루에 수백 장씩 올라온다. 누군가는 루미를 고양이로 그렸다.', [
        O('gallery', '팬아트 소개 방송을 하자', '신뢰 +5 / 이번 방송 팬 +20%', { trust: 5, fanBonus: .2 }),
        O('contest', '팬아트 공모전을 열자', '15만원 지출 / 매력 +3 / 이번 방송 팬 +30%', { cash: -15, charm: 3, fanBonus: .3 })]) },
    { id: 'meme', art: 'dk_meme', w: s => .6 + s.reactions * .4 + (s.skills.talk >= 50 ? 1 : 0), why: ['talk'],
      make: s => E('meme', '루미 얼굴이 밈이 됐다', '놀란 루미 얼굴이 짤이 되어 커뮤니티마다 돌아다닌다. 원본 방송 조회수가 하룻밤에 열 배가 됐다.', [
        O('embrace_meme', '밈을 받아들이고 굿즈 짤로 쓰자', '매력 -2 / 이번 방송 팬 +45%', { charm: -2, fanBonus: .45 }),
        O('laugh', '같이 웃고 넘어가자', '신뢰 +3 / 이번 방송 팬 +20%', { trust: 3, fanBonus: .2 })]) },
    { id: 'adoffer', art: 'dk_adoffer', w: s => 1 + (s.flags.adClean ? 1.5 : 0) + s.tier * .4, why: ['trust'],
      make: s => { const c = 40 + 40 * s.tier; return E('adoffer', '좋은 광고 제안', s.flags.adClean ? '예전에 광고를 깐깐하게 고른 게 소문이 났다. 믿을 만한 브랜드에서 먼저 연락이 왔다.' : '제법 괜찮은 브랜드에서 광고 제안이 왔다. 제품 샘플도 정말 쓸 만하다.', [
        O('ad_yes', '받자, 솔직한 후기로', `${c}만원 수입 / 신뢰 +2`, { cash: c, trust: 2 }, { adClean: true }),
        O('ad_no', '이번엔 방송에 집중하자', '신뢰 +3', { trust: 3 })]); } },
    { id: 'grant', art: 'dk_grant', w: s => .8 + (s.cash < 150 ? 1.5 : 0), why: ['quality'],
      make: s => { const c = 60 + 30 * s.tier; return E('grant', '창작 지원금 선정', '지역 문화재단의 1인 창작자 지원 사업에 신청서를 냈었다. 오늘 선정 통보 메일이 왔다.', [
        O('grant_save', '운영 자금으로 쓰자', `${c}만원 수입`, { cash: c }),
        O('grant_train', '레슨비로 쓰자', `${Math.round(c / 2)}만원 수입 / 방송감·노래·게임 +3`, { cash: Math.round(c / 2), talk: 3, song: 3, game: 3 })]); } },
    { id: 'ost', art: 'dk_ost', w: s => .5 + (s.skills.song >= 55 ? 2 : 0), why: ['song'],
      make: s => { const c = 30 + 20 * s.tier; return E('ost', '인디 게임 OST 제안', '작은 인디 게임사가 엔딩곡을 불러 달라고 연락했다. 데모 영상 속 도트 캐릭터가 루미를 닮았다.', [
        O('ost_yes', '부르자, 제대로 녹음하자', `${c}만원 수입 / 노래 +5 / 건강 -4`, { cash: c, song: 5, health: -4 }, { ost: true }),
        O('ost_no', '일정이 빠듯해서 다음에', '신뢰 +1', { trust: 1 })]); } },
    { id: 'press', art: 'dk_press', w: s => .5 + s.tier * .8 + (s.fans > 10000 ? 1 : 0), why: ['quality', 'gear'],
      make: s => E('press', '잡지 인터뷰 요청', '문화 잡지에서 ‘주목할 버추얼 방송인’ 코너 인터뷰를 요청했다. 사진 촬영도 있다.', [
        O('press_yes', '인터뷰에 응하자', '10만원 지출 / 매력 +4 / 이번 방송 팬 +25%', { cash: -10, charm: 4, fanBonus: .25 }),
        O('press_text', '서면 인터뷰로만', '이번 방송 팬 +10%', { fanBonus: .1 })]) },
    { id: 'gamedev', art: 'dk_gamedev', w: s => .5 + (s.skills.game >= 55 ? 2 : 0), why: ['game'],
      make: s => E('gamedev', '게임사가 신작 테스트를 부탁했다', '인디 게임사가 출시 전 신작의 첫 플레이 방송을 제안했다. “루미 님 반응이 제일 솔직해서요.”', [
        O('gd_play', '독점 첫 플레이 방송', '이번 방송 팬 +35% / 게임 +3', { fanBonus: .35, game: 3 }),
        O('gd_feedback', '피드백도 꼼꼼히 해주자', '건강 -3 / 신뢰 +2 / 게임 +5', { health: -3, trust: 2, game: 5 })]) },
    { id: 'goodluck', art: 'goodluck', w: s => .7, why: [],
      make: s => E('goodluck', '알고리즘이 웃어준 주', '아무 이유 없이 추천 영상 맨 위에 루미의 방송이 걸렸다. 매니저가 이유를 찾다가 포기했다.', [
        O('go_all', '물 들어올 때 노 젓자', '건강 -6 / 이번 방송 수익·팬 +40%', { health: -6, multiplier: .4 }),
        O('go_steady', '평소대로 하자', '이번 방송 팬 +15%', { fanBonus: .15 })]) }
  ];
  // Bad cards: guard(s) says how much preparation softens the hit (0..1) and names the protection.
  const BAD = [
    { id: 'gear_break', art: 'dk_gear', w: s => 1 + (s.gear <= 1 ? 1 : 0), guard: s => s.gear >= 3 ? [.5, `장비 ${s.gear}단계의 여분 부품`] : [0, '예비 장비'],
      make: (s, g) => { const c = Math.round((30 + 15 * s.tier) * (1 - g)); return E('gear_break', '방송 장비가 멈췄다', '방송 직전, 컴퓨터에서 타는 냄새가 났다. 화면이 멈추고 팬 소리만 요란하다.', [
        O('fix_fast', '급하게 수리하고 방송하자', `${c}만원 지출`, { cash: -c }),
        O('fix_cheap', '중고 부품으로 버티자', `${Math.round(c / 3)}만원 지출 / 이번 방송 수익 -25%`, { cash: -Math.round(c / 3), multiplier: -.25 })]); } },
    { id: 'troll', art: 'dk_troll', w: s => 1 + (s.fans > 5000 ? .8 : 0) + (s.trust < 50 ? 1 : 0), guard: s => s.staff.chat ? [.5, '채팅 매니저'] : [0, '채팅 매니저'],
      make: (s, g) => { const loss = Math.round(10 * (1 - g)) / 100; return E('troll', '악플 테러', '누군가 계정을 여러 개 만들어 채팅창을 도배하기 시작했다. 루미가 방송 중 잠깐 말을 잃었다.', [
        O('ban_all', '전부 차단하고 공지하자', `건강 -4 / 팬 ${Math.round(loss * 50)}% 감소`, { health: -4, fanLoss: loss / 2 }),
        O('ignore_troll', '웃으며 방송을 이어가자', `신뢰 +2 / 팬 ${Math.round(loss * 100)}% 감소 / 건강 -8`, { trust: 2, fanLoss: loss, health: -8 })]); } },
    { id: 'policy', art: 'dk_policy', w: s => .8 + s.tier * .3, guard: s => s.staff.sales ? [.5, '영업 담당'] : [0, '영업 담당'],
      make: (s, g) => { const m = -Math.round(40 * (1 - g)) / 100; return E('policy', '플랫폼 정책이 바뀌었다', '플랫폼이 수익 배분 정책을 바꿨다. 공지는 길고, 결론은 “덜 드립니다”였다.', [
        O('adapt', '후원 방식을 바꿔 적응하자', `이번 방송 수익 ${Math.round(m * 100)}% / 신뢰 +2`, { multiplier: m, trust: 2 }),
        O('multi', '다른 플랫폼 동시 송출 준비', `20만원 지출 / 이번 방송 수익 ${Math.round(m * 50)}%`, { cash: -20, multiplier: m / 2 })]); } },
    { id: 'copyright', art: 'dk_copyright', w: s => .6 + (s.pending && s.pending.topic === 'song' ? 1.5 : 0), guard: s => s.projects.song ? [.6, '직접 만든 오리지널 곡'] : [0, '오리지널 곡'],
      make: (s, g) => { const loss = Math.round(8 * (1 - g)) / 100; return E('copyright', '저작권 경고', '예전 노래 방송에 저작권 경고가 붙었다. 영상 몇 개가 한꺼번에 비공개 처리됐다.', [
        O('appeal', '이의 신청하고 정리하자', `10만원 지출 / 팬 ${Math.round(loss * 50)}% 감소`, { cash: -10, fanLoss: loss / 2 }),
        O('delete', '문제 영상을 지우자', `팬 ${Math.round(loss * 100)}% 감소`, { fanLoss: loss })]); } },
    { id: 'hack', art: 'dk_hack', w: s => .5 + (s.fans > 8000 ? .8 : 0), guard: s => s.staff.pr || s.tier >= 2 ? [.6, '기획사 보안팀'] : [0, '보안 담당'],
      make: (s, g) => { const c = Math.round(40 * (1 - g)); return E('hack', '계정이 해킹당했다', '새벽 세 시, 루미 계정에 수상한 코인 광고가 올라왔다. 매니저 휴대폰이 쉬지 않고 울린다.', [
        O('recover', '전문 업체에 복구를 맡기자', `${c + 10}만원 지출 / 신뢰 +2`, { cash: -(c + 10), trust: 2 }),
        O('diy', '밤새 직접 복구하자', `건강 -12 / 팬 ${Math.round((1 - g) * 6)}% 감소`, { health: -12, fanLoss: (1 - g) * .06 })]); } },
    { id: 'noise', art: 'dk_noise', w: s => s.tier === 0 ? 1.5 : .2, guard: s => s.gear >= 4 ? [.6, '흡음재'] : [0, '흡음재'],
      make: (s, g) => E('noise', '윗집의 항의', '밤 방송 중에 초인종이 울렸다. 잠옷 차림의 이웃이 팔짱을 끼고 서 있다. 루미는 헤드셋을 목에 건 채 고개를 숙였다.', [
        O('soundproof', '방음재를 들이자', `${Math.round(25 * (1 - g))}만원 지출`, { cash: -Math.round(25 * (1 - g)) }),
        O('earlier', '방송 시간을 앞당기자', `이번 방송 팬 -${Math.round(15 * (1 - g))}%`, { fanBonus: -.15 * (1 - g) })]) },
    { id: 'cold', art: 'dk_cold', w: s => .6 + (s.health < 50 ? 2 : 0), guard: s => s.health >= 70 ? [.5, `건강 ${Math.round(s.health)}을 지켜온 휴식`] : [0, '평소의 휴식'],
      make: (s, g) => E('cold', '루미가 감기에 걸렸다', '아침부터 목소리가 갈라진다. 루미가 이불 속에서 휴대폰으로 방송 공지를 쓰려다 매니저에게 뺏겼다.', [
        O('rest_cold', '푹 쉬게 하자', `건강 +${Math.round(6 + 6 * g)} / 이번 방송 수익·팬 -30%`, { health: 6 + 6 * g, multiplier: -.3 }),
        O('push_cold', '짧게라도 방송하자', `건강 -${Math.round(12 * (1 - g))} / 신뢰 -2`, { health: -12 * (1 - g), trust: -2 })]) },
    { id: 'staff_quit', art: 'dk_staffquit', w: s => Object.keys(s.staff).length ? .7 + (s.trust < 60 ? 1 : 0) : 0, guard: s => s.trust >= 75 ? [.7, `신뢰 ${Math.round(s.trust)}의 팀 분위기`] : [0, '팀 분위기'],
      make: (s, g) => { const who = Object.keys(s.staff)[0]; const name = STAFF[who].name; return E('staff_quit', `${name}가 이직 제안을 받았다`, `${name}가 조심스럽게 말을 꺼냈다. “다른 회사에서 연락이 왔어요. 조건이 꽤 좋아서요.”`, [
        O('raise_keep', '처우를 올려서 붙잡자', `${Math.round(30 * (1 - g) + 10)}만원 지출 / 신뢰 +2`, { cash: -Math.round(30 * (1 - g) + 10), trust: 2 }),
        O('let_go', '좋은 기회라면 보내주자', `${name} 퇴사 / 신뢰 +3`, { trust: 3, fire: who })]); } }
  ];
  // Draw a card for a deck quarter. Two bad cards in a row make the next one more likely good (pity).
  function drawCard(s) {
    const recent = s.history.slice(-2).map(r => r.card).filter(Boolean);
    const badStreak = recent.filter(c => c.kind === 'bad').length;
    const pGood = clamp(.42 + mood(s) * .15 + (bestSkill(s) >= 60 ? .05 : 0) + badStreak * .25 - (s.health < 40 ? .12 : 0), .2, .85);
    const pMid = .2;
    const seen = new Set(s.history.map(r => r.card && r.card.id));
    const r = roll(s.seed, s.q, 'deck');
    const midQ = MIDS.filter(q => !seen.has('mid' + q));
    if (r < pMid && midQ.length) { const q = midQ[Math.floor(roll(s.seed, s.q, 'deck-mid') * midQ.length)]; return { kind: 'mid', id: 'mid' + q, q }; }
    const good = (r - pMid) / (1 - pMid) < pGood;
    const all = (good ? GOOD : BAD).filter(c => c.w(s) > 0);
    const list = all.filter(c => !seen.has(c.id) || roll(s.seed, s.q, 'repeat-' + c.id) < .3);
    const pool = list.length ? list : all;
    const total = pool.reduce((a, c) => a + Math.max(0, c.w(s)), 0) || 1;
    let x = roll(s.seed, s.q, 'deck-pick') * total;
    for (const c of pool) { x -= Math.max(0, c.w(s)); if (x <= 0) return { kind: good ? 'good' : 'bad', id: c.id }; }
    return { kind: good ? 'good' : 'bad', id: pool[pool.length - 1].id };
  }
  // Written quarter events that also work anywhere, reused as neutral 'mid' deck cards.
  const MIDS = [11, 12, 13, 15, 16, 18, 22, 23, 25, 26, 28, 29, 30, 32, 33, 34, 36];
  function event(s) {
    if (SPINE.has(s.q)) return fixedEvent(s, s.q);
    const card = drawCard(s);
    if (card.kind === 'mid') return { ...fixedEvent(s, card.q), card: { kind: 'mid', id: card.id } };
    if (card.kind === 'good') {
      const c = GOOD.find(x => x.id === card.id), e = c.make(s);
      const why = c.why.map(k => WHY[k](s)).filter(Boolean);
      return { ...e, art: c.art, card: { kind: 'good', id: c.id, why: why.length ? why[Math.floor(roll(s.seed, s.q, 'why') * why.length)] : '' } };
    }
    const c = BAD.find(x => x.id === card.id), [g, by] = c.guard(s), e = c.make(s, g);
    return { ...e, art: c.art, card: { kind: 'bad', id: c.id, guard: g, by } };
  }
  function start(s, plan, topic, ambitious, leap = false, concept = 'cozy', programId = 'regular') {
    if (s.phase !== 'plan' || s.ending) throw new Error('계획 단계가 아닙니다');
    // A big project needs a broadcast; without one the flag has no effect (including exposure risk).
    const p = normalize(plan), amb = !!ambitious && p.stream > 0;
    if (leap) {
      const li = leapInfo(s);
      if (!li.open) throw new Error('지금은 도약 무대에 나갈 수 없습니다');
      if (!p.stream) throw new Error('도약 무대에는 방송 일정이 필요합니다');
      if (s.cash < li.cost) throw new Error('도약 무대 참가비가 부족합니다');
    }
    const pre = preview(s, p, topic, amb, !!leap, concept, programId);
    const n = clone(s);
    Career.defer(n);
    n.pending = { plan: p, topic, concept, program: pre.program.id, ambitious: amb, leap: !!leap, preview: pre };
    n.phase = 'event'; n.pending.event = event(n); return n;
  }
  const planOnly = s => { if (s.phase !== 'plan' || s.ending) throw new Error('계획 단계에서만 할 수 있습니다'); };
  const gearCap = s => Math.min(MAX_GEAR, TIERS[s.tier].gearMax);
  function hire(s, id) {
    planOnly(s);
    if (!STAFF[id]) throw new Error('알 수 없는 스태프');
    if (s.staff[id]) throw new Error('이미 함께하는 스태프입니다');
    if (staffCount(s) >= TIERS[s.tier].slots) throw new Error(`지금 단계에서는 스태프를 ${TIERS[s.tier].slots}명까지 둘 수 있습니다`);
    const n = clone(s); n.staff[id] = n.q; return n;
  }
  function fire(s, id) {
    planOnly(s);
    if (!s.staff[id]) throw new Error('함께하지 않는 스태프입니다');
    const n = clone(s); delete n.staff[id]; n.trust = clamp(n.trust - 2); return n;
  }
  function setAuto(s, kind, on) {
    planOnly(s);
    if (!liveNames[kind]) throw new Error('알 수 없는 미니게임');
    const n = clone(s); n.auto[liveFamily(kind)] = !!on; return n;
  }
  function buyProject(s, id) {
    planOnly(s);
    const pj = PROJECTS[id];
    if (!pj) throw new Error('알 수 없는 프로젝트');
    if (s.projects[id]) throw new Error('이미 진행한 프로젝트입니다');
    if (s.tier < pj.tier) throw new Error(`${TIERS[pj.tier].name} 단계에서 열립니다`);
    if (s.cash < pj.price) throw new Error('프로젝트 자금이 부족합니다');
    const n = clone(s); n.cash = round(n.cash - pj.price); n.projects[id] = n.q;
    applyProject(n, id);
    return n;
  }
  // One-time effects of a project, also used when an event hands one over.
  function applyProject(n, id) {
    if (id === 'song') { n.fans = Math.round(n.fans * 1.12); n.skills.song = clamp(n.skills.song + 6); }
    if (id === 'concert') n.fans = Math.round(n.fans * 1.25);
    if (id === 'worldtour') { n.fans = Math.round(n.fans * 1.2); n.skills.song = clamp(n.skills.song + 5); }
  }
  const staffFor = (s, kind) => Object.keys(s.staff).find(k => STAFF[k] && STAFF[k].auto === liveFamily(kind)) || '';
  function upgrade(s) {
    if (s.phase !== 'plan' || s.ending) throw new Error('지금은 장비를 구매할 수 없습니다');
    if (s.gear >= gearCap(s)) throw new Error(s.gear >= MAX_GEAR ? '장비 업그레이드를 모두 마쳤습니다' : `다음 장비는 ${TIERS[s.tier + 1].name} 단계에서 열립니다`);
    const price = gearPrice(s);
    if (s.cash < price) throw new Error('장비를 살 자금이 부족합니다');
    const n = clone(s); n.cash -= price; n.gear++; return n;
  }
  const gearPrice = s => 55 + s.gear * 40;
  // Different viewers value skill, memorable moments, and comfort differently.
  const reviewScores = (n, axes, success, viral) => Career.reviews(critics, axes, success, viral, channel => roll(n.seed, n.q, channel));
  const careerView = s => Career.view(s);
  function production(s, plan, topic, ambitious = false, concept = 'cozy', programId = 'regular') {
    const pre = preview(s, plan, topic, ambitious, false, concept, programId);
    const projected = { ...s, pending: { concept }, health: pre.health, charm: clamp(s.charm + plan.charm * 9),
      trust: clamp(s.trust + plan.rest), skills: { ...s.skills, [topic]: pre.skill } };
    return { title: plan.stream ? (pre.program.id === 'regular' ? `${CONCEPTS[concept]} ${topics[topic]} #${s.q}` : `${pre.program.name} #${s.q}`) : '다음 방송을 위한 재충전',
      art: plan.stream ? `prep_${topic}` : 'clip_quiet', axes: Career.axes(projected, pre, topic, false, ambitious && plan.stream > 0, 0),
      pre, plan: clone(plan) };
  }
  const followup = s => Career.followup(s);
  function respondFollowup(s, id) {
    planOnly(s);
    const n = clone(s); Career.respond(n, id); return n;
  }
  // How busy the broadcast is: more viewers and a bigger stage mean faster chat and tighter cues.
  function liveHeat(s, choice) {
    const viewers = Math.round(8 + s.fans * .14), d = (choice && choice.delta) || {};
    const boost = (d.fanBonus || 0) + (d.multiplier || 0);
    const big = (s.pending.ambitious ? .3 : 0) + (s.pending.leap ? .3 : 0) + (boost >= .5 ? .3 : boost >= .15 ? .15 : 0);
    const crowd = clamp((Math.log10(viewers) - 1.2) / 2, 0, 1);
    return { viewers, big: big > 0, heat: Math.round(clamp(crowd * .7 + big, 0, 1) * 100) / 100 };
  }
  const shuffler = s => (list, tag) => list.map((v, i) => [roll(s.seed, s.q, `chat-${tag}-${i}`), v]).sort((a, b) => a[0] - b[0]).map(v => v[1]);
  // Chat is fixed by seed, quarter, topic and story flags, so a reload replays the same broadcast.
  function makeChat(s, choice, n) {
    const topic = s.pending.topic, f = { ...s.flags, ...(choice ? choice.flags : {}) }, shuffle = shuffler(s);
    const extraToxic = [], extraGood = [];
    if (f.sponsor && !f.sponsorResolved) extraToxic.push('젤리 먹고 집중력 올랐냐 ㅋㅋㅋ');
    if (f.secret === 'denied') extraToxic.push('상자에 비친 얼굴 캡처 있음 ㅋ');
    if (f.persona === 'concept') extraToxic.push('설정 붕괴까지 5분 남음 ㅋㅋ');
    if (f.moka && f.moka !== 'missed') extraGood.push(['모카님 방송 보고 왔어요!', '어서 와요! 모카한테도 인사 전해줄게요.']);
    if (f.reveal || s.exposed) extraGood.push(['실제 모습도 좋아요. 지금 그대로 있어줘요', '…고마워요. 이 말 오래 기억할게요.']);
    if (f.songPromise && topic === 'song') extraGood.push(['약속한 노래 방송 기다렸어요', '매니저님이랑 한 약속이니까요!']);
    const toxicPool = [...extraToxic, ...shuffle([...chatLines.toxic, ...chatLines.toxicBy[topic]], 'toxic')];
    const goodPool = [...extraGood, ...shuffle([...chatLines.good, ...chatLines.goodBy[topic]], 'good')];
    const nToxic = Math.min(toxicPool.length, Math.max(4, Math.round(n * .28)) + (s.pending.ambitious ? 1 : 0) + (s.trust < 45 ? 1 : 0) + (extraToxic.length ? 1 : 0));
    const nGood = Math.min(goodPool.length, Math.max(4, Math.round(n * .24)));
    const normalPool = shuffle(chatLines.normal, 'normal');
    const order = shuffle([...toxicPool.slice(0, nToxic).map(text => ({ kind: 'toxic', text, reply: '어… 그 얘기는 넘어갈게요…' })),
      ...goodPool.slice(0, nGood).map(([text, reply]) => ({ kind: 'good', text, reply })),
      ...Array.from({ length: n - nToxic - nGood }, (_, i) => ({ kind: 'normal', text: normalPool[i % normalPool.length], reply: '' }))], 'order');
    if (order[0].kind === 'toxic') { const j = order.findIndex(c => c.kind !== 'toxic'); [order[0], order[j]] = [order[j], order[0]]; }
    const step = (LIVE_MS - 1400) / n;
    return order.map((c, i) => {
      const nick = chatNicks[Math.floor(roll(s.seed, s.q, `chat-nick-${i}`) * chatNicks.length)];
      return { id: `c${i + 1}`, nick, ...c, reply: c.kind === 'normal' ? `${nick}님 어서 오세요!` : c.reply, at: Math.round(900 + i * step + roll(s.seed, s.q, `chat-at-${i}`) * step * .35) };
    });
  }
  function makeCues(s, heat) {
    const n = Math.round(7 + 4 * heat), win = Math.round(2100 - 800 * heat), step = (LIVE_MS - 1800) / n, keys = Object.keys(assistCues);
    return Array.from({ length: n }, (_, i) => {
      const answer = keys[Math.floor(roll(s.seed, s.q, `cue-${i}`) * keys.length)], pool = assistCues[answer];
      return { id: `a${i + 1}`, answer, text: pool[Math.floor(roll(s.seed, s.q, `cue-text-${i}`) * pool.length)], at: Math.round(1200 + i * step), win };
    });
  }
  function makeNotes(s, heat) {
    const n = Math.round(10 + 8 * heat), beat = (LIVE_MS - 3400) / n;
    return Array.from({ length: n }, (_, i) => ({ id: `n${i + 1}`, at: Math.round(2200 + i * beat + (roll(s.seed, s.q, `note-${i}`) < .25 ? beat * .5 : 0)) }));
  }
  const reactionPrompts = [
    ['smile', '첫 구독자예요! 루미 덕분에 오늘 하루가 좋았어요.'],
    ['surprise', '편의점에서 산 빵에 황금 티켓이 들어 있었어요!'],
    ['sad', '한 달 키운 게임 캐릭터 저장 파일이 날아갔어요…'],
    ['smile', '드디어 시험 끝났어요! 같이 축하해 주세요.'],
    ['surprise', '방금 모카님이 시청자 전원을 데리고 들어왔어요!'],
    ['sad', '집에 왔는데 아껴 둔 푸딩이 사라졌어요…']
  ];
  const jokePrompts = [
    ['컵라면을 세 개나 먹고 방송에 늦었대요. 한마디?', ['물을 끓이는 방법은 알아요.', '면접을 세 번 보고 왔군요!', '다음에는 시간을 지켜요.'], 1],
    ['알람 다섯 개를 전부 끄고 잤다는 시청자에게?', ['기상청도 포기한 기상이네요!', '잠을 오래 잤군요.', '내일 알람을 설정해요.'], 0],
    ['공포 방송인데 귀신보다 전기요금이 무섭대요.', ['전기요금은 납부해야죠.', '공포 영화 이야기인가요?', '이번 보스는 누진세입니다!'], 2],
    ['게임에서 또 길을 잃은 루미에게 채팅이 길치래요.', ['저는 지도에 없는 DLC를 탐험 중이에요!', '길이 복잡해서 그래요.', '지도를 열어 볼게요.'], 0],
    ['퇴근하자마자 과제하러 왔다는 시청자에게?', ['힘든 하루였겠어요.', '퇴근 뒤에 출근이라니 인생 2회차네요!', '과제를 먼저 해요.'], 1],
    ['마이크 대신 리모컨을 들고 노래했대요.', ['리모컨을 내려놓아요.', '마이크가 필요해요.', '고음 대신 채널이 올라갔겠네요!'], 2]
  ];
  const lyricPrompts = [
    ['작은 방 창가에 내려앉은 □, 오늘도 너에게 인사해', ['별빛', '영수증', '주차장'], 0],
    ['너의 목소리를 따라 걷던 □, 두 손을 맞잡고 노래해', ['리모컨', '계산기', '밤길'], 2],
    ['긴 하루가 끝나면 여기서 □, 내일의 웃음을 기다려', ['달려가', '쉬어가', '계산해'], 1],
    ['서툰 마음도 한 걸음씩 □, 우리 이야기가 시작돼', ['택배함', '재부팅', '자라나'], 2],
    ['눈을 감아도 잊지 않을 □, 너와 내가 만든 멜로디', ['순간', '비밀번호', '주차권'], 0],
    ['창문 너머로 아침이 와도 □, 다음 노래에서 다시 만나', ['환불해', '기억해', '퇴근해'], 1]
  ];
  const pitchTargets = [
    { answer: 'low', note: '낮은 도 · C3', hz: 130.81 },
    { answer: 'mid', note: '가운데 도 · C4', hz: 261.63 },
    { answer: 'high', note: '높은 도 · C5', hz: 523.25 }
  ];
  function makeRounds(s, kind, heat) {
    const reading = kind === 'prompt' || kind === 'lyrics';
    const n = Math.round(kind === 'prompt' ? 4 + heat : kind === 'lyrics' ? 5 + 2 * heat : kind === 'aim' ? 8 + 5 * heat : 6 + 4 * heat);
    const step = (LIVE_MS - 2600) / n;
    const window = Math.floor(Math.min(step - 180, reading ? 3400 - 800 * heat : 2100 - 900 * heat));
    // A seeded permutation prevents every three-choice round from using the same button.
    const options = (row, tag) => {
      const order = row[1].map((text, i) => ({ text, i, draw: roll(s.seed, s.q, `${kind}-${tag}-option-${i}`) })).sort((a, b) => a.draw - b.draw);
      return { prompt: row[0], choices: order.map(o => o.text), answer: order.findIndex(o => o.i === row[2]) };
    };
    return Array.from({ length: n }, (_, i) => {
      const pick = (pool, tag = 'pick') => pool[Math.floor(roll(s.seed, s.q, `${kind}-${tag}-${i}`) * pool.length)];
      let detail;
      if (kind === 'reaction') { const [mood, prompt] = pick(reactionPrompts); detail = { prompt, mood, answer: mood }; }
      else if (kind === 'prompt') detail = options(pick(jokePrompts), i);
      else if (kind === 'aim') {
        const answer = i % 4 === 2 ? 'ally' : 'enemy';
        detail = { answer, prompt: answer === 'enemy' ? '적 타깃! 정확히 조준해요.' : '아군 등장! 사격하지 마세요.', x: Math.round(12 + roll(s.seed, s.q, `aim-x-${i}`) * 76), y: Math.round(12 + roll(s.seed, s.q, `aim-y-${i}`) * 76) };
      } else if (kind === 'raid') {
        const attack = pick(['left', 'right', 'center']);
        detail = { attack, answer: attack === 'left' ? 'right' : attack === 'right' ? 'left' : 'guard', prompt: attack === 'left' ? '왼쪽에 붉은 경고! 오른쪽으로 피해요.' : attack === 'right' ? '오른쪽에 붉은 경고! 왼쪽으로 피해요.' : '전방 전체 공격! 방어 자세를 잡아요.' };
      } else if (kind === 'lyrics') detail = options(pick(lyricPrompts), i);
      else { const target = pick(pitchTargets); detail = { ...target, prompt: `${target.note} 음 높이에 맞춰 주세요.` }; }
      return { id: `${kind}-${i + 1}`, at: Math.round(1400 + i * step), window, ...detail };
    });
  }
  function liveScript(s, choice) {
    const { viewers, big, heat } = liveHeat(s, choice), kind = liveKind(s.pending.topic, s);
    // Boost moments: chances to catch a hot moment on stream. Better prepared broadcasts get more of them.
    const q = s.pending.preview ? s.pending.preview.quality : 50;
    const nb = (q >= 70 ? 2 : q >= 50 ? 1 : 0) + (roll(s.seed, s.q, 'boost-n') < .35 ? 1 : 0);
    const boosts = Array.from({ length: Math.min(3, nb) }, (_, i) => ({ id: 'b' + (i + 1), at: Math.round(3500 + (i + roll(s.seed, s.q, 'boost-' + i) * .6) * (LIVE_MS - 6000) / Math.max(1, nb)), win: 1600, text: ['채팅 폭주!', '레전드 장면!', '클립각 발생!'][Math.floor(roll(s.seed, s.q, 'boost-t' + i) * 3)] }));
    return { kind, viewers, big, heat, duration: LIVE_MS, boosts,
      // Chat volume: about 12 lines for a quiet room, up to 33 for a crowded, important broadcast.
      chat: makeChat(s, choice, Math.round(kind === 'chat' ? 11 + 22 * heat : 8 + 14 * heat)),
      cues: kind === 'assist' ? makeCues(s, heat) : null, notes: kind === 'sing' ? makeNotes(s, heat) : null,
      rounds: ['chat', 'assist', 'sing'].includes(kind) ? null : makeRounds(s, kind, heat) };
  }
  // Every minigame scores -0.6~1. Skipping or doing nothing is 0; mistakes push it below 0.
  function liveScore(live, input) {
    const kind = (live && live.kind) || 'chat', name = liveNames[kind];
    if (!live || !input || input.skipped) return { kind, name, skipped: true, score: 0, chance: 0, fans: 0, summary: `${name}를 건너뛰었다` };
    const boosts = Math.max(0, Math.min((live.boosts || []).length, Math.floor(Number(input.boosts) || 0)));
    const pack = (raw, detail, summary) => { const score = Math.round(clamp(raw, -.6, 1) * 100) / 100; return { kind, name, skipped: false, score, ...detail, summary, boosts, chance: round(score * LIVE.chance * 100), fans: Math.round(score * LIVE.fans * 100) }; };
    const int = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
    if (input.auto) {
      const who = input.staff;
      if (!who) return { kind, name, skipped: true, score: 0, chance: 0, fans: 0, summary: `${name}를 건너뛰었다` };
      const vet = input.since >= AUTO.veteranAfter;
      return pack(vet ? AUTO.veteran : AUTO.score, { auto: true, staff: who, boosts: 0 }, `${STAFF[who].name}가 ${name}를 맡았다${vet ? '(손발이 맞음)' : ''}`);
    }
    if (kind === 'assist') {
      const n = live.cues.length, hits = int(input.hits, n), wrong = int(input.wrong, n * 3);
      return pack(hits / n - .6 * wrong / n, { hits, n, wrong }, `게임 도와주기: 신호 ${hits}/${n} 성공${wrong ? ` · 잘못 누름 ${wrong}` : ''}`);
    }
    if (kind === 'sing') {
      const n = live.notes.length, perfect = int(input.perfect, n), good = int(input.good, n - perfect), extra = int(input.extra, n * 3);
      return pack((perfect + .7 * good) / n - .35 * extra / n, { perfect, good, n, extra }, `노래 박자: 완벽 ${perfect} · 좋음 ${good} / ${n}${extra ? ` · 헛박자 ${extra}` : ''}`);
    }
    if (Array.isArray(live.rounds)) {
      const rounds = live.rounds.filter(r => kind !== 'aim' || r.answer === 'enemy'), n = rounds.length;
      const hitIds = new Set(Array.isArray(input.hits) ? input.hits : []);
      const hits = rounds.filter(r => hitIds.has(r.id)).length, wrong = int(input.wrong, n * 3);
      return pack(hits / Math.max(1, n) - .6 * wrong / Math.max(1, n), { hits, n, wrong }, `${name}: ${hits}/${n} 성공${wrong ? ` · 잘못 누름 ${wrong}` : ''}`);
    }
    const chat = live.chat, ids = new Set(chat.map(c => c.id));
    const blocked = new Set((input.blocked || []).filter(id => ids.has(id)));
    const mentioned = new Set((input.mentioned || []).filter(id => ids.has(id) && !blocked.has(id)));
    const toxic = chat.filter(c => c.kind === 'toxic'), good = chat.filter(c => c.kind === 'good'), goal = Math.min(3, good.length);
    const hit = toxic.filter(c => blocked.has(c.id)).length, misBlocks = chat.filter(c => c.kind !== 'toxic' && blocked.has(c.id)).length;
    const picked = good.filter(c => mentioned.has(c.id)).length, trollMentions = toxic.filter(c => mentioned.has(c.id)).length;
    return pack(.6 * hit / Math.max(1, toxic.length) + .4 * Math.min(picked, goal) / Math.max(1, goal) - .15 * misBlocks - .25 * trollMentions,
      { hit, toxic: toxic.length, picked, good: good.length, goal, misBlocks, trollMentions },
      `채팅 관리: 악플 ${hit}/${toxic.length} 차단 · 좋은 채팅 ${Math.min(picked, goal)}/${goal} 언급${misBlocks ? ` · 잘못 차단 ${misBlocks}` : ''}${trollMentions ? ` · 악플에 답함 ${trollMentions}` : ''}`);
  }
  function memories(s) {
    const f = s.flags, m = [];
    if (f.persona) m.push(f.persona === 'natural' ? '첫 방송은 서툴러도 우리 말투로 시작했다.' : '첫 방송은 완벽한 콘셉트로 끝까지 버텼다.');
    if (f.stage) m.push('모카와 작은 공연 무대에 함께 섰다.');
    else if (f.moka === 'missed') m.push('모카의 첫 합방 제안을 거절했다.');
    else if (f.moka === 'reached') m.push('합방을 거절했던 모카에게 먼저 축하를 건넸다.');
    else if (f.moka) m.push('모카와 합방하며 인연을 만들었다.');
    if (f.sponsor) m.push(f.sponsorResolved ? '문제의 젤리 광고비를 돌려주고 사과했다.' : '문제의 젤리 광고는 끝까지 우리 이름에 남았다.');
    if (f.songKept === true) m.push('약속대로 노래에 집중한 분기를 보냈다.');
    if (f.songKept === false) m.push('노래 활동 약속을 지키지 못했다.');
    if (s.exposed) m.push(f.revealReaction >= .3 ? '실제 모습을 공개했고, “오히려 좋아”라는 반응이 따라왔다.' : f.revealReaction >= 0 ? '실제 모습을 공개했고, 반응은 담담했다.' : '실제 모습을 공개했지만 팬 일부가 떠났다.');
    else if (f.secret === 'protected') m.push('정체 노출 위기를 함께 막아냈다.');
    else if (f.secret === 'denied') m.push('정체 루머를 부인한 채 방송을 이어갔다.');
    if (f.festival) m.push('온라인 페스티벌 무대에 섰다.');
    if (s.tier) m.push(['', '도약 무대를 넘어 기획사로 확장했다.', '도약 무대를 두 번 넘어 전성기에 올랐다.', '도약 무대를 세 번 넘어 레전드가 되었다.'][s.tier]);
    const got = (s.goals || []).filter(g => g.ok).length;
    if ((s.goals || []).length) m.push(`해마다 세운 목표 ${s.goals.length}개 중 ${got}개를 이뤘다.`);
    if (f.charity) m.push('자선 방송 수익을 전부 기부했다.');
    const cards = s.history.map(r => r.card).filter(Boolean);
    const bad = cards.filter(c => c.kind === 'bad'), good = cards.filter(c => c.kind === 'good');
    if (good.length) m.push(`좋은 일이 ${good.length}번 찾아왔다.`);
    if (bad.length) m.push(`힘든 일을 ${bad.length}번 함께 넘겼다${bad.some(c => c.guard > 0) ? '. 준비해 둔 덕을 본 적도 있다' : ''}.`);
    const top = s.history.filter(r => r.fit >= 5)[0];
    if (top) m.push(`${top.q}분기에 ${topics[top.topic]} × ${CONCEPTS[top.concept]} 조합을 찾아냈다.`);
    if (f.firstFan) m.push('10년 전 첫 방송의 시청자에게서 편지를 받았다.');
    if (f.poach === 'trusted') m.push('스카우트 제안 앞에서 루미가 스스로 남기로 했다.');
    if (f.mokaFinal) m.push('모카와 마지막 무대에 함께 섰다.');
    if (f.songStage) m.push('노래 대회 무대에 올랐다.');
    if (s.reactions) m.push(`게임에서 망한 순간이 ${s.reactions}번 레전드 리액션이 되었다.`);
    const best = s.history.filter(r => r.score).sort((a, b) => b.score - a.score)[0];
    if (best) m.push(`최고의 방송: ${best.q}분기 ${topics[best.topic]} 방송, 평가 ${best.score}/40.`);
    return m;
  }
  // Main story: one chapter per career stage. Small chapters show up if the channel is still waiting to leap.
  // Main story: one chapter per career stage, told as short scenes. Small chapters show up if the channel is still waiting to leap.
  // Each scene: [speaker, line]. speaker '' = narration.
  const STORY = {
    ch1: { title: '1장 · 작은 방', art: 'debut', scenes: [
      ['', '노트북 한 대, 빌린 마이크, 시청자 3명. 루미의 방송은 그렇게 시작했다.'],
      ['루미', '처음엔 그냥, 누군가 제 이야기를 들어주면 좋겠다고 생각했어요.'],
      ['루미', '매니저님은요? 왜 저 같은 신인을 맡겠다고 했어요?'],
      ['', '매니저는 대답 대신 새 공책의 첫 장을 펼쳤다. 둘은 맨 위에 한 줄을 함께 적었다.'],
      ['루미', '“오래, 우리답게.” …좋아요. 이걸 우리 첫 기획서로 해요.']] },
    ch2: { title: '2장 · 이름이 알려지다', art: 'story_office', scenes: [
      ['', '도약 무대가 끝나고 대기실. 루미의 휴대폰에 처음 보는 알림 수가 떠 있다.'],
      ['루미', '매니저님, 이거 봐요. 구독자 숫자에 쉼표가 생겼어요!'],
      ['', '며칠 뒤, 작은 사무실 계약서에 도장을 찍었다. 책상이 세 개, 화분이 하나.'],
      ['루미', '이제 저 혼자 방송하는 게 아니네요. 동료도 생기고, 월세도 생기고…'],
      ['루미', '근데… 제가 처음 약속한 거, 아직 기억하죠? 공책 첫 장에 쓴 거요.']] },
    ch2s: { title: '2장 · 제자리의 친구들', art: 'story_rooftop', scenes: [
      ['', '3년차 가을. 같이 시작한 동기들 몇 명은 벌써 기획사에 들어갔다.'],
      ['루미', '부러운 건 맞아요. 솔직히 오늘 모카 소식 보고 조금 울었어요.'],
      ['루미', '그래도 우리 방에 매일 오는 사람들이 있잖아요. 고인물 님은 3년째 개근이에요.'],
      ['', '옥상 난간 너머로 도시 불빛이 깜빡인다. 다음 연말 도약 무대까지, 아직 기회는 있다.']] },
    ch3: { title: '3장 · 무대 위의 나', art: 'story_mirror', scenes: [
      ['', '전성기라는 말이 붙기 시작했다. 스케줄표는 빈칸이 없다.'],
      ['', '공연 직전의 대기실. 루미가 조명 달린 거울 앞에서 한참을 서 있다.'],
      ['루미', '사람들이 좋아하는 게 캐릭터인지, 저인지 가끔 헷갈려요.'],
      ['루미', '거울 속 저는 웃고 있는데, 저는 잘 모르겠어요.'],
      ['', '매니저는 공책 첫 장의 한 줄을 다시 떠올린다. “오래, 우리답게.” 지금의 속도가 우리다운 걸까.']] },
    ch3s: { title: '3장 · 오래 버티는 법', art: 'story_winter', scenes: [
      ['', '5년차 겨울. 숫자는 천천히 오르고, 방송은 매일 이어진다.'],
      ['루미', '크게 뜨진 못했어도, 그만두고 싶었던 적은 없어요. 이상하죠?'],
      ['루미', '오늘 케이크는 제가 살게요. 5주년이니까요. 작은 걸로요.'],
      ['', '눈길 위로 두 사람의 발자국이 나란히 찍힌다. 매니저는 다음 분기 일정표를 떠올린다.']] },
    ch4: { title: '4장 · 가장 큰 무대', art: 'story_arena', scenes: [
      ['', '레전드. 누군가는 그렇게 불렀다. 돔 공연장의 객석이 야광봉으로 채워진다.'],
      ['루미', '매니저님, 저기 맨 뒤까지 다 사람이에요. 시청자 3명이던 거 기억나요?'],
      ['', '무대로 나가기 직전, 루미가 매니저의 손을 잡는다.'],
      ['루미', '제가 여기까지 온 건, 첫날 공책에 같이 한 줄 적어준 사람이 있어서예요.']] },
    ch4s: { title: '4장 · 우리만의 무대', art: 'story_lastlight', scenes: [
      ['', '8년차. 가장 큰 무대는 아니어도, 루미의 방송은 매일 밤 켜진다.'],
      ['루미', '돔 공연은 못 했지만요, 우리 채팅창은 매일 밤 콘서트장 같아요.'],
      ['', '책상 위 스탠드 불빛 아래, 두 사람이 오래된 첫 공책을 펼쳐 본다.'],
      ['루미', '“오래, 우리답게.” 이건 지켰네요, 우리.']] },
    ch5: { title: '마지막 장 · 10년', art: 'story_lastlight', scenes: [
      ['', '10년. 처음 그 방의 노트북은 이제 사무실 선반 위 소품이 되었다.'],
      ['루미', '매니저님, 마지막 분기 계획은 같이 세워요. 처음처럼 한 칸씩요.'],
      ['루미', '어떤 결말이든, 이번에도 우리가 정하는 거예요.']] }
  };
  // Year goals: picked at New Year, checked at year end. They give each year its own small target.
  const GOALS = {
    fans: { name: '팬 늘리기', desc: s => `올해 팬 ${Math.round(goalFans(s)).toLocaleString('ko-KR')}명 달성`, reward: '보상 자금 +40만원·신뢰 +3' },
    score: { name: '명방송 만들기', desc: () => '올해 평가 30점 이상 방송 1회', reward: '보상 방송감 +4·신뢰 +3' },
    save: { name: '살림 챙기기', desc: s => `연말 자금 ${Math.round(goalCash(s))}만원 이상`, reward: '보상 건강 +10·신뢰 +3' },
    bond: { name: '관계 챙기기', desc: () => '연말 신뢰 80 이상 유지', reward: '보상 매력 +5·자금 +20만원' },
    leap: { name: '도약 무대 넘기', desc: () => '올해 도약 무대 성공', reward: '보상 자금 +80만원·신뢰 +5' }
  };
  const goalFans = s => Math.max(s.yearFans * 1.6, s.yearFans + 800);
  const goalCash = s => 200 + s.tier * 300;
  function yearGoals(s) {
    const ids = ['fans', 'score', 'save', 'bond'];
    if (s.tier < TIERS.length - 1 && s.fans >= TIERS[s.tier].need * .6) ids.unshift('leap');
    return ids.slice(0, 3);
  }
  const goalOpen = s => s.phase === 'plan' && !s.ending && s.q % 4 === 1 && !s.goal;
  function setGoal(s, id) {
    if (!goalOpen(s)) throw new Error('올해 목표는 새해 첫 분기에 정합니다');
    if (!yearGoals(s).includes(id)) throw new Error('고를 수 없는 목표입니다');
    const n = clone(s); n.goal = { id, year: Math.ceil(n.q / 4), fans: goalFans(n), cash: goalCash(n) }; n.yearFans = n.fans; n.goal.fans = goalFans(n); return n;
  }
  // Checked in the year's last quarter, including this quarter's broadcast score and leap result.
  function checkGoal(n, notes, score, leap) {
    const g = n.goal; if (!g) return null;
    const year = n.history.filter(r => Math.ceil(r.q / 4) === g.year);
    const ok = g.id === 'fans' ? n.fans >= g.fans : g.id === 'score' ? score >= 30 || year.some(r => r.score >= 30) : g.id === 'save' ? n.cash >= g.cash : g.id === 'bond' ? n.trust >= 80 : !!(leap && leap.ok) || year.some(r => r.leap && r.leap.ok);
    const res = { id: g.id, name: GOALS[g.id].name, year: g.year, ok };
    if (ok) {
      if (g.id === 'fans') { n.cash += 40; n.trust = clamp(n.trust + 3); }
      if (g.id === 'score') { n.skills.talk = clamp(n.skills.talk + 4); n.trust = clamp(n.trust + 3); }
      if (g.id === 'save') { n.health = clamp(n.health + 10); n.trust = clamp(n.trust + 3); }
      if (g.id === 'bond') { n.charm = clamp(n.charm + 5); n.cash += 20; }
      if (g.id === 'leap') { n.cash += 80; n.trust = clamp(n.trust + 5); }
      notes.push(`${g.year}년차 목표 ‘${GOALS[g.id].name}’ 달성! ${GOALS[g.id].reward}.`);
    } else notes.push(`${g.year}년차 목표 ‘${GOALS[g.id].name}’는 아쉽게 놓쳤다. 새해에 다시 정하자.`);
    n.goals.push(res); n.goal = null;
    return res;
  }
  const careers = ['작은 방의 단골', '꾸준한 인기 방송인', '대형 버튜버', '레전드'];
  const relations = { together: '함께 쓰는 다음 기획서', partner: '아직 맞춰가는 파트너', distant: '거리를 둔 재계약' };
  // Special endings replace the base ending when their story was lived through. Checked in this order.
  const SPECIALS = [
    { id: 'graduate', title: '합의한 졸업', art: 'graduate', when: s => s.flags.graduate, text: '마지막 방송을 함께 마쳤다. 숫자와 별개로, 멈출 때도 둘이 정했다.' },
    { id: 'mask', title: '가면을 벗은 스타', art: 'mask', when: s => s.exposed && s.tier >= 1 && s.charm >= 65, text: '캐릭터 뒤의 얼굴까지 사랑받는 방송인이 되었다. 루미: “처음엔 들킬까 봐 무서웠는데, 이젠 이게 저예요.”' },
    { id: 'moka', title: '모카와 함께 무대로', art: 'moka', when: s => s.flags.mokaFinal && s.flags.moka === 'helped' && s.trust >= 75, text: '시청자 42명의 합방에서 시작한 두 사람이 같은 무대의 양쪽 끝에 섰다. 다음 투어 기획서는 두 권이다.' },
    { id: 'songname', title: '노래로 남은 이름', art: 'songname', when: s => s.skills.song >= 85 && (s.flags.album || s.flags.songStage) && (s.projects.song || s.flags.album), text: '휴대폰 녹음 파일로 시작한 목소리가 이제 사람들의 재생 목록에 있다. 루미의 이름은 노래 제목 옆에 남았다.' },
    { id: 'comedy', title: '레전드 리액션의 여왕', art: 'comedy', when: s => s.reactions >= 7, text: '게임은 여전히 못한다. 대신 망하는 순간마다 채팅창이 웃음으로 가득 찬다. 편집자의 폴더에는 “레전드” 클립이 끝없이 쌓였다.' }
  ];
  const EARLY = {
    bankrupt: { title: '멈춘 사무실, 남은 목소리', art: 'bankrupt', text: '적자가 이어져 활동을 멈췄다. 언제 방송하고 언제 투자할지, 다음 회차에는 다른 배분을 해볼 수 있다.' },
    burnout: { title: '방송보다 먼저, 회복', art: 'burnout', text: '휴식 뒤에도 건강을 회복하지 못해 활동을 중단했다. 이 커리어의 다음 목표는 회복이다.' },
    independent: { title: '루미의 독립', art: 'independent', text: '반복된 충돌 끝에 루미는 혼자 기획서를 쓰기로 했다. 쌓아온 실력은 남았지만, 함께할 다음 일정은 없다.' }
  };
  // Every ending, for the ending collection: 4 careers × 3 relations + 5 special + 3 early = 20.
  const ENDINGS = [...careers.flatMap((c, t) => Object.keys(relations).map(r => ({ id: `t${t}-${r}`, title: `${c} · ${relations[r]}` }))),
    ...SPECIALS.map(x => ({ id: x.id, title: x.title })), ...Object.entries(EARLY).map(([id, x]) => ({ id, title: x.title }))];
  function ending(s, cause = '') {
    const relKey = s.trust >= 70 ? 'together' : s.trust >= 40 ? 'partner' : 'distant';
    const career = careers[s.tier], relation = relations[relKey];
    let id, title, text, art;
    const special = !cause && SPECIALS.find(x => x.when(s));
    if (cause) ({ title, text, art } = EARLY[cause]), id = cause;
    else if (special) { id = special.id; title = `${special.title} · ${career}`; text = special.text; art = special.art; }
    else {
      id = `t${s.tier}-${relKey}`; title = `${career} · ${relation}`; art = s.tier >= 3 && relKey !== 'distant' ? 'legend' : relKey;
      const careerText = ['작은 방이지만 10년 동안 매일 오는 사람들이 있다.', '이름을 말하면 알아보는 사람이 생겼다.', '업계에서 먼저 연락이 오는 방송인이 되었다.', '돔 공연장을 채운 이름. 버추얼 방송의 역사책에 루미의 장이 생겼다.'][s.tier];
      const relText = { together: '루미가 다음 기획서의 빈칸을 남겨둔다. “이건 같이 정해요.”', partner: '방송은 이어진다. 다만 루미가 원하는 것과 회사가 원하는 것을 다시 맞춰야 한다.', distant: '계약서에는 서명했지만, 회의실의 공기는 예전 같지 않다.' }[relKey];
      text = careerText + ' ' + relText;
    }
    const scored = s.history.filter(r => r.score);
    return { id, title, career, relation: cause ? '' : relation, text, cause, kind: art, art, quarter: s.q, fans: s.fans, cash: s.cash, tier: s.tier, exposed: s.exposed, memories: memories(s),
      chapters: s.story.map(k => STORY[k].title), reactions: s.reactions,
      best: scored.length ? Math.max(...scored.map(r => r.score)) : 0, legends: scored.filter(r => r.legend).length,
      virals: s.history.filter(r => r.viral).length, bestRank: Math.min(chartRank(s.fans), ...s.history.map(r => r.rank)) };
  }
  const findChoice = (s, id) => { const c = s.pending.event.options.find(o => o.id === id); if (!c) throw new Error('알 수 없는 선택'); return c; };
  const workRng = s => tag => roll(s.seed, s.q, 'workshop-' + tag);
  function beginProduction(s, choiceId, effort = 'next') {
    if (s.phase !== 'event') throw new Error('사건 선택 단계가 아닙니다');
    const choice = findChoice(s, choiceId);
    if (!s.pending.plan.stream) return settle(s, choice, null);
    const n = clone(s), p = n.pending;
    p.choiceId = choice.id;
    const info = production(n, p.plan, p.topic, p.ambitious, p.concept || 'cozy', p.program || 'regular');
    p.workshop = Workshop.create(n, info, effort, workRng(n));
    n.phase = 'production'; return n;
  }
  function productionTick(s) {
    if (s.phase !== 'production') throw new Error('제작 진행 단계가 아닙니다');
    const n = clone(s);
    Workshop.tick(n.pending.workshop, n, fitOf(n.pending.topic, n.pending.concept), workRng(n));
    return n;
  }
  function chooseProduction(s, id) {
    if (s.phase !== 'production') throw new Error('제작 진행 단계가 아닙니다');
    const n = clone(s); Workshop.choose(n.pending.workshop, id, n.cash); return n;
  }
  function launchProduction(s) {
    if (s.phase !== 'production' || s.pending.workshop.step !== 6 || !s.pending.workshop.choice) throw new Error('방송 준비를 먼저 마쳐 주세요');
    return launchLive(clone(s), findChoice(s, s.pending.choiceId));
  }
  function delegateProduction(s) {
    if (s.phase !== 'production') throw new Error('제작 진행 단계가 아닙니다');
    let n = s;
    while (n.pending.workshop.step < 6) {
      if (n.pending.workshop.step === 3 && !n.pending.workshop.choice) n = chooseProduction(n, 'delegate');
      n = productionTick(n);
    }
    return launchProduction(n);
  }
  function usePreparedCue(s) {
    const w = s.pending && s.pending.workshop;
    if (s.phase !== 'live' || !w || !w.cue || w.cueUsed) throw new Error('준비한 애드리브를 사용할 수 없습니다');
    const n = clone(s); n.pending.workshop.cueUsed = true; return n;
  }
  function launchLive(n, choice) {
    n.pending.choiceId = choice.id; n.pending.live = liveScript(n, choice); n.phase = 'live';
    const kind = n.pending.live.kind, who = staffFor(n, kind);
    if (who && n.auto[liveFamily(kind)]) return finishLive(n, { auto: true });
    return n;
  }
  // Quarters with a broadcast go live first; the chat minigame result is settled once in finishLive.
  function goLive(s, choiceId) {
    if (s.phase !== 'event') throw new Error('사건 선택 단계가 아닙니다');
    const choice = findChoice(s, choiceId);
    if (!s.pending.plan.stream) return settle(s, choice, null);
    return launchLive(clone(s), choice);
  }
  const autoInput = (s, kind) => { const who = staffFor(s, kind); return { auto: true, staff: who, since: who ? s.q - s.staff[who] : 0 }; };
  function finishLive(s, input) {
    if (s.phase !== 'live') throw new Error('방송 진행 단계가 아닙니다');
    const safe = input && input.auto ? autoInput(s, s.pending.live.kind) : input;
    return settle(s, findChoice(s, s.pending.choiceId), liveScore(s.pending.live, safe));
  }
  // One-shot settlement used by tests and bots: same rules, chat input optional (skipped = neutral).
  // Subject particle 이/가 from the last Hangul syllable's final consonant.
  const josa = w => { const c = String(w).charCodeAt(String(w).length - 1) - 0xac00; return c >= 0 && c < 11172 && c % 28 ? '이' : '가'; };
  function resolve(s, choiceId, input) {
    if (s.phase !== 'event') throw new Error('사건 선택 단계가 아닙니다');
    const choice = findChoice(s, choiceId);
    return settle(s, choice, s.pending.plan.stream ? liveScore(liveScript(s, choice), input) : null);
  }
  function settle(s, choice, live) {
    const n = clone(s), before = clone(s), p = n.pending.plan, topic = n.pending.topic;
    Career.ensure(n);
    const lv = live ? live.score : 0;
    const notes = []; const d = choice.delta;
    n.cash += d.cash || 0; n.health = clamp(n.health + (d.health || 0)); n.trust = clamp(n.trust + (d.trust || 0));
    n.conflicts = Math.max(0, n.conflicts + (d.conflicts || 0)); n.charm = clamp(n.charm + (d.charm || 0));
    for (const k of Object.keys(topics)) n.skills[k] = clamp(n.skills[k] + (d[k] || 0));
    if (d.project && !n.projects[d.project]) { n.projects[d.project] = n.q; applyProject(n, d.project); }
    if (d.fire && n.staff[d.fire]) delete n.staff[d.fire];
    // Luck is explained: good cards name a reason from the player's past choices, bad cards show what softened them.
    const card = n.pending.event.card || null;
    if (card && card.kind === 'good' && card.why) notes.push(`행운이 온 이유: ${card.why}.`);
    if (card && card.kind === 'bad') notes.push(card.guard > 0 ? `${card.by} 덕분에 피해가 ${Math.round(card.guard * 100)}% 줄었다.` : `대비가 없었다. ${card.by}${josa(card.by)} 있었다면 피해를 줄일 수 있었다.`);
    n.fans = Math.round(n.fans * (1 - (d.fanLoss || 0)));
    Object.assign(n.flags, choice.flags);
    if (n.q === 6 && n.flags.songPromise) {
      if (topic === 'song' && p.stream + p.train >= 1) { n.trust = clamp(n.trust + 8); n.flags.songKept = true; notes.push('5분기의 노래 활동 약속을 지켰다. 신뢰 +8.'); }
      else { n.trust = clamp(n.trust - 16); n.conflicts++; n.flags.songKept = false; notes.push('5분기의 노래 활동 약속을 놓쳤다. 신뢰 -16, 갈등 +1.'); }
    }
    const concept = n.pending.concept || 'cozy', fit = fitOf(topic, concept);
    const pre = preview(n, p, topic, n.pending.ambitious, n.pending.leap, concept, n.pending.program || 'regular');
    const work = n.pending.workshop || null;
    if (work) {
      const mod = Workshop.modifiers(work);
      pre.cost += work.cost; pre.health = clamp(pre.health + work.health);
      pre.chance = clamp(pre.chance + mod.chance, .12, .93);
      pre.quality = clamp(pre.quality + mod.quality);
      notes.push(`이번 방송 준비: ${Workshop.choices[work.choice].name}. 실력 준비 ${work.axes.skill} · 볼거리 ${work.axes.show} · 편안함 ${work.axes.comfort} · 남은 문제 ${work.issues}.`);
      if (work.cueUsed) notes.push('준비해 둔 애드리브로 장면을 이어 갔다. 볼거리 +4.');
      if (work.effort === 'archive') {
        const target = n.career.broadcasts.find(b => b.q === work.archiveQ);
        if (target && !target.editedQ) { target.editedQ = n.q; notes.push(`${target.q}분기 클립을 다시 편집했다. 이번 볼거리 준비 대신 지난 방송의 반응을 돕는다.`); }
      }
    }
    n.cash -= pre.cost; n.skills[topic] = pre.skill; n.charm = clamp(n.charm + p.charm * 9);
    n.health = pre.health; n.trust = clamp(n.trust + p.rest);
    if (choice.flags.reveal) {
      n.exposed = true;
      const reaction = n.charm >= 60 ? .3 : n.charm >= 40 ? .05 : -.16;
      n.flags.revealReaction = reaction;
      n.fans = Math.max(0, Math.round(n.fans * (1 + reaction)));
      notes.push(`본체 매력 ${Math.round(n.charm)}: 공개 반응으로 팬 ${reaction >= 0 ? '+' : ''}${Math.round(reaction * 100)}%. 이후 공개 활동 수익이 추가된다.`);
    }
    const chance = clamp(pre.chance + lv * LIVE.chance, .1, .95);
    const success = p.stream > 0 && roll(n.seed, n.q, 'broadcast') < chance;
    const ambitious = n.pending.ambitious;
    let factor = success ? (ambitious ? 1.65 : 1.12) : (ambitious ? .35 : .7);
    // A failed game broadcast can still land: high 방송감 turns the fail into a legendary reaction clip.
    const reaction = p.stream > 0 && !success && topic === 'game' && roll(n.seed, n.q, 'reaction') < clamp((n.skills.talk - 25) / 80 + (work ? Math.max(0, work.axes.show - work.base.show) * .004 + (work.cueUsed ? .06 : 0) : 0), .05, work ? .8 : .75);
    if (reaction) { factor = ambitious ? 1.4 : 1.25; n.reactions++; notes.push(`게임은 망했지만 방송감 ${Math.round(n.skills.talk)}의 리액션이 살렸다. 실패가 오히려 웃음이 됐다.`); }
    factor *= 1 + (d.multiplier || 0);
    const viral = p.stream > 0 && (success || reaction) && roll(n.seed, n.q, 'viral') < .07 + n.gear * .02 + (n.staff.editor ? .06 : 0) + (reaction ? .25 : 0);
    const baseIncome = p.stream * (16 + n.gear * 4 + .8 * Math.sqrt(before.fans)) * (1 + incomeBoost(n)) * (1 + n.tier * 0.22);
    const income = Math.round(baseIncome * factor + (n.exposed && p.stream > 0 ? n.charm * .12 : 0));
    // Each stage has a ceiling: word-of-mouth growth slows as fans approach it, until the next leap.
    const room = Math.max(.08, 1 - before.fans / TIERS[n.tier].ceiling);
    // After the reveal, personal charm keeps shaping every broadcast: -15% at low charm, up to +35% at high charm.
    const openBoost = n.exposed && p.stream > 0 ? clamp((n.charm - 40) / 100, -.15, .35) : 0;
    const focus = p.stream > 0 ? Career.focus(n, topic) : null;
    const fans = Math.round(p.stream * ((18 + pre.quality * .6) * (1 + n.tier * .6) + before.fans * .05 * room) * factor * (pre.trend ? 1.25 : 1) * (1 + (d.fanBonus || 0)) * (viral ? 2.5 : 1) * (1 + openBoost) * (1 + lv * LIVE.fans) * (n.staff.editor ? 1.08 : 1) * (1 + (live && live.boosts ? live.boosts * .08 : 0)) * (1 + (focus ? focus.bonus : 0)));
    if (focus) { notes.push(`${focus.sourceQ}분기 방송의 후일담 ‘${focus.name}’: 이번 팬 증가 +${Math.round(focus.bonus * 100)}%.`); n.career.focus = null; }
    if (p.stream > 0) notes.push(`방송 궁합 ${'★'.repeat(fit)}${'☆'.repeat(5 - fit)} · ${topics[topic]} × ${CONCEPTS[concept]}${fit >= 5 ? ' — 최고의 조합을 찾았다!' : fit <= 1 ? ' — 이 조합은 영 아니었다.' : ''}`);
    if (live && live.boosts) notes.push(`방송 중 부스트 ${live.boosts}번 성공! 팬 증가량 +${live.boosts * 8}%.`);
    if (live) notes.unshift(live.skipped ? `${live.name}를 건너뛰었다. 방송 결과에는 보너스도 손해도 없다.` : `${live.summary} → 성공 확률 ${live.chance >= 0 ? '+' : ''}${live.chance}%p, 팬 증가량 ${live.fans >= 0 ? '+' : ''}${live.fans}%.`);
    if (openBoost) notes.push(`공개 활동 효과: 본체 매력 ${Math.round(n.charm)} → 이번 팬 증가량 ${openBoost > 0 ? '+' : ''}${Math.round(openBoost * 100)}%.`);
    n.cash = round(n.cash + income); n.fans += fans; n.skills[topic] = round(clamp(n.skills[topic] + p.stream * .6));
    const echoes = Career.settleEchoes(n, channel => roll(n.seed, n.q, channel));
    for (const e of echoes) notes.push(`${e.sourceQ}분기 ‘${e.title}’: ${e.reason}. 팬 +${e.fans}명 · 수입 +${e.cash}만원${e.editor ? ' (편집자 지원)' : ''}.`);
    let status = p.stream === 0 ? '준비하는 분기' : reaction ? (viral ? '레전드 리액션, 클립 폭발!' : '레전드 리액션!') : viral ? '클립이 터졌다!' : success ? '방송 목표 달성' : '기대보다 조용한 방송';
    // Leap stage: the broadcast of this quarter is the audition.
    let leap = null;
    if (n.pending.leap) {
      const cost = pre.leapCost, lc = leapChance(n, pre.quality, success || reaction, viral);
      n.cash -= cost; n.leap.attempts++;
      const ok = roll(n.seed, n.q, 'leap-' + n.leap.attempts) < lc;
      leap = { ok, chance: round(lc * 100), cost, from: TIERS[n.tier].name, to: TIERS[n.tier + 1].name };
      if (ok) {
        n.tier++; n.fans = Math.round(n.fans * 1.15); n.leap.retryQ = 0; n.leap.retryCost = 0;
        status = `도약 성공! ${TIERS[n.tier].name}`;
        notes.unshift(`도약 무대 성공(가능성 ${leap.chance}%). ${TIERS[n.tier].name} 단계: 장비 ${gearCap(n)}단계까지, 스태프 ${TIERS[n.tier].slots}명까지, 새 프로젝트가 열린다. 사무실 유지비가 오른다.`);
      } else {
        n.leap.retryQ = n.q + 1; n.leap.retryCost = Math.round(cost * 1.5);
        notes.unshift(`도약 무대 실패(가능성 ${leap.chance}%). 다음 분기에 참가비 ${n.leap.retryCost}만원으로 바로 재도전할 수 있다.`);
      }
    }
    // Story chapters: a big one after each leap, a small one if the channel is still waiting.
    let story = '';
    const has = k => n.story.includes(k) || n.story.includes(k + 's');
    if (leap && leap.ok) story = ['', 'ch2', 'ch3', 'ch4'][n.tier];
    else if (n.q === 12 && !has('ch2')) story = 'ch2s';
    else if (n.q === 20 && !has('ch3')) story = 'ch3s';
    else if (n.q === 30 && !has('ch4')) story = 'ch4s';
    else if (n.q === MAX_Q - 1) story = 'ch5';
    if (story && !n.story.includes(story)) n.story.push(story); else story = '';
    if (p.stream === 0 && ((d.multiplier || 0) > 0 || (d.fanBonus || 0) > 0)) notes.push('이번 일정에는 방송이 없어 방송 성과 보너스를 사용하지 못했다.');
    if (pre.trend && p.stream > 0) notes.push(`이번 ${topics[topic]} 유행으로 팬 증가량 +25%.`);
    if (n.health <= 0) {
      n.burnout++; n.health = 35; n.fans = Math.round(n.fans * .9); n.trust = clamp(n.trust - 10);
      notes.push('건강이 바닥나 활동을 줄였다. 팬 10% 감소, 신뢰 -10. 건강 35로 회복했지만 다음 일정 조정이 필요하다.');
    }
    if (n.cash < 0) { n.debt++; notes.push(`적자 ${n.debt}/3분기. 훈련·투자 규모를 줄이거나 수입을 확보해야 한다.`); } else n.debt = 0;
    if (n.conflicts >= 2 || n.trust < 35) notes.push('관계 경고: 대화와 타협이 필요하다. 갈등 3 이상 + 신뢰 35 미만이면 독립한다.');
    let cause = '';
    if (n.debt >= 3) cause = 'bankrupt';
    else if (n.burnout >= 2) cause = 'burnout';
    else if (n.conflicts >= 3 && n.trust < 35) cause = 'independent';
    const originalAxes = p.stream > 0 ? Career.axes(n, pre, topic, reaction, ambitious, lv) : null;
    const axes = work && originalAxes ? Workshop.axes(work, originalAxes) : originalAxes;
    const reviews = axes ? reviewScores(n, axes, success, viral) : [];
    const score = reviews.reduce((a, r) => a + r.score, 0);
    const goal = n.q % 4 === 0 ? checkGoal(n, notes, score, leap) : null;
    const program = pre.program.id;
    const productionTitle = program === 'regular' ? `${CONCEPTS[concept]} ${topics[topic]} #${n.q}` : `${pre.program.name} #${n.q}`;
    const result = { q: n.q, topic, plan: clone(p), ambitious, program, productionTitle, event: n.pending.event.title, choice: choice.label,
      status, success, viral, reaction, leap, story, goal, card, concept, fit: p.stream > 0 ? fit : 0, tier: n.tier, trend: p.stream > 0 && pre.trend, chance: round(chance * 100), baseChance: round(pre.chance * 100), live, income, cost: pre.cost, fans,
      reviews, score, axes, workshop: work ? clone(work) : null, echoes, focus: focus ? clone(focus) : null, legend: score >= 32, rank: chartRank(n.fans), prevRank: chartRank(before.fans),
      deltaCash: round(n.cash - before.cash), deltaFans: n.fans - before.fans, deltaHealth: round(n.health - before.health),
      deltaTrust: round(n.trust - before.trust), notes, after: { cash: n.cash, fans: n.fans, health: n.health, trust: n.trust, gear: n.gear, skills: clone(n.skills), charm: n.charm } };
    if (axes) { const broadcast = Career.record(n, result, axes, channel => roll(n.seed, n.q, channel)); result.broadcastTitle = broadcast.title; result.opportunityGrade = broadcast.grade; }
    n.last = result; n.history.push(result); n.pending = null; n.phase = 'result';
    if (cause || n.q >= MAX_Q || n.flags.graduate) n.ending = ending(n, cause);
    return n;
  }
  function advance(s) {
    if (s.phase !== 'result' || s.ending) throw new Error('다음 분기로 진행할 수 없습니다');
    const n = clone(s); n.q++; n.phase = 'plan';
    Career.advance(n, channel => roll(n.seed, n.q, channel));
    if (n.q % 4 === 1) n.yearFans = n.fans;
    return n;
  }
  function validLive(live) {
    if (!live || !liveNames[live.kind] || !Array.isArray(live.chat)) return false;
    // Keep accepting the original Version 4 live payloads, which have no rounds property.
    if (live.kind === 'chat') return true;
    if (live.kind === 'assist') return Array.isArray(live.cues);
    if (live.kind === 'sing') return Array.isArray(live.notes);
    if (!Array.isArray(live.rounds) || !live.rounds.length || !Number.isFinite(live.duration) || live.duration <= 0) return false;
    const seen = new Set(); let end = 0;
    return live.rounds.every(r => {
      if (!r || typeof r.id !== 'string' || !r.id || seen.has(r.id) || !Number.isFinite(r.at) || !Number.isFinite(r.window) || r.window <= 0 || r.at < end || r.at + r.window > live.duration || typeof r.prompt !== 'string') return false;
      seen.add(r.id); end = r.at + r.window;
      if (live.kind === 'reaction') return ['smile', 'surprise', 'sad'].includes(r.answer) && r.mood === r.answer;
      if (live.kind === 'prompt' || live.kind === 'lyrics') return Array.isArray(r.choices) && r.choices.length === 3 && r.choices.every(c => typeof c === 'string') && [0, 1, 2].includes(r.answer);
      if (live.kind === 'aim') return ['enemy', 'ally'].includes(r.answer) && [r.x, r.y].every(v => Number.isFinite(v) && v >= 0 && v <= 100);
      if (live.kind === 'raid') return ['left', 'right', 'guard'].includes(r.answer) && ['left', 'right', 'center'].includes(r.attack);
      return ['low', 'mid', 'high'].includes(r.answer) && typeof r.note === 'string' && Number.isFinite(r.hz) && r.hz > 0;
    });
  }
  function validSave(s) {
    return !!(s && s.version === VERSION && modes[s.mode] && Number.isInteger(s.q) && s.q >= 1 && s.q <= MAX_Q &&
      Number.isInteger(s.tier) && s.tier >= 0 && s.tier < TIERS.length && s.staff && s.auto && s.projects && s.leap && Array.isArray(s.story) && Array.isArray(s.goals) &&
      ['plan', 'event', 'production', 'live', 'result'].includes(s.phase) && Array.isArray(s.history) &&
      ['cash', 'fans', 'health', 'trust', 'charm', 'gear', 'conflicts', 'debt', 'burnout'].every(k => Number.isFinite(s[k])) &&
      s.skills && Object.keys(topics).every(k => Number.isFinite(s.skills[k])) && s.flags && Career.valid(s.career) &&
      (s.phase !== 'event' || (s.pending && s.pending.plan && s.pending.event && Array.isArray(s.pending.event.options))) &&
      (!s.pending || s.pending.workshop === undefined || Workshop.valid(s.pending.workshop)) &&
      (s.phase !== 'production' || (s.pending && s.pending.plan && s.pending.plan.stream > 0 && s.pending.event && Array.isArray(s.pending.event.options) && s.pending.event.options.some(o => o.id === s.pending.choiceId) && Workshop.valid(s.pending.workshop))) &&
      (s.phase !== 'live' || !s.pending?.workshop || s.pending.workshop.step === 6 && !!s.pending.workshop.choice) &&
      (s.phase !== 'live' || (s.pending && s.pending.event && Array.isArray(s.pending.event.options) && validLive(s.pending.live) && s.pending.event.options.some(o => o.id === s.pending.choiceId))) &&
      (s.phase !== 'result' || (s.last && Array.isArray(s.last.reviews) && s.last.plan)));
  }
  return { beginProduction, productionTick, chooseProduction, launchProduction, delegateProduction, usePreparedCue, workChoices: Workshop.choices, workNames: Workshop.names, archiveTarget: Workshop.archiveTarget, careerView, followup, respondFollowup, production, programInfo: Career.program, programs: Career.programs, opportunityNames: Career.grades, axisNames: Career.axisNames, concepts: CONCEPTS, fitOf, deck: { good: GOOD.map(c => c.id), bad: BAD.map(c => c.id), spine: [...SPINE] }, goals: GOALS, yearGoals, goalOpen, setGoal, VERSION, MAX_Q, modes, actions, topics, policies, critics, live: LIVE, auto: AUTO, tiers: TIERS, staff: STAFF, projects: PROJECTS, story: STORY, endings: ENDINGS, maxGear: MAX_GEAR, create, planFrom, preview, start, goLive, finishLive, resolve, liveKind, liveFamily, liveNames, liveScript, liveScore, advance, upgrade, gearPrice, gearCap, hire, fire, setAuto, buyProject, staffFor, leapInfo, upkeep, market, roll, normalize, chartRank, validSave };
});














