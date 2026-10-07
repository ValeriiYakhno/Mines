// One-shot and looping sound effects, tied to the "Sound" menu toggle - separate from the Music toggle
// (js/audio.js). Off by default until that toggle's own click or main.js's first-interaction fallback:
// that's the user gesture Web Audio needs.
import { getCtx, loadBuffer, rampGain } from './audio-context.js';

const BASE = 'assets/audio/sfx/';
const CLIPS = {                       // name -> file; empty until the sound step (7)
  // buttonClick: 'button_click.mp3',
};
const VOLUME = {                      // name -> 0..1
  // buttonClick: 0.5,
};
const LOOP_FADE_S = 0.2;              // fade in/out when a loop starts/stops, so it never clicks

export class SfxPlayer {
  constructor() {
    this.enabled = false;
    this.master = 1;              // 0..1 from the Settings slider
    this.loops = {};              // name -> { source, gain }
    this.wanted = new Set();      // loops that should be playing; a decode finishing after stopLoop must not start one
  }

  _load(file) { return loadBuffer(BASE + file); }

  setVolume(v) { this.master = v; for (const [name, l] of Object.entries(this.loops)) rampGain(l.gain, (VOLUME[name] ?? 0.5) * v, 0.1); }

  setEnabled(on) {
    if (on === this.enabled) return;
    this.enabled = on;
    getCtx();
    if (on) Object.values(CLIPS).forEach(file => this._load(file).catch(() => {}));   // one-shots are tiny: fetch now
    else [...this.wanted].forEach(name => this.stopLoop(name));
  }

  play(name) {
    if (!this.enabled || !CLIPS[name]) return;
    this._load(CLIPS[name]).then(buffer => {
      if (!this.enabled) return;
      const ctx = getCtx();
      const gain = ctx.createGain();
      gain.gain.value = (VOLUME[name] ?? 0.5) * this.master;
      gain.connect(ctx.destination);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.start();
    }).catch(err => console.error('sfx: failed to load', CLIPS[name], err));
  }

  startLoop(name) {
    if (!this.enabled || !CLIPS[name] || this.wanted.has(name)) return;
    this.wanted.add(name);
    this._load(CLIPS[name]).then(buffer => {
      if (!this.wanted.has(name) || this.loops[name]) return;
      const ctx = getCtx();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start();
      rampGain(gain, (VOLUME[name] ?? 0.5) * this.master, LOOP_FADE_S);
      this.loops[name] = { source, gain };
    }).catch(err => { this.wanted.delete(name); console.error('sfx: failed to load', CLIPS[name], err); });
  }

  stopLoop(name) {
    this.wanted.delete(name);
    const l = this.loops[name];
    if (!l) return;
    delete this.loops[name];
    rampGain(l.gain, 0, LOOP_FADE_S);
    l.source.stop(getCtx().currentTime + LOOP_FADE_S + 0.05);
  }
}
