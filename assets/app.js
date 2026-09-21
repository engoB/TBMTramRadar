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
  wifi: '<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>'
};
const svg = (name, size = 20) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
const LOGO = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke-width="3" aria-hidden="true">
  <path d="M12 3a9 9 0 0 1 9 9" stroke="#852d7e"/><path d="M21 12a9 9 0 0 1-9 9" stroke="#00893e"/>
  <path d="M12 21a9 9 0 0 1-9-9" stroke="#e2007a"/><path d="M3 12a9 9 0 0 1 9-9" stroke="#d8232a"/>
  <circle cx="12" cy="12" r="3.2" fill="#0f172a" stroke="none"/></svg>`;

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
  dest: store.get('tbm-dest') || null, fromId: null, pinned: null,
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
function walkFor(st, kmh = kmhOf(state.cadence)) {
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
function directOptions(stations, now) {
  const res = [], dest = state.dest;
  for (const S of stations) {
    const w = walkFor(S);
    for (const [j, i] of state.stIndex.get(S.id) || []) {
      if (!state.activeLines.has(j.line)) continue;
      const k = j.callIdx[dest];
      if (k == null || k <= i) continue;
      const it = mkItem(S, w, j, i, now);
      if (it.depIn < -1) continue;
      it.arrDest = j.calls[k].arr;
      res.push(it);
    }
  }
  return res;
}
function transferOptions(stations, now) {
  const res = [], dest = state.dest, minT = CFG.transferSec;
  for (const S of stations) {
    const w = walkFor(S);
    for (const [j, i] of state.stIndex.get(S.id) || []) {
      if (!state.activeLines.has(j.line)) continue;
      const first = mkItem(S, w, j, i, now);
      if (first.depIn < -1 || first.arrIn > 3600) continue;
      let best = null;
      for (let k = i + 1; k < j.calls.length; k++) {
        const T = j.calls[k].st, tArr = j.calls[k].arr;
        for (const [j2, m] of state.stIndex.get(T) || []) {
          if (j2.line === j.line || !state.activeLines.has(j2.line)) continue;
          const c2 = j2.calls[m];
          if (c2.dep < tArr + minT) continue;
          const kd = j2.callIdx[dest];
          if (kd == null || kd <= m) continue;
          const arrDest = j2.calls[kd].arr;
          if (!best || arrDest < best.arrDest) best = { arrDest, T, tArrT: tArr, j2, m, line: j2.line, tDep2: c2.dep, dest2: j2.dest, live2: c2.live && j2.monitored };
        }
      }
      if (best) { first.arrDest = best.arrDest; first.transfer = best; res.push(first); }
    }
  }
  return res;
}
const rankKey = o => (o.v === 'red' ? 1e7 : 0) + (o.arrDest ?? o.tArr) + 0.15 * (o.w ? o.w.sec : 0);

function computeCtx(now) {
  const ctx = { now, mode: state.dest ? 'dest' : 'free' };
  if (!state.stopsReady) return ctx;
  const near = candidateStations();
  ctx.nearest = near[0] || null;
  const forced = state.fromId && state.stations[state.fromId];
  const cands = forced ? [forced] : near;
  if (state.dest) {
    const destSt = state.stations[state.dest];
    ctx.destSt = destSt;
    if (!cands.length) { ctx.needUser = true; return ctx; }
    if (state.user && hav(state.user.ll, destSt.ll) < 200) ctx.arrived = true;
    ctx.walkDest = state.user ? walkFor(destSt) : null;
    const stations = cands.filter(s => s.id !== state.dest);
    let opts = directOptions(stations, now);
    if (!opts.length) { opts = transferOptions(stations, now); ctx.viaTransfer = opts.length > 0; }
    opts.sort((a, b) => rankKey(a) - rankKey(b));
    ctx.options = opts;
    ctx.primary = opts[0] || null;
    if (ctx.primary && ctx.primary.v === 'red') ctx.noneCatchable = true;
    if (ctx.nearest && ctx.primary && ctx.primary.S.id !== ctx.nearest.id) {
      ctx.nearestItem = opts.find(o => o.S.id === ctx.nearest.id) || null;
    }
    ctx.board = ctx.primary ? ctx.primary.S : (forced || ctx.nearest);
  } else {
    const S = forced || ctx.nearest;
    if (!S) return ctx;
    const w = walkFor(S);
    ctx.board = S;
    ctx.groups = stationBoard(S, w, now, 3);
    let g = state.pinned ? ctx.groups.find(x => x.key === state.pinned) : null;
    if (!g) for (const x of ctx.groups) if (!g || x.list[0].arrIn < g.list[0].arrIn) g = x;
    ctx.g = g;
    ctx.primary = g ? g.list[0] : null;
    ctx.nextCatch = g && ctx.primary && ctx.primary.v === 'red' ? g.catchable : null;
  }
  if (ctx.board) ctx.boardW = walkFor(ctx.board);
  return ctx;
}
function adviseCadence(p) {
  let orange = null;
  for (const c of CADENCES) {
    const v = verdict(p.arrIn, p.depIn, walkFor(p.S, c.kmh).sec);
    if (v === 'green') return { c, v };
    if (v === 'orange' && !orange) orange = { c, v };
  }
  return orange;
}

/* =========================================================
   Carte
   ========================================================= */
const isDesk = () => window.matchMedia('(min-width: 768px)').matches;
const map = L.map('map', { zoomControl: false, attributionControl: false, minZoom: 10, maxZoom: 19 }).setView(CENTER, 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20 }).addTo(map);
if (isDesk()) L.control.zoom({ position: 'bottomright' }).addTo(map);
map.addControl(new (L.Control.extend({
  options: { position: 'bottomright' },
  onAdd() {
    const d = L.DomUtil.create('div', 'attr');
    d.innerHTML = `<button type="button" aria-label="Sources de la carte et des données" aria-expanded="false">i</button>
      <span class="attr-txt">&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>, données TBM, itinéraires OSRM</span>`;
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
const legLayer = L.layerGroup().addTo(map);
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
  const isDest = state.dest === id;
  return `<div class="pop-head"><div class="pop-lines">${[...st.lines].sort().map(l => badge(l, 'sm')).join('')}</div><div><div class="pop-title">${esc(st.name)}</div>
      <div class="pop-sub">${w ? `${fmtDist(w.dist)} à pied, ${fmtWalk(w.sec)}${w.routed ? '' : ' (estimé)'}` : 'Placez votre repère pour le temps de marche'}</div></div></div>
    <div class="pop-deps">${deps}</div>
    <div class="acts-line" style="margin-top:10px">
      <button type="button" class="btn" data-act="dest" data-id="${esc(id)}">${isDest ? 'Destination actuelle' : 'Y aller'}</button>
      <button type="button" class="btn ghost" data-act="from" data-id="${esc(id)}">Partir d'ici</button>
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

/* Tracé du trajet sur la carte : marche réelle + tronçon(s) de tram */
let legKey = '';
function updateTripLayers(ctx) {
  const p = ctx.primary;
  if (state.user && ctx.board) {
    const r = walkCache.get(ctx.board.id);
    const pts = r && r.geom && hav(r.geomOrigin, state.user.ll) < 30 ? [state.user.ll, ...r.geom, ctx.board.ll] : [state.user.ll, ctx.board.ll];
    walkLine.setLatLngs(pts);
    const v = p && p.S && p.S.id === ctx.board.id ? p.v : null;
    walkLine.setStyle({ color: v === 'green' ? '#15803d' : v === 'orange' ? '#d97706' : v === 'red' ? '#dc2626' : '#0f172a' });
  } else walkLine.setLatLngs([]);
  const key = p && state.dest ? `${p.j.id}|${p.i}|${p.transfer ? p.transfer.j2.id : ''}|${state.dest}` : '';
  if (key === legKey) return;
  legKey = key;
  legLayer.clearLayers();
  if (!key) return;
  const draw = (j, from, to) => {
    const pts = [];
    for (let k = from; k < to; k++) pts.push(...segPath(j.line, j.calls[k].st, j.calls[k + 1].st).pts);
    if (pts.length > 1) {
      L.polyline(pts, { pane: 'legPane', color: '#0f172a', weight: 12, opacity: .18, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(legLayer);
      L.polyline(pts, { pane: 'legPane', color: lineColor(j.line), weight: 7, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(legLayer);
    }
  };
  if (p.transfer) {
    const kT = p.j.callIdx[p.transfer.T];
    draw(p.j, p.i, kT);
    draw(p.transfer.j2, p.transfer.m, p.transfer.j2.callIdx[state.dest]);
  } else draw(p.j, p.i, p.j.callIdx[state.dest]);
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
  if (state.lastGps) { setUser(state.lastGps.ll, state.lastGps.acc, 'gps'); map.flyTo(state.lastGps.ll, Math.max(map.getZoom(), 16), { duration: .8 }); checkFar(state.lastGps.ll); }
  else toast('En attente du signal GPS…');
  renderGps();
}
let watchId = null;
function startGps() {
  if (!('geolocation' in navigator)) { state.gps = 'error'; renderGps(); showBanner('nogps', 'votre navigateur ne propose pas la géolocalisation'); return; }
  state.gps = 'search'; renderGps();
  watchId = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
}
function onPos(pos) {
  const ll = [pos.coords.latitude, pos.coords.longitude], acc = pos.coords.accuracy;
  state.lastGps = { ll, acc };
  state.gps = 'ok';
  if (state.bannerKind === 'nogps') hideBanner();
  if (state.mode === 'gps') {
    setUser(ll, acc, 'gps');
    const far = checkFar(ll);
    if (state.firstFix) { state.firstFix = false; if (!far) map.flyTo(ll, 16, { duration: 1.1 }); }
  }
  renderGps();
}
function onErr(err) {
  if (err.code === 1) { state.gps = 'denied'; if (watchId != null) navigator.geolocation.clearWatch(watchId); if (!state.user) showBanner('nogps', 'vous avez refusé l\u2019accès à votre position'); }
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
  if (state.mode === 'manual') { s = 'manual'; label = 'Repère manuel'; }
  else if (state.mode === 'sim') { s = 'sim'; label = 'Position simulée'; }
  else if (s === 'ok') label = `GPS ±${Math.round(state.lastGps.acc)} m`;
  else if (s === 'search') label = 'Recherche GPS…';
  else if (s === 'denied') label = 'GPS refusé';
  else label = 'GPS indisponible';
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
  map.flyTo(ll, 16, { duration: 1 });
  toast(spot === 'quinconces' ? 'Position simulée aux Quinconces' : 'Position simulée place de la Bourse');
  if (snap === 'collapsed') setSnap('mid');
}
map.on('click', e => {
  if (Date.now() - lastPopupClose < 400) return;
  closeResults();
  setManual([e.latlng.lat, e.latlng.lng], 'manual');
  toast('Repère placé. Touchez le badge GPS pour reprendre le GPS.');
});

/* =========================================================
   Panneau coulissant (3 crans)
   ========================================================= */
const sheet = $('#sheet'), head = $('#sheetHead'), body = $('#sheetBody'), handle = $('#handle');
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none';
document.body.appendChild(probe);
const safeB = () => probe.offsetHeight || 0;
let sheetH = 0, curT = 0, snap = 'mid', drag = null, justDragged = false;
function sheetVisible() { return Math.max(0, sheetH - curT); }
function snaps() {
  const col = Math.min(sheetH, Math.round(head.offsetHeight + safeB()));
  return { collapsed: sheetH - col, mid: sheetH - Math.min(sheetH, 400 + safeB()), full: 0 };
}
function applyT(t, anim) { sheet.classList.toggle('anim', !!anim); curT = t; sheet.style.transform = `translate3d(0,${t.toFixed(1)}px,0)`; }
function setSnap(name, anim = true) {
  snap = name;
  applyT(snaps()[name], anim);
  sheet.classList.toggle('full', name === 'full');
  if (name !== 'full') body.scrollTop = 0;
  document.documentElement.style.setProperty('--sheet-offset', (isDesk() ? 0 : sheetH - curT) + 'px');
  handle.setAttribute('aria-label', name === 'full' ? 'Réduire le panneau' : 'Agrandir le panneau');
}
function layoutSheet() { sheetH = Math.round(window.innerHeight * 0.84); sheet.style.height = sheetH + 'px'; setSnap(snap, false); }
sheet.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (snap === 'full' && !head.contains(e.target)) return;
  drag = { id: e.pointerId, y0: e.clientY, t0: curT, active: false, lastY: e.clientY, lastT: performance.now(), v: 0 };
});
sheet.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const dy = e.clientY - drag.y0;
  if (!drag.active) {
    if (Math.abs(dy) < 7) return;
    drag.active = true;
    try { sheet.setPointerCapture(e.pointerId); } catch (_) { /* pointeur relâché */ }
  }
  const max = snaps().collapsed;
  let t = drag.t0 + dy;
  if (t < 0) t *= 0.25;
  if (t > max) t = max + (t - max) * 0.25;
  applyT(t, false);
  const tn = performance.now();
  drag.v = (e.clientY - drag.lastY) / Math.max(1, tn - drag.lastT);
  drag.lastY = e.clientY; drag.lastT = tn;
});
function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  if (drag.active) {
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 60);
    const s = snaps(), proj = curT + drag.v * 200;
    let best = 'mid', bd = Infinity;
    for (const n of ['full', 'mid', 'collapsed']) { const d = Math.abs(s[n] - proj); if (d < bd) { bd = d; best = n; } }
    setSnap(best);
  }
  drag = null;
}
sheet.addEventListener('pointerup', endDrag);
sheet.addEventListener('pointercancel', endDrag);
sheet.addEventListener('click', e => { if (justDragged) { e.stopPropagation(); e.preventDefault(); } }, true);
sheet.addEventListener('wheel', e => {
  if (snap !== 'full' && e.deltaY > 12) { e.preventDefault(); setSnap(snap === 'collapsed' ? 'mid' : 'full'); }
  else if (snap === 'full' && e.deltaY < -12 && body.scrollTop <= 0 && head.contains(e.target)) setSnap('mid');
}, { passive: false });
handle.addEventListener('click', () => setSnap(snap === 'collapsed' ? 'mid' : snap === 'mid' ? 'full' : 'collapsed'));
$('#summary').addEventListener('click', () => { if (snap === 'collapsed') setSnap('mid'); });
window.addEventListener('resize', layoutSheet);

/* =========================================================
   Rendu des panneaux
   ========================================================= */
const setHTML = (el, html) => { if (el._h !== html) { el.innerHTML = html; el._h = html; } };
function panelHead(icon, title, meta = '') {
  return `<div class="panel-h"><span class="ico">${svg(icon, 16)}</span><h2>${title}</h2>${meta}</div>`;
}
function renderLive() {
  const b = $('#live'), txt = $('.txt', b);
  const age = state.lastUpdate ? nowS() - state.lastUpdate : null;
  let s, label;
  if (state.api === 'error' && !state.lastUpdate) { s = 'error'; label = state.apiErrorKind === 'offline' ? 'Hors ligne' : 'Erreur'; }
  else if (!state.lastUpdate) { s = 'loading'; label = 'TBM…'; }
  else if (age > 120 || state.api === 'error') { s = 'stale'; label = `${Math.round(age / 60)} min`; }
  else { s = 'ok'; label = `${Math.max(0, Math.round(age))} s`; }
  b.dataset.state = s;
  txt.textContent = label;
  b.title = s === 'ok' ? `Temps réel TBM mis à jour il y a ${label}. Touchez pour actualiser.` : (state.apiError || 'Connexion au temps réel TBM');
}
$('#live').addEventListener('click', () => {
  if (state.api === 'error' && !state.lastUpdate) openCfg();
  else { toast('Actualisation du temps réel…'); LINE_IDS.forEach(l => { state.lineFresh[l] = 0; }); }
});
function renderChips() {
  $('#chips').innerHTML = LINE_IDS.map(l => `<button type="button" class="chip" data-line="${l}" style="--c:${lineColor(l)}" aria-pressed="${state.activeLines.has(l)}" aria-label="Ligne ${l}">${l}</button>`).join('');
}
function renderCadence() {
  $('#cadence').innerHTML = CADENCES.map(c => `<button type="button" role="radio" data-cadence="${c.id}" aria-checked="${c.id === state.cadence}"><b>${c.label}</b><small>${fmtKmh(c.kmh)}</small></button>`).join('');
}

function renderSummary(ctx) {
  const el = $('#summary');
  const box = (icon, t, s) => `<div class="sum"><div class="sum-ico">${svg(icon, 22)}</div><div class="sum-main"><div class="sum-title">${t}</div><div class="sum-sub">${s}</div></div></div>`;
  if (state.api === 'error' && !state.journeys.length) return setHTML(el, box('wifi', 'Temps réel TBM indisponible', esc(state.apiError)));
  if (!state.stopsReady || (!state.lastUpdate && state.api === 'loading')) return setHTML(el, box('tram', 'Connexion au temps réel TBM…', 'Chargement des arrêts et des passages'));
  const p = ctx.primary;
  if (!p) {
    if (ctx.needUser || !ctx.board) return setHTML(el, box('locate', state.gps === 'search' ? 'Recherche de votre position…' : 'Où êtes-vous ?', 'Touchez la carte ou simulez une position'));
    return setHTML(el, box('tram', esc(ctx.board.name), state.dest ? `Aucun tram vers ${esc(stName(state.dest))} dans l\u2019heure` : 'Aucun départ annoncé dans l\u2019heure'));
  }
  const title = state.dest ? `${esc(p.S.name)} → ${esc(stName(state.dest))}` : `${esc(p.S.name)}, vers ${esc(p.dest)}`;
  const sub = `${p.w ? fmtWalk(p.w.sec) + ' à pied, ' : ''}${p.v ? VERDICT_TEXT[p.v].toLowerCase() : 'placez votre repère'}`;
  setHTML(el, `<div class="sum">${badge(p.line, 'lg')}<div class="sum-main"><div class="sum-title">${title}</div><div class="sum-sub">${sub}</div></div>
    <div class="sum-time ${p.v ? 'v-' + p.v : ''}"><strong>${cdSpan(p, 'min')}</strong><small>à quai</small></div></div>`);
}

function simButtons() {
  return `<div class="acts"><button class="btn" type="button" data-act="sim" data-spot="bourse">${svg('pin', 16)}Place de la Bourse</button><button class="btn ghost" type="button" data-act="sim" data-spot="quinconces">Quinconces</button></div>`;
}
function recentButtons() {
  const r = state.recents.filter(id => state.stations[id] && id !== state.dest).slice(0, 4);
  return r.length ? `<div class="recents">${r.map(id => `<button type="button" data-act="dest" data-id="${esc(id)}">${esc(stName(id))}</button>`).join('')}</div>` : '';
}
function relevantMessages(lines, stations) {
  return state.messages.filter(m => m.lines.some(l => lines.includes(l)) || m.stations.some(s => stations.includes(s)));
}
function timeline(p, now) {
  const j = p.j, c = j.calls, pos = tramPos(j, now), color = lineColor(p.line);
  const walk = p.w ? p.w.sec : null;
  const span = Math.max(p.depIn, walk || 0, 60) * 1.12 + 15;
  const X = t => clamp(t / span * 100, 0, 100);
  const startIdx = pos ? Math.min(pos.next, p.i) : p.i;
  let dots = '';
  for (let k = startIdx; k < p.i; k++) dots += `<span class="tl-dot" style="left:${X(c[k].arr - now).toFixed(1)}%;--c:${color}" title="${esc(stName(c[k].st))} ${fmtClock(c[k].arr)}"></span>`;
  const arrX = X(Math.max(0, p.arrIn)), depX = X(p.depIn);
  const stopsAway = p.i - startIdx;
  const vehLabel = !pos ? 'pas encore parti' : pos.dwell ? `à ${stName(c[pos.at].st)}` : stopsAway ? `${stopsAway} arrêt${stopsAway > 1 ? 's' : ''} avant` : 'arrive';
  const tramRow = `<div class="tl-row"><span class="tl-lab" style="color:${color}">Tram ${esc(p.line)}</span>
      <div class="tl-track"></div><div class="tl-fill" style="width:${arrX.toFixed(1)}%;background:${color};opacity:.35"></div>
      <div class="tl-quai" style="left:${arrX.toFixed(1)}%;width:${Math.max(1.5, depX - arrX).toFixed(1)}%;background:${color}"></div>
      ${dots}<span class="tl-veh" style="left:0;--c:${color}">${esc(p.line)}</span>
      <span class="tl-st" style="left:${arrX.toFixed(1)}%"></span>
      <span class="tl-txt l" style="left:0">${esc(vehLabel)}</span>
      <span class="tl-txt ${arrX > 80 ? 'r' : ''}" style="left:${Math.max(arrX, 24).toFixed(1)}%">${p.arrIn > 0 ? 'à quai ' + fmtClockS(p.tArr) : 'à quai'}</span></div>`;
  const meRow = walk == null ? '' : `<div class="tl-row"><span class="tl-lab" style="color:var(--me)">Vous</span>
      <div class="tl-track"></div><div class="tl-fill" style="width:${X(walk).toFixed(1)}%;background:var(--me);opacity:.35"></div>
      <span class="tl-me" style="left:0"></span><span class="tl-flag" style="left:${X(walk).toFixed(1)}%"></span>
      <span class="tl-txt ${X(walk) > 80 ? 'r' : ''}" style="left:${Math.max(X(walk), 24).toFixed(1)}%">au quai ${fmtClockS(now + walk)}</span></div>`;
  return `<div class="tl" aria-hidden="true"><span class="tl-arr" style="left:${arrX.toFixed(1)}%;--c:${color}"></span>${tramRow}${meRow}</div>`;
}
function positionText(p, now) {
  const pos = tramPos(p.j, now), c = p.j.calls;
  if (!pos) return `Départ du terminus ${esc(stName(c[0].st))} à ${fmtClock(c[0].dep)}.`;
  const away = p.i - pos.next;
  if (pos.dwell) {
    if (pos.at === p.i) return `Le tram est <b>à quai à ${esc(p.S.name)}</b>.`;
    return `Le tram est à quai à <b>${esc(stName(c[pos.at].st))}</b>, ${p.i - pos.at} arrêt${p.i - pos.at > 1 ? 's' : ''} avant votre station.`;
  }
  if (away <= 0) return `Le tram arrive : il a quitté <b>${esc(stName(c[pos.from].st))}</b>.`;
  return `Le tram est entre <b>${esc(stName(c[pos.from].st))}</b> et <b>${esc(stName(c[pos.to].st))}</b>, ${away} arrêt${away > 1 ? 's' : ''} avant votre station.`;
}

function renderVerdict(ctx) {
  const el = $('#pVerdict');
  el.className = 'panel panel-verdict';
  const empty = (h, t, extra = '') => setHTML(el, `<div class="pv-empty"><h3>${h}</h3>${t}${extra}</div>`);
  if (state.api === 'error' && !state.journeys.length) {
    const blocked = state.apiErrorKind === 'blocked' || state.apiErrorKind === 'proxy';
    return empty('Temps réel TBM indisponible', `${esc(state.apiError)}. ${blocked ? 'Sans ces horaires, pas de verdict : configurez un relais pour contourner le blocage.' : 'Le verdict reprendra dès que le flux répondra.'}`,
      `<div class="acts"><button class="btn" type="button" data-act="retry">Réessayer</button>${blocked ? '<button class="btn ghost" type="button" data-act="settings">Configurer un relais</button>' : ''}</div>`);
  }
  if (!state.stopsReady || (!state.lastUpdate && state.api === 'loading')) return empty('Connexion au temps réel TBM…', 'Chargement des arrêts puis des passages des trams.');
  if (ctx.needUser || (!ctx.board && !state.user)) return empty('Où êtes-vous ?', 'Autorisez la localisation, touchez la carte pour placer votre repère, ou simulez une position.', simButtons());
  if (ctx.arrived) return empty('Vous êtes à destination', `Vous êtes à moins de 200 m de ${esc(ctx.destSt.name)}.`, `<div class="acts"><button class="btn ghost" type="button" data-act="clear-dest">Changer de destination</button></div>`);
  const p = ctx.primary;
  const destPrompt = state.dest ? '' : `<div class="pv-next"><b>Où allez-vous ?</b> Choisissez une destination en haut pour ne voir que les trams dans votre sens.${recentButtons()}</div>`;
  if (!p) {
    if (state.dest && ctx.walkDest && ctx.walkDest.dist < 2500) return empty(`Allez-y à pied`, `Aucun tram utile vers ${esc(stName(state.dest))} depuis les stations proches : c’est à ${fmtDist(ctx.walkDest.dist)}, ${fmtWalk(ctx.walkDest.sec - CFG.walk.platformSec)} de marche.`);
    if (state.dest) return empty(`Aucun tram vers ${esc(stName(state.dest))}`, `Aucun passage annoncé dans l\u2019heure depuis les stations à moins de ${fmtDist(CFG.walk.candidateRadius)}, même avec une correspondance. Le service est peut-être terminé ou perturbé : voyez les infos trafic.`);
    return empty(esc(ctx.board.name), state.journeys.length ? 'Aucun départ annoncé ici dans l\u2019heure pour les lignes affichées.' : 'Aucun tram annoncé sur le réseau : le service est probablement terminé.', destPrompt);
  }
  const now = ctx.now, v = p.v;
  if (v) el.classList.add('v-' + v);
  let band = '';
  if (p.w) {
    const m = p.arrIn - p.w.sec;
    const detail = v === 'green' ? `Vous serez sur le quai ${fmtMS(m)} avant lui.` : v === 'orange' ? (m >= 0 ? `Seulement ${fmtMS(m)} d'avance.` : `Il sera à quai depuis ${fmtMS(-m)} à votre arrivée.`) : `Il vous manque ${fmtMS(p.w.sec - p.depIn)}.`;
    const slack = p.arrIn - p.w.sec - 30;
    const leave = v === 'red' ? '' : slack > 60 ? `Partez dans<b>${fmtMS(slack).replace(' s', '\u00a0s')}</b>` : '<b>Partez</b>maintenant';
    band = `<div class="pv-band"><span class="lamp"></span><div class="grow"><strong>${VERDICT_TEXT[v]}</strong><span>${detail}</span></div>${leave ? `<div class="pv-leave">${leave}</div>` : ''}</div>`;
  } else band = `<div class="pv-band"><span class="lamp"></span><div class="grow"><strong>Verdict indisponible</strong><span>Placez votre repère pour savoir si vous l'aurez.</span></div></div>`;
  const rows = [];
  if (p.w) rows.push(`<li><span class="k">${svg('walk', 18)}</span><span>Montez à <b>${esc(p.S.name)}</b> : ${fmtDist(p.w.dist)}, ${fmtWalk(p.w.sec)} à pied${p.w.routed ? '' : ' (estimé)'}</span></li>`);
  else rows.push(`<li><span class="k">${svg('pin', 18)}</span><span>Départ de <b>${esc(p.S.name)}</b></span></li>`);
  if (p.transfer) {
    const t = p.transfer;
    rows.push(`<li><span class="k">${svg('swap', 18)}</span><span>Changez à <b>${esc(stName(t.T))}</b> : ${badge(t.line, 'sm')} vers ${esc(t.dest2)} à ${fmtClock(t.tDep2)} (${fmtMS(t.tDep2 - t.tArrT)} de battement)</span></li>`);
  }
  if (p.arrDest) rows.push(`<li><span class="k">${svg('flag', 18)}</span><span>Arrivée à <b>${esc(stName(state.dest))}</b> vers ${fmtClock(p.arrDest)}</span></li>`);
  const alerts = relevantMessages([p.line, ...(p.transfer ? [p.transfer.line] : [])], [p.S.id, ...(state.dest ? [state.dest] : [])]);
  const alertHTML = alerts.length ? `<button type="button" class="pv-alert" data-act="goto-info"><span>${svg('alert', 16)}</span><span>${esc(alerts[0].title || alerts[0].body).slice(0, 140)}${alerts.length > 1 ? ` (+${alerts.length - 1})` : ''}</span></button>` : '';
  let next = '';
  if (v === 'red') {
    const alt = state.dest ? ctx.options.find(o => o.v && o.v !== 'red') : ctx.nextCatch;
    if (alt) next = `<div class="pv-next">Visez le suivant : ${badge(alt.line, 'sm')} à <b>${fmtClock(alt.tArr)}</b> depuis ${esc(alt.S.name)}, dans ${cdSpan(alt, 'min')}.</div>`;
    else {
      const adv = adviseCadence(p);
      next = `<div class="pv-next">${adv ? `En allure ${adv.c.label.toLowerCase()} (${fmtKmh(adv.c.kmh)}), vous l'auriez.` : 'Aucun tram attrapable dans les passages annoncés.'}</div>`;
    }
  } else if (v === 'orange' && p.w) {
    next = `<div class="pv-next">Il faut tenir au moins <b>${fmtKmh(Math.max(0, p.w.dist) / Math.max(1, p.depIn - CFG.walk.platformSec) * 3.6)}</b>.</div>`;
  }
  let nearest = '';
  if (ctx.nearestItem) nearest = `<div class="pv-next">Station la plus proche, ${esc(ctx.nearest.name)} : ${badge(ctx.nearestItem.line, 'sm')} dans ${cdSpan(ctx.nearestItem, 'min')}, ${ctx.nearestItem.v ? VERDICT_TEXT[ctx.nearestItem.v].toLowerCase() : ''}. Le trajet ci-dessus vous fait arriver plus tôt.</div>`;
  else if (state.dest && ctx.nearest && ctx.nearest.id !== state.dest && p.S.id !== ctx.nearest.id && !ctx.options.some(o => o.S.id === ctx.nearest.id)) nearest = `<div class="pv-next">${esc(ctx.nearest.name)}, la station la plus proche, n\u2019est pas desservie vers ${esc(stName(state.dest))}.</div>`;
  let walkHint = '';
  if (ctx.walkDest && p.arrDest && now + ctx.walkDest.sec - CFG.walk.platformSec <= p.arrDest) {
    walkHint = `<div class="pv-next">${svg('walk', 16)} À pied jusqu’à ${esc(stName(state.dest))} : ${fmtWalk(ctx.walkDest.sec - CFG.walk.platformSec)}, arrivée vers ${fmtClock(now + ctx.walkDest.sec - CFG.walk.platformSec)}, <b>plus tôt que le tram</b>.</div>`;
  }
  setHTML(el, `${band}
    <div class="pv-main">
      <div class="pv-cd">${cdSpan(p)}<small>${p.arrIn > 0 ? 'arrivée à quai<br>' + fmtClockS(p.tArr) : 'repart à<br>' + fmtClockS(p.tDep)}</small></div>
      <div class="pv-info">
        <div class="pv-line">${badge(p.line, 'lg')}<div><div class="pv-dir">vers ${esc(p.dest)}</div><div class="pv-meta">${liveTag(p.live)} ${fmtDelay(p.delay)}</div></div></div>
        <ul class="pv-rows">${rows.join('')}</ul>
      </div>
    </div>
    ${timeline(p, now)}
    <p class="pv-pos">${positionText(p, now)}</p>
    ${alertHTML}${walkHint}${next}${nearest}${destPrompt}`);
}

function renderOptions(ctx) {
  const el = $('#pOptions');
  if (!state.stopsReady || !state.lastUpdate) return setHTML(el, '');
  if (state.dest && ctx.options && ctx.options.length > 1) {
    const perStation = new Map(), list = [];
    for (const o of ctx.options) {
      if (o === ctx.primary) continue;
      const n = perStation.get(o.S.id) || 0;
      if (n >= 2) continue;
      perStation.set(o.S.id, n + 1);
      list.push(o);
      if (list.length >= 6) break;
    }
    const rows = list.map(o => `<button type="button" class="opt" data-act="from" data-id="${esc(o.S.id)}">
      <span class="vd ${o.v ? 'v-' + o.v : ''}"></span>
      <div class="opt-main"><div class="opt-t">${esc(o.S.name)}</div>
        <div class="opt-s">${badge(o.line, 'sm')}${o.transfer ? ` puis ${badge(o.transfer.line, 'sm')} à ${esc(stName(o.transfer.T))}` : ''}<span>${o.w ? fmtWalk(o.w.sec) + ' à pied' : ''}</span></div></div>
      <div class="opt-r">${cdSpan(o, 'min')}<small>arrivée ${fmtClock(o.arrDest)}</small></div></button>`).join('');
    return setHTML(el, panelHead('list', `Autres possibilités vers ${esc(stName(state.dest))}`, `<span class="count">${list.length}</span>`) + (rows || '<p class="muted">Pas d\u2019autre option utile.</p>'));
  }
  if (!state.dest && state.user) {
    const now = ctx.now;
    const rows = candidateStations().slice(0, 6).map(S => {
      const w = walkFor(S);
      let best = null;
      for (const g of stationBoard(S, w, now, 1)) if (g.catchable && (!best || g.catchable.arrIn < best.arrIn)) best = g.catchable;
      return `<button type="button" class="opt ${ctx.board && ctx.board.id === S.id ? 'cur' : ''}" data-act="from" data-id="${esc(S.id)}">
        <span class="vd ${best ? 'v-' + best.v : 'v-red'}"></span>
        <div class="opt-main"><div class="opt-t">${esc(S.name)}</div><div class="opt-s"><span class="dots">${[...S.lines].sort().map(l => `<i style="--c:${lineColor(l)}"></i>`).join('')}</span><span>${fmtDist(w.dist)}, ${fmtWalk(w.sec)}</span></div></div>
        <div class="opt-r">${best ? `${badge(best.line, 'sm')} ${cdSpan(best, 'min')}` : '<small>rien d\u2019attrapable</small>'}</div></button>`;
    }).join('');
    return setHTML(el, panelHead('compass', 'Stations autour de vous') + rows);
  }
  setHTML(el, '');
}

function renderDeps(ctx) {
  const el = $('#pDeps');
  if (!ctx.board || !state.lastUpdate) return setHTML(el, '');
  const groups = state.dest ? stationBoard(ctx.board, ctx.boardW, ctx.now, 3) : ctx.groups;
  const age = Math.round(nowS() - state.lastUpdate);
  const meta = `<span class="panel-meta">${state.fromId ? '<button type="button" class="linkbtn" data-act="from-clear">Station la plus proche</button> ' : ''}màj ${age < 60 ? age + ' s' : Math.round(age / 60) + ' min'}</span>`;
  if (!groups || !groups.length) return setHTML(el, panelHead('clock', `Passages à ${esc(ctx.board.name)}`, meta) + '<p class="muted">Aucun départ annoncé dans l\u2019heure.</p>');
  const pinnedKey = !state.dest && state.pinned && ctx.g ? ctx.g.key : null;
  const rows = groups.map(g => {
    const first = g.list[0], pinned = pinnedKey === g.key;
    return `<button type="button" class="dep${g.toDest ? ' todest' : ''}${pinned ? ' pinned' : ''}" data-pin="${esc(g.key)}" aria-pressed="${pinned}">
      ${badge(g.line)}<span class="dep-dir">${esc(g.dest)}${g.toDest ? '<span class="tag">votre sens</span>' : ''}<small>${pinned ? 'Direction suivie' : first.live ? 'Temps réel' : 'Horaire théorique'}${first.delay != null && Math.abs(first.delay) >= 60 ? ', ' + (first.delay > 0 ? '+' : '') + Math.round(first.delay / 60) + ' min' : ''}</small></span>
      <span class="dep-times">${g.list.map(p => `<span class="t ${p.v ? 'v-' + p.v : ''}">${cdSpan(p, 'min')}</span>`).join('')}</span></button>`;
  }).join('');
  setHTML(el, panelHead('clock', `Passages à ${esc(ctx.board.name)}`, meta) + `<div class="deps">${rows}</div>` +
    (state.dest ? '' : '<p class="muted" style="margin:8px 2px 0">Touchez une direction pour la suivre dans le verdict.</p>'));
}

function renderInfo(ctx) {
  const el = $('#pInfo');
  if (!state.msgFresh) return setHTML(el, '');
  const mineLines = ctx.primary ? [ctx.primary.line, ...(ctx.primary.transfer ? [ctx.primary.transfer.line] : [])] : [];
  const mineSt = [ctx.board && ctx.board.id, state.dest].filter(Boolean);
  const list = state.messages.map(m => ({ m, mine: m.lines.some(l => mineLines.includes(l)) || m.stations.some(s => mineSt.includes(s)) }))
    .sort((a, b) => b.mine - a.mine);
  const count = `<span class="count ${list.some(x => x.mine) ? 'hot' : ''}">${list.length}</span>`;
  let content;
  if (state.msgError && !state.messages.length) content = `<p class="muted">Infos trafic indisponibles : ${esc(state.msgError)}.</p>`;
  else if (!list.length) content = '<p class="muted">Aucune perturbation signalée sur le tram.</p>';
  else content = list.slice(0, 12).map(({ m, mine }) => `<div class="msg ${mine ? 'mine' : ''}">
      <div class="msg-h">${m.lines.map(l => badge(l, 'sm')).join('')}</div>
      <div class="msg-t">${esc(m.title || m.body.slice(0, 90))}</div>
      ${m.title ? `<div class="msg-b">${esc(m.body)}</div>` : m.body.length > 90 ? `<div class="msg-b">${esc(m.body)}</div>` : ''}
      ${m.stations.length ? `<div class="msg-v">Stations : ${m.stations.slice(0, 6).map(s => esc(stName(s))).join(', ')}</div>` : ''}
      ${m.until ? `<div class="msg-v">Jusqu'au ${toDate(m.until).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>` : ''}</div>`).join('');
  setHTML(el, panelHead('alert', 'Infos trafic tram', count) + content);
}

let lastUi = 0, lastBoardId = null;
function tickUi(force) {
  const now = nowS();
  if (!force && now - lastUi < 1) return;
  lastUi = now;
  const ctx = computeCtx(now);
  lastCtx = ctx;
  if (!state.dest && ctx.board && ctx.board.id !== lastBoardId) { if (lastBoardId) state.pinned = null; }
  lastBoardId = ctx.board ? ctx.board.id : null;
  setRoles(ctx.board ? ctx.board.id : null, state.dest);
  renderSummary(ctx); renderVerdict(ctx); renderOptions(ctx); renderDeps(ctx); renderInfo(ctx);
  $('#walkSource').textContent = !state.user ? '' : state.routerOk === false ? 'distance estimée' : state.routerOk ? 'itinéraire piéton réel' : '';
  updateTripLayers(ctx);
  refreshPopup();
  renderLive();
  tickCountdowns();
  if (state.user) {
    const cands = candidateStations();
    const extra = [state.fromId, state.dest].filter(id => id && state.stations[id]).map(id => state.stations[id]);
    ensureWalkTable([...new Set([...extra, ...cands])]);
    if (ctx.board) ensureRouteGeom(ctx.board);
  }
  if (snap === 'collapsed' && Math.abs(curT - snaps().collapsed) > 1 && !drag) setSnap('collapsed');
}

/* =========================================================
   Actions
   ========================================================= */
function setDest(id) {
  if (!state.stations[id]) return;
  state.dest = id; state.fromId = null; state.pinned = null;
  store.set('tbm-dest', id);
  state.recents = [id, ...state.recents.filter(x => x !== id)].slice(0, 6);
  store.set('tbm-recents', state.recents);
  $('#q').value = stName(id);
  $('#qClear').classList.remove('hidden');
  map.closePopup();
  applyStationVisibility();
  tickUi(true);
  if (snap === 'collapsed') setSnap('mid');
  const pts = [state.stations[id].ll];
  if (state.user) pts.push(state.user.ll);
  if (lastCtx && lastCtx.board) pts.push(lastCtx.board.ll);
  if (pts.length > 1) map.flyToBounds(L.latLngBounds(pts), { paddingTopLeft: [isDesk() ? 440 : 30, 170], paddingBottomRight: [30, isDesk() ? 40 : sheetVisible() + 30], maxZoom: 16, duration: .9 });
  else map.flyTo(pts[0], 15, { duration: .8 });
  toast(`Direction : ${stName(id)}`);
}
function clearDest() {
  state.dest = null; state.pinned = null;
  store.set('tbm-dest', null);
  $('#q').value = '';
  $('#qClear').classList.add('hidden');
  applyStationVisibility();
  tickUi(true);
}
function onAction(e) {
  const act = e.target.closest('[data-act]');
  if (act) {
    const a = act.dataset.act, id = act.dataset.id;
    if (a === 'sim') simulate(act.dataset.spot);
    else if (a === 'banner-close') { if (state.bannerKind) state.bannerDismissed[state.bannerKind] = true; hideBanner(); }
    else if (a === 'dest') setDest(id);
    else if (a === 'clear-dest') clearDest();
    else if (a === 'from') { state.fromId = id; state.pinned = null; map.closePopup(); tickUi(true); if (snap === 'collapsed') setSnap('mid'); map.flyTo(state.stations[id].ll, Math.max(map.getZoom(), 15), { duration: .7 }); }
    else if (a === 'from-clear') { state.fromId = null; tickUi(true); }
    else if (a === 'retry') { toast('Nouvelle tentative…'); boot(true); }
    else if (a === 'settings') openCfg();
    else if (a === 'cfg-close') $('#cfg').close();
    else if (a === 'cfg-save') saveCfg($('#proxyInput').value.trim());
    else if (a === 'cfg-clear') { $('#proxyInput').value = ''; saveCfg(''); }
    else if (a === 'goto-info') { setSnap('full'); setTimeout(() => $('#pInfo').scrollIntoView({ behavior: 'smooth', block: 'start' }), 350); }
    else if (a === 'update') applyUpdate();
    else if (a === 'check-update') checkVersion(true);
    e.stopPropagation();
    return;
  }
  const pin = e.target.closest('[data-pin]');
  if (pin && !state.dest) { state.pinned = state.pinned === pin.dataset.pin ? null : pin.dataset.pin; tickUi(true); }
}
document.addEventListener('click', onAction);
$('#cadence').addEventListener('click', e => {
  const b = e.target.closest('[data-cadence]'); if (!b) return;
  state.cadence = b.dataset.cadence;
  store.set('tbm-cadence', state.cadence);
  $$('#cadence [data-cadence]').forEach(x => x.setAttribute('aria-checked', String(x.dataset.cadence === state.cadence)));
  tickUi(true);
});
$('#chips').addEventListener('click', e => {
  const c = e.target.closest('[data-line]'); if (!c) return;
  const l = c.dataset.line;
  if (state.activeLines.has(l)) { if (state.activeLines.size === 1) { toast('Gardez au moins une ligne affichée.'); return; } state.activeLines.delete(l); }
  else { state.activeLines.add(l); state.lineFresh[l] = 0; }
  store.set('tbm-lines', [...state.activeLines]);
  c.setAttribute('aria-pressed', String(state.activeLines.has(l)));
  state.pinned = null;
  drawLines(); applyStationVisibility(); updateTrams(nowS()); legKey = ''; tickUi(true);
});

/* Recherche de destination */
const q = $('#q'), results = $('#results'), qClear = $('#qClear');
let resList = [], resIdx = 0;
function resRow(st, i, extra = '') {
  return `<button type="button" role="option" class="res${i === resIdx ? ' active' : ''}" data-res="${esc(st.id)}" aria-selected="${i === resIdx}">
    <span class="pop-lines">${[...st.lines].sort().map(l => badge(l, 'sm')).join('')}</span><span class="res-name">${esc(st.name)}</span>
    <span class="res-meta">${extra || (state.user ? fmtDist(hav(state.user.ll, st.ll)) : '')}</span></button>`;
}
function runSearch() {
  const raw = q.value, query = norm(raw);
  qClear.classList.toggle('hidden', !raw && !state.dest);
  if (!state.stopsReady) { results.innerHTML = '<div class="res-empty">Les stations sont en cours de chargement.</div>'; results.classList.remove('hidden'); return; }
  if (!query || (state.dest && raw === stName(state.dest))) {
    const rec = state.recents.map(id => state.stations[id]).filter(Boolean);
    resList = rec;
    resIdx = 0;
    results.innerHTML = (state.dest ? '<button type="button" class="res" data-act="clear-dest"><span class="res-name">Toute direction (station la plus proche)</span></button>' : '') +
      (rec.length ? '<div class="res-sec">Destinations récentes</div>' + rec.map((st, i) => resRow(st, i)).join('') : '<div class="res-empty">Tapez le nom de la station où vous allez.</div>');
  } else {
    resList = stationList().filter(st => st.n.includes(query)).sort((a, b) => {
      const sa = a.n.startsWith(query) || a.n.includes(' ' + query) ? 0 : 1, sb = b.n.startsWith(query) || b.n.includes(' ' + query) ? 0 : 1;
      return sa - sb || a.name.localeCompare(b.name, 'fr');
    }).slice(0, 8);
    resIdx = 0;
    results.innerHTML = resList.length ? resList.map((st, i) => resRow(st, i)).join('') : `<div class="res-empty">Aucune station de tram ne contient « ${esc(raw)} ».</div>`;
  }
  results.classList.remove('hidden');
  q.setAttribute('aria-expanded', 'true');
}
function closeResults() { results.classList.add('hidden'); q.setAttribute('aria-expanded', 'false'); }
function markActive() { $$('.res[data-res]', results).forEach((b, i) => { b.classList.toggle('active', i === resIdx); b.setAttribute('aria-selected', String(i === resIdx)); }); }
function pick(id) { closeResults(); q.blur(); setDest(id); }
q.addEventListener('input', runSearch);
q.addEventListener('focus', () => { q.select(); runSearch(); });
q.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' && resList.length) { e.preventDefault(); resIdx = (resIdx + 1) % resList.length; markActive(); }
  else if (e.key === 'ArrowUp' && resList.length) { e.preventDefault(); resIdx = (resIdx - 1 + resList.length) % resList.length; markActive(); }
  else if (e.key === 'Enter') { e.preventDefault(); if (resList[resIdx]) pick(resList[resIdx].id); }
  else if (e.key === 'Escape') { closeResults(); q.value = state.dest ? stName(state.dest) : ''; q.blur(); }
});
results.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') e.preventDefault(); });
results.addEventListener('click', e => { const b = e.target.closest('[data-res]'); if (b) pick(b.dataset.res); else if (e.target.closest('[data-act="clear-dest"]')) closeResults(); });
q.addEventListener('blur', () => setTimeout(() => { closeResults(); if (!q.value && state.dest) q.value = stName(state.dest); }, 180));
qClear.addEventListener('click', () => { clearDest(); q.focus(); });

/* Réglages */
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

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
$('#recenter').addEventListener('click', () => {
  if (state.user) map.flyTo(state.user.ll, Math.max(map.getZoom(), 16), { duration: .8 });
  else toast('Position inconnue : touchez la carte pour placer votre repère.');
});
$('#fitNet').addEventListener('click', () => {
  const pts = stationList().filter(isVisible).map(s => s.ll);
  if (pts.length) map.flyToBounds(L.latLngBounds(pts), { paddingTopLeft: [isDesk() ? 440 : 20, 150], paddingBottomRight: [20, isDesk() ? 40 : sheetVisible() + 20], duration: .9 });
});

/* =========================================================
   Mises à jour automatiques (service worker + version.json)
   ========================================================= */
let swReg = null, reloading = false, bootedAt = Date.now();
async function readVersion() {
  try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch (_) { return null; }
}
function showVersion() {
  const v = state.version;
  $('#versionTxt').textContent = v ? `v${v.version}${v.build && v.build !== '__BUILD__' ? ' (' + String(v.build).slice(0, 7) + ')' : ''}` : '';
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

$$('[data-icon]').forEach(el => { el.innerHTML = svg(el.dataset.icon, el.classList.contains('fab') ? 22 : 18); });
$$('[data-logo]').forEach(el => { el.innerHTML = LOGO; });
renderChips();
renderCadence();
applyZoomClasses();
if (state.dest) { $('#q').value = ''; }
layoutSheet();
requestAnimationFrame(() => { layoutSheet(); setSnap('mid'); });
renderGps();
startGps();
loadNetwork();
boot(false).then(() => { if (state.dest && state.stations[state.dest]) { $('#q').value = stName(state.dest); qClear.classList.remove('hidden'); } });
schedule();
initUpdates();
setTimeout(() => { if (!state.user) toast('Astuce : touchez la carte pour placer votre repère.'); }, 8000);

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
})();
