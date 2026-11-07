import { BodyPlayer } from '/vendor/livliv/body.js';
import { startLipSync } from '/vendor/livliv/voice.js';
import { MoonBody } from './moon-body.js';

export async function createStageAvatar({root, audio}) {
  const canvas = root.querySelector('canvas'), caption = root.querySelector('#host-caption'), status = root.querySelector('#host-status');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const player = new BodyPlayer(canvas, new MoonBody(), {followPointer: false, maxPixelRatio: 1.5, idle: !reduced});
  try { await player.load({}); } catch (error) { player.dispose({release: true}); throw error; }
  let state, lastPhase, lastChoices, initialized = false, enabled = true, syncPromise, disposed = false;
  // The existing audio owns playback and acknowledgements. No second audio player/queue is created.
  player.use({order: 20, update(frame) { if (audio.paused || audio.ended || audio.muted || !enabled) frame.params.mouthOpen = 0; }});
  function refresh() {
    const talking = enabled && !audio.paused && !audio.ended && Boolean(audio.getAttribute('src'));
    root.dataset.talking = String(talking);
    status.textContent = talking ? '正在接话' : 'AI 值班店员';
    const item = state?.speech?.find(item => item.id === state?.stage?.speechId);
    const words = talking ? item?.text || state?.stage?.caption : '';
    caption.textContent = words ? [...words].slice(0, 88).join('') + ([...words].length > 88 ? '…' : '') : state?.workflow?.phase === 'generating' ? '画着呢，摊子还开着。你还想在月球买点什么？' : state?.workflow?.phase === 'paused' ? '稍等一下，摊主马上回来。' : '月球小摊营业中，等你一句奇思妙想。';
  }
  for (const event of ['playing', 'pause', 'ended', 'emptied', 'error']) audio.addEventListener(event, refresh);
  root.dataset.ready = 'true'; root.hidden = false;
  return {
    update(next) {
      state = next; enabled = next.settings?.avatarEnabled !== false;
      root.hidden = !enabled;
      if (enabled) { if (!player.playing) player.play(); } else player.pause();
      const phase = next.workflow?.phase || 'idle';
      const choices = (next.workflow?.choices || []).map(c => c.commentId).join('|');
      if (initialized && enabled && !reduced) {
        if (phase === 'revealed' && lastPhase !== phase) player.act('hop');
        else if (choices && choices !== lastChoices) player.act('nod');
      }
      player.setExpression(phase === 'revealed' || phase === 'voting' ? 'smile' : null);
      lastPhase = phase; lastChoices = choices; initialized = true; refresh();
    },
    // Called synchronously within the existing sound-enable click to unlock Web Audio.
    enableVoice() {
      if (disposed) return;
      syncPromise ??= startLipSync(player, audio, {motion: reduced ? 0 : .55, bounce: false}).catch(error => { console.warn('嘴型同步未启用', error.message); });
      return syncPromise;
    },
    dispose() {
      disposed = true;
      for (const event of ['playing', 'pause', 'ended', 'emptied', 'error']) audio.removeEventListener(event, refresh);
      player.dispose({release: true});
    },
  };
}
