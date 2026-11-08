const $: any = (id: any) => document.getElementById(id);
const make: any = (tag: any, text: any, className: any) => { const element: any = document.createElement(tag); if (text != null) element.textContent = String(text); if (className) element.className = className; return element; };
let state: any = null;
let soundEnabled: any = false;
let playingId: any = null;
let imageId: any = null;
let playingReceipt: any = null;
let acknowledgedKey: any = null;
const audio: any = $('stage-audio');
let avatar: any;
// Local modules initialize before the first audio gesture, so Web Audio cannot miss it.
$('enable-sound').disabled = true;
void import('./stage-avatar.js').then(async ({createStageAvatar}: any) => {
  avatar = await createStageAvatar({root: $('stage-avatar'), audio});
  if (state) avatar.update(state);
}).catch(() => { $('stage-avatar').hidden = true; $('stage-avatar').dataset.failed = 'true'; }).finally(() => { $('enable-sound').disabled = false; });
const isVoteText: any = (text: any) => typeof text === 'string' && /^投\s*[123一二三](?:\s*号)?$/u.test(text.normalize('NFKC').trim());
let streamController: any = null;
let streamObjectUrl: any = null;
function clearStream() {
  streamController?.abort(); streamController = null;
  if (streamObjectUrl) URL.revokeObjectURL(streamObjectUrl);
  streamObjectUrl = null;
}
function stopAudio() { clearStream(); audio.pause(); audio.removeAttribute('src'); audio.load(); playingId = null; playingReceipt = null; }
function attachAudioSource(item: any, playbackKey: any) {
  clearStream();
  if (!item.streaming || !globalThis.MediaSource?.isTypeSupported('audio/mpeg')) { audio.src = item.url; return; }
  const controller: any = new AbortController(); streamController = controller;
  const source: any = new MediaSource(); streamObjectUrl = URL.createObjectURL(source);
  source.addEventListener('sourceopen', async () => {
    try {
      controller.signal.throwIfAborted();
      const buffer: any = source.addSourceBuffer('audio/mpeg');
      const response: any = await fetch(item.url, { signal: controller.signal });
      if (!response.ok || !response.body) throw Error('语音流未就绪');
      const reader: any = response.body.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          controller.signal.throwIfAborted();
          if (done) break;
          await new Promise((resolve: any, reject: any) => {
            const clean: any = () => { buffer.removeEventListener('updateend', ready); buffer.removeEventListener('error', failed); controller.signal.removeEventListener('abort', failed); };
            const ready: any = () => { clean(); resolve(); };
            const failed: any = () => { clean(); reject(Error('语音流已中断')); };
            buffer.addEventListener('updateend', ready, { once: true }); buffer.addEventListener('error', failed, { once: true }); controller.signal.addEventListener('abort', failed, { once: true });
            try { buffer.appendBuffer(value); } catch (error: any) { clean(); reject(error); }
          });
        }
        if (source.readyState === 'open') source.endOfStream();
      } finally { reader.releaseLock(); }
    } catch {
      if (!controller.signal.aborted && playingId === playbackKey) {
        $('sound-status').textContent = '这条语音流中断，请在工作台检查';
        audio.pause(); void acknowledgeSpeech(true);
      }
    }
  }, { once: true });
  audio.src = streamObjectUrl;
}
function syncAudio() {
  const id: any = state?.stage?.speechId;
  const playbackKey: any = `${id}:${state?.stage?.speechRevision || 0}`;
  if (!id) { stopAudio(); return; }
  if (!soundEnabled || playbackKey === playingId) return;
  const item: any = (state.speech || []).find((entry: any) => entry.id === id);
  if (!item?.url) return;
  audio.pause();
  playingId = playbackKey;
  playingReceipt = { id, revision: state?.stage?.speechRevision || 0, key: playbackKey };
  attachAudioSource(item, playbackKey);
  void audio.play().then(() => { if (playingId === playbackKey) $('sound-status').textContent = '舞台声音已启用'; }).catch(() => {
    if (playingId !== playbackKey) return;
    playingId = null;
    soundEnabled = false;
    $('enable-sound').hidden = false;
    $('disable-sound').hidden = true;
    $('sound-status').textContent = '浏览器暂未允许声音，请点击启用';
  });
}
function render(next: any) {
  if (state && next.instanceId === state.instanceId && Number.isFinite(next.revision) && next.revision < state.revision) return;
  state = next;
  avatar?.update(state);
  $('stage-offline').hidden = true;
  const workflow: any = state.workflow;
  const phase: any = workflow?.phase || (state.round?.status === 'collecting' ? 'collecting' : 'idle');
  const artwork: any = (state.artworks || []).find((entry: any) => entry.id === state.stage?.artworkId);
  const previousPhase: any = workflow?.previousPhase || '';
  const isGif: any = artwork?.mime === 'image/gif';
  const historical: any = phase === 'idle' && Boolean(artwork);
  const waitingReveal: any = phase === 'paused' && previousPhase === 'revealed';
  const screen: any = artwork && phase === 'idle' ? 'revealed' : phase === 'generating' || (phase === 'paused' && ['generating', 'revealed'].includes(previousPhase)) ? 'generating' : phase === 'revealed' ? 'revealed' : ['selecting', 'voting', 'ready'].includes(phase) || (phase === 'paused' && (workflow?.choices || []).length) ? 'evaluating' : 'collecting';
  document.querySelector<HTMLElement>('.stage-layout').dataset.screen = screen;
  document.querySelector<HTMLElement>('.stage-layout').dataset.phase = phase;
  document.querySelectorAll<HTMLElement>('[data-stage-step]').forEach((element: any) => element.classList.toggle('current', element.dataset.stageStep === screen));
  const captureRunning: any = ['running', 'receiving', 'connected', 'online', 'live'].includes(state.capture?.state) && state.capture?.active !== false;
  $('stage-live-badge').textContent = captureRunning ? '● LIVE' : state.capture?.state === 'offline' ? '未开播' : '待机';
  $('stage-live-badge').classList.toggle('live', captureRunning);
  $('stage-title').textContent = state.theme?.title || '今日命题';
  $('stage-screen-title').hidden = screen === 'collecting';
  $('stage-screen-title').textContent = screen === 'generating' ? waitingReveal ? '即将揭晓' : '正在画图板' : screen === 'revealed' ? historical ? isGif ? '最近动图回看' : '最近作品回看' : isGif ? '今日动图' : '今日作品' : phase === 'selecting' ? '正在评选' : phase === 'voting' ? '让大家来选' : workflow?.winnerCommentId ? '本轮赢家公布' : workflow?.tie?.length ? '等待主播裁定' : '候选创意公布';
  $('stage-mode-label').textContent = historical ? '04 回看 · 本机保存的最近作品' : { collecting: '01 征集 · 短画面提示词竞赛', evaluating: '02 评选 · 三个好点子，大家来决定', generating: '03 生成 · 获胜创意 → 动图', revealed: '04 展示 · 本轮作品放映' }[screen];
  $('stage-rules').textContent = screen === 'generating' ? waitingReveal ? '动图已完成 · 等待主播恢复并揭晓' : '创意已锁定 · 正在生成本轮 GIF 动图' : screen === 'revealed' ? `${historical ? '本机保存的最近作品' : '来自本轮的创意'} · AI 生成${isGif ? '动图' : '图片'}` : state.theme?.rules || '发一句贴合主题、有画面感的奇思妙想。';
  const showVotingClock: any = phase === 'voting' || (phase === 'paused' && previousPhase === 'voting');
  $('stage-collect-panel').hidden = screen !== 'collecting' && !showVotingClock;
  $('stage-feed-heading').hidden = screen !== 'collecting';
  $('stage-live-comments').hidden = screen !== 'collecting';
  $('stage-evaluation-panel').hidden = !['evaluating', 'generating', 'revealed'].includes(screen);
  $('stage-art').hidden = !['generating', 'revealed'].includes(screen);
  $('stage-ranking').hidden = !['collecting', 'evaluating'].includes(screen);
  $('stage-output-note').hidden = !['generating', 'revealed'].includes(screen);
  $('stage-generation').hidden = screen !== 'generating';
  $('stage-generation-title').textContent = waitingReveal ? '作品已就绪，等待揭晓' : '正在生成 GIF 动图';
  $('stage-generation-help').textContent = waitingReveal ? '主播恢复比赛后，一起看看这份创意。' : '正在把获胜创意变成动图，请稍候。';
  document.querySelector<HTMLElement>('.generation-spinner').hidden = waitingReveal;
  document.querySelector<HTMLElement>('.stage-generating-rule').hidden = waitingReveal;
  $('stage-output-label').textContent = screen === 'generating' ? waitingReveal ? '作品已就绪' : phase === 'paused' ? '互动已暂停' : '动图创作中' : artwork?.mime === 'image/gif' ? 'GIF · 自动循环播放' : historical ? '最近图片回看' : '本轮作品';
  $('stage-output-status').textContent = screen === 'generating' ? waitingReveal ? '主播恢复比赛后揭晓' : phase === 'paused' ? '生成请求继续，恢复后揭晓作品' : '好画值得等一会儿，继续聊聊你的奇思妙想。' : historical ? '本机作品回看 · 等待下一轮开场' : '灵感来自真实观众 · 感谢一起创作';
  const phaseLabels: any = { idle: '等待主播开场', collecting: '剩余投稿时间', selecting: 'AI 正在推荐候选', voting: '剩余投票时间', paused: '比赛已暂停', ready: workflow?.winnerCommentId ? '本轮赢家已产生' : '候选已公布', generating: '正在创作 GIF', revealed: '本轮作品已揭晓', error: '主播正在处理，请稍候' };
  $('stage-round').textContent = phaseLabels[phase] || '等待主播推进';
  $('stage-phase').textContent = phase === 'collecting' ? '收词截止后公布候选，观众投票决定画谁' : phase === 'idle' ? '请在直播间弹幕中参与，由主播开始本轮' : workflow?.message || '';
  $('stage-question').hidden = !workflow?.currentQuestion || !['collecting', 'paused'].includes(phase);
  $('stage-question').textContent = workflow?.currentQuestion || '';
  $('stage-caption').textContent = state.stage?.caption || (phase === 'voting' ? '发送「投1」「投2」「投3」，选出你最想看到的画。' : '观众出灵感，AI 来作画。');
  $('stage-footnote').textContent = phase === 'voting' ? '本场收到的有效弹幕票 · 发送「投1」「投2」「投3」参与' : historical ? '最近作品回看 · 等待主播开启新一轮' : '请在直播间弹幕中参与 · AI 生成内容';
  const comments: any = (state.comments || []).filter((comment: any) => comment.roundId === state.round?.id && !isVoteText(comment.text));
  $('stage-received').textContent = `本轮收到 ${comments.length} 条创意发言`;
  const ids: any = new Set(comments.map((comment: any) => comment.id));
  const visible: any = comments.filter((comment: any) => !comment.duplicateOf || !ids.has(comment.duplicateOf)).slice(-5).reverse();
  const feed: any = $('stage-live-comments');
  const feedSignature: any = JSON.stringify(visible.map((comment: any) => [comment.id, comment.text, comment.nickname, comment.occurrenceCount]));
  if (feed.dataset.signature !== feedSignature) {
    const initial: any = !feed.dataset.signature;
    feed.dataset.signature = feedSignature;
    feed.replaceChildren();
    if (!visible.length) feed.append(make('div', phase === 'idle' ? '主题即将公布，留一点想象给今天。' : '还在等待第一句好点子，欢迎在直播间发言。', 'stage-empty-row'));
    for (const [index, comment] of visible.entries()) {
      const row: any = make('article', null, `stage-comment-row${index < 3 ? ' newest' : ''}${!initial && index === 0 ? ' arriving' : ''}`);
      row.append(make('strong', comment.nickname || '一位观众'), make('p', comment.text));
      feed.append(row);
    }
  }
  const hostReply: any = (workflow?.conversation || []).at(-1);
  $('stage-host-panel').hidden = !hostReply?.text || screen !== 'evaluating';
  $('stage-host-text').textContent = hostReply?.text || '';
  $('stage-host-name').textContent = hostReply?.nickname ? `回应 ${hostReply.nickname}` : '';
  const selections: any = workflow?.choices?.length ? workflow.choices : state.selections || [];
  $('stage-candidate-heading').textContent = selections.length ? phase === 'voting' ? '实时票数 · 本轮候选' : '本轮候选 · 每人一个名额' : '本轮候选 · 等待推荐';
  $('stage-ranking-note').textContent = phase === 'voting' ? `${workflow?.voters || 0} 位观众已投票` : '由 AI 推荐，主播可补选';
  $('stage-vote-label').hidden = !workflow?.choices?.length;
  const selectionRoot: any = $('stage-selections');
  const signature: any = JSON.stringify([selections, workflow?.winnerCommentId, (state.comments || []).map((c: any) => [c.id, c.text, c.nickname])]);
  if (selectionRoot.dataset.signature !== signature) {
    selectionRoot.dataset.signature = signature;
    selectionRoot.replaceChildren();
    if (!selections.length) selectionRoot.append(make('div', '收词结束后，推荐最多三个创意供观众投票。', 'stage-empty-row'));
    for (const [index, selection] of selections.slice(0, 3).entries()) {
      const comment: any = (state.comments || []).find((entry: any) => entry.id === selection.commentId);
      const row: any = make('article', null, 'stage-selection');
      row.classList.toggle('winner', selection.commentId === workflow?.winnerCommentId);
      const body: any = make('div', null, 'stage-selection-body');
      body.append(make('p', selection.text || comment?.text || '入选创意'), make('small', `${selection.nickname || comment?.nickname || '一位观众'} · ${selection.reason || '本轮入选创意'}`));
      row.append(make('span', phase === 'voting' ? `投${selection.index || index + 1}` : String(index + 1).padStart(2, '0'), 'stage-rank-number'), body);
      if (workflow?.choices?.length) row.append(make('strong', `${selection.votes || 0} 票`, 'stage-votes'));
      selectionRoot.append(row);
    }
  }
  const winner: any = selections.find((selection: any) => selection.commentId === workflow?.winnerCommentId);
  $('stage-featured').hidden = !winner;
  if (winner) {
    $('stage-featured-label').textContent = screen === 'generating' ? 'LOCKED · 获胜创意已锁定' : 'WINNER · 本轮获胜创意';
    $('stage-featured-text').textContent = winner.text || '';
    $('stage-featured-reason').textContent = winner.reason || '';
    $('stage-featured-author').textContent = `灵感来自 ${winner.nickname || '一位观众'}`;
    $('stage-featured-votes').textContent = `${winner.votes || 0} 票 · 本场收到`;
  }
  $('stage-evaluation-message').textContent = phase === 'selecting' ? '按贴题、创意和画面感评选，请稍候。' : phase === 'voting' ? `发送「投1」「投2」「投3」· 同 UID 最后一票有效${workflow?.unknownVotes ? ` · ${workflow.unknownVotes} 条身份未知票未计入` : ''}` : workflow?.message || '';
  if (artwork && screen === 'revealed') {
    if (imageId !== artwork.id) { imageId = artwork.id; $('stage-image').src = artwork.url; }
    $('stage-image').hidden = false;
    $('stage-waiting').hidden = true;
    const comment: any = (state.comments || []).find((entry: any) => entry.id === artwork.commentId);
    $('stage-art-credit').textContent = `灵感来自 ${artwork.nickname || comment?.nickname || '一位观众'} · ${artwork.text || comment?.text || '今日主题作品'}`;
    $('stage-art-credit').hidden = false;
  } else {
    imageId = null;
    $('stage-image').hidden = true;
    $('stage-image').removeAttribute('src');
    $('stage-waiting').hidden = screen === 'generating';
    $('stage-art-credit').hidden = true;
  }
  updateClock();
  syncAudio();
}
$('enable-sound').onclick = () => {
  void avatar?.enableVoice();
  soundEnabled = true;
  $('enable-sound').hidden = true;
  $('disable-sound').hidden = false;
  $('sound-status').textContent = '舞台声音已启用';
  syncAudio();
};
$('disable-sound').onclick = () => {
  soundEnabled = false;
  stopAudio();
  $('enable-sound').hidden = false;
  $('disable-sound').hidden = true;
  $('sound-status').textContent = '舞台声音已关闭';
};
async function acknowledgeSpeech(error: any = false) {
  const receipt: any = playingReceipt;
  if (!receipt || receipt.key === acknowledgedKey) return;
  acknowledgedKey = receipt.key;
  try {
    const response: any = await fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'speech-ended', id: receipt.id, revision: receipt.revision, ...(error ? { error: true } : {}) }) });
    if (!response.ok) $('sound-status').textContent = '朗读回执未送达，请在工作台检查语音队列';
  } catch { $('sound-status').textContent = '朗读回执未送达，等待本机服务恢复'; }
}
function updateClock() {
  const workflow: any = state?.workflow;
  const effectivePhase: any = workflow?.phase === 'paused' ? workflow.previousPhase : workflow?.phase;
  const timed: any = workflow && ['collecting', 'voting'].includes(effectivePhase);
  const milliseconds: any = !timed ? 0 : workflow.phase !== 'paused' && Number.isFinite(workflow.deadline) ? workflow.deadline - Date.now() : workflow.remainingMs;
  const seconds: any = Math.max(0, Math.ceil((milliseconds || 0) / 1000));
  $('stage-countdown').textContent = timed ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : workflow?.phase === 'paused' ? '—' : '--:--';
  $('stage-countdown').classList.toggle('urgent', timed && seconds > 0 && seconds <= 30);
  const total: any = effectivePhase === 'collecting' ? workflow.collectSeconds : workflow?.voteSeconds;
  $('stage-time-progress').hidden = !timed || !Number.isFinite(total) || total <= 0;
  if (timed && total > 0) $('stage-time-progress').value = Math.min(100, Math.max(0, (milliseconds || 0) / (total * 1000) * 100));
}
$('stage-date').textContent = new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }).replace(/\//g, '.');
audio.onended = () => { void acknowledgeSpeech(); };
audio.onerror = () => { $('sound-status').textContent = '这条音频播放失败，继续后续朗读'; void acknowledgeSpeech(true); };
setInterval(updateClock, 250);
const stream: any = new EventSource('/api/events');
const receive: any = (event: any) => { try { render(JSON.parse(event.data)); } catch { /* Ignore non-state keepalives. */ } };
stream.onmessage = receive;
stream.addEventListener('data', receive);
stream.onerror = () => { $('stage-offline').hidden = false; };
void fetch('/api/state', { cache: 'no-store' }).then((response: any) => { if (!response.ok) throw Error(); return response.json(); }).then(render).catch(() => { $('stage-offline').hidden = false; });
window.addEventListener('pagehide', () => { avatar?.dispose(); clearStream(); audio.pause(); stream.close(); });
