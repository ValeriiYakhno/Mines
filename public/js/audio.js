// Background music: 3 short loop beds (each repeated a random 2-4 times) and 3 full songs (played
// once), shuffled into one endless playlist with a crossfade between every track. Built on the Web
// Audio API rather than <audio>/loop, because both the in-loop repeat and the track-to-track crossfade
// need to be genuinely gapless:
//  - native `<audio loop>` re-decodes from the file's start on every wrap, and MP3 encoder padding
//    means that re-decode isn't sample-accurate - it audibly clicks/pauses at the seam. Web Audio
//    decodes each file once into a PCM buffer and loops THAT directly (AudioBufferSourceNode.loop),
//    which is sample-accurate: no re-decode, no seam.
//  - crossfading two <audio> elements can leave an audible gap if the incoming element hasn't finished
//    buffering by the time the outgoing one reaches silence. Every track's buffer is pre-decoded the
//    moment music is first turned on (_preloadAll), so every later transition starts instantly -
//    nothing is ever waiting on a network fetch or decode at the moment it's needed.
//
// Starts only from a genuine user gesture (the Music toggle's own click, or main.js's first-interaction
// fallback so it plays as soon as the page allows rather than requiring a trip to the menu) - that's
// what browsers require before audio may play, Web Audio included. The toggle behaves as a mute, not a
// true pause: the current track (and its own scheduled transition) keeps running silently while off, so
// turning music back on just unmutes it in step instead of restarting or drifting off schedule.
import { getCtx, loadBuffer, rampGain } from './audio-context.js';

const TRACKS = [   // { file: 'music_01.mp3', loop: false } - empty until the sound step (7); check licences of every track
];
const AUDIO_BASE = 'assets/audio/';
const VOLUME = 0.5;
const FADE_S = 2;            // crossfade length between two tracks, in seconds
const TOGGLE_FADE_S = 0.6;   // quicker fade when the menu toggle mutes/unmutes

/** Fisher-Yates shuffle; re-rolls once if the result would start with `avoidFirst` (no back-to-back repeat across a playlist wrap) */
function shuffle(list, avoidFirst) {
  const a = list.slice();
  do {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  } while (a.length > 1 && avoidFirst && a[0] === avoidFirst);
  return a;
}

export class MusicPlayer {
  constructor() {
    this.volume = VOLUME;
    this.enabled = false;
    this.order = shuffle(TRACKS);
    this.idx = -1;
    this.active = null;           // { source, gain } for the currently scheduled/audible track
    this.nextTimer = 0;
  }

  _load(file) { return loadBuffer(AUDIO_BASE + file); }

  _preloadAll() { TRACKS.forEach(t => this._load(t.file).catch(() => {})); }

  /** control_toggle_music: on = play (unmute if already running, otherwise start the playlist); off = mute */
  setEnabled(on) {
    if (on === this.enabled) return;
    this.enabled = on;
    getCtx();
    if (on) {
      this._preloadAll();
      if (this.active) rampGain(this.active.gain, this.volume, TOGGLE_FADE_S);
      else this._playNext();
    } else if (this.active) {
      rampGain(this.active.gain, 0, TOGGLE_FADE_S);
    }
  }

  _playNext() {
    if (!this.enabled || !TRACKS.length) return;
    this.idx++;
    if (this.idx >= this.order.length) { this.order = shuffle(TRACKS, this.order[this.order.length - 1]); this.idx = 0; }
    const track = this.order[this.idx];
    const repeats = track.loop ? 2 + Math.floor(Math.random() * 3) : 1;   // loops: random 2-4; songs: exactly once
    this._load(track.file).then(buffer => {
      if (!this.enabled) return;   // toggled off while this decode was in flight - nothing started, next setEnabled(true) retries
      const ctx = getCtx();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = track.loop;
      source.connect(gain);
      const now = ctx.currentTime;
      source.start(now);
      rampGain(gain, this.volume, FADE_S);
      this.active = { source, gain };
      const totalLength = buffer.duration * repeats;
      clearTimeout(this.nextTimer);
      this.nextTimer = setTimeout(() => {
        rampGain(gain, 0, FADE_S);
        source.stop(ctx.currentTime + FADE_S + 0.1);
        this._playNext();               // crossfade: the next track fades in while this one fades out
      }, Math.max(0, totalLength - FADE_S) * 1000);
    }).catch(err => {
      console.error('music: failed to load', track.file, err);
      if (this.enabled) this._playNext();   // skip the broken track instead of stalling the playlist
    });
  }
}
