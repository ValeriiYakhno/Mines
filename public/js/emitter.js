// Minimal pub-sub, shared by Game and BackendClient (both fire multi-argument events, which rules out
// the native EventTarget/CustomEvent - it only carries a single `detail` value).
export class Emitter {
  on(evt, fn) { (this.listeners ??= {}); (this.listeners[evt] ??= []).push(fn); }
  emit(evt, ...a) { (this.listeners?.[evt] || []).forEach(f => f(...a)); }
}
