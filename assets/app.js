/* TBM Tram Radar Bordeaux — application principale.
   Données : SIRI Lite TBM (temps réel), GTFS TBM (tracés, via data/network.json), OSRM piéton (itinéraires). */
(() => {
'use strict';
const CFG = window.TBM_CONFIG;

/* =========================================================
   Utilitaires
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const TAU = Math.PI * 2, RAD = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* stockage indisponible */ } }
};
function hav(a, b) {
  const dLat = (b[0] - a[0]) * RAD, dLng = (b[1] - a[1]) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(s));
}
function bearing(a, b) {
  const y = Math.sin((b[1] - a[1]) * RAD) * Math.cos(b[0] * RAD);
  const x = Math.cos(a[0] * RAD) * Math.sin(b[0] * RAD) - Math.sin(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.cos((b[1] - a[1]) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}
const ease = f => 0.5 * f + 0.5 * (f - Math.sin(TAU * f) / TAU);
const easeD = f => 0.5 + 0.5 * (1 - Math.cos(TAU * f));

/* Horloge calée sur le serveur TBM : les comptes à rebours ne dépendent pas de l'heure du téléphone. */
let clockOffset = 0;
const offsetSamples = [];
const nowS = () => Date.now() / 1000 + clockOffset;
function noteServerTime(res) {
  const iso = res && res.data && res.data.Siri && res.data.Siri.ServiceDelivery && res.data.Siri.ServiceDelivery.ResponseTimestamp;
  const s = iso ? Date.parse(iso) / 1000 : NaN;
  if (!isFinite(s) || res.t1 - res.t0 > 3000) return;
  const o = s - (res.t0 + res.t1) / 2000;
  if (Math.abs(o) > 600) return;
  offsetSamples.push(o);
  if (offsetSamples.length > 9) offsetSamples.shift();
  const sorted = [...offsetSamples].sort((a, b) => a - b);
  clockOffset = sorted[Math.floor(sorted.length / 2)];
}

const pad2 = n => String(n).padStart(2, '0');
const fmtDist = m => m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
const fmtWalk = sec => sec >= 5940 ? `${Math.round(sec / 3600)} h` : `${Math.max(1, Math.round(sec / 60))} min`;
const fmtKmh = v => `${v.toFixed(1).replace('.', ',')} km/h`;
const toDate = ts => new Date((ts - clockOffset) * 1000);
const fmtClock = ts => toDate(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const fmtClockS = ts => toDate(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
function fmtMS(sec) {
  const s = Math.round(Math.abs(sec)), m = Math.floor(s / 60), r = s % 60;
  if (!m) return `${r} s`;
  return r ? `${m} min ${pad2(r)} s` : `${m} min`;
}
/* Compte à rebours : secondes exactes sous 2 minutes. */
function cdText(arrIn, depIn, style) {
  if (arrIn > 0) {
    if (style === 'min') return arrIn < 60 ? `${Math.ceil(arrIn)} s` : `${Math.floor(arrIn / 60)} min`;
    if (arrIn < 120) return `${Math.ceil(arrIn)} s`;
    if (arrIn >= 3600) return `${Math.floor(arrIn / 3600)} h ${pad2(Math.floor(arrIn % 3600 / 60))}`;
    return `${Math.floor(arrIn / 60)}:${pad2(Math.floor(arrIn % 60))}`;
  }
  return depIn > 0 ? 'À quai' : 'Parti';
}
const cdSpan = (p, style = '') => `<span class="cd" data-arr="${p.tArr}" data-dep="${p.tDep}" data-style="${style}"></span>`;
function tickCountdowns() {
  const now = nowS();
  for (const el of document.querySelectorAll('.cd[data-arr]')) {
    const t = cdText(+el.dataset.arr - now, +el.dataset.dep - now, el.dataset.style);
    if (el.textContent !== t) el.textContent = t;
  }
}
function fmtDelay(d) {
  if (d == null) return '';
  if (d >= 60) return `<span class="delay">+${Math.round(d / 60)} min</span>`;
  if (d <= -60) return `<span class="delay">${Math.round(d / 60)} min</span>`;
  return '<span class="delay ok">à l\u2019heure</span>';
}
const liveTag = live => live ? '<span class="rt">Temps réel</span>' : '<span class="rt theo">Théorique</span>';

const ICONS = {
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  locate: '<line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>',
  map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
  pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  tram: '<rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><path d="m8 19-2 3"/><path d="m18 22-2-3"/><path d="M8 15h.01"/><path d="M16 15h.01"/>',
  walk: '<circle cx="13" cy="4" r="2"/><path d="m9 20 3-6 3 3v5"/><path d="m6 12 3-3 4 1 3 3"/><path d="M9 9 7 15"/>',
  flag: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/>',
  swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  starFill: '<path fill="currentColor" d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  bellOn: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M22 8c0-2.3-.8-4.3-2-6"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/><path d="M4 2C2.8 3.7 2 5.7 2 8"/>',
  share: '<path d="M12 2v13"/><path d="m16 6-4-4-4 4"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  wifi: '<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>'
};
const svg = (name, size = 20) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
const LOGO = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke-width="3" aria-hidden="true">
  <path d="M12 3a9 9 0 0 1 9 9" stroke="#852d7e"/><path d="M21 12a9 9 0 0 1-9 9" stroke="#00893e"/>
  <path d="M12 21a9 9 0 0 1-9-9" stroke="#e2007a"/><path d="M3 12a9 9 0 0 1 9-9" stroke="#d8232a"/>
  <circle cx="12" cy="12" r="3.2" fill="#0f172a" stroke="none"/></svg>`;

/* =========================================================
   Pont natif : plugins Capacitor dans l'app iOS, repli web sinon
   ========================================================= */
const Native = (() => {
  const C = window.Capacitor;
  const isNative = !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
  const P = n => (isNative && typeof C.registerPlugin === 'function' ? C.registerPlugin(n) : null);
  return { isNative, platform: isNative ? C.getPlatform() : 'web', geo: P('Geolocation'), notif: P('LocalNotifications'), haptics: P('Haptics'), share: P('Share'), status: P('StatusBar') };
})();

/* =========================================================
   État
   ========================================================= */
const LINE_IDS = Object.keys(CFG.lines);
const REF2LINE = Object.fromEntries(LINE_IDS.map(l => [CFG.lines[l].ref, l]));
const CENTER = [44.8412, -0.5720];
const SIM_SPOTS = { bourse: [44.8413, -0.5693], quinconces: [44.8456, -0.5752] };
const METRO_RADIUS = 20000;
const CADENCES = [
  { id: 'promenade', label: 'Promenade', kmh: 3.6 },
  { id: 'normal', label: 'Normal', kmh: 4.8 },
  { id: 'presse', label: 'Pressé', kmh: 6.2 },
  { id: 'course', label: 'Course', kmh: 9.5 }
];
const kmhOf = id => (CADENCES.find(c => c.id === id) || CADENCES[1]).kmh;
const KEY_NAMES = ['quinconces', 'place de la bourse', 'gare saint jean', 'victoire', 'porte de bourgogne', 'meriadeck', 'hotel de ville', 'grand theatre', 'stalingrad', 'sainte catherine'];
const savedLines = (store.get('tbm-lines') || []).filter(l => LINE_IDS.includes(l));

const state = {
  lineMeta: Object.fromEntries(LINE_IDS.map(l => [l, { color: CFG.lines[l].color, shapes: null }])),
  user: null, mode: 'gps', lastGps: null, gps: 'search', firstFix: true,
  activeLines: new Set(savedLines.length ? savedLines : LINE_IDS),
  dest: null, fromId: null, pinned: null, dir: store.get('tbm-dir') || null, dirTouched: false, view: store.get('tbm-view') || 'ui', follow: false, margin: store.get('tbm-margin') ?? 60, alert: null, needFit: false, speedSamples: [], realKmh: null, kmhNow: null,
  recents: store.get('tbm-recents') || [],
  cadence: store.get('tbm-cadence') || 'normal',
  bannerDismissed: { far: false, nogps: false }, bannerKind: null,
  proxy: store.get('tbm-proxy') ?? (CFG.proxy || ''),
  api: 'loading', apiError: '', apiErrorKind: '', lastUpdate: 0,
  lineFresh: {}, loadingLines: new Set(),
  stations: {}, sp2st: {}, stopsReady: false,
  journeys: [], journeyById: new Map(), stIndex: new Map(), segments: new Map(),
  messages: [], msgFresh: 0, msgError: '',
  routerOk: null, version: null
};
const lineColor = l => (state.lineMeta[l] && state.lineMeta[l].color) || '#64748b';
const badge = (l, cls = '') => `<span class="badge ${cls}" style="--c:${lineColor(l)}">${esc(l)}</span>`;

/* =========================================================
   Réseau : fetch générique, API TBM (avec relais facultatif)
   ========================================================= */
async function fetchJSON(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) { const e = new Error(`Le serveur a répondu ${res.status}`); e.kind = 'http'; throw e; }
    const data = await res.json();
    return { data, t0, t1: Date.now() };
  } catch (err) {
    if (!err.kind) {
      if (err.name === 'AbortError') { err.kind = 'timeout'; err.message = 'Le serveur ne répond pas (délai dépassé)'; }
      else if (!navigator.onLine) { err.kind = 'offline'; err.message = 'Pas de connexion internet'; }
      else if (err instanceof TypeError || err.name === 'TypeError') { err.kind = 'network'; err.message = 'Accès refusé par le navigateur ou réseau indisponible'; }
      else if (err instanceof SyntaxError || err.name === 'SyntaxError') { err.kind = 'format'; err.message = 'Réponse illisible'; }
      else err.kind = 'other';
    }
    throw err;
  } finally { clearTimeout(timer); }
}
function apiUrl(path, params = {}) {
  const u = new URL(CFG.api.base + path);
  u.searchParams.set('AccountKey', CFG.api.key);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}
async function api(path, params, timeoutMs) {
  const target = apiUrl(path, params);
  const url = state.proxy ? state.proxy.replace('{url}', encodeURIComponent(target)) : target;
  try { return await fetchJSON(url, timeoutMs); }
  catch (err) {
    if (err.kind === 'network') {
      err.kind = state.proxy ? 'proxy' : 'blocked';
      err.message = state.proxy ? 'Le relais configuré ne répond pas correctement' : 'Le navigateur bloque l\u2019accès direct à l\u2019API TBM (CORS)';
    } else if (err.kind === 'http') err.message = err.message.replace('Le serveur', 'Le serveur TBM');
    throw err;
  }
}
function setApiError(err) {
  state.api = 'error';
  state.apiError = (err && err.message) || 'Erreur inconnue';
  state.apiErrorKind = (err && err.kind) || 'other';
  renderLive();
  tickUi(true);
}

/* =========================================================
   Données statiques : tracés GTFS (network.json) et arrêts
   ========================================================= */
async function loadNetwork() {
  try {
    const r = await fetch('data/network.json', { cache: 'no-cache' });
    if (!r.ok) return;
    const js = await r.json();
    for (const [l, m] of Object.entries(js.lines || {})) {
      if (!state.lineMeta[l]) continue;
      if (m.color) state.lineMeta[l].color = m.color.startsWith('#') ? m.color : '#' + m.color;
      if (Array.isArray(m.shapes) && m.shapes.length) state.lineMeta[l].shapes = m.shapes;
    }
  } catch (_) { /* repli sur les couleurs de config.js et les tracés reconstitués */ }
  renderChips();
  prepareGeometry();
}

function buildStations(list) {
  const stations = {}, sp2st = {};
  for (const sp of list) {
    const sid = sp.area || 'sp:' + sp.id;
    let st = stations[sid];
    if (!st) st = stations[sid] = { id: sid, name: sp.name.trim(), sLat: 0, sLng: 0, k: 0, lines: new Set() };
    st.sLat += sp.lat; st.sLng += sp.lng; st.k++;
    if (sp.name.length < st.name.length) st.name = sp.name.trim();
    sp.lines.forEach(l => st.lines.add(l));
    sp2st[sp.id] = sid;
  }
  for (const st of Object.values(stations)) {
    st.ll = [st.sLat / st.k, st.sLng / st.k];
    st.n = norm(st.name);
    st.key = KEY_NAMES.some(k => st.n.includes(k));
  }
  state.stations = stations;
  state.sp2st = sp2st;
  state.stopsReady = true;
  if (state.dest && !stations[state.dest]) state.dest = null;
  loadGeometryCache();
  rebuildStationMarkers();
  prepareGeometry();
}
async function loadStops() {
  stopsLoading = true; stopsTriedAt = Date.now();
  try { return await loadStopsInner(); } finally { stopsLoading = false; }
}
async function loadStopsInner() {
  const cached = store.get('tbm-stops-v3');
  const fresh = cached && cached.list && cached.list.length && cached.t > Date.now() - 864e5;
  if (cached && cached.list && cached.list.length) buildStations(cached.list);
  if (fresh) return true;
  try {
    const res = await api('stoppoints-discovery.json', {}, 45000);
    const arr = (res.data && res.data.Siri && res.data.Siri.StopPointsDelivery && res.data.Siri.StopPointsDelivery.AnnotatedStopPointRef) || [];
    const list = [];
    for (const sp of arr) {
      const id = sp.StopPointRef && sp.StopPointRef.value, loc = sp.Location;
      if (!id || !loc) continue;
      const area = (sp.StopAreaRef && sp.StopAreaRef.value) || '';
      const lines = (sp.Lines || []).map(l => REF2LINE[l.value]).filter(Boolean);
      if (!lines.length && !/:BP:T[A-Z0-9]+:LOC$/.test(area)) continue;
      list.push({ id, name: (sp.StopName && sp.StopName.value) || 'Arrêt', lat: +loc.latitude, lng: +loc.longitude, area, lines });
    }
    if (!list.length) { const e = new Error('La liste des arrêts de tram reçue est vide'); e.kind = 'format'; throw e; }
    store.set('tbm-stops-v3', { t: Date.now(), list });
    buildStations(list);
    return true;
  } catch (err) {
    if (state.stopsReady) return true;
    setApiError(err);
    return false;
  }
}
function loadGeometryCache() {
  const g = store.get('tbm-geom-v3');
  if (!g || g.t < Date.now() - 30 * 864e5) return;
  for (const [a, b, lines] of g.segs || []) {
    if (!state.stations[a] || !state.stations[b]) continue;
    const key = a + '|' + b;
    const s = state.segments.get(key) || { a, b, lines: new Set() };
    lines.split('').forEach(l => s.lines.add(l));
    state.segments.set(key, s);
  }
  for (const [sid, lines] of Object.entries(g.st || {})) {
    const st = state.stations[sid];
    if (st) lines.split('').forEach(l => { if (state.lineMeta[l]) st.lines.add(l); });
  }
}
function saveGeometryCache() {
  const segs = [...state.segments.values()].map(s => [s.a, s.b, [...s.lines].sort().join('')]);
  const st = {};
  for (const s of Object.values(state.stations)) if (s.lines.size) st[s.id] = [...s.lines].sort().join('');
  store.set('tbm-geom-v3', { t: Date.now(), segs, st });
}

/* =========================================================
   Temps réel : estimated-timetable par ligne et par sens
   ========================================================= */
const ts = s => (s ? Date.parse(s) / 1000 : null);
function parseET(js, line) {
  const del = js && js.Siri && js.Siri.ServiceDelivery && js.Siri.ServiceDelivery.EstimatedTimetableDelivery && js.Siri.ServiceDelivery.EstimatedTimetableDelivery[0];
  const frames = (del && del.EstimatedJourneyVersionFrame) || [];
  const now = nowS(), out = [];
  for (const f of frames) for (const j of (f.EstimatedVehicleJourney || [])) {
    if (j.Cancellation === true) continue;
    const calls = [];
    for (const c of ((j.EstimatedCalls && j.EstimatedCalls.EstimatedCall) || [])) {
      const st = state.sp2st[c.StopPointRef && c.StopPointRef.value];
      if (!st) continue;
      if (c.ArrivalStatus === 'cancelled' || c.DepartureStatus === 'cancelled' || c.Cancellation === true) continue;
      const aArr = ts(c.AimedArrivalTime), eArr = ts(c.ExpectedArrivalTime), aDep = ts(c.AimedDepartureTime), eDep = ts(c.ExpectedDepartureTime);
      const arr = eArr ?? aArr ?? eDep ?? aDep;
      if (arr == null) continue;
      if (calls.length && calls[calls.length - 1].st === st) continue;
      calls.push({ st, arr, dep: eDep ?? aDep ?? arr, aimed: aDep ?? aArr, live: eDep != null || eArr != null });
    }
    if (calls.length < 2) continue;
    let prev = -Infinity;
    for (const c of calls) { if (c.arr < prev) c.arr = prev; if (c.dep < c.arr) c.dep = c.arr; prev = c.dep; }
    const last = calls[calls.length - 1];
    if (last.arr < now - 120 || calls[0].dep > now + 5400) continue;
    const dir = (j.DirectionRef && j.DirectionRef.value) || '0';
    const id = (j.VehicleJourneyRef && j.VehicleJourneyRef.value) || `${line}${dir}:${calls[0].dep}`;
    const callIdx = {};
    calls.forEach((c, i) => { if (callIdx[c.st] == null) callIdx[c.st] = i; });
    out.push({ id, line, dir, monitored: j.Monitored !== false, dest: (state.stations[last.st] || {}).name || 'Terminus', calls, callIdx, idx: 0 });
  }
  return out;
}
function absorb(journeys) {
  let changed = false;
  for (const j of journeys) {
    const c = j.calls;
    for (let i = 0; i < c.length; i++) {
      const st = state.stations[c[i].st];
      if (st && !st.lines.has(j.line)) { st.lines.add(j.line); changed = true; }
      if (!i) continue;
      const [a, b] = [c[i - 1].st, c[i].st].sort();
      const key = a + '|' + b;
      let s = state.segments.get(key);
      if (!s) { s = { a, b, lines: new Set() }; state.segments.set(key, s); changed = true; }
      if (!s.lines.has(j.line)) { s.lines.add(j.line); changed = true; }
    }
  }
  if (changed) { saveGeometryCache(); rebuildStationMarkers(); prepareGeometry(); }
}
function indexJourneys() {
  const byId = new Map(), idx = new Map();
  for (const j of state.journeys) {
    byId.set(j.id, j);
    for (let i = 0; i < j.calls.length - 1; i++) {
      const st = j.calls[i].st;
      if (!idx.has(st)) idx.set(st, []);
      idx.get(st).push([j, i]);
    }
  }
  state.journeyById = byId;
  state.stIndex = idx;
}
async function refreshLines(lines) {
  lines = lines.filter(l => !state.loadingLines.has(l));
  if (!lines.length || !state.stopsReady) return;
  lines.forEach(l => state.loadingLines.add(l));
  if (!state.lastUpdate) { state.api = 'loading'; renderLive(); }
  const tasks = [];
  for (const l of lines) for (const d of ['0', '1']) {
    tasks.push(api('estimated-timetable.json', { LineRef: CFG.lines[l].ref, DirectionRef: d }).then(r => { noteServerTime(r); return { l, d, list: parseET(r.data, l) }; }));
  }
  const res = await Promise.allSettled(tasks);
  lines.forEach(l => state.loadingLines.delete(l));
  const now = nowS();
  const ok = res.filter(r => r.status === 'fulfilled').map(r => r.value);
  const failed = new Set();
  res.forEach((r, k) => { if (r.status === 'rejected') failed.add(lines[k >> 1] + (k % 2 ? '1' : '0')); });
  lines.forEach(l => {
    const bothFailed = failed.has(l + '0') && failed.has(l + '1');
    state.lineFresh[l] = bothFailed ? now - CFG.refresh.normal + 15 : now;
  });
  if (!ok.length) { setApiError(res[0].reason); return; }
  const fresh = [], seen = new Set(), replaced = new Set(ok.map(o => o.l + o.d));
  for (const o of ok) for (const j of o.list) if (!seen.has(j.id)) { seen.add(j.id); fresh.push(j); }
  state.journeys = state.journeys
    .filter(j => !replaced.has(j.line + j.dir) && !seen.has(j.id) && j.calls[j.calls.length - 1].arr > now - 120)
    .concat(fresh);
  indexJourneys();
  absorb(fresh);
  state.lastUpdate = now;
  state.api = failed.size ? 'partial' : 'ok';
  state.apiError = failed.size ? `${failed.size} flux sur ${res.length} n\u2019ont pas répondu` : '';
  renderLive();
  tickUi(true);
}

/* Infos trafic (SIRI general-message), lecture tolérante au format */
function collectKey(obj, key, acc = []) {
  if (Array.isArray(obj)) obj.forEach(o => collectKey(o, key, acc));
  else if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) { if (k === key) acc.push(v); collectKey(v, key, acc); }
  return acc;
}
const flatVals = v => (Array.isArray(v) ? v.flatMap(flatVals) : v == null ? [] : typeof v === 'object' ? (v.value != null ? [String(v.value)] : []) : [String(v)]);
function parseMessages(js) {
  const raw = collectKey(js, 'InfoMessage').concat(collectKey(js, 'GeneralMessage')).flat();
  const out = [], seen = new Set();
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const texts = [...new Set(flatVals(collectKey(m, 'MessageText')).map(t => t.trim()).filter(Boolean))];
    if (!texts.length) continue;
    const lines = [...new Set(flatVals(collectKey(m, 'LineRef')).map(r => REF2LINE[r]).filter(Boolean))].sort();
    const stations = [...new Set(flatVals(collectKey(m, 'StopPointRef')).map(r => state.sp2st[r]).filter(Boolean))];
    const body = texts.slice().sort((a, b) => b.length - a.length)[0];
    const title = texts.length > 1 ? texts.slice().sort((a, b) => a.length - b.length)[0] : '';
    if (!lines.length && !stations.length && !/tram/i.test(body)) continue;
    const key = norm(body).slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, body, lines, stations, until: ts(flatVals(m.ValidUntilTime)[0]) });
  }
  return out;
}
async function refreshMessages() {
  state.msgFresh = nowS();
  try { const r = await api('general-message.json', {}, 20000); state.messages = parseMessages(r.data); state.msgError = ''; }
  catch (err) { state.msgError = err.message; }
  tickUi(true);
}

/* Planificateur : 30 s en temps normal, 10 s pour la ligne du tram visé quand il approche. */
let rtTimer = null, lastCtx = null, stopsLoading = false, stopsTriedAt = 0;
function urgentLines() {
  const s = new Set(), p = lastCtx && lastCtx.primary;
  if (p && p.arrIn < 240) { s.add(p.line); if (p.transfer) s.add(p.transfer.line); }
  return s;
}
function schedule() {
  clearTimeout(rtTimer);
  rtTimer = setTimeout(async () => {
    try {
      if (!document.hidden && !state.stopsReady && !stopsLoading && Date.now() - stopsTriedAt > 20000) { boot(false); }
      if (!document.hidden && state.stopsReady) {
        const now = nowS(), urg = urgentLines();
        const due = LINE_IDS.filter(l => state.activeLines.has(l) || urg.has(l))
          .filter(l => now - (state.lineFresh[l] || 0) >= (urg.has(l) ? CFG.refresh.urgent : CFG.refresh.normal));
        if (due.length) await refreshLines(due);
        if (now - state.msgFresh >= CFG.refresh.messages) refreshMessages();
      }
    } finally { schedule(); }
  }, 1500);
}

/* =========================================================
   Itinéraire piéton réel (OSRM piéton)
   ========================================================= */
const walkCache = new Map();
let tableBusy = false, tableAt = 0, routeBusy = false, routeAt = 0;
const routerUrl = (kind, pts, q) => `${CFG.router}/${kind}/v1/foot/${pts.map(p => `${p[1].toFixed(6)},${p[0].toFixed(6)}`).join(';')}${q}`;
async function ensureWalkTable(sts) {
  if (!state.user || !sts.length || !CFG.router) return;
  const o = state.user.ll, now = nowS();
  const stale = sts.some(st => { const r = walkCache.get(st.id); return !r || hav(r.origin, o) > 40; });
  if ((!stale && now - tableAt < 180) || tableBusy || now - tableAt < 8) return;
  tableBusy = true; tableAt = now;
  try {
    const r = await fetchJSON(routerUrl('table', [o, ...sts.map(s => s.ll)], '?sources=0&annotations=distance'), 12000);
    const row = r.data && r.data.code === 'Ok' && r.data.distances && r.data.distances[0];
    if (!row) throw new Error('routage');
    sts.forEach((st, k) => {
      const d = row[k + 1];
      if (d == null) return;
      const prev = walkCache.get(st.id) || {};
      walkCache.set(st.id, { ...prev, dist: d, origin: o, crow0: hav(o, st.ll) });
    });
    state.routerOk = true;
  } catch (_) { state.routerOk = false; }
  finally { tableBusy = false; tickUi(true); }
}
async function ensureRouteGeom(st) {
  if (!state.user || !st || !CFG.router) return;
  const o = state.user.ll, r = walkCache.get(st.id), now = nowS();
  if (r && r.geom && hav(r.geomOrigin, o) < 15) return;
  if (routeBusy || now - routeAt < 5) return;
  routeBusy = true; routeAt = now;
  try {
    const res = await fetchJSON(routerUrl('route', [o, st.ll], '?overview=full&geometries=geojson&steps=false'), 12000);
    const rt = res.data && res.data.routes && res.data.routes[0];
    if (!rt) throw new Error('routage');
    walkCache.set(st.id, { ...(walkCache.get(st.id) || {}), dist: rt.distance, origin: o, crow0: hav(o, st.ll), geom: rt.geometry.coordinates.map(c => [c[1], c[0]]), geomOrigin: o });
    state.routerOk = true;
  } catch (_) { state.routerOk = false; }
  finally { routeBusy = false; tickUi(true); }
}
function walkFor(st, kmh = state.kmhNow || kmhOf(state.cadence)) {
  if (!state.user || !st) return null;
  const crow = hav(state.user.ll, st.ll), r = walkCache.get(st.id);
  let dist, routed = false;
  if (r && r.dist != null && hav(r.origin, state.user.ll) < 200) { dist = Math.max(crow, r.dist + (crow - r.crow0)); routed = true; }
  else dist = crow * CFG.walk.detour;
  return { crow, dist, routed, sec: dist / (kmh / 3.6) + CFG.walk.platformSec };
}

/* =========================================================
   Moteur d'interception
   ========================================================= */
function verdict(arrIn, depIn, walk) {
  if (walk == null) return null;
  if (depIn - walk < 0) return 'red';
  if (arrIn - walk > 120) return 'green';
  return 'orange';
}
const VERDICT_TEXT = { green: "Vous l'avez à coup sûr", orange: 'Pressez le pas !', red: 'Trop tard' };
const isVisible = st => !!st && [...st.lines].some(l => state.activeLines.has(l));
const stationList = () => Object.values(state.stations).filter(st => st.lines.size);

function candidateStations() {
  if (!state.user) return [];
  const list = stationList().filter(isVisible).map(st => ({ st, d: hav(state.user.ll, st.ll) })).sort((a, b) => a.d - b.d);
  let c = list.filter(x => x.d <= CFG.walk.candidateRadius).slice(0, CFG.walk.maxCandidates);
  if (c.length < 3) c = list.slice(0, 3);
  return c.map(x => x.st);
}
function mkItem(S, w, j, i, now) {
  const c = j.calls[i], arrIn = c.arr - now, depIn = c.dep - now;
  return {
    S, w, j, i, line: j.line, dest: j.dest, tArr: c.arr, tDep: c.dep, arrIn, depIn,
    delay: c.aimed != null ? Math.round(c.dep - c.aimed) : null, live: c.live && j.monitored,
    v: verdict(arrIn, depIn, w ? w.sec : null)
  };
}
function stationBoard(S, w, now, minCount = 3) {
  const groups = new Map();
  for (const [j, i] of state.stIndex.get(S.id) || []) {
    if (!state.activeLines.has(j.line)) continue;
    const c = j.calls[i];
    if (c.dep - now < -1 || c.arr - now > 5400) continue;
    const key = j.line + '|' + j.dest;
    let g = groups.get(key);
    if (!g) { g = { key, line: j.line, dest: j.dest, all: [] }; groups.set(key, g); }
    g.all.push(mkItem(S, w, j, i, now));
  }
  const out = [];
  for (const g of groups.values()) {
    g.all.sort((a, b) => a.arrIn - b.arrIn);
    g.list = g.all.slice(0, minCount);
    g.catchable = g.all.find(p => p.v && p.v !== 'red') || null;
    g.toDest = !!state.dest && g.all.some(p => (p.j.callIdx[state.dest] ?? -1) > p.i);
    out.push(g);
  }
  out.sort((a, b) => (b.toDest - a.toDest) || a.line.localeCompare(b.line) || a.list[0].arrIn - b.list[0].arrIn);
  return out;
}

/* =========================================================
   Moteur : station la plus proche + direction choisie
   ========================================================= */
function nearestStations() {
  return candidateStations().slice(0, 4).map(st => ({ st, d: (walkFor(st) || { dist: Infinity }).dist })).sort((a, b) => a.d - b.d).map(x => x.st);
}
function computeCtx(now) {
  const ctx = { now };
  if (!state.stopsReady) return ctx;
  const forced = state.fromId && state.stations[state.fromId];
  const list = forced ? [forced] : nearestStations();
  if (!list.length) return ctx;
  // La plus proche ; si elle n'a aucun départ (terminus, ligne masquée), la suivante qui en a.
  let S = list[0], groups = stationBoard(S, walkFor(S), now, 3);
  for (let k = 1; !groups.length && k < list.length; k++) {
    const g2 = stationBoard(list[k], walkFor(list[k]), now, 3);
    if (g2.length) { ctx.skipped = S; S = list[k]; groups = g2; }
  }
  ctx.board = S;
  ctx.forced = !!forced;
  ctx.boardW = walkFor(S);
  ctx.groups = groups;
  let g = null;
  if (!state.dirTouched) { const f = favorites().find(x => x.st === S.id && ctx.groups.some(y => y.key === x.key)); if (f) g = ctx.groups.find(y => y.key === f.key); }
  if (!g && state.dir) g = ctx.groups.find(x => x.key === state.dir) || null;
  if (!g) for (const x of ctx.groups) if (!g || x.list[0].arrIn < g.list[0].arrIn) g = x;
  ctx.g = g;
  ctx.primary = g ? g.list[0] : null;
  ctx.nextCatch = g && ctx.primary && ctx.primary.v === 'red' ? g.catchable : null;
  return ctx;
}

/* =========================================================
   Carte
   ========================================================= */
const isDesk = () => window.matchMedia('(min-width: 768px)').matches;
const map = L.map('map', { zoomControl: false, attributionControl: false, minZoom: 10, maxZoom: 19 }).setView(CENTER, 13);
L.tileLayer((CFG.tiles && CFG.tiles.url) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: (CFG.tiles && CFG.tiles.maxZoom) || 19, crossOrigin: true }).addTo(map);
if (isDesk()) L.control.zoom({ position: 'bottomright' }).addTo(map);
map.addControl(new (L.Control.extend({
  options: { position: 'bottomright' },
  onAdd() {
    const d = L.DomUtil.create('div', 'attr');
    d.innerHTML = `<button type="button" aria-label="Sources de la carte et des données" aria-expanded="false">i</button>
      <span class="attr-txt">&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, données TBM, itinéraires OSRM</span>`;
    L.DomEvent.disableClickPropagation(d);
    const b = d.querySelector('button');
    b.addEventListener('click', () => b.setAttribute('aria-expanded', String(d.classList.toggle('open'))));
    return d;
  }
}))());
map.createPane('linesPane').style.zIndex = 410;
map.createPane('legPane').style.zIndex = 412;
map.createPane('walkPane').style.zIndex = 415;
const lineLayer = L.layerGroup().addTo(map);
const stationLayer = L.layerGroup().addTo(map);
const walkLine = L.polyline([], { pane: 'walkPane', color: '#0f172a', weight: 5, opacity: .9, dashArray: '1 10', lineCap: 'round', interactive: false }).addTo(map);

/* Géométrie : tracés GTFS densifiés, tronçons partagés dessinés côte à côte */
let geom = { lines: {}, runs: [] };
function densify(pts, step = 15) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = hav(a, b), n = Math.floor(d / step);
    for (let k = 1; k <= n; k++) { const f = k / (n + 1); out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); }
    out.push(b);
  }
  return out;
}
function prepareGeometry() {
  const lines = {};
  for (const l of LINE_IDS) {
    let shapes = state.lineMeta[l].shapes;
    if (!shapes || !shapes.length) {
      shapes = [];
      for (const s of state.segments.values()) if (s.lines.has(l) && state.stations[s.a] && state.stations[s.b]) shapes.push([state.stations[s.a].ll, state.stations[s.b].ll]);
    }
    lines[l] = shapes.filter(s => s && s.length > 1).map(s => densify(s));
  }
  geom = { lines, runs: [], pathCache: new Map() };
  const CELL = 0.00012, grid = new Map();
  const cell = (la, lo) => `${Math.round(la / CELL)}|${Math.round(lo / CELL)}`;
  for (const l of LINE_IDS) for (const sh of lines[l]) for (const p of sh) {
    const k = cell(p[0], p[1]);
    if (!grid.has(k)) grid.set(k, new Set());
    grid.get(k).add(l);
  }
  const near = p => {
    const i = Math.round(p[0] / CELL), j = Math.round(p[1] / CELL), set = new Set();
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const s = grid.get(`${i + di}|${j + dj}`); if (s) s.forEach(x => set.add(x)); }
    return [...set].sort().join('');
  };
  for (const l of LINE_IDS) for (const sh of lines[l]) {
    let run = [sh[0]], key = near(sh[0]);
    for (let i = 1; i < sh.length; i++) {
      const k = near(sh[i]);
      run.push(sh[i]);
      if (k !== key || i === sh.length - 1) { geom.runs.push({ line: l, set: key, pts: run }); run = [sh[i]]; key = k; }
    }
  }
  drawLines();
}
function offsetLine(pts, px) {
  if (!px) return pts;
  const P = pts.map(p => map.project(L.latLng(p[0], p[1]), map.getZoom()));
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    out.push(map.unproject(L.point(P[i].x - dy / len * px, P[i].y + dx / len * px), map.getZoom()));
  }
  return out;
}
function drawLines() {
  lineLayer.clearLayers();
  const W = map.getZoom() >= 15 ? 6 : 5;
  const runs = [];
  for (const r of geom.runs) {
    if (!state.activeLines.has(r.line)) continue;
    const set = r.set.split('').filter(l => state.activeLines.has(l));
    if (!set.includes(r.line)) set.push(r.line);
    set.sort();
    let pts = r.pts;
    const a = pts[0], b = pts[pts.length - 1];
    if (b[1] < a[1] || (b[1] === a[1] && b[0] < a[0])) pts = pts.slice().reverse();
    runs.push({ line: r.line, pts, off: (set.indexOf(r.line) - (set.length - 1) / 2) * W });
  }
  for (const r of runs) L.polyline(r.pts, { pane: 'linesPane', color: '#ffffff', weight: W + 5, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(lineLayer);
  for (const r of runs) L.polyline(offsetLine(r.pts, r.off), { pane: 'linesPane', color: lineColor(r.line), weight: W, opacity: .95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(lineLayer);
}
map.on('zoomend', drawLines);

/* Chemin d'une rame entre deux stations, le long du tracé réel quand il est connu */
function nearestIdx(sh, p) {
  let best = -1, bd = Infinity;
  const cosL = Math.cos(p[0] * RAD);
  for (let i = 0; i < sh.length; i++) { const dx = (sh[i][1] - p[1]) * cosL, dy = sh[i][0] - p[0], d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
  return { i: best, d: Math.sqrt(bd) * 111320 };
}
function segPath(line, a, b) {
  const key = line + '|' + a + '|' + b;
  if (geom.pathCache.has(key)) return geom.pathCache.get(key);
  const A = state.stations[a].ll, B = state.stations[b].ll;
  let pts = [A, B], bestScore = Infinity;
  for (const sh of (state.lineMeta[line].shapes ? geom.lines[line] : [])) {
    const ia = nearestIdx(sh, A), ib = nearestIdx(sh, B);
    if (ia.d > 90 || ib.d > 90 || ia.i === ib.i) continue;
    const score = ia.d + ib.d;
    if (score >= bestScore) continue;
    const slice = ia.i < ib.i ? sh.slice(ia.i, ib.i + 1) : sh.slice(ib.i, ia.i + 1).reverse();
    const len = slice.reduce((s, p, k) => s + (k ? hav(slice[k - 1], p) : 0), 0);
    if (len > hav(A, B) * 3 + 300) continue;
    pts = [A, ...slice, B]; bestScore = score;
  }
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + hav(pts[k - 1], pts[k]));
  const path = { pts, cum, len: cum[cum.length - 1] || 1 };
  geom.pathCache.set(key, path);
  return path;
}
function alongPath(path, f) {
  const target = f * path.len, { pts, cum } = path;
  let k = 1;
  while (k < cum.length - 1 && cum[k] < target) k++;
  const seg = cum[k] - cum[k - 1] || 1, g = clamp((target - cum[k - 1]) / seg, 0, 1);
  const a = pts[k - 1], b = pts[k];
  return { ll: [a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g], bearing: bearing(a, b) };
}

/* Stations : anneau aux couleurs des lignes, étiquettes lisibles */
const stationMarkers = {};
let roles = { board: null, dest: null };
function stationIcon(st, role) {
  const cols = [...st.lines].sort().map(lineColor);
  const ring = cols.length > 1 ? `conic-gradient(${cols.map((c, i) => `${c} ${(i / cols.length * 360).toFixed(1)}deg ${((i + 1) / cols.length * 360).toFixed(1)}deg`).join(',')})` : cols[0];
  const size = role ? 26 : cols.length > 1 ? 20 : 16;
  return L.divIcon({ className: 'stn-icon', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2],
    html: `<div class="stn ${role || ''}" style="--ring:${ring};--s:${size}px;--p:${role ? 5 : 4}px"><i></i></div>` });
}
function roleOf(id) { return id === roles.dest ? 'dest' : id === roles.board ? 'board' : ''; }
function labelClass(st, role) { return 'st-label' + (st.key ? ' key' : '') + (st.lines.size > 1 ? ' multi' : '') + (role ? ' role' : ''); }
function rebuildStationMarkers() {
  if (currentPopup && currentPopup._source && currentPopup._source._tbm && currentPopup._source._tbm.type === 'station') map.closePopup();
  stationLayer.clearLayers();
  for (const k of Object.keys(stationMarkers)) delete stationMarkers[k];
  for (const st of stationList()) {
    const role = roleOf(st.id);
    const m = L.marker(st.ll, { icon: stationIcon(st, role), zIndexOffset: role ? 800 : 100, keyboard: false, riseOnHover: true });
    m._tbm = { type: 'station', id: st.id };
    m.on('click', () => { m.getPopup().options.autoPanPaddingBottomRight = L.point(20, (isDesk() ? 20 : sheetVisible()) + 16); });
    m.bindPopup(() => `<div class="pop">${stationPopupInner(st.id)}</div>`, { minWidth: 280, maxWidth: 280, autoPanPaddingTopLeft: L.point(20, 150), autoPanPaddingBottomRight: L.point(20, 360) });
    m.bindTooltip(esc(st.name), { permanent: true, direction: 'right', offset: [role ? 14 : 10, 0], className: labelClass(st, role), interactive: false });
    stationMarkers[st.id] = m;
  }
  applyStationVisibility();
}
function setRoles(board, dest) {
  if (board === roles.board && dest === roles.dest) return;
  const old = [roles.board, roles.dest];
  roles = { board, dest };
  for (const id of new Set([...old, board, dest])) {
    const m = id && stationMarkers[id], st = id && state.stations[id];
    if (!m || !st) continue;
    const role = roleOf(id);
    m.setIcon(stationIcon(st, role));
    m.setZIndexOffset(role ? 800 : 100);
    const tt = m.getTooltip();
    if (tt) { tt.options.className = labelClass(st, role); tt.options.offset = L.point(role ? 14 : 10, 0); m.closeTooltip(); m.openTooltip(); }
  }
}
function applyStationVisibility() {
  for (const st of stationList()) {
    const m = stationMarkers[st.id];
    if (!m) continue;
    const show = isVisible(st) || st.id === roles.dest;
    if (show && !stationLayer.hasLayer(m)) stationLayer.addLayer(m);
    else if (!show && stationLayer.hasLayer(m)) stationLayer.removeLayer(m);
  }
}
function stationPopupInner(id) {
  const st = state.stations[id];
  if (!st) return '<div class="pop-title">Station introuvable</div>';
  const now = nowS(), w = walkFor(st);
  const groups = stationBoard(st, w, now, 3);
  let deps;
  if (state.api === 'error' && !state.journeys.length) deps = `<div class="pop-dist">Temps réel indisponible : ${esc(state.apiError)}.</div>`;
  else if (!groups.length) deps = '<div class="pop-dist">Aucun départ annoncé dans l\u2019heure.</div>';
  else deps = groups.map(g => `<div class="pop-dep">${badge(g.line, 'sm')}<span class="dep-dir">${esc(g.dest)}</span>
      <span class="dep-times">${g.list.map(p => `<span class="t ${p.v ? 'v-' + p.v : ''}">${cdSpan(p, 'min')}</span>`).join('')}</span></div>`).join('');
  return `<div class="pop-head"><div class="pop-lines">${[...st.lines].sort().map(l => badge(l, 'sm')).join('')}</div><div><div class="pop-title">${esc(st.name)}</div>
      <div class="pop-sub">${w ? `${fmtDist(w.dist)} à pied, ${fmtWalk(w.sec)}${w.routed ? '' : ' (estimé)'}` : 'Placez votre repère pour le temps de marche'}</div></div></div>
    <div class="pop-deps">${deps}</div>
    <div class="acts-line" style="margin-top:10px">
      <button type="button" class="btn" data-act="from" data-id="${esc(id)}">Partir d'ici</button>
    </div>`;
}

/* Rames : position estimée entre deux stations, le long du tracé */
function tramPos(j, now) {
  const c = j.calls, n = c.length;
  if (now < c[0].dep - 180 || now > c[n - 1].arr + 15) return null;
  const ll = k => state.stations[c[k].st].ll;
  const brg = k => { const a = Math.min(k, n - 2); return bearing(ll(a), ll(a + 1)); };
  if (now < c[0].dep) return { lat: ll(0)[0], lng: ll(0)[1], dwell: true, at: 0, bearing: brg(0), next: 1 };
  let i = j.idx || 0;
  if (i >= n - 1 || c[i].arr > now) i = 0;
  for (; i < n - 1; i++) {
    if (now < c[i].dep) { j.idx = i; return { lat: ll(i)[0], lng: ll(i)[1], dwell: true, at: i, bearing: brg(i), next: i + 1 }; }
    if (now < c[i + 1].arr) {
      j.idx = i;
      const dt = Math.max(1, c[i + 1].arr - c[i].dep), f = clamp((now - c[i].dep) / dt, 0, 1);
      const path = segPath(j.line, c[i].st, c[i + 1].st), p = alongPath(path, ease(f));
      return { lat: p.ll[0], lng: p.ll[1], dwell: false, from: i, to: i + 1, bearing: p.bearing, speed: path.len / dt * easeD(f), next: i + 1 };
    }
  }
  return { lat: ll(n - 1)[0], lng: ll(n - 1)[1], dwell: true, at: n - 1, bearing: brg(n - 2), next: n };
}
const trams = new Map();
function tramIcon(line, dest) {
  return L.divIcon({ className: 'tram-icon', iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -14],
    html: `<div class="tram" style="--c:${lineColor(line)}"><div class="dir"></div><b>${esc(line)}</b><span class="dest">${esc(dest)}</span></div>` });
}
function updateTrams(now) {
  const seen = new Set();
  for (const j of state.journeys) {
    if (!state.activeLines.has(j.line)) continue;
    const p = tramPos(j, now);
    if (!p) continue;
    seen.add(j.id);
    let t = trams.get(j.id);
    if (!t) {
      const marker = L.marker([p.lat, p.lng], { icon: tramIcon(j.line, j.dest), zIndexOffset: 900, keyboard: false, riseOnHover: true, title: `Ligne ${j.line} vers ${j.dest}` });
      marker._tbm = { type: 'tram', id: j.id };
      marker.bindPopup(() => `<div class="pop" style="--c:${lineColor(j.line)}">${tramPopupInner(j.id)}</div>`, { minWidth: 280, maxWidth: 280, autoPan: false });
      marker.addTo(map);
      t = { marker };
      trams.set(j.id, t);
    }
    t.p = p;
    t.marker.setLatLng([p.lat, p.lng]);
    if (!t.dirEl) { const el = t.marker.getElement(); if (el) { t.dirEl = el.querySelector('.dir'); t.body = el.querySelector('.tram'); } }
    if (t.dirEl) {
      t.dirEl.style.transform = `rotate(${p.bearing.toFixed(1)}deg)`;
      if (t.body.classList.contains('dwell') !== p.dwell) t.body.classList.toggle('dwell', p.dwell);
    }
  }
  for (const [id, t] of trams) {
    if (seen.has(id)) continue;
    if (currentPopup && currentPopup._source === t.marker) map.closePopup();
    t.marker.remove();
    trams.delete(id);
  }
}
function stName(id) { return (state.stations[id] || {}).name || 'Arrêt'; }
function tramPopupInner(id) {
  const j = state.journeyById.get(id), t = trams.get(id);
  if (!j || !t) return '<div class="pop-title">Cette rame a terminé sa course.</div>';
  const now = nowS(), c = j.calls, n = c.length, p = t.p;
  let status;
  if (p.dwell) status = p.at === n - 1 ? `Arrivée au terminus ${esc(stName(c[p.at].st))}` : `À quai à ${esc(stName(c[p.at].st))}, départ dans ${fmtMS(c[p.at].dep - now)}`;
  else status = `Entre ${esc(stName(c[p.from].st))} et ${esc(stName(c[p.to].st))}`;
  const up = [];
  for (let i = p.next; i < n && up.length < 5; i++) up.push(`<li><span>${esc(stName(c[i].st))}</span><span>${fmtClock(c[i].arr)}</span></li>`);
  const nx = p.next < n ? c[p.next] : null;
  return `<div class="pop-head">${badge(j.line)}<div><div class="pop-title">Vers ${esc(j.dest)}</div><div class="pop-sub">${liveTag(j.monitored)}</div></div></div>
    <div class="pop-dist" style="color:var(--ink);font-weight:600">${status}</div>
    <dl><dt>Ponctualité</dt><dd>${nx && nx.aimed != null ? fmtDelay(nx.dep - nx.aimed) : '—'}</dd>
      <dt>Arrivée au terminus</dt><dd>${fmtClock(c[n - 1].arr)}</dd></dl>
    ${up.length ? `<ul class="nexts">${up.join('')}</ul>` : ''}
    <div class="note">Position estimée d\u2019après les heures de passage temps réel.</div>`;
}

let currentPopup = null, lastPopupClose = 0;
map.on('popupopen', e => {
  currentPopup = e.popup;
  const el = e.popup.getElement();
  if (el && !el._bound) { el._bound = true; el.addEventListener('click', onAction); }
  tickCountdowns();
});
map.on('popupclose', e => { if (currentPopup === e.popup) currentPopup = null; lastPopupClose = Date.now(); });
function refreshPopup() {
  if (!currentPopup) return;
  const el = currentPopup.getElement(), box = el && el.querySelector('.pop');
  const tb = currentPopup._source && currentPopup._source._tbm;
  if (!box || !tb) return;
  const html = tb.type === 'station' ? stationPopupInner(tb.id) : tramPopupInner(tb.id);
  if (box._h !== html) { box.innerHTML = html; box._h = html; }
}
function applyZoomClasses() {
  const z = map.getZoom(), c = map.getContainer();
  c.classList.toggle('z-labels', z >= 13);
  c.classList.toggle('z-all', z >= 15);
  c.classList.toggle('z-dest', z >= 15);
}
map.on('zoomend', applyZoomClasses);

/* Marche réelle vers la station, tracée sur la carte */
function updateTripLayers(ctx) {
  if (state.user && ctx.board) {
    const r = walkCache.get(ctx.board.id);
    const pts = r && r.geom && hav(r.geomOrigin, state.user.ll) < 30 ? [state.user.ll, ...r.geom, ctx.board.ll] : [state.user.ll, ctx.board.ll];
    walkLine.setLatLngs(pts);
    const v = ctx.primary && ctx.primary.v;
    walkLine.setStyle({ color: v === 'green' ? '#15803d' : v === 'orange' ? '#d97706' : v === 'red' ? '#dc2626' : '#0f172a' });
  } else walkLine.setLatLngs([]);
}
function realSpeed() {
  if (state.mode !== 'gps') return null;
  const now = Date.now(), s = state.speedSamples.filter(x => now - x.t < 30000);
  if (s.length < 2 || now - s[s.length - 1].t > 15000) return null;
  const sp = s.map(x => x.v).filter(v => v != null);
  let kmh;
  if (sp.length >= 2) { const last = sp.slice(-5); kmh = last.reduce((a, b) => a + b, 0) / last.length * 3.6; }
  else {
    const a = s[0], b = s[s.length - 1], dt = (b.t - a.t) / 1000, dd = hav(a.ll, b.ll);
    if (dt < 8 || dd < Math.max(a.acc, b.acc)) return null;
    kmh = dd / dt * 3.6;
  }
  return kmh >= 2 && kmh <= 22 ? kmh : null;
}
function fitTrip(animate) {
  if (!state.user) return;
  const pts = [state.user.ll];
  if (lastCtx && lastCtx.board) pts.push(lastCtx.board.ll);
  if (pts.length === 1) { map.setView(pts[0], 16, { animate }); return; }
  map.flyToBounds(L.latLngBounds(pts), { paddingTopLeft: [28, 90], paddingBottomRight: [28, 150], maxZoom: 17, duration: animate ? .8 : 0 });
}

/* =========================================================
   Position du piéton
   ========================================================= */
let userMarker = null, accCircle = null;
const meIcon = source => L.divIcon({ className: 'me-icon', iconSize: [22, 22], iconAnchor: [11, 11], html: `<div class="me ${source === 'gps' ? '' : source}"></div>` });
function setUser(ll, acc, source) {
  state.user = { ll, acc, source };
  if (!userMarker) {
    userMarker = L.marker(ll, { icon: meIcon(source), draggable: true, zIndexOffset: 1000, keyboard: false, title: 'Votre position' }).addTo(map);
    userMarker.on('dragend', () => { const q = userMarker.getLatLng(); setManual([q.lat, q.lng], 'manual'); });
  } else { userMarker.setLatLng(ll); if (userMarker._src !== source) userMarker.setIcon(meIcon(source)); }
  userMarker._src = source;
  if (acc && source === 'gps') {
    if (!accCircle) accCircle = L.circle(ll, { radius: acc, color: '#2563eb', weight: 1, opacity: .4, fillOpacity: .08, interactive: false }).addTo(map);
    else accCircle.setLatLng(ll).setRadius(acc);
  } else if (accCircle) { accCircle.remove(); accCircle = null; }
  tickUi(true);
}
function setManual(ll, source) {
  state.mode = source;
  state.fromId = null;
  setUser(ll, null, source);
  hideBanner();
  renderGps();
}
function resumeGps() {
  if (!('geolocation' in navigator) || state.gps === 'denied' || state.gps === 'error') {
    toast(state.gps === 'denied' ? 'Autorisez la localisation dans les réglages du navigateur.' : 'Le GPS ne répond pas sur cet appareil.');
    return;
  }
  state.mode = 'gps';
  if (state.lastGps) { setUser(state.lastGps.ll, state.lastGps.acc, 'gps'); state.needFit = true; checkFar(state.lastGps.ll); }
  else toast('En attente du signal GPS…');
  renderGps();
}
let watchId = null;
function startGps() {
  if (watchId != null) return;
  if (Native.geo) {
    state.gps = 'search'; renderGps();
    Native.geo.watchPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 3000 }, (pos, err) => {
      if (err) onErr({ code: /denied|permission|autoris/i.test(String(err.message || err)) ? 1 : 2 });
      else if (pos) onPos(pos);
    }).then(id => { watchId = id; }).catch(() => onErr({ code: 1 }));
    return;
  }
  if (!('geolocation' in navigator)) { state.gps = 'error'; renderGps(); showBanner('nogps', 'votre navigateur ne propose pas la géolocalisation'); return; }
  state.gps = 'search'; renderGps();
  watchId = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
}
function onPos(pos) {
  const ll = [pos.coords.latitude, pos.coords.longitude], acc = pos.coords.accuracy;
  state.lastGps = { ll, acc };
  state.gps = 'ok';
  if (acc < 40) {
    state.speedSamples.push({ t: Date.now(), ll, acc, v: pos.coords.speed != null && pos.coords.speed >= 0 ? pos.coords.speed : null });
    state.speedSamples = state.speedSamples.filter(x => Date.now() - x.t < 60000);
  }
  if (state.bannerKind === 'nogps') hideBanner();
  if (state.mode === 'gps') {
    setUser(ll, acc, 'gps');
    if (state.follow && state.view === 'map') map.panTo(ll, { animate: true, duration: .6 });
    const far = checkFar(ll);
    if (state.firstFix) { state.firstFix = false; if (!far) state.needFit = true; }
  }
  renderGps();
}
function onErr(err) {
  if (err.code === 1) { state.gps = 'denied'; if (watchId != null) { if (Native.geo) Native.geo.clearWatch({ id: watchId }); else navigator.geolocation.clearWatch(watchId); watchId = null; } if (!state.user) showBanner('nogps', 'vous avez refusé l\u2019accès à votre position'); }
  else if (err.code === 2) { state.gps = state.lastGps ? 'ok' : 'error'; if (!state.user) showBanner('nogps', 'aucun signal de position disponible'); }
  else if (!state.lastGps) { state.gps = 'search'; if (!state.user) showBanner('nogps', 'le signal GPS met du temps à arriver'); }
  renderGps();
}
function checkFar(ll) {
  const d = hav(ll, CENTER);
  if (d > METRO_RADIUS) { showBanner('far', d); return true; }
  if (state.bannerKind === 'far') hideBanner();
  return false;
}
function renderGps() {
  const b = $('#gps'), txt = $('.txt', b);
  let s = state.gps, label;
  if (state.mode === 'manual') { s = 'manual'; label = 'Manuel'; }
  else if (state.mode === 'sim') { s = 'sim'; label = 'Simulé'; }
  else if (s === 'ok') label = `GPS ±${Math.round(state.lastGps.acc)} m`;
  else if (s === 'search') label = 'GPS…';
  else if (s === 'denied') label = 'GPS refusé';
  else label = 'Sans GPS';
  b.dataset.state = s;
  txt.textContent = label;
  b.title = state.mode !== 'gps' ? 'Reprendre le GPS' : label;
}
$('#gps').addEventListener('click', () => {
  if (state.mode !== 'gps') resumeGps();
  else if (state.gps === 'denied') toast('Autorisez la localisation dans les réglages du navigateur, ou touchez la carte.');
  else if (state.gps === 'error') toast('GPS indisponible : touchez la carte pour placer votre repère.');
  else if (state.gps === 'ok' && state.user) map.flyTo(state.user.ll, Math.max(map.getZoom(), 16), { duration: .8 });
  else toast('Recherche du signal GPS en cours…');
});
function showBanner(kind, info) {
  if (state.bannerDismissed[kind] || state.mode === 'sim' || (kind === 'nogps' && state.mode === 'manual')) return;
  state.bannerKind = kind;
  let msg;
  if (kind === 'far') {
    let nearTxt = '';
    if (state.lastGps && state.stopsReady) {
      let best = null, bd = Infinity;
      for (const st of stationList()) { const d = hav(state.lastGps.ll, st.ll); if (d < bd) { bd = d; best = st; } }
      if (best) nearTxt = ` Tram le plus proche : ${best.name}, à ${fmtDist(bd)} à vol d\u2019oiseau.`;
    }
    msg = `Votre GPS fonctionne : vous êtes à ${Math.round(info / 1000)} km du centre de Bordeaux, hors du réseau de tramway.${nearTxt}`;
  } else msg = `Position indisponible : ${info}. Touchez la carte pour placer votre repère, ou simulez une position.`;
  const el = $('#banner');
  el.innerHTML = `<button class="icon-btn close" type="button" data-act="banner-close" aria-label="Fermer">${svg('x', 18)}</button><p>${esc(msg)}</p>
    <div class="acts"><button class="btn" type="button" data-act="sim" data-spot="bourse">${svg('pin', 16)}Place de la Bourse</button>
    <button class="btn ghost" type="button" data-act="sim" data-spot="quinconces">Quinconces</button></div>`;
  el.style.borderLeftColor = kind === 'far' ? 'var(--hurry)' : 'var(--late)';
  el.classList.remove('hidden');
}
function hideBanner() { $('#banner').classList.add('hidden'); state.bannerKind = null; }
function simulate(spot) {
  const ll = SIM_SPOTS[spot] || SIM_SPOTS.bourse;
  setManual(ll, 'sim');
  state.needFit = true;
  toast(spot === 'quinconces' ? 'Position simulée aux Quinconces' : 'Position simulée place de la Bourse');
}
map.on('click', e => {
  if (Date.now() - lastPopupClose < 400) return;
  setManual([e.latlng.lat, e.latlng.lng], 'manual');
  toast('Repère placé. Touchez « Manuel » pour reprendre le GPS.');
});


/* =========================================================
   Interface (style iOS) : vue Tram plein écran ou vue Carte plein écran
   ========================================================= */
const setHTML = (el, html) => { if (el._h !== html) { el.innerHTML = html; el._h = html; return true; } return false; };
function sheetVisible() { return state.view === 'map' ? 150 : 0; }
function renderChips() { /* filtres : dans le menu */ }

/* Retour haptique : moteur Taptic via Capacitor, vibration sinon */
function haptic(kind) {
  try {
    if (Native.haptics) {
      if (kind === 'select') Native.haptics.impact({ style: 'LIGHT' });
      else Native.haptics.notification({ type: kind === 'green' ? 'SUCCESS' : kind === 'orange' ? 'WARNING' : 'ERROR' });
    } else if (navigator.vibrate) navigator.vibrate(kind === 'select' ? 8 : kind === 'red' ? [40, 60, 40] : 25);
  } catch (_) { /* pas de retour haptique disponible */ }
}

let toastTimer = null;
function toast(msg, long) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), long ? 6000 : 2600);
}

/* ---------- Vues ---------- */
function setView(v) {
  state.view = v;
  store.set('tbm-view', v);
  document.body.dataset.view = v;
  $$('#navSeg [data-view]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  haptic('select');
  if (v === 'map') setTimeout(() => { map.invalidateSize(); fitTrip(false); }, 60);
  tickUi(true);
}
function setFollow(on) {
  state.follow = on;
  const b = $('#followBtn');
  b.setAttribute('aria-pressed', String(on));
  b.querySelector('.lbl').textContent = on ? 'Suivi actif' : 'Suivre';
  if (on && state.user) map.flyTo(state.user.ll, Math.max(map.getZoom(), 17), { duration: .6 });
}
map.on('dragstart', () => { if (state.follow) setFollow(false); });

/* ---------- Statut temps réel ---------- */
function renderLive() {
  const b = $('#live'), txt = $('.txt', b);
  const age = state.lastUpdate ? nowS() - state.lastUpdate : null;
  let s, label;
  if (state.api === 'error' && !state.lastUpdate) { s = 'error'; label = state.apiErrorKind === 'offline' ? 'Hors ligne' : 'Erreur'; }
  else if (!state.lastUpdate) { s = 'loading'; label = '…'; }
  else if (age > 120 || state.api === 'error') { s = 'stale'; label = `${Math.round(age / 60)} min`; }
  else { s = 'ok'; label = 'Direct'; }
  b.dataset.state = s;
  txt.textContent = label;
  b.setAttribute('aria-label', s === 'ok' ? `Temps réel à jour, il y a ${Math.round(age)} secondes` : (state.apiError || 'Connexion au temps réel'));
}
$('#live').addEventListener('click', () => {
  if (state.api === 'error' && !state.lastUpdate) openCfg();
  else { toast('Actualisation…'); LINE_IDS.forEach(l => { state.lineFresh[l] = 0; }); }
});

/* ---------- Favoris (station + direction) ---------- */
function favorites() { return store.get('tbm-favs') || []; }
function isFav(st, key) { return favorites().some(f => f.st === st && f.key === key); }
function toggleFav(ctx) {
  if (!ctx.board || !ctx.g) return;
  const favs = favorites(), k = ctx.g.key, st = ctx.board.id;
  const i = favs.findIndex(f => f.st === st && f.key === k);
  if (i >= 0) { favs.splice(i, 1); toast('Retiré des favoris'); }
  else { favs.unshift({ st, key: k, name: ctx.board.name, line: ctx.g.line, dest: ctx.g.dest }); toast('Ajouté aux favoris : présélectionné à cette station'); }
  store.set('tbm-favs', favs.slice(0, 12));
  haptic('select');
  tickUi(true);
}

/* ---------- Directions : flèches gauche / droite ---------- */
function orderedDirs(ctx) {
  return (ctx.groups || []).slice().sort((a, b) => a.line.localeCompare(b.line) || a.dest.localeCompare(b.dest, 'fr'));
}
function stepDir(delta) {
  const ctx = lastCtx;
  const dirs = orderedDirs(ctx || {});
  if (dirs.length < 2) return;
  const i = Math.max(0, dirs.findIndex(g => ctx.g && g.key === ctx.g.key));
  const n = dirs[(i + delta + dirs.length) % dirs.length];
  state.dir = n.key; state.dirTouched = true;
  store.set('tbm-dir', n.key);
  haptic('select');
  const el = $('#uDirName');
  if (el) { el.classList.remove('slide-l', 'slide-r'); void el.offsetWidth; el.classList.add(delta > 0 ? 'slide-l' : 'slide-r'); }
  tickUi(true);
}
(() => {
  const zone = $('#uDir');
  let sx = null, sy = null;
  zone.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
  zone.addEventListener('pointerup', e => {
    if (sx == null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) stepDir(dx < 0 ? 1 : -1);
  });
  zone.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') stepDir(-1); else if (e.key === 'ArrowRight') stepDir(1); });
})();

/* ---------- Rendus ---------- */
function ringOf(st) {
  const cols = [...st.lines].sort().map(lineColor);
  return cols.length > 1 ? `conic-gradient(${cols.map((c, i) => `${c} ${(i / cols.length * 360).toFixed(1)}deg ${((i + 1) / cols.length * 360).toFixed(1)}deg`).join(',')})` : cols[0];
}
function relevantMessages(lines, stations) {
  return state.messages.filter(m => m.lines.some(l => lines.includes(l)) || m.stations.some(s => stations.includes(s)));
}
function renderStation(ctx) {
  const el = $('#uStation');
  if (!ctx.board) return setHTML(el, `<div class="u-st"><div class="u-st-main"><span class="u-eyebrow">Votre station</span><b>Position inconnue</b></div></div>`);
  const w = ctx.boardW, st = ctx.board;
  const eyebrow = ctx.forced ? 'Station choisie' : ctx.skipped ? 'Plus proche avec départs' : 'Station la plus proche';
  setHTML(el, `<div class="u-st">
    <span class="stn" style="--ring:${ringOf(st)};--s:30px;--p:6px" aria-hidden="true"><i></i></span>
    <div class="u-st-main"><span class="u-eyebrow">${eyebrow}</span><b>${esc(st.name)}</b></div>
    <div class="u-walk">${w ? `<b>${fmtWalk(w.sec)}</b><small>${fmtDist(w.dist)} à pied${w.routed ? '' : ' (estimé)'}</small>` : ''}</div>
    ${ctx.forced ? '<button type="button" class="u-pill" data-act="from-clear">La plus proche</button>' : ''}
  </div>`);
}
function renderDir(ctx) {
  const el = $('#uDirInner');
  const dirs = orderedDirs(ctx);
  if (!dirs.length) { setHTML(el, `<div class="u-dir-empty">Aucune direction desservie dans l\u2019heure</div>`); $('#uDir').dataset.count = '0'; return; }
  const i = Math.max(0, dirs.findIndex(g => ctx.g && g.key === ctx.g.key));
  const g = dirs[i], fav = isFav(ctx.board.id, g.key);
  $('#uDir').dataset.count = String(dirs.length);
  setHTML(el, `
    <button type="button" class="u-arrow" data-act="dir-prev" aria-label="Direction précédente" ${dirs.length < 2 ? 'disabled' : ''}>${svg('chevL', 26)}</button>
    <div class="u-dir-cur" role="group" aria-roledescription="sélecteur" aria-label="Direction ${i + 1} sur ${dirs.length} : ligne ${esc(g.line)} vers ${esc(g.dest)}">
      <div class="u-dir-top">${badge(g.line)}<span class="u-eyebrow">Direction ${i + 1}/${dirs.length}</span>
        <button type="button" class="u-fav" data-act="fav" aria-pressed="${fav}" aria-label="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${svg(fav ? 'starFill' : 'star', 20)}</button></div>
      <div id="uDirName" class="u-dir-name">${esc(g.dest)}</div>
      <div class="u-dots" aria-hidden="true">${dirs.map((d, k) => `<i class="${k === i ? 'on' : ''}" style="--c:${lineColor(d.line)}"></i>`).join('')}</div>
    </div>
    <button type="button" class="u-arrow" data-act="dir-next" aria-label="Direction suivante" ${dirs.length < 2 ? 'disabled' : ''}>${svg('chevR', 26)}</button>`);
}
function race(p, now) {
  const walk = p.w ? p.w.sec : null;
  const span = Math.max(p.depIn, walk || 0, 60) * 1.08 + 10;
  const X = t => clamp(t / span * 100, 3, 97);
  const a = X(Math.max(0, p.arrIn)), d = X(p.depIn), m = walk != null ? X(walk) : null;
  const lab = (x, cls, html) => `<span class="race-lab ${cls} ${x < 18 ? 'al' : x > 82 ? 'ar' : ''}" style="left:${x.toFixed(1)}%">${html}</span>`;
  return `<div class="race" style="--c:${lineColor(p.line)}" aria-hidden="true">
    <span class="race-trk"></span>
    <span class="race-quai" style="left:${a.toFixed(1)}%;width:${Math.max(1.5, d - a).toFixed(1)}%"></span>
    ${lab(a, 'up', `<b>Tram</b> ${p.arrIn > 0 ? fmtClockS(p.tArr) : 'à quai'}`)}
    <span class="race-tram" style="left:${a.toFixed(1)}%">${esc(p.line)}</span>
    ${m != null ? `<span class="race-me" style="left:${m.toFixed(1)}%">${svg('walk', 16)}</span>${lab(m, 'down', `<b>Vous</b> ${fmtClockS(now + walk)}`)}` : ''}
  </div>`;
}
function whereText(p, now) {
  const pos = tramPos(p.j, now), c = p.j.calls;
  if (!pos) return `Part du terminus à ${fmtClock(c[0].dep)}`;
  if (pos.dwell && pos.at === p.i) return 'À quai maintenant';
  const n = pos.dwell ? p.i - pos.at : p.i - pos.next;
  if (n <= 0) return 'Arrive à la station';
  return pos.dwell ? `À quai à ${stName(c[pos.at].st)}, ${n} arrêt${n > 1 ? 's' : ''} avant` : `${n} arrêt${n > 1 ? 's' : ''} avant votre station`;
}
function verdictWords(ctx) {
  const p = ctx.primary;
  if (!p || !p.w) return null;
  const v = p.v;
  if (v === 'red') {
    const n = ctx.nextCatch;
    return { head: 'Trop tard', sub: n ? `Le suivant arrive dans <b>${cdSpan(n, 'min')}</b> : ${n.v === 'green' ? 'celui-là, vous l\u2019avez' : 'jouable en pressant le pas'}.` : 'Aucun tram attrapable parmi les passages annoncés.' };
  }
  const slack = p.arrIn - p.w.sec - state.margin;
  if (v === 'green') return { head: 'Vous l\u2019avez', sub: slack > 60 ? `Partez dans <b>${fmtMS(slack)}</b>.` : '<b>Partez maintenant</b>, sans courir.' };
  return { head: 'Pressez le pas', sub: `<b>Partez maintenant</b> : au moins ${fmtKmh(p.w.dist / Math.max(1, p.depIn - CFG.walk.platformSec) * 3.6)}.` };
}
function simButtons() {
  return `<div class="u-acts"><button class="btn" type="button" data-act="sim" data-spot="bourse">${svg('pin', 16)}Place de la Bourse</button><button class="btn ghost" type="button" data-act="sim" data-spot="quinconces">Quinconces</button></div>`;
}
function renderVerdict(ctx) {
  const el = $('#uVerdict');
  const box = (cls, h, t, extra = '') => { el.className = 'u-verdict ' + cls; setHTML(el, `<div class="u-v-head"><strong>${h}</strong></div><div class="u-v-sub">${t}</div>${extra}`); };
  if (state.api === 'error' && !state.journeys.length) {
    const blocked = state.apiErrorKind === 'blocked' || state.apiErrorKind === 'proxy';
    return box('v-red', 'Temps réel indisponible', `${esc(state.apiError)}.`, `<div class="u-acts"><button class="btn" type="button" data-act="retry">Réessayer</button>${blocked ? '<button class="btn ghost" type="button" data-act="settings">Connexion</button>' : ''}</div>`);
  }
  if (!state.stopsReady || (!state.lastUpdate && state.api === 'loading')) return box('', 'Connexion…', 'Chargement des stations et des passages TBM.');
  if (!ctx.board) return box('', 'Où êtes-vous ?', 'Autorisez la localisation, placez-vous sur la carte, ou simulez une position.', simButtons());
  const p = ctx.primary;
  if (!p) return box('', 'Pas de départ', state.journeys.length ? 'Rien d\u2019annoncé dans l\u2019heure à cette station.' : 'Aucun tram annoncé : service probablement terminé.');
  const now = ctx.now, vw = verdictWords(ctx);
  el.className = 'u-verdict ' + (p.v ? 'v-' + p.v : '');
  const next = ctx.g.list.slice(1, 3);
  const delay = p.delay != null && Math.abs(p.delay) >= 60 ? `<span class="delay">${p.delay > 0 ? 'retard +' : 'avance '}${Math.abs(Math.round(p.delay / 60))} min</span>` : '';
  setHTML(el, `
    <div class="u-v-head">
      <strong>${vw ? vw.head : 'Placez-vous'}</strong>
      <div class="u-cd">${cdSpan(p)}<small>${p.arrIn > 0 ? 'avant l\u2019arrivée' : 'repart ' + fmtClockS(p.tDep)}</small></div>
    </div>
    <div class="u-v-sub">${vw ? vw.sub : 'Placez votre repère pour savoir si vous l\u2019aurez.'}</div>
    ${race(p, now)}
    <div class="u-v-foot"><span>${esc(whereText(p, now))}</span>${delay}${p.live ? '<span class="rt">temps réel</span>' : '<span class="rt theo">théorique</span>'}
      ${next.length ? `<span class="u-next">puis ${next.map(n => cdSpan(n, 'min')).join(', ')}</span>` : ''}</div>`);
  const sum = vw ? `${vw.head}. Tram ${p.line} vers ${p.dest}, ${p.arrIn > 0 ? 'dans ' + Math.max(1, Math.round(p.arrIn / 60)) + ' minutes' : 'à quai'}.` : '';
  const sr = $('#srVerdict');
  if (sr.textContent !== sum) sr.textContent = sum;
}
function renderAlert(ctx) {
  const el = $('#uAlert');
  const p = ctx.primary;
  const impact = p ? relevantMessages([p.line], [p.S.id]) : ctx.board ? relevantMessages([...ctx.board.lines], [ctx.board.id]) : [];
  if (!impact.length) return setHTML(el, '');
  setHTML(el, `<button type="button" class="u-impact" data-act="digest">${svg('alert', 18)}<span><b>Perturbation en cours</b>${esc((impact[0].title || impact[0].body).slice(0, 90))}</span>${svg('chevR', 18)}</button>`);
}
function renderBottom(ctx) {
  const preset = CADENCES.find(c => c.id === state.cadence) || CADENCES[1];
  setHTML($('#uSpeed'), state.realKmh
    ? `<span class="spd on"><i></i>Votre vitesse réelle : <b>${fmtKmh(state.realKmh)}</b></span>`
    : `<span class="spd"><i></i>Allure « ${preset.label} »${state.mode === 'gps' ? ', vitesse réelle dès que vous marchez' : ''}</span>`);
  const p = ctx.primary, a = state.alert;
  const alertLbl = a ? `Alerte ${fmtClock(a.leaveAt)}` : 'Me prévenir';
  setHTML($('#uActions'), `
    <button type="button" class="u-act ${a ? 'on' : ''}" data-act="alert" ${!p || !p.w ? 'disabled' : ''} aria-pressed="${!!a}">${svg(a ? 'bellOn' : 'bell', 20)}<span>${alertLbl}</span></button>
    <button type="button" class="u-act" data-act="maps" ${!ctx.board ? 'disabled' : ''}>${svg('walk', 20)}<span>Plans</span></button>
    <button type="button" class="u-act" data-act="share" ${!p ? 'disabled' : ''}>${svg('share', 20)}<span>Partager</span></button>`);
}
function renderMini(ctx) {
  const el = $('#mini');
  const p = ctx.primary, vw = verdictWords(ctx);
  el.className = 'mini ' + (p && p.v ? 'v-' + p.v : '');
  if (!p) return setHTML(el, `<span class="mini-t">${ctx.board ? esc(ctx.board.name) + ' : pas de départ' : 'Où êtes-vous ?'}</span>`);
  setHTML(el, `${badge(p.line)}<span class="mini-main"><b>${vw ? vw.head : 'Placez-vous'}</b><small>vers ${esc(p.dest)}, ${esc(p.S.name)}</small></span><span class="mini-cd">${cdSpan(p)}</span>`);
}

/* ---------- Alerte de départ (notification locale, mise à jour en temps réel) ---------- */
const ALERT_ID = 4201;
async function askNotifPermission() {
  try {
    if (Native.notif) { const r = await Native.notif.requestPermissions(); return r.display === 'granted'; }
    if ('Notification' in window) { if (Notification.permission === 'granted') return true; return (await Notification.requestPermission()) === 'granted'; }
  } catch (_) { /* refus ou indisponible */ }
  return false;
}
async function scheduleNative(a) {
  if (!Native.notif) return;
  try {
    await Native.notif.cancel({ notifications: [{ id: ALERT_ID }] });
    await Native.notif.schedule({ notifications: [{ id: ALERT_ID, title: `Partez maintenant : tram ${a.line}`, body: `Vers ${a.dest}, à quai à ${a.stName} vers ${fmtClock(a.arr)}.`, schedule: { at: toDate(a.leaveAt), allowWhileIdle: true } }] });
    a.scheduledAt = a.leaveAt;
  } catch (_) { /* notifications refusées */ }
}
async function toggleAlert() {
  if (state.alert) { cancelAlert('Alerte annulée'); return; }
  const p = lastCtx && lastCtx.primary;
  if (!p || !p.w) return;
  const target = p.v === 'red' && lastCtx.nextCatch ? lastCtx.nextCatch : p;
  const leaveAt = target.tArr - target.w.sec - state.margin;
  if (leaveAt - nowS() < 20) { haptic(target.v || 'orange'); toast('Partez maintenant !'); return; }
  const granted = await askNotifPermission();
  state.alert = { jid: target.j.id, st: target.S.id, stName: target.S.name, line: target.line, dest: target.dest, arr: target.tArr, leaveAt, scheduledAt: null, granted };
  await scheduleNative(state.alert);
  haptic('green');
  toast(`Alerte à ${fmtClock(leaveAt)} pour le tram de ${fmtClock(target.tArr)}${granted ? '' : ' (dans l\u2019app : notifications refusées)'}`, true);
  tickUi(true);
}
function cancelAlert(msg) {
  if (Native.notif) Native.notif.cancel({ notifications: [{ id: ALERT_ID }] }).catch(() => {});
  state.alert = null;
  if (msg) toast(msg);
  tickUi(true);
}
function checkAlert() {
  const a = state.alert;
  if (!a) return;
  const j = state.journeyById.get(a.jid), st = state.stations[a.st];
  const i = j ? j.callIdx[a.st] : null;
  if (!j || i == null || !st) { if (nowS() > a.arr + 60) cancelAlert(); return; }
  const w = walkFor(st);
  a.arr = j.calls[i].arr;
  if (w) a.leaveAt = a.arr - w.sec - state.margin;
  if (Native.notif && a.scheduledAt != null && Math.abs(a.leaveAt - a.scheduledAt) > 20 && a.leaveAt > nowS() + 5) scheduleNative(a);
  if (nowS() >= a.leaveAt) {
    haptic('orange');
    toast(`Partez maintenant : tram ${a.line} vers ${a.dest}, à quai à ${fmtClock(a.arr)}`, true);
    if (!Native.notif && a.granted && document.hidden && 'Notification' in window) {
      try { new Notification(`Partez maintenant : tram ${a.line}`, { body: `Vers ${a.dest}, à quai à ${a.stName} vers ${fmtClock(a.arr)}.`, tag: 'tbm-alert' }); } catch (_) { /* navigateur sans notifications */ }
    }
    state.alert = null;
  }
}
setInterval(checkAlert, 3000);

/* ---------- Partager, Plans ---------- */
async function shareTrip() {
  const p = lastCtx && lastCtx.primary;
  if (!p) return;
  const text = `Je prends le tram ${p.line} vers ${p.dest} à ${p.S.name}, à quai vers ${fmtClock(p.tArr)}.`;
  try {
    if (Native.share) await Native.share.share({ title: 'Mon tram', text });
    else if (navigator.share) await navigator.share({ title: 'Mon tram', text });
    else { await navigator.clipboard.writeText(text); toast('Copié dans le presse-papiers'); }
  } catch (_) { /* partage annulé */ }
}
function openMaps() {
  const st = lastCtx && lastCtx.board;
  if (!st) return;
  const q = `daddr=${st.ll[0].toFixed(6)},${st.ll[1].toFixed(6)}&dirflg=w`;
  const url = Native.platform === 'ios' ? `maps://?${q}` : `https://maps.apple.com/?${q}`;
  window.open(url, '_blank');
}

/* ---------- Infos réseau du jour ---------- */
const today = () => new Date().toISOString().slice(0, 10);
const msgKey = m => norm(m.body).slice(0, 60);
function digestUnseen() {
  const seen = store.get('tbm-digest') || {};
  const keys = seen.day === today() ? seen.keys || [] : [];
  return state.messages.some(m => !keys.includes(msgKey(m)));
}
function msgHTML(list) {
  return list.length ? list.map(({ m, me }) => `<div class="msg ${me ? 'mine' : ''}"><div class="msg-h">${m.lines.map(l => badge(l, 'sm')).join('')}</div>
      <div class="msg-t">${esc(m.title || m.body.slice(0, 90))}</div>${m.title || m.body.length > 90 ? `<div class="msg-b">${esc(m.body)}</div>` : ''}
      ${m.until ? `<div class="msg-v">Jusqu'au ${toDate(m.until).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>` : ''}</div>`).join('')
    : '<p class="muted">Aucune information particulière sur le tram aujourd\u2019hui.</p>';
}
function openDigest() {
  const mine = lastCtx && lastCtx.board ? [...lastCtx.board.lines] : [];
  const list = state.messages.map(m => ({ m, me: m.lines.some(l => mine.includes(l)) })).sort((a, b) => b.me - a.me);
  $('#digestBody').innerHTML = msgHTML(list);
  store.set('tbm-digest', { day: today(), keys: state.messages.map(msgKey) });
  openSheet('#digest');
}
function maybeDailyDigest() {
  if (!state.msgFresh || state.msgError || !state.messages.length || !store.get('tbm-onb')) return;
  const seen = store.get('tbm-digest') || {};
  if (seen.day === today() || $$('dialog[open]').length) return;
  openDigest();
}

/* ---------- Menu (feuille iOS) ---------- */
function openSheet(sel) { const d = $(sel); if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', ''); tickUi(true); }
$$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
function renderMenu(ctx) {
  if (!$('#menu').open) return;
  const favs = favorites();
  let h = '';
  if (ctx.board) {
    h += `<h3>Passages à ${esc(ctx.board.name)}</h3><div class="group">`;
    h += ctx.groups && ctx.groups.length ? ctx.groups.map(g => `<button type="button" class="row" data-pick="${esc(g.key)}">
        ${badge(g.line, 'sm')}<span class="row-t">${esc(g.dest)}</span>
        <span class="row-times">${g.list.map(p => `<span class="t ${p.v ? 'v-' + p.v : ''}">${cdSpan(p, 'min')}</span>`).join('')}</span></button>`).join('')
      : '<div class="row"><span class="row-t muted">Aucun départ annoncé dans l\u2019heure</span></div>';
    h += '</div>';
  }
  h += `<h3>Favoris</h3><div class="group">${favs.length ? favs.map((f, k) => `<button type="button" class="row" data-fav="${k}">${badge(f.line, 'sm')}<span class="row-t">${esc(f.name)}<small>vers ${esc(f.dest)}</small></span>${svg('chevR', 16)}</button>`).join('')
    : '<div class="row"><span class="row-t muted">Touchez l\u2019étoile d\u2019une direction pour la présélectionner à cette station.</span></div>'}</div>`;
  h += `<h3>Réseau</h3><div class="group">
    <button type="button" class="row" data-act="digest">${svg('alert', 18)}<span class="row-t">Infos réseau du jour</span><span class="row-v">${state.messages.length}</span>${svg('chevR', 16)}</button>
    <div class="row"><span class="row-t">Lignes affichées</span></div>
    <div class="row chips-row">${LINE_IDS.map(l => `<button type="button" class="chip" data-line="${l}" style="--c:${lineColor(l)}" aria-pressed="${state.activeLines.has(l)}">${l}</button>`).join('')}</div></div>`;
  h += `<h3>Réglages</h3><div class="group">
    <div class="row"><span class="row-t">Marge avant l\u2019arrivée du tram<small>Pour « Partez dans… » et l\u2019alerte</small></span></div>
    <div class="row"><div class="seg seg-sm full" role="radiogroup">${[30, 60, 120].map(m => `<button type="button" role="radio" data-margin="${m}" aria-checked="${state.margin === m}"><b>${m < 60 ? m + ' s' : m / 60 + ' min'}</b></button>`).join('')}</div></div>
    <button type="button" class="row" data-act="settings"><span class="row-t">Connexion au temps réel</span>${svg('chevR', 16)}</button>
    <button type="button" class="row" data-act="check-update"><span class="row-t">Rechercher une mise à jour</span></button></div>`;
  h += `<h3>À propos</h3><div class="group">
    <a class="row" href="privacy.html" target="_blank" rel="noopener"><span class="row-t">Confidentialité</span>${svg('chevR', 16)}</a>
    <button type="button" class="row" data-act="onboarding"><span class="row-t">Revoir la présentation</span></button>
    ${CFG.support ? `<a class="row" href="${esc(CFG.support)}"><span class="row-t">Contact et assistance</span>${svg('chevR', 16)}</a>` : ''}
    <div class="row"><span class="row-t muted">Tram Radar ${state.version ? 'v' + esc(state.version.version) : ''}. Horaires : TBM, Bordeaux Métropole (Licence Ouverte). Carte : © OpenStreetMap. Itinéraires : OSRM. Application indépendante, non affiliée à TBM.</span></div></div>`;
  setHTML($('#menuBody'), h);
}

/* ---------- Présentation au premier lancement ---------- */
const ONB = [
  { icon: 'tram', t: 'Attrapez votre tram', d: 'Tram Radar trouve la station la plus proche et vous dit, en temps réel, si vous aurez le prochain tram dans votre direction.', a: [['next', 'Continuer']] },
  { icon: 'locate', t: 'Votre position', d: 'Elle sert à trouver votre station et à calculer votre trajet à pied. Elle reste sur votre appareil : seul le calcul d\u2019itinéraire piéton l\u2019envoie, sans compte ni historique.', a: [['loc', 'Autoriser la localisation'], ['next', 'Plus tard', 'ghost']] },
  { icon: 'bell', t: 'Alerte de départ', d: 'Touchez « Me prévenir » : l\u2019app vous notifie au moment de partir, recalculé en direct si le tram prend du retard.', a: [['notif', 'Activer les notifications'], ['done', 'Plus tard', 'ghost']] }
];
let onbStep = 0;
function renderOnb() {
  const s = ONB[onbStep];
  $('#onbBody').innerHTML = `<div class="onb-ico">${svg(s.icon, 44)}</div><h2>${s.t}</h2><p>${s.d}</p>
    <div class="onb-dots">${ONB.map((_, k) => `<i class="${k === onbStep ? 'on' : ''}"></i>`).join('')}</div>
    <div class="onb-acts">${s.a.map(([k, l, c]) => `<button type="button" class="btn big ${c || ''}" data-onb="${k}">${l}</button>`).join('')}</div>`;
}
function showOnb() { onbStep = 0; renderOnb(); $('#onb').classList.remove('hidden'); }
function finishOnb() { store.set('tbm-onb', 1); $('#onb').classList.add('hidden'); tickUi(true); }
$('#onb').addEventListener('click', async e => {
  const b = e.target.closest('[data-onb]'); if (!b) return;
  const k = b.dataset.onb;
  if (k === 'loc') { startGps(); onbStep++; renderOnb(); }
  else if (k === 'notif') { await askNotifPermission(); finishOnb(); }
  else if (k === 'done') finishOnb();
  else { onbStep++; renderOnb(); }
});

/* ---------- Boucle d'affichage ---------- */
let lastUi = 0, lastBoardId = null, lastVerdict = null;
function tickUi(force) {
  const now = nowS();
  if (!force && now - lastUi < 1) return;
  lastUi = now;
  state.realKmh = realSpeed();
  state.kmhNow = state.realKmh || kmhOf(state.cadence);
  const ctx = computeCtx(now);
  lastCtx = ctx;
  if (ctx.board && lastBoardId && ctx.board.id !== lastBoardId && !ctx.forced) { toast(`Station la plus proche : ${ctx.board.name}`); state.dirTouched = false; }
  lastBoardId = ctx.board ? ctx.board.id : null;
  const pv = ctx.primary && ctx.primary.v ? { j: ctx.primary.j.id, v: ctx.primary.v } : null;
  if (pv && lastVerdict && pv.j === lastVerdict.j && pv.v !== lastVerdict.v) haptic(pv.v);
  lastVerdict = pv;
  setRoles(ctx.board ? ctx.board.id : null, null);
  renderStation(ctx); renderDir(ctx); renderVerdict(ctx); renderAlert(ctx); renderBottom(ctx); renderMini(ctx); renderMenu(ctx);
  updateTripLayers(ctx);
  refreshPopup();
  renderLive();
  tickCountdowns();
  maybeDailyDigest();
  $('#menuBtn').classList.toggle('has-new', digestUnseen());
  if (state.needFit && ctx.board && state.view === 'map') { state.needFit = false; fitTrip(true); }
  if (state.user) {
    const c = candidateStations().slice(0, 4);
    if (state.fromId && state.stations[state.fromId]) c.unshift(state.stations[state.fromId]);
    ensureWalkTable([...new Set(c)]);
    if (ctx.board) ensureRouteGeom(ctx.board);
  }
}

/* ---------- Actions ---------- */
function onAction(e) {
  const act = e.target.closest('[data-act]');
  if (act) {
    const a = act.dataset.act, id = act.dataset.id;
    if (a === 'sim') simulate(act.dataset.spot);
    else if (a === 'banner-close') { if (state.bannerKind) state.bannerDismissed[state.bannerKind] = true; hideBanner(); }
    else if (a === 'from') { state.fromId = id; state.dirTouched = false; map.closePopup(); tickUi(true); }
    else if (a === 'from-clear') { state.fromId = null; state.dirTouched = false; tickUi(true); }
    else if (a === 'dir-prev') stepDir(-1);
    else if (a === 'dir-next') stepDir(1);
    else if (a === 'fav') toggleFav(lastCtx);
    else if (a === 'alert') toggleAlert();
    else if (a === 'maps') openMaps();
    else if (a === 'share') shareTrip();
    else if (a === 'menu') openSheet('#menu');
    else if (a === 'close') act.closest('dialog').close();
    else if (a === 'digest') { if ($('#menu').open) $('#menu').close(); openDigest(); }
    else if (a === 'follow') setFollow(!state.follow);
    else if (a === 'view-ui') setView('ui');
    else if (a === 'onboarding') { $('#menu').close(); showOnb(); }
    else if (a === 'retry') { toast('Nouvelle tentative…'); boot(true); }
    else if (a === 'settings') { $$('dialog[open]').forEach(d => d.close()); openCfg(); }
    else if (a === 'cfg-close') $('#cfg').close();
    else if (a === 'cfg-save') saveCfg($('#proxyInput').value.trim());
    else if (a === 'cfg-clear') { $('#proxyInput').value = ''; saveCfg(''); }
    else if (a === 'update') applyUpdate();
    else if (a === 'check-update') checkVersion(true);
    e.stopPropagation();
    return;
  }
  const v = e.target.closest('#navSeg [data-view]');
  if (v) { setView(v.dataset.view); return; }
  const pick = e.target.closest('[data-pick]');
  if (pick) { state.dir = pick.dataset.pick; state.dirTouched = true; store.set('tbm-dir', state.dir); $('#menu').close(); tickUi(true); return; }
  const fav = e.target.closest('[data-fav]');
  if (fav) {
    const f = favorites()[+fav.dataset.fav];
    if (f && state.stations[f.st]) { state.fromId = f.st; state.dir = f.key; state.dirTouched = true; $('#menu').close(); tickUi(true); }
    return;
  }
  const m = e.target.closest('[data-margin]');
  if (m) { state.margin = +m.dataset.margin; store.set('tbm-margin', state.margin); tickUi(true); return; }
  const line = e.target.closest('[data-line]');
  if (line) {
    const l = line.dataset.line;
    if (state.activeLines.has(l)) { if (state.activeLines.size === 1) { toast('Gardez au moins une ligne.'); return; } state.activeLines.delete(l); }
    else { state.activeLines.add(l); state.lineFresh[l] = 0; }
    store.set('tbm-lines', [...state.activeLines]);
    drawLines(); applyStationVisibility(); updateTrams(nowS()); tickUi(true);
  }
}
document.addEventListener('click', onAction);
$('#cadence').addEventListener('click', e => {
  const b = e.target.closest('[data-cadence]'); if (!b) return;
  state.cadence = b.dataset.cadence;
  store.set('tbm-cadence', state.cadence);
  $$('#cadence [data-cadence]').forEach(x => x.setAttribute('aria-checked', String(x.dataset.cadence === state.cadence)));
  haptic('select');
  tickUi(true);
});
function renderCadence() {
  $('#cadence').innerHTML = CADENCES.map(c => `<button type="button" role="radio" data-cadence="${c.id}" aria-checked="${c.id === state.cadence}"><b>${c.label}</b><small>${c.kmh.toString().replace('.', ',')} km/h</small></button>`).join('');
}
$('#recenter').addEventListener('click', () => { if (state.user) fitTrip(true); else toast('Position inconnue : touchez la carte pour vous placer.'); });


const WORKER_CODE = `export default {
  async fetch(request) {
    const target = new URL(request.url).searchParams.get('url');
    if (!target || !target.startsWith('https://bdx.mecatran.com/')) {
      return new Response('URL non autorisée', { status: 400 });
    }
    const upstream = await fetch(target, { headers: { Accept: 'application/json' } });
    const headers = new Headers(upstream.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers });
  }
};`;
function openCfg() {
  $('#proxyInput').value = state.proxy;
  $('#workerCode').textContent = WORKER_CODE;
  $('#cfgDiag').textContent = state.api === 'error' ? `Dernière erreur : ${state.apiError}.` : state.lastUpdate ? `Le temps réel fonctionne${state.proxy ? ' via votre relais' : ' en accès direct'}. Horloge TBM : écart de ${clockOffset.toFixed(1).replace('.', ',')} s avec votre appareil.` : 'Connexion en cours à l\u2019API SIRI Lite de TBM.';
  $('#cfgStatus').textContent = '';
  const d = $('#cfg');
  if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
}
async function saveCfg(value) {
  const status = $('#cfgStatus');
  if (value && !value.includes('{url}')) { status.textContent = 'L\u2019adresse doit contenir {url}.'; status.style.color = 'var(--late)'; return; }
  state.proxy = value;
  store.set('tbm-proxy', value);
  status.style.color = 'var(--muted)';
  status.textContent = 'Test de connexion…';
  try { await api('check-status.json', {}, 15000); status.style.color = 'var(--go)'; status.textContent = 'Connexion réussie. Chargement des horaires…'; boot(true); }
  catch (err) { status.style.color = 'var(--late)'; status.textContent = `Échec : ${err.message}.`; }
}


/* =========================================================
   Mises à jour automatiques (service worker + version.json)
   ========================================================= */
let swReg = null, reloading = false, bootedAt = Date.now();
async function readVersion() {
  try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch (_) { return null; }
}
function showVersion() {
  const v = state.version;
  const el = $('#versionTxt'); if (!el) return;
  el.textContent = v ? `v${v.version}${v.build && v.build !== '__BUILD__' ? ' (' + String(v.build).slice(0, 7) + ')' : ''}` : '';
}
function updateReady(label) {
  if (Date.now() - bootedAt < 15000 || document.hidden) { applyUpdate(); return; }
  $('#updateTxt').textContent = label ? `Version ${label} prête` : 'Nouvelle version prête';
  $('#updateBar').classList.remove('hidden');
}
function applyUpdate() {
  if (swReg && swReg.waiting) swReg.waiting.postMessage({ type: 'SKIP_WAITING' });
  else { reloading = true; location.reload(); }
}
async function checkVersion(manual) {
  const v = await readVersion();
  if (!v) { if (manual) toast('Impossible de vérifier les mises à jour pour le moment.'); return; }
  if (state.version && v.build !== state.version.build) {
    if (swReg) { await swReg.update().catch(() => {}); if (!swReg.installing && !swReg.waiting) updateReady(v.version); }
    else updateReady(v.version);
  } else if (manual) toast(`Vous avez la dernière version (v${v.version}).`);
}
async function initUpdates() {
  state.version = await readVersion();
  showVersion();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    try {
      swReg = await navigator.serviceWorker.register('sw.js');
      const watch = w => w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) updateReady(); });
      if (swReg.waiting && navigator.serviceWorker.controller) updateReady();
      swReg.addEventListener('updatefound', () => watch(swReg.installing));
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
    } catch (_) { swReg = null; }
  }
  setInterval(() => checkVersion(false), 10 * 60 * 1000);
}


/* =========================================================
   Démarrage
   ========================================================= */
async function boot(force) {
  if (force) { state.api = 'loading'; state.apiError = ''; LINE_IDS.forEach(l => { state.lineFresh[l] = 0; }); renderLive(); tickUi(true); }
  const ok = await loadStops();
  if (!ok) return;
  const now = nowS();
  await refreshLines(LINE_IDS.filter(l => state.activeLines.has(l) && now - (state.lineFresh[l] || 0) >= 5));
  refreshMessages();
}

$$('[data-icon]').forEach(el => { el.innerHTML = svg(el.dataset.icon, +(el.dataset.size || 20)); });
$$('[data-logo]').forEach(el => { el.innerHTML = LOGO; });
document.body.dataset.view = state.view;
document.body.classList.toggle('native', Native.isNative);
$$('#navSeg [data-view]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === state.view)));
if (Native.status) Native.status.setStyle({ style: 'DARK' }).catch(() => {});
renderCadence();
applyZoomClasses();
renderGps();
if (store.get('tbm-onb')) startGps(); else showOnb();
loadNetwork();
boot(false);
schedule();
initUpdates();

let lastTick = 0;
function frame(t) {
  updateTrams(nowS());
  if (t - lastTick > 200) { lastTick = t; tickCountdowns(); }
  tickUi(false);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (!$('#updateBar').classList.contains('hidden')) applyUpdate(); return; }
  tickUi(true);
  checkVersion(false);
});
window.addEventListener('online', () => { LINE_IDS.forEach(l => { state.lineFresh[l] = 0; }); });
window.addEventListener('resize', () => map.invalidateSize());
})();
