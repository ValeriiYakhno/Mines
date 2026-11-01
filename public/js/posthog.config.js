/* PostHog settings + the player id, read by the inline snippet in index.html <head> and by
   js/analytics.js. A classic (non-module) script on purpose: it has to run in <head>, before the
   ES modules, so PostHog can register player_uuid from the very first page view.
   The project key is PostHog's public ingestion key (phc_...), safe to ship to the browser. */
window.POSTHOG_CONFIG = {
  key: '',   // TODO step 4: the new PostHog project's public key (phc_...)
  apiHost: 'https://eu.i.posthog.com',
  defaults: '2026-05-30',
  // our own events (js/analytics.js) already cover every click that matters; autocapture would only
  // duplicate them ("clicked button ...") and eat the monthly event quota. $pageview / $pageleave stay.
  autocapture: false,
  // no session replay until there is a cookie-consent flow. Passed to posthog.init in index.html;
  // flip to false only together with the consent banner. Also leave replay off in the PostHog
  // project settings (Settings > Session replay), so the SDK cannot pick it up remotely.
  disableSessionRecording: true,
};

/* environment, sent with every event (posthog.register in index.html + js/analytics.js):
   local   - localhost / 127.0.0.1
   prod    - ONLY the hosts listed in PROD_HOSTS below
   preview - every other host: Workers preview builds (<version-or-branch>-shines-and-mines.<account>.workers.dev),
             pages.dev, a stray mirror, an unlisted domain. Unknown hosts must never count as prod.
   When the game gets its own domain, add it to PROD_HOSTS (this is the only change needed here).
   The og:url / og:image address in index.html <head> is static HTML, so change it in the same commit. */
var PROD_HOSTS = [
  'shines-and-mines.tugfish.workers.dev',
  'mines.tugfish.workers.dev',   // old Worker name, remove when the old Worker is deleted
  // 'play.example.com',   // own domain: uncomment and put the real host here
];
window.SHINES_AND_MINES_ENV = (function (host) {
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host)) return 'local';
  return PROD_HOSTS.indexOf(host.toLowerCase()) !== -1 ? 'prod' : 'preview';
})(location.hostname);

/* team devices: open the game once with ?internal=1 and every event from that browser carries
   is_internal: true (filter it out in PostHog: "Filter out internal and test users").
   ?internal=0 removes the mark. Remembered in localStorage, so the flag survives later visits. */
window.SHINES_AND_MINES_INTERNAL = (function () {
  var KEY = 'shinesAndMinesInternal';
  try {
    var q = new URLSearchParams(location.search).get('internal');
    if (q === '1') localStorage.setItem(KEY, '1');
    if (q === '0') localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === '1';
  } catch (e) {
    return new URLSearchParams(location.search).get('internal') === '1';
  }
})();

/* player UUID (same localStorage key js/analytics.js uses): created here on the first visit so it
   exists before posthog.register(); firstVisit tells analytics.js it was just created. */
window.SHINES_AND_MINES_PLAYER = (function () {
  var KEY = 'shinesAndMinesPlayerId';
  try {
    var id = localStorage.getItem(KEY);
    if (id) return { id: id, firstVisit: false };
    id = crypto.randomUUID(); localStorage.setItem(KEY, id);
    return { id: id, firstVisit: true };
  } catch (e) {
    return { id: crypto.randomUUID(), firstVisit: true };    // private mode: an id for this page only
  }
})();
