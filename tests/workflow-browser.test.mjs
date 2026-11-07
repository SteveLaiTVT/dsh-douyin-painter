import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, access, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { Application } from '../src/app.js';
import { LocalServer } from '../src/server.js';

// All providers and capture are injected locally. This verifies the real
// browser -> HTTP -> Application workflow without paid or Douyin requests.
function silenceWav() {
  const audio = Buffer.alloc(44 + 8000);
  audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(16000, 28); audio.writeUInt16LE(2, 32);
  audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(8000, 40);
  return audio;
}
// Six-frame local GIF fixture; it is a transport/display fixture, not AI output.
const tinyGif = Buffer.concat([Buffer.from('47494638396101000100800000000000ffffff','hex'), Buffer.from('21ff0b4e45545343415045322e300301000000','hex'), ...Array.from({length:6}, (_, index) => Buffer.from(`21f90400140000002c0000000001000100000201${index % 2 ? '4c' : '44'}00`, 'hex')), Buffer.from('3b','hex')]);
async function setup(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'workflow-browser-'));
  const capture = new EventEmitter();
  capture.stop = async () => capture.emit('status', { state: 'stopped', active: false });
  capture.start = async () => capture.emit('status', { state: 'running', active: true, message: '离线注入采集源' });
  const calls = { image: 0, speech: 0 };
  const app = await new Application({ dataDir, capture, autoTick: false,
    config: { deepseek: true, openai: true, minimax: true, outputFormat: 'gif', defaultVoiceId: 'voice-a', voicePresets: [{ id: 'voice-a', label: '电台男主播' }, { id: 'voice-b', label: '温暖闺蜜' }, { id: 'voice-c', label: '清脆少女' }] },
    text: {
      explain: async () => ({ text: '今天来想象月亮便利店！先发创意，再用投1或投2投票选作品。' }),
      select: async ({ comments }) => ({ selections: comments.slice(0, 3).map(comment => ({ commentId: comment.id, reason: '贴题、有想象力', prompt: comment.text })) }),
      converse: async ({ comments }) => ({ commentId: comments.at(-1)?.id || null, text: comments.length ? '这个点子还能藏进什么惊喜？' : '', readOriginal: true }),
    },
    image: { generate: async () => { calls.image++; return { bytes: tinyGif, mime: 'image/gif' }; } },
    speech: { synthesize: async () => { calls.speech++; return { bytes: silenceWav(), mime: 'audio/wav' }; } },
  }).open();
  const server = new LocalServer({ app }); await server.start(0);
  let executablePath;
  try { await access('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'); executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'; } catch {}
  const browser = await chromium.launch({ headless: true, executablePath });
  t.after(async () => { await browser.close(); await server.close(); await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  return { app, capture, browser, server, calls };
}
function send(app, id, userId, text) { app.receive({ id, userId, text, nickname: userId || '未知观众', roomId: 'test-room', source: 'live' }); }

test('workflow browser: opening, recommendations, UID votes, queue receipts and GIF reveal form one live round', async t => {
  const { app, capture, browser, server, calls } = await setup(t);
  await app.dispatch({ action: 'theme', title: '月亮便利店', rules: '一句话说说你想买的奇妙商品' });
  capture.emit('status', { state: 'running', active: true, message: '离线采集源运行中' });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
  const faults = []; page.on('pageerror', error => faults.push(error.message));
  await page.goto(server.origin + '/control');
  await page.locator('#workflow-start').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#workflow-voice').options.length === 3);
  await page.locator('#workflow-autochat').uncheck();
  await page.locator('#workflow-voice').selectOption('voice-b');
  await page.locator('#workflow-start').click();
  await page.waitForFunction(() => document.querySelector('#workflow-phase').textContent === '开场收词');
  assert.equal(await page.locator('#start-round').isDisabled(), true);
  assert.equal(await page.locator('#close-round').isDisabled(), true);
  assert.equal(await page.locator('#select-button').isDisabled(), true);
  assert.equal(app.snapshot().workflow.autoChat, false);
  assert.equal(app.snapshot().workflow.voiceId, 'voice-b');
  assert.match(await page.locator('#workflow-countdown').textContent(), /\d\d:\d\d/);
  const stage = await browser.newPage(); stage.on('pageerror', error => faults.push(error.message));
  await stage.goto(server.origin + '/stage');
  const openingReceipt = stage.waitForRequest(request => request.url().endsWith('/api/actions') && request.method() === 'POST' && request.postDataJSON()?.action === 'speech-ended');
  await stage.locator('#enable-sound').click();
  await openingReceipt;
  await stage.waitForFunction(async () => !(await (await fetch('/api/state')).json()).stage.speechId);
  assert.ok(calls.speech >= 1, 'opening narration uses the injected voice provider');
  // The actual media ended event must acknowledge the active queued item.
  assert.equal(app.snapshot().stage.speechId, null, 'opening voice must finish rather than leave the speech queue stuck');
  send(app, 'idea-1', 'artist-1', '收藏乡愁的月光罐头');
  send(app, 'idea-2', 'artist-2', '可以寄到地球的星星明信片');
  await page.locator('#workflow-next').click();
  await page.locator('#workflow-vote').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.workflow-choice').count(), 2);
  assert.equal(await page.getByRole('button', {name:'请用上方主控揭晓 GIF', exact:true}).first().isDisabled(), true);
  await page.locator('#workflow-vote').click();
  await page.waitForFunction(() => document.querySelector('#workflow-phase').textContent === '观众投票中');
  send(app, 'vote-1', 'voter-1', '投1'); send(app, 'vote-2', 'voter-1', '投2'); send(app, 'vote-3', '', '投1');
  await page.waitForFunction(() => document.querySelector('#workflow-voter-count').textContent.includes('1 位'));
  assert.ok((await page.locator('#workflow-unknown-votes').textContent()).includes('1'));
  capture.emit('status', { state: 'offline', active: true, message: '离线注入：上游暂停' });
  await page.locator('#workflow-resume').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#workflow-phase').textContent(), '比赛已暂停');
  capture.emit('status', { state: 'running', active: true, message: '离线注入：上游恢复' });
  await page.locator('#workflow-resume').click();
  await page.locator('#workflow-close-vote').click();
  await page.locator('#workflow-reveal').waitFor({ state: 'visible' });
  assert.equal(app.snapshot().workflow.winnerCommentId, 'idea-2');
  await page.locator('#workflow-reveal').click();
  await page.waitForFunction(() => document.querySelector('#workflow-phase').textContent === '作品已揭晓');
  assert.equal(calls.image, 1);
  assert.equal(app.snapshot().artworks.at(-1).mime, 'image/gif');
  await stage.locator('#stage-image').waitFor({ state: 'visible' });
  await stage.waitForFunction(() => document.querySelector('#stage-image').complete && document.querySelector('#stage-image').naturalWidth > 0);
  assert.ok((await stage.locator('#stage-art-credit').textContent()).includes('artist-2'));
  assert.equal(await page.locator('#workflow-preview img').count(), 1);
  await mkdir('.data/validation', { recursive: true });
  await page.screenshot({ path: '.data/validation/workflow-control-desktop.png', fullPage: true });
  await stage.screenshot({ path: '.data/validation/workflow-stage.png', fullPage: true });
  await page.locator('#workflow-stop-speech').click();
  assert.equal(app.snapshot().stage.speechId, null);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: '.data/validation/workflow-control-mobile.png', fullPage: true });
  assert.deepEqual(faults, []);
});

test('workflow browser: host can free a candidate slot, nominate a real comment and explicitly decide a zero-vote tie', async t => {
  const { app, capture, browser, server, calls } = await setup(t);
  await app.dispatch({ action: 'theme', title: '月亮便利店' });
  capture.emit('status', { state: 'running', active: true });
  await app.dispatch({ action: 'workflow-start', autoChat: false, autoVoice: false });
  for (let index = 1; index <= 4; index++) send(app, `idea-${index}`, `artist-${index}`, `月亮便利店的第${index}件奇妙商品`);
  const page = await browser.newPage();
  await page.goto(server.origin + '/control');
  await page.locator('#workflow-next').click();
  await page.locator('#workflow-vote').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.workflow-choice').count(), 3);
  await page.locator('.workflow-choice').nth(1).getByRole('button', { name: '移出候选，留出补选名额' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.workflow-choice').length === 2);
  const fourth = page.locator('.comment-card').filter({ has: page.locator('.comment-text').filter({ hasText: '第4件' }) });
  await fourth.getByRole('button', { name: '主播补选', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.workflow-choice h3')].some(element => element.textContent.includes('第4件')));
  await page.locator('#workflow-vote').click();
  await page.locator('#workflow-close-vote').click();
  await page.waitForFunction(() => document.querySelector('#workflow-phase').textContent.includes('主播裁定'));
  assert.equal(await page.locator('#workflow-reveal').isVisible(), false, 'no vote cannot silently pick a winner');
  const chosen = page.locator('.workflow-choice').filter({ has: page.locator('h3').filter({ hasText: '第4件' }) });
  await chosen.getByRole('button', { name: '主播裁定，选择此创意作画' }).click();
  await page.waitForFunction(() => document.querySelector('#workflow-phase').textContent === '作品已揭晓');
  assert.equal(app.snapshot().workflow.winnerCommentId, 'idea-4');
  assert.equal(calls.image, 1);
});

test('workflow browser: a transient recommendation failure exposes a host-triggered retry without automatic paid retries', async t => {
  const { app, capture, browser, server } = await setup(t);
  const select = app.text.select.bind(app.text); let attempts = 0;
  app.text.select = async input => { attempts++; if (attempts === 1) throw Error('离线注入：推荐服务暂时失败'); return select(input); };
  await app.dispatch({ action: 'theme', title: '月亮便利店' });
  capture.emit('status', { state: 'running', active: true });
  await app.dispatch({ action: 'workflow-start', autoChat: false, autoVoice: false });
  send(app, 'retry-idea', 'artist-retry', '让想念发芽的月光花盆');
  const page = await browser.newPage(); await page.goto(server.origin + '/control');
  await page.locator('#workflow-next').click();
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('推荐服务暂时失败'));
  assert.equal(attempts, 1);
  await page.getByRole('button', { name: '重试推荐', exact: true }).waitFor({ state: 'visible' });
  assert.equal(await page.locator('#select-button').isDisabled(), true, 'legacy select must stay guarded');
  await app.workflow.tick();
  assert.equal(attempts, 1, 'a timer tick cannot automatically retry a failed paid recommendation');
  await page.getByRole('button', { name: '重试推荐', exact: true }).click();
  await page.locator('#workflow-vote').waitFor({ state: 'visible' });
  assert.equal(attempts, 2);
  assert.equal(await page.locator('.workflow-choice').count(), 1);
  assert.equal(await page.getByRole('button', { name: '重试推荐', exact: true }).isVisible(), false);
});

test('PDF reference stage: one 1080x1920 skeleton renders collecting, voting, generating and the real local GIF fixture', async t => {
  const { app, capture, browser, server } = await setup(t);
  await app.dispatch({ action: 'theme', title: '三句情书', rules: '用三句话，写一封没寄出的信。提示词：雨 / 未寄出 / 第二人称。' });
  capture.emit('status', { state: 'running', active: true, message: '离线视觉验收采集源' });
  await app.dispatch({ action: 'workflow-start', collectSeconds: 180, voteSeconds: 30, autoVoice: false, autoChat: false });
  const samples = [
    ['迟夏', '晚风替我发送 / 又替我撤回 / 月亮已读'],
    ['雾岛', '报站念到你的城 / 坐过三站 / 没敢下车'],
    ['半页', '第三句留白 / 怕你读懂 / 也怕你没读懂'],
    ['南岸旧信', '我把地址写成风 / 邮差换了几任 / 你没拆开'],
    ['阿栀', '雨落在第七行 / 伞偏向我 / 那句话没说完'],
  ];
  samples.forEach(([nickname, text], index) => app.receive({ id: `pdf-${index}`, userId: `pdf-viewer-${index}`, nickname, text, roomId: 'test-room', source: 'live' }));
  ['投 一', '投２', '投3号'].forEach((text, index) => send(app, `pdf-early-vote-${index}`, `early-voter-${index}`, text));
  const stage = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const faults = []; stage.on('pageerror', error => faults.push(error.message));
  await stage.goto(server.origin + '/stage');
  await stage.waitForFunction(() => document.querySelectorAll('.stage-comment-row').length === 5);
  await mkdir('.data/validation', { recursive: true });
  const geometry = await stage.evaluate(() => {
    const shell = document.querySelector('.stage-layout');
    const style = getComputedStyle(shell);
    const rect = shell.getBoundingClientRect();
    return { width: rect.width, height: rect.height, left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight), top: parseFloat(style.paddingTop), bottom: parseFloat(style.paddingBottom), background: style.backgroundColor, titleSize: parseFloat(getComputedStyle(document.querySelector('#stage-title')).fontSize), countdownSize: parseFloat(getComputedStyle(document.querySelector('#stage-countdown')).fontSize), modeSize: parseFloat(getComputedStyle(document.querySelector('#stage-mode-label')).fontSize), modeColor: getComputedStyle(document.querySelector('#stage-mode-label')).color, surfaceColor: getComputedStyle(document.querySelector('.stage-counter')).backgroundColor };
  });
  assert.deepEqual({ width: geometry.width, height: geometry.height, left: geometry.left, right: geometry.right, top: geometry.top, bottom: geometry.bottom, background: geometry.background }, { width: 1080, height: 1920, left: 112, right: 112, top: 120, bottom: 230, background: 'rgb(10, 11, 13)' });
  assert.ok(geometry.titleSize >= 88 && geometry.titleSize <= 104);
  assert.ok(geometry.countdownSize >= 118 && geometry.countdownSize <= 132);
  assert.equal(geometry.modeSize,26);assert.equal(geometry.modeColor,'rgb(255, 91, 69)');assert.equal(geometry.surfaceColor,'rgb(18, 21, 25)');
  assert.ok((await stage.locator('#stage-received').textContent()).includes('5 条'));
  assert.equal(await stage.locator('.stage-comment-row').filter({hasText:'投3号'}).count(),0);
  await stage.screenshot({ path: '.data/validation/pdf-stage-collecting.png' });
  app.workflow.s.deadline=Date.now()+90000;
  await app.dispatch({action:'workflow-pause'});
  await stage.waitForFunction(()=>document.querySelector('.stage-layout').dataset.phase==='paused');
  assert.equal(await stage.locator('#stage-countdown').textContent(),'01:30');
  const frozenProgress=await stage.locator('#stage-time-progress').evaluate(element=>element.value);
  assert.ok(frozenProgress>=49&&frozenProgress<=51,'paused collection uses its 180s collection duration rather than 30s voting duration');
  await app.dispatch({action:'workflow-resume'});
  await app.dispatch({ action: 'workflow-next' });
  await app.dispatch({ action: 'workflow-vote' });
  send(app, 'pdf-vote', 'pdf-voter', '投1');
  await stage.waitForFunction(() => document.querySelector('.stage-layout').dataset.screen === 'evaluating' && document.querySelectorAll('.stage-selection').length === 3);
  await stage.locator('#stage-countdown').waitFor({state:'visible'});
  assert.equal(await stage.locator('#stage-round').textContent(),'剩余投票时间');
  assert.match(await stage.locator('#stage-countdown').textContent(), /00:[23]\d/);
  await stage.screenshot({ path: '.data/validation/pdf-stage-voting.png' });
  await app.dispatch({ action: 'workflow-close-vote' });
  let finishImage;
  app.image.generate = () => new Promise(resolve => { finishImage = resolve; });
  const pendingReveal = app.dispatch({ action: 'workflow-reveal' });
  await stage.locator('#stage-generation').waitFor({ state: 'visible' });
  await stage.screenshot({ path: '.data/validation/pdf-stage-generating.png' });
  await app.dispatch({action:'workflow-pause'});
  await stage.waitForFunction(()=>document.querySelector('.stage-layout').dataset.phase==='paused');
  assert.equal(await stage.locator('#stage-generation').isVisible(),true,'paused generation keeps its real previous-stage visual');
  assert.equal(await stage.locator('#stage-countdown').textContent(),'—');
  assert.equal(await stage.locator('#stage-time-progress').evaluate(element=>element.hidden),true);
  const pausedControl=await browser.newPage();await pausedControl.goto(server.origin+'/control');
  await pausedControl.waitForFunction(()=>document.querySelector('#workflow-countdown').textContent==='等待恢复');
  const nativeGif = await readFile('.data/validation/native-gif.gif').catch(() => tinyGif);
  finishImage({ bytes: nativeGif, mime: 'image/gif' });
  await pendingReveal;
  await stage.waitForFunction(()=>document.querySelector('#stage-screen-title').textContent==='即将揭晓');
  assert.equal(await stage.locator('#stage-image').isVisible(),false,'completed paused work must wait for the host reveal');
  await app.dispatch({action:'workflow-resume'});
  await stage.locator('#stage-image').waitFor({ state: 'visible' });
  await stage.waitForFunction(() => document.querySelector('#stage-image').complete && document.querySelector('#stage-image').naturalWidth > 0);
  await stage.screenshot({ path: '.data/validation/pdf-stage-revealed.png' });
  const mediaBounds = await stage.locator('#stage-art').boundingBox();
  assert.equal(mediaBounds.width, 1080 - 112 * 2, 'GIF respects both live-player safe margins');
  assert.ok(mediaBounds.height >= 600, 'GIF is the primary visual rather than a thumbnail');
  assert.ok(mediaBounds.y + mediaBounds.height <= 1690, 'canvas stays above the 230px platform-safe bottom zone');
  await app.dispatch({action:'theme',title:'一词一境'});
  const still=await app.media({bytes:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=','base64'),mime:'image/png'},'image',{text:'最近的静态作品',nickname:'离线作者'});
  app.state.artworks.push(still);await app.dispatch({action:'show-artwork',id:still.id});
  await stage.waitForFunction(()=>document.querySelector('#stage-screen-title').textContent==='最近作品回看');
  assert.ok((await stage.locator('#stage-rules').textContent()).includes('AI 生成图片'));
  assert.ok(!(await stage.locator('#stage-rules').textContent()).includes('共同选出'));
  await stage.screenshot({path:'.data/validation/pdf-stage-history-still.png'});
  assert.deepEqual(faults, []);
});
