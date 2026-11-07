import {createThemePlanner} from './theme-planner.js';
const $ = (id) => document.getElementById(id);
const make = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text != null) element.textContent = String(text);
  if (className) element.className = className;
  return element;
};
let state = null;
let themeDirty = false;
let roomDirty = false;
let feedSignature = '';
let selectionSignature = '';
let artworkSignature = '';
let speechSignature = '';
const pending = new Set();
const planner = createThemePlanner({dispatch,busy:(action)=>taskBusy(action)});
const roundLabels = { idle: '待开场', collecting: '正在收词', closed: '收词结束' };
const textOf = (value) => typeof value === 'string' ? value : value?.text || '';
const taskBusy = (action, id) => pending.has(action) || pending.has(`${action}:${id}`) || (state?.busy || []).some((key) => key === action || key === `${action}:${id}`);
function notify(message, isError = true) {
  $('notice').textContent = message;
  $('notice').classList.toggle('success', !isError);
  $('notice').hidden = !message;
}
function button(label, action, payload = {}, kind = 'text-button') {
  const element = make('button', label, kind);
  element.type = 'button';
  element.disabled = taskBusy(action, payload.commentId);
  element.onclick = () => void dispatch({ action, ...payload });
  return element;
}
async function dispatch(input) {
  const key = input.commentId ? `${input.action}:${input.commentId}` : input.action;
  if (pending.has(key)) return;
  pending.add(key);
  render();
  notify('');
  try {
    const response = await fetch('/api/actions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    const result = await response.json();
    if (!response.ok || result.error) throw Error(typeof result.error === 'string' ? result.error : result.error?.message || result.message || '这次操作没有完成，请稍后重试。');
    if (result.theme && result.round) accept(result);
    else await refresh();
    if (input.action === 'theme') {
      themeDirty = false;
      notify('今日主题已更新，可以开始收词了。', false);
    }
    if (input.action === 'room' || input.action === 'connect') {
      if ($('room').value.trim() === input.room) roomDirty = false;
      if (input.action === 'room') notify('直播间设置已保存，需要时再点击连接。', false);
    }
    if (input.action === 'manual') $('manual-text').value = '';
    if (input.action === 'theme-plan-apply') { themeDirty=false; notify('策划已应用，主持与生图将使用这份方案。',false); }
    return true;
  } catch (error) {
    notify(error.message || '无法连接本机服务，请确认应用仍在运行。');
    return false;
  } finally {
    pending.delete(key);
    // Buttons inside cards must be refreshed when pending state settles.
    feedSignature = selectionSignature = speechSignature = '';
    render();
  }
}
function accept(next) {
  if (state && next.instanceId === state.instanceId && Number.isFinite(next.revision) && next.revision < state.revision) return;
  state = next;
  $('connection').classList.add('online');
  $('connection').replaceChildren(make('i'), document.createTextNode('本机服务已连接'));
  render();
}
async function refresh() {
  const response = await fetch('/api/state', { cache: 'no-store' });
  if (!response.ok) throw Error('无法读取工作台状态');
  accept(await response.json());
}
function commentCard(comment) {
  const card = make('article', null, 'comment-card');
  const header = make('div', null, 'comment-header');
  const avatar = make('span', (comment.nickname || '观众').slice(0, 1), 'avatar');
  const details = make('div');
  details.append(make('strong', comment.nickname || '一位观众'));
  let date = new Date(comment.receivedAt);
  const stamp = Number.isFinite(date.getTime()) ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
  details.append(make('small', `${comment.source === 'manual' || comment.manual ? '手动发言 · ' : ''}${stamp}`));
  header.append(avatar, details);
  if (comment.eligible === true || comment.evaluation?.eligible === true) header.append(make('span', '好点子', 'badge green'));
  card.append(header);
  const identity = make('p', comment.userId ? `UID ${comment.userId}` : '身份未知', 'comment-identity');
  card.append(identity, make('p', comment.text, 'comment-text'));
  if (Number.isFinite(comment.occurrenceCount) && comment.occurrenceCount > 1)
    card.append(make('span', `出现 ${comment.occurrenceCount} 次 · 重复不加权`, 'comment-repeat'));
  if (comment.evaluation) {
    const evaluation = comment.evaluation;
    const block = make('div', null, 'evaluation');
    const heading = evaluation.eligible === false ? 'AI 点评 · 暂不参赛' : `AI 点评${evaluation.score != null ? ` · ${evaluation.score}/100` : ''}`;
    block.append(make('strong', heading), make('p', evaluation.reason || ''));
    card.append(block);
  }
  const reply = textOf(comment.reply);
  if (reply) {
    const block = make('div', null, 'reply-block');
    block.append(make('span', '✦ AI 接话'), make('p', reply), button('朗读回复', 'speak', { text: reply }));
    card.append(block);
  }
  const actions = make('div', null, 'comment-actions');
  actions.append(button(taskBusy('evaluate', comment.id) ? '点评中…' : '✦ 评估创意', 'evaluate', { commentId: comment.id }), button(taskBusy('reply', comment.id) ? '接话中…' : 'AI 接话', 'reply', { commentId: comment.id }), button('♫ 朗读', 'speak', { text: comment.text }));
  if (state.workflow?.phase === 'ready' && !state.workflow?.winnerCommentId && !(state.workflow?.tie || []).length && (state.workflow?.choices || []).length < 3 && !(state.workflow?.choices || []).some(choice => choice.commentId === comment.id))
    actions.append(button('主播补选', 'workflow-nominate', { commentId: comment.id }));
  card.append(actions);
  return card;
}
function renderComments() {
  if (!state) return;
  const all = state.comments || [];
  const query = $('comment-search').value.trim().toLowerCase();
  const ids = new Set(all.map(comment => comment.id));
  const unfolded = all.filter(comment => !comment.duplicateOf || !ids.has(comment.duplicateOf));
  const visible = unfolded.filter((comment) => `${comment.text} ${comment.nickname} ${comment.userId || ''}`.toLowerCase().includes(query)).slice(-100).reverse();
  const signature = JSON.stringify([visible, [...pending], state.busy, query, state.workflow?.phase, state.workflow?.choices]);
  $('comments-count').textContent = `${unfolded.length} 条`;
  $('comments-count').title = `保留 ${all.length} 条原始发言，重复内容已折叠`;
  if (signature === feedSignature) return;
  feedSignature = signature;
  const feed = $('comment-feed');
  const oldScroll = feed.scrollTop;
  feed.replaceChildren();
  if (!visible.length) {
    const empty = make('div', null, 'empty-state');
    empty.append(make('span', '“', 'empty-icon'), make('h3', query ? '没有找到这条发言' : '好点子，马上就来。'), make('p', query ? '试试其他关键词。' : '连接直播间后，这里会实时显示弹幕。\n也可以先手动添加一句，熟悉比赛流程。'));
    feed.append(empty);
  } else feed.append(...visible.map(commentCard));
  feed.scrollTop = oldScroll;
}
function renderSelections() {
  const selections = state.selections || [];
  const signature = JSON.stringify([selections, state.comments, state.busy, [...pending], state.workflow?.phase]);
  if (signature === selectionSignature) return;
  selectionSignature = signature;
  const root = $('selections');
  root.replaceChildren();
  if (!selections.length) return root.append(make('div', '收词结束后，让 AI 挑选三个好点子。', 'small-empty'));
  for (const [index, selection] of selections.entries()) {
    const comment = (state.comments || []).find((entry) => entry.id === selection.commentId);
    const card = make('article', null, 'selection-card');
    const heading = make('div', null, 'selection-heading');
    heading.append(make('span', String(index + 1).padStart(2, '0'), 'rank-number'), make('small', selection.nickname || comment?.nickname || '观众创意'));
    card.append(heading, make('h3', selection.text || comment?.text || '入选创意'), make('p', selection.reason, 'selection-reason'));
    const prompt = make('details', null, 'prompt-details');
    prompt.append(make('summary', '绘画构想'), make('p', selection.prompt));
    const sources = Array.isArray(selection.sources) && selection.sources.length
      ? selection.sources
      : (selection.sourceIds || [selection.commentId]).map(id => (state.comments || []).find(entry => entry.id === id)).filter(Boolean);
    if (sources.length) {
      const origins = make('details', null, 'source-details');
      origins.append(make('summary', `创意出处 · ${sources.length} 条原文`));
      for (const source of sources) {
        const row = make('article', null, 'source-comment');
        row.append(make('small', `${source.nickname || '观众'} · ${source.userId ? `UID ${source.userId}` : '身份未知'}`), make('p', source.text));
        origins.append(row);
      }
      card.append(origins);
    }
    const workflowActive = state.workflow && state.workflow.phase !== 'idle';
    const generateButton = button(workflowActive ? '请用上方主控揭晓 GIF' : taskBusy('generate', selection.commentId) ? '正在创作…' : '✧ 将创意画出来', 'generate', { commentId: selection.commentId }, 'button accent full');
    if (workflowActive) generateButton.disabled = true;
    card.append(prompt, generateButton);
    root.append(card);
  }
}
function renderArtworks() {
  const artworks = state.artworks || [];
  const signature = JSON.stringify([artworks, state.stage?.artworkId]);
  $('artworks-count').textContent = `${artworks.length} 幅`;
  if (signature === artworkSignature) return;
  artworkSignature = signature;
  const root = $('artworks');
  root.replaceChildren();
  if (!artworks.length) {
    const empty = make('div', null, 'artwork-placeholder');
    empty.append(make('span', '✧'), make('p', '从入选词开始，生成第一幅画。'));
    return root.append(empty);
  }
  for (const artwork of [...artworks].reverse()) {
    const card = make('article', null, 'artwork-card');
    const image = make('img');
    image.src = artwork.url;
    image.alt = artwork.prompt || 'AI 生成作品';
    image.loading = 'lazy';
    card.append(image);
    const body = make('div', null, 'artwork-card-body');
    const comment = (state.comments || []).find((entry) => entry.id === artwork.commentId);
    body.append(make('p', comment?.text || artwork.prompt || '今日作品'));
    const current = state.stage?.artworkId === artwork.id;
    body.append(button(current ? '● 正在舞台展示' : '展示到舞台', 'show-artwork', { id: artwork.id }, current ? 'text-button selected' : 'text-button'));
    card.append(body);
    root.append(card);
  }
}
function renderSpeech() {
  const list = state.speech || [];
  const signature = JSON.stringify([list, state.stage?.speechId, [...pending], state.busy]);
  if (signature === speechSignature) return;
  speechSignature = signature;
  const root = $('speech-list');
  root.replaceChildren();
  if (!list.length) return root.append(make('p', '还没有生成语音。在喜欢的发言下点击「朗读」。', 'small-empty'));
  for (const item of [...list].reverse().slice(0, 10)) {
    const row = make('div', null, 'speech-row');
    row.append(make('span', '♫', 'speech-icon'), make('p', item.text));
    row.append(button(state.stage?.speechId === item.id ? '重新播放' : '播放到舞台', 'play-speech', { id: item.id }, 'button subtle'));
    root.append(row);
  }
}
function render() {
  if (!state) return;
  planner.render(state);
  if (!themeDirty && document.activeElement !== $('theme-title') && document.activeElement !== $('theme-rules')) {
    $('theme-title').value = state.theme?.title || '';
    $('theme-rules').value = state.theme?.rules || '';
  }
  const status = state.round?.status || 'idle';
  const workflowActive = state.workflow && state.workflow.phase !== 'idle';
  $('round-status').textContent = roundLabels[status] || status;
  $('round-status').classList.toggle('green', status === 'collecting');
  $('start-round').disabled = workflowActive || taskBusy('start') || !state.theme?.title || status === 'collecting';
  $('close-round').disabled = workflowActive || taskBusy('close-round') || status !== 'collecting';
  $('select-button').disabled = workflowActive || taskBusy('select') || status !== 'closed' || !(state.comments || []).length;
  $('select-button').textContent = taskBusy('select') ? '✦ AI 正在认真挑选…' : '✦ 评选本轮好点子';
  $('round-guidance').textContent = status === 'collecting' ? '正在收集本轮创意。准备好后结束收词，再请 AI 评选。' : status === 'closed' ? '收词已结束，点击右侧「评选本轮好点子」。' : '先设置主题，再邀请观众发弹幕。';
  $('explain-button').disabled = !state.theme?.title || taskBusy('explain');
  $('explain-button').textContent = taskBusy('explain') ? '✦ 正在准备解说…' : '✦ 让 AI 解说玩法';
  $('save-theme').disabled = taskBusy('theme');
  $('explanation').hidden = !textOf(state.explanation);
  $('explanation-text').textContent = textOf(state.explanation);
  $('speak-explanation').disabled = taskBusy('speak');
  const capture = state.capture || {};
  const connected = ['connected', 'receiving', 'live', 'online', 'collecting', 'running'].includes(capture.state);
  const connecting = ['connecting', 'starting', 'preparing', 'building'].includes(capture.state);
  $('capture-dot').classList.toggle('online', connected);
  $('capture-dot').classList.toggle('connecting', connecting);
  $('capture-message').textContent = capture.message || (connected ? '已连接，等待观众发言。' : '连接后，观众发言会出现在右侧。');
  $('disconnect-button').hidden = capture.active === false || ['disconnected', 'stopped', 'idle'].includes(capture.state);
  $('connect-button').disabled = taskBusy('connect') || connecting;
  $('connect-button').textContent = connecting ? '连接中…' : '连接';
  $('save-room').disabled = taskBusy('room');
  if (!taskBusy('avatar')) $('avatar-enabled').checked = state.settings?.avatarEnabled !== false;
  $('avatar-enabled').disabled = taskBusy('avatar');
  if (!roomDirty && document.activeElement !== $('room')) $('room').value = state.settings?.room || capture.room || '';
  $('feed-state').replaceChildren(make('i'), document.createTextNode(capture.state === 'running' ? '采集运行中，等待弹幕' : connected ? '实时弹幕已接入' : connecting ? '正在连接直播间' : capture.state === 'offline' ? '直播间未开播，等待中' : '等待连接直播间'));
  $('feed-state').classList.toggle('active', connected);
  let configured = 0;
  for (const provider of ['deepseek', 'openai', 'minimax']) {
    const ready = Boolean(state.config?.[provider]);
    if (ready) configured++;
    $(`config-${provider}`).textContent = ready ? '已配置' : '未配置';
    $(`config-${provider}`).classList.toggle('ready', ready);
  }
  $('services-summary').textContent = `${configured}/3 已配置`;
  renderComments(); renderSelections(); renderArtworks(); renderSpeech();
  const errors = state.errors || [];
  if (errors.length && $('notice').hidden) {
    const last = errors.at(-1);
    notify(typeof last === 'string' ? last : last.message || '有一项任务未完成，请检查连接与服务配置。');
  }
}
$('today').textContent = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
$('theme-form').addEventListener('input', () => { themeDirty = true; });
$('theme-form').onsubmit = (event) => { event.preventDefault(); void dispatch({ action: 'theme', title: $('theme-title').value.trim(), rules: $('theme-rules').value.trim() }); };
$('room').addEventListener('input', () => { roomDirty = true; });
$('save-room').onclick = () => { if ($('capture-form').reportValidity()) void dispatch({ action: 'room', room: $('room').value.trim() }); };
$('capture-form').onsubmit = (event) => { event.preventDefault(); void dispatch({ action: 'connect', room: $('room').value.trim() }); };
$('manual-form').onsubmit = (event) => { event.preventDefault(); void dispatch({ action: 'manual', text: $('manual-text').value.trim(), nickname: $('manual-name').value.trim(), userId: $('manual-user-id').value.trim() }); };
$('speak-explanation').onclick = () => void dispatch({ action: 'speak', text: textOf(state?.explanation) });
$('comment-search').oninput = renderComments;
document.querySelectorAll('[data-action]').forEach((element) => { element.onclick = () => void dispatch({ action: element.dataset.action }); });
const stream = new EventSource('/api/events');
const update = (event) => { try { accept(JSON.parse(event.data)); } catch { /* A keepalive is not an application snapshot. */ } };
stream.onmessage = update;
stream.addEventListener('data', update);
stream.onerror = () => {
  $('connection').classList.remove('online');
  $('connection').replaceChildren(make('i'), document.createTextNode('服务断开，正在重连'));
};
void refresh().catch(() => notify('无法连接本机服务。请确认应用已启动，工作台会自动重连。'));

// The live workflow is the primary control surface. Individual tools above
// remain available for rehearsals and one-off host interventions.
const workflowLabels = { idle: '等待开场', collecting: '开场收词', selecting: 'AI 推荐候选中', voting: '观众投票中', paused: '比赛已暂停', ready: '等待主播推进', generating: 'GIF 创作中', revealed: '作品已揭晓', error: '本轮需要处理' };
let workflowChoiceSignature = '';
let voicePresetSignature = '';
let workflowPreviewId = null;
let queuedWorkflowSettings = null;
let savingWorkflowSettings = false;
function secondsLeft(workflow) {
  const effectivePhase = workflow.phase === 'paused' ? workflow.previousPhase : workflow.phase;
  const timed = ['collecting', 'voting'].includes(effectivePhase);
  if (!timed) return null;
  const milliseconds = workflow.phase !== 'paused' && Number.isFinite(workflow.deadline) ? workflow.deadline - Date.now() : workflow.remainingMs;
  return Number.isFinite(milliseconds) && milliseconds > 0 ? Math.ceil(milliseconds / 1000) : 0;
}
function renderWorkflowClock() {
  const workflow = state?.workflow;
  if (!workflow) { $('workflow-countdown').textContent = '—'; return; }
  const seconds = secondsLeft(workflow);
  $('workflow-countdown').textContent = seconds !== null ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : workflow.phase === 'paused' ? '等待恢复' : '—';
}
function renderWorkflow() {
  const workflow = state.workflow || { phase: 'idle', choices: [], autoChat: true, autoVoice: true };
  const phase = workflow.phase || 'idle';
  const choices = workflow.choices || [];
  const tie = workflow.tie || [];
  const votingFinished = Boolean(workflow.winnerCommentId || tie.length);
  const canRetryRecommendation = phase === 'ready' && choices.length === 0 && workflow.recommendationFailed === true;
  const title = phase === 'ready' ? votingFinished ? tie.length ? '平票，等待主播裁定' : '赢家已产生，准备作画' : canRetryRecommendation ? '推荐未完成，等待主播重试' : choices.length ? '候选已就位，准备投票' : '等待主播补选候选' : workflowLabels[phase] || phase;
  $('workflow-phase').textContent = title;
  $('workflow-message').textContent = workflow.message || (phase === 'idle' ? '先设置今日主题、连接直播间，再开场邀请观众一起共创。' : phase === 'collecting' ? '邀请观众发一句贴合主题的奇思妙想。AI 会接住有趣发言，适时追问。' : phase === 'generating' ? '正在生成真正的 GIF 动图。等待时可以继续与观众聊聊创作灵感。' : phase === 'ready' && tie.length ? '本轮没有唯一赢家。请在候选卡中选择一个创意，作为主播裁定后再生成作品。' : '由主播掌握节奏，点击下一步继续。');
  $('workflow-question').hidden = !workflow.currentQuestion;
  $('workflow-question').textContent = workflow.currentQuestion ? `✦ ${workflow.currentQuestion}` : '';
  const disabled = (phase === 'collecting' && taskBusy('explain')) || taskBusy('workflow-settings') || taskBusy('workflow-start') || taskBusy('workflow-next') || taskBusy('workflow-vote') || taskBusy('workflow-reveal');
  const showButton = (id, visible, disable = false) => { $(id).hidden = !visible; $(id).disabled = disabled || disable; };
  showButton('workflow-start', ['idle', 'revealed', 'error'].includes(phase), !state.theme?.title);
  $('workflow-start').textContent = phase === 'revealed' ? '再来一轮，重新开场' : phase === 'error' ? '重新开始一轮' : '开场，开始收词';
  showButton('workflow-next', phase === 'collecting' || canRetryRecommendation);
  $('workflow-next').textContent = canRetryRecommendation ? '重试推荐' : '结束收词，让 AI 推荐';
  showButton('workflow-vote', phase === 'ready' && choices.length > 0 && !votingFinished);
  showButton('workflow-close-vote', phase === 'voting');
  showButton('workflow-reveal', phase === 'ready' && Boolean(workflow.winnerCommentId));
  showButton('workflow-pause', ['collecting', 'voting', 'generating'].includes(phase));
  $('workflow-pause').textContent = phase === 'generating' ? '暂停互动与播报' : '暂停本轮';
  showButton('workflow-resume', phase === 'paused');
  const comments = (state.comments || []).filter(comment => comment.roundId === state.round?.id);
  const knownViewers = new Set(comments.filter(comment => comment.userId).map(comment => `${comment.source}:${comment.roomId || ''}:${comment.userId}`));
  $('workflow-participants').textContent = `${knownViewers.size} 位已识别观众参与`;
  $('workflow-comment-count').textContent = `${comments.length} 条本轮发言回执`;
  $('workflow-voter-count').textContent = `${workflow.voters || 0} 位观众已投票`;
  const queue = workflow.queue || [];
  $('workflow-queue-count').textContent = queue.length ? `语音 ${queue.length} 条 · ${queue[0].status === 'synthesizing' ? '正在合成' : queue[0].status === 'playing' ? '正在朗读' : '等待播放'}` : '语音队列为空';
  $('workflow-unknown-votes').hidden = !workflow.unknownVotes;
  $('workflow-unknown-votes').textContent = `${workflow.unknownVotes || 0} 条身份未知票未计入`;
  $('workflow-vote-help').hidden = !choices.length;
  const stepPhase = ['ready', 'paused'].includes(phase) ? (votingFinished ? 'voting' : choices.length ? 'selecting' : 'collecting') : phase === 'revealed' ? 'generating' : phase;
  document.querySelectorAll('#workflow-steps li').forEach(step => step.classList.toggle('current', step.dataset.phase === stepPhase));
  const choiceSignature = JSON.stringify([choices, tie, phase, workflow.winnerCommentId, [...pending], state.busy]);
  if (choiceSignature !== workflowChoiceSignature) {
    workflowChoiceSignature = choiceSignature;
    const root = $('workflow-choices'); root.replaceChildren();
    for (const [position, choice] of choices.entries()) {
      const card = make('article', null, 'workflow-choice');
      card.dataset.commentId = choice.commentId;
      const isWinner = workflow.winnerCommentId === choice.commentId;
      card.classList.toggle('winner', isWinner);
      const heading = make('div', null, 'workflow-choice-heading');
      heading.append(make('span', `投${choice.index || position + 1}`, 'workflow-vote-number'), make('strong', `${choice.votes || 0} 票`, 'workflow-choice-votes'));
      card.append(heading, make('h3', choice.text || '观众创意'), make('small', `来自 ${choice.nickname || '一位观众'}`), make('p', choice.reason || '', 'workflow-choice-reason'));
      if (isWinner) card.append(make('span', '✧ 本轮赢家', 'workflow-winner-label'));
      if (phase === 'ready' && !votingFinished) card.append(button('移出候选，留出补选名额', 'workflow-remove', { commentId: choice.commentId }));
      if (phase === 'ready' && tie.includes(choice.commentId)) card.append(button('主播裁定，选择此创意作画', 'workflow-reveal', { commentId: choice.commentId }, 'button accent full'));
      root.append(card);
    }
  }
  const presets = state.config?.voicePresets || [];
  const presetSignature = JSON.stringify([presets, workflow.voiceId]);
  if (presetSignature !== voicePresetSignature) {
    voicePresetSignature = presetSignature;
    const select = $('workflow-voice'); select.replaceChildren();
    if (!presets.length) { const option = make('option', '使用默认音色'); option.value = ''; select.append(option); }
    for (const preset of presets) { const option = make('option', preset.label); option.value = preset.id; select.append(option); }
    if (workflow.voiceId && !presets.some(preset => preset.id === workflow.voiceId)) { const custom = make('option', '当前自定义音色'); custom.value = workflow.voiceId; select.append(custom); }
    const selectedVoice = queuedWorkflowSettings?.voiceId || workflow.voiceId || presets[0]?.id || '';
    select.value = selectedVoice;
  }
  if (!taskBusy('workflow-settings') && !savingWorkflowSettings) {
    $('workflow-autochat').checked = workflow.autoChat !== false;
    $('workflow-autovoice').checked = workflow.autoVoice !== false;
  }
  const history = (workflow.conversation || []).slice(-3);
  const conversationRoot = $('workflow-conversation'); conversationRoot.hidden = !history.length;
  conversationRoot.replaceChildren();
  for (const item of history) { const row = make('div', null, 'workflow-conversation-row'); row.append(make('small', item.nickname ? `接住 ${item.nickname} 的话` : 'AI 主持'), make('p', item.text || '')); conversationRoot.append(row); }
  if (phase === 'revealed') {
    const artwork = (state.artworks || []).find(item => item.id === state.stage?.artworkId);
    if (artwork && workflowPreviewId !== artwork.id) {
      workflowPreviewId = artwork.id;
      let preview = document.getElementById('workflow-preview');
      if (!preview) { preview = make('div', null, 'workflow-preview'); preview.id = 'workflow-preview'; $('workflow-choices').after(preview); }
      preview.replaceChildren(); const image = make('img'); image.src = artwork.url; image.alt = artwork.text || artwork.prompt || '本轮生成的 GIF 作品'; preview.append(image, make('p', `✧ ${artwork.nickname || '观众'} 的灵感，已经成为作品。`));
    }
  }
  const preview = document.getElementById('workflow-preview'); if (preview) preview.hidden = phase !== 'revealed';
  renderWorkflowClock();
}
const baseRender = render;
render = function renderAll() { baseRender(); if (state) renderWorkflow(); };
$('workflow-start').onclick = () => void dispatch({ action: 'workflow-start', collectSeconds: Number($('workflow-collect-seconds').value), voteSeconds: Number($('workflow-vote-seconds').value), autoChat: $('workflow-autochat').checked, autoVoice: $('workflow-autovoice').checked, voiceId: $('workflow-voice').value || undefined });
for (const action of ['next', 'vote', 'close-vote', 'reveal', 'pause', 'resume']) $(`workflow-${action}`).onclick = () => void dispatch({ action: `workflow-${action}` });
const saveWorkflowSettings = () => {
  queuedWorkflowSettings = { action: 'workflow-settings', autoChat: $('workflow-autochat').checked, autoVoice: $('workflow-autovoice').checked, voiceId: $('workflow-voice').value || undefined };
  if (savingWorkflowSettings) return;
  savingWorkflowSettings = true;
  void (async () => {
    try { while (queuedWorkflowSettings) { const input = queuedWorkflowSettings; queuedWorkflowSettings = null; await dispatch(input); } }
    finally { savingWorkflowSettings = false; render(); }
  })();
};
$('workflow-autochat').onchange = saveWorkflowSettings;
$('workflow-autovoice').onchange = saveWorkflowSettings;
$('workflow-voice').onchange = saveWorkflowSettings;
$('workflow-stop-speech').onclick = () => void dispatch({ action: 'stop-speech' });
setInterval(renderWorkflowClock, 250);

$('avatar-enabled').onchange = () => void dispatch({action: 'avatar', enabled: $('avatar-enabled').checked});
