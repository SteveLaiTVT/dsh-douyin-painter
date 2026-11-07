// Small, per-viewer host context. This module does not play audio or publish a stage.
const normalizedSource = comment => comment.source === 'manual' ? 'manual' : 'live';
const identity = comment => {
  const uid = comment.userId == null ? '' : String(comment.userId).trim();
  return uid ? JSON.stringify([normalizedSource(comment), String(comment.roomId || ''), uid]) : null;
};
const validText = value => typeof value === 'string' && value.trim().length > 0;
const isVote = value => /^投\s*[123一二三](?:号)?\s*$/u.test(value.normalize('NFKC').trim());
const REPLY_WINDOW_MS = 180000;
const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function replyKey(value, nickname = '') {
  const clean = nickname ? value.replace(new RegExp(`^\\s*@?${escaped(nickname)}[，,:：、\\s]*`, 'u'), '') : value;
  return normalize(clean);
}
function near(left, right, threshold = 0.82) {
  if (left === right) return true;
  if (Math.min(left.length, right.length) < 8) return false;
  const grams = value => new Set(Array.from({length: value.length - 1}, (_, i) => value.slice(i, i + 2)));
  const a = grams(left), b = grams(right);
  const common = [...a].filter(item => b.has(item)).length;
  return 2 * common / (a.size + b.size) >= threshold;
}
// A kind label helps, but cannot be the sole barrier against rule scripts.
// Require procedural combinations, not an isolated word used in an idea.
export function isRulesReply(value, {kind} = {}) {
  if (kind === 'rules') return true;
  const sentence = value.normalize('NFKC');
  if (/(?:玩法|规则|参与方式|参赛方式)/u.test(sentence) && /(?:每人|每位|发送|投稿|投票|收词|评选)/u.test(sentence)) return true;
  if (/每(?:人|位观众|个观众).{0,12}(?:一|1|只|最多|仅|限).{0,8}(?:创意|票|投稿)/u.test(sentence)) return true;
  if (/(?:发送|输入|打出|回复|请发).{0,12}投[一二三123]/u.test(sentence)) return true;
  if (/先.{0,12}(?:投稿|收词).{0,25}(?:再|然后|结束后).{0,20}(?:投票|评选|候选)/u.test(sentence)) return true;
  const actions = ['投稿', '收词', '候选', '投票', '评选'].filter(word => sentence.includes(word));
  return actions.length >= 3 && /(?:请|大家|每人|可以|先|然后|结束后)/u.test(sentence);
}
export class ConversationDirector {
  constructor({ text, clock = Date.now, cooldownMs = 3000 } = {}) {
    if (!text || typeof text.converse !== 'function') throw new Error('互动文本模块不可用');
    if (!Number.isFinite(cooldownMs) || cooldownMs < 0) throw new Error('互动间隔无效');
    Object.assign(this, { text, clock, cooldownMs });
    this.epoch = 0; this.active = null; this.lastAttempt = -Infinity;
    this.histories = new Map(); this.responded = new Set(); this.recentReplies = []; this.recentOriginals = []; this.lastError = null;
  }
  cancel() { this.epoch++; this.active?.controller.abort(); this.active = null; }
  reset({preserveRecent = false} = {}) {
    this.cancel();
    if (!preserveRecent) this.recentReplies = [];
    this.recentOriginals = [];
    this.lastAttempt = -Infinity; this.histories.clear(); this.responded.clear(); this.lastError = null;
  }
  recordNarration(value, kind = 'reply') {
    this.recentReplies.push({text: value.trim(), key: replyKey(value), kind, at: this.clock()});
    this.recentReplies = this.recentReplies.slice(-24);
  }
  consume(comment) {
    this.responded.add(comment.id);
    while (this.responded.size > 1000) this.responded.delete(this.responded.values().next().value);
    this.recentOriginals.push({key: normalize(comment.text), at: this.clock()});
    this.recentOriginals = this.recentOriginals.slice(-200);
  }
  async next({ theme, themePlan, rules = '', phase = 'collecting', comments = [], signal } = {}) {
    const now = this.clock();
    if (this.active || signal?.aborted || now - this.lastAttempt < this.cooldownMs || !Array.isArray(comments)) return null;
    this.recentReplies = this.recentReplies.filter(item => now - item.at < REPLY_WINDOW_MS);
    this.recentOriginals = this.recentOriginals.filter(item => now - item.at < REPLY_WINDOW_MS);
    const seen = new Set(), seenTexts = new Set();
    const candidates = comments.filter(comment => {
      if (!comment || !validText(comment.id) || !validText(comment.text) || comment.duplicateOf || this.responded.has(comment.id) || seen.has(comment.id) || isVote(comment.text)) return false;
      const receivedAt = Number.isFinite(comment.receivedAt) ? comment.receivedAt : now;
      if (now - receivedAt > 30000 || receivedAt - now > 5000) return false;
      const key = normalize(comment.text);
      if (seenTexts.has(key) || this.recentOriginals.some(item => near(key, item.key, 0.92))) return false;
      seen.add(comment.id); seenTexts.add(key); return true;
    }).map(comment => ({ ...comment, receivedAt: Number.isFinite(comment.receivedAt) ? comment.receivedAt : now }))
      .sort((left, right) => left.receivedAt - right.receivedAt).slice(-12);
    if (!candidates.length) return null;
    const viewers = new Set(candidates.map(identity).filter(Boolean));
    const history = [...viewers].flatMap(key => this.histories.get(key) || []).map(entry => ({ ...entry }));
    const token = { controller: new AbortController(), epoch: this.epoch };
    this.active = token; this.lastAttempt = now; this.lastError = null;
    const combined = signal ? AbortSignal.any([signal, token.controller.signal]) : token.controller.signal;
    try {
      const result = await this.text.converse({ theme, themePlan, rules, phase, comments: candidates, history, recentReplies: this.recentReplies.map(({text,kind}) => ({text,kind})), signal: combined });
      if (this.epoch !== token.epoch || combined.aborted) return null;
      if (!result || result.commentId === null) {
        for (const candidate of candidates) this.consume(candidate);
        while (this.responded.size > 1000) this.responded.delete(this.responded.values().next().value);
        return null;
      }
      const comment = candidates.find(candidate => candidate.id === result.commentId);
      if (!comment || !validText(result.text) || result.text.length > 500 || typeof result.readOriginal !== 'boolean') throw new Error('互动结果不对应真实发言');
      if (this.clock() - comment.receivedAt > 30000) return null;
      this.consume(comment);
      const kind = isRulesReply(result.text, {kind: result.kind, rules}) ? 'rules' : 'reply';
      if (kind === 'rules') return {commentId: comment.id, text: result.text.trim(), readOriginal: false, kind};
      const key = replyKey(result.text, comment.nickname);
      if (this.recentReplies.some(item => near(key, item.key))) return null;
      this.recentReplies.push({text: result.text.trim(), key, kind, at: this.clock()});
      this.recentReplies = this.recentReplies.slice(-24);
      while (this.responded.size > 1000) this.responded.delete(this.responded.values().next().value);
      const viewer = identity(comment);
      if (viewer) {
        const entries = this.histories.get(viewer) || [];
        entries.push({ commentId: comment.id, text: comment.text.slice(0, 500), reply: result.text.trim().slice(0, 500), userId: String(comment.userId), roomId: String(comment.roomId || ''), source: normalizedSource(comment) });
        this.histories.delete(viewer); this.histories.set(viewer, entries.slice(-6));
        while (this.histories.size > 100) this.histories.delete(this.histories.keys().next().value);
      }
      return { commentId: comment.id, text: result.text.trim(), readOriginal: result.readOriginal, kind };
    } catch (error) {
      if (this.epoch === token.epoch && !combined.aborted) this.lastError = error instanceof Error ? error.message : '互动任务失败';
      return null;
    } finally { if (this.active === token) this.active = null; }
  }
}
