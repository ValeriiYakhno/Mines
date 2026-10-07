// One shared Web Audio context + gain-ramp helper for both music (audio.js) and sound effects (sfx.js).
let ctx;
export function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Decoded once per URL and reused. A failed fetch/decode (or a 404 page) is dropped from the cache,
// so the next call retries instead of replaying the same rejected promise forever.
const buffers = new Map();
export function loadBuffer(url) {
  const ctx = getCtx();   // sync, inside the user gesture that triggered the load
  if (!buffers.has(url)) {
    const p = fetch(url)
      .then(r => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.arrayBuffer(); })
      .then(b => ctx.decodeAudioData(b));
    p.catch(() => buffers.delete(url));
    buffers.set(url, p);
  }
  return buffers.get(url);
}

export function rampGain(gainNode, to, seconds) {
  const c = getCtx(), g = gainNode.gain, now = c.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(to, now + seconds);
}
