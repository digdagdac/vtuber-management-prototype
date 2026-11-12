'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const G = require('../core.js');
let pw;
for (const p of [process.env.VT_PLAYWRIGHT, 'playwright'].filter(Boolean)) {
  try { pw = require(p); break; } catch (_) {}
}
if (!pw) throw new Error('Playwright를 찾지 못했습니다');
const root = path.join(__dirname, '..'), KEY = 'vtuber-core-lab-v5';
const out = path.join(root, 'output/playwright/v8'); fs.mkdirSync(out, { recursive: true });
const checks = [], errors = [], screenshots = [];
const read = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)).run, KEY);
const pass = name => { checks.push(name); console.log('PASS ' + name); };
async function load(page, run, draft) {
  await page.evaluate(([key, run, version, storySeen, draft]) => localStorage.setItem(key, JSON.stringify({ version, run, storySeen,
    draft: draft || { slots: ['stream', 'train', 'rest', 'rest'], topic: 'game', concept: 'horror', program: 'regular', effort: 'next', ambitious: false, leap: false } })), [KEY, run, G.VERSION, Object.keys(G.story), draft]);
  await page.reload();
}
async function shot(page, name) {
  const file = path.join(out, name + '.png'); await page.screenshot({ path: file, animations: 'disabled' }); screenshots.push(path.relative(root, file));
}
async function step(page, n = 1) { for (let i = 0; i < n; i++) await page.evaluate(() => window.__vtTest.productionStep()); }
async function layout(page) {
  const bad = await page.evaluate(() => {
    const errors = [];
    if (document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1) errors.push('page');
    for (const el of document.querySelectorAll('.win.production, .work-desk, .work-choices, [data-work-choice], #work-delegate, .work-foot, .production-board, [data-effort]')) {
      const r = el.getBoundingClientRect();
      if (r.bottom > innerHeight - 25 || r.top < 0 || r.right > innerWidth || r.left < 0 || el.scrollWidth > el.clientWidth + 1) errors.push(el.id || el.className);
      if ((el.matches('.work-desk') || el.matches('.production-board')) && el.scrollHeight > el.clientHeight + 1) errors.push(el.className + ':clipped');
    }
    return errors;
  });
  assert.deepEqual(bad, []);
}
(async () => {
  let browser;
  for (const opts of [{}, { channel: 'msedge' }, { channel: 'chrome' }]) { try { browser = await pw.chromium.launch({ headless: true, ...opts }); break; } catch (_) {} }
  if (!browser) throw new Error('브라우저 실행 실패');
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href + '?test=1&build=v8');
    const initial = G.setGoal(G.create(), G.yearGoals(G.create())[0]);
    for (const topic of ['game', 'song', 'talk']) {
      await load(page, initial); await page.locator('#topic-' + topic).click(); await page.locator('#commit').click();
      await page.locator('[data-choice]').first().click(); await page.locator('.win.production').waitFor();
      assert.equal((await read(page)).phase, 'production');
      await page.waitForFunction(() => { const img = document.querySelector('.work-art img'); return img?.complete && img.naturalWidth > 0; });
      assert.ok((await page.locator('.work-art img').getAttribute('src')).includes('prep_' + topic));
      await step(page, 3); await page.locator('[data-work-choice="staging"]').waitFor();
      for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080]]) { await page.setViewportSize({ width, height }); await layout(page); }
      await page.setViewportSize({ width: 1366, height: 768 });
      await shot(page, 'midpoint-' + topic);
      const mid = await read(page); await page.reload();
      assert.deepEqual(await read(page), mid); await page.locator('[data-work-choice="staging"]').click();
      await step(page, 4); await page.locator('#chat').waitFor();
      const script = (await read(page)).pending.live;
      await page.evaluate(() => window.__vtTest.advance(4000));
      const clock = await page.evaluate(() => window.__vtTest.clock());
      await page.locator('#prepared-cue').click();
      assert.equal(await page.evaluate(() => window.__vtTest.clock()), clock);
      assert.equal((await read(page)).pending.workshop.cueUsed, true);
      assert.equal(await page.locator('#prepared-cue').isDisabled(), true);
      await shot(page, 'onair-' + topic);
      await page.reload(); assert.equal(await page.locator('#prepared-cue').isDisabled(), true);
      assert.deepEqual((await read(page)).pending.live, script);
      await page.evaluate(ms => window.__vtTest.advance(ms), script.duration + 1);
      assert.equal(await page.locator('#prepared-cue').isDisabled(), true);
      assert.equal(await page.locator('.msg').count(), 0); assert.equal(await page.locator('#chat-end').isVisible(), true);
      await page.locator('#live-end').click(); await page.locator('#advance').waitFor();
      assert.match(await page.locator('.work-receipt').innerText(), /실수도 살릴 장면|애드리브/);
      assert.equal((await read(page)).history.length, 1);
      if (topic === 'game') await shot(page, 'completed-broadcast');
    }
    pass('3개 주제의 제작 장면·중간 선택·애드리브·종료 채팅·원인 기록이 실제 UI에서 연결됨');
    pass('PC 1280×720·1366×768·1920×1080에서 제작 선택과 버튼이 잘리지 않음');
    pass('중간 점검에서 재접속해도 기여가 유지되고 애드리브가 방송 타이머를 초기화하지 않음');
    pass('방송 중 재접속 후 사용한 애드리브가 복구되지 않고 기존 고정 방송이 이어짐');
    await page.locator('#advance').click();
    await page.locator('[data-effort="archive"]').click();
    assert.equal(await page.locator('[data-effort="archive"]').getAttribute('aria-pressed'), 'true');
    for (const [width, height] of [[1280, 720], [1366, 768]]) { await page.setViewportSize({ width, height }); await layout(page); }
    await shot(page, 'editing-or-next');
    await page.locator('#commit').click(); await page.locator('[data-choice]').first().click();
    assert.equal((await read(page)).pending.workshop.effort, 'archive');
    await page.locator('#work-delegate').click(); await page.locator('#live-skip').click();
    const edited = await read(page);
    assert.equal(edited.career.broadcasts[0].editedQ, 2); assert.equal(edited.history.length, 2);
    assert.ok(edited.last.echoes.some(e => e.edited));
    pass('지난 클립 편집 선택이 이번 제작과 실제 후속 보상에 반영됨');
    // First three broadcasts can be compared without playing an entire career.
    await page.locator('#advance').click(); await page.locator('#commit').click();
    await page.locator('[data-choice]').first().click(); await step(page, 3);
    await page.locator('[data-work-choice="protect"]').click(); await page.locator('#work-delegate').click();
    await page.locator('#live-skip').click(); assert.equal((await read(page)).history.length, 3);
    pass('첫 3편을 연속 제작하며 연출·기본 위임·컨디션 방침과 방송 실적이 누적됨');
    // Automatic minigames still work after preparation, rather than bypassing its accounting.
    const automatic = G.create(); automatic.staff.gamecoach = 1;
    await load(page, G.setGoal(automatic, G.yearGoals(automatic)[0]));
    await page.locator('#commit').click(); await page.locator('[data-choice]').first().click();
    await page.locator('#work-delegate').click(); await page.locator('#advance').waitFor();
    assert.equal((await read(page)).last.live.auto, true); assert.equal((await read(page)).last.workshop.choice, 'delegate');
    pass('준비 맡기기와 고용 스태프의 자동 방송이 한 번만 결산됨');
    // Old event and live payloads with no workshop remain usable.
    let old = G.start(initial, { stream: 1, train: 1, charm: 0, rest: 2 }, 'game', false);
    old = G.goLive(old, old.pending.event.options[0].id); await load(page, old);
    await page.locator('#live-skip').click(); assert.equal((await read(page)).history.length, 1);
    pass('기존 v4 생방송 저장을 제작 필드 없이 불러와 정상 결산함');
    // Restore the reported stuck save rather than resetting the player's run.
    let poor = G.start(initial, { stream: 1, train: 1, charm: 0, rest: 2 }, 'game', false);
    poor = G.beginProduction(poor, poor.pending.event.options[0].id);
    for (let i = 0; i < 3; i++) poor = G.productionTick(poor);
    for (const cash of [-100, 0, 3.9, 4]) {
      const saved = JSON.parse(JSON.stringify(poor)); saved.cash = cash;
      await load(page, saved);
      assert.equal(await page.locator('[data-work-choice="protect"]').isEnabled(), true);
      assert.equal(await page.locator('#work-delegate').isEnabled(), true);
      for (const id of ['practice', 'staging']) assert.equal(await page.locator(`[data-work-choice="${id}"]`).isEnabled(), cash >= 4);
      if (cash === -100) {
        await page.reload(); assert.deepEqual(await read(page), saved);
        await page.locator('[data-work-choice="protect"]').click();
        await page.locator('#work-delegate').click(); await page.locator('#live-skip').click();
        assert.equal((await read(page)).history.length, saved.history.length + 1);
        await page.locator('#advance').click(); assert.equal((await read(page)).q, saved.q + 1);
        await load(page, saved); await page.locator('#work-delegate').click();
        await page.locator('#live-skip').click(); await page.locator('#advance').waitFor();
        assert.equal((await read(page)).last.workshop.choice, 'delegate');
        assert.equal(await page.locator('#notice').innerText(), '');
      }
    }
    pass('적자 상태의 중간 저장을 복구해 무료 방침·맡기기로 결산과 다음 분기까지 진행하고 유료 선택은 잔액 4만원부터 허용함');
    // Real clock path, including pause at the decision, outside the test hook.
    await load(page, initial);
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href + '?build=v8');
    await page.locator('#commit').click(); await page.locator('[data-choice]').first().click();
    await page.locator('[data-work-choice="protect"]').waitFor({ timeout: 8000 });
    await page.locator('[data-work-choice="protect"]').click(); await page.locator('#chat').waitFor({ timeout: 8000 });
    assert.equal((await read(page)).phase, 'live');
    pass('실제 타이머에서도 자동 기여→중간 정지→선택→생방송이 이어짐');
    const mainSave = await page.evaluate(k => localStorage.getItem(k), KEY);
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href + '?flow=v7&build=v8&test=1');
    await page.locator('#story-skip').click(); await page.locator('[data-goal]').first().click();
    await page.locator('#commit').click(); await page.locator('[data-choice]').first().click();
    await page.locator('#chat').waitFor(); assert.equal(await page.locator('.win.production').count(), 0);
    await page.locator('#live-skip').click();
    assert.equal(await page.evaluate(k => localStorage.getItem(k), KEY), mainSave);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('vtuber-core-lab-v7-comparison')).run.history.length), 1);
    pass('기존 흐름 비교판은 제작을 생략하고 독립 저장을 사용해 본편 기록을 보존함');
    assert.deepEqual(errors, []); pass('브라우저 페이지·콘솔 오류 없음');
    fs.writeFileSync(path.join(root, 'qa/workshop-browser-results.json'), JSON.stringify({ checkedAt: new Date().toISOString(), browser: browser.version(), passed: checks.length, checks, screenshots, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
