'use strict';
const APP_VERSION = '10';

const $ = (id) => document.getElementById(id);
const bike = new FtmsBike();
const DEFAULT_RANGE = { min: 1, max: 32, inc: 1 };
const range = () => bike.range || DEFAULT_RANGE;

// ---------- Almacenamiento local ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
const settings = Object.assign({ beep: true }, store.get('settings', {}));
// Los datos guardados se validan al leerlos: el almacenamiento de rodbcn.github.io
// lo comparten todas las webs de GitHub Pages de la cuenta.
const num = (x, lo, hi, d) => (Number.isFinite(+x) ? Math.min(hi, Math.max(lo, +x)) : d);
function cleanWorkout(w) {
  if (!w || typeof w !== 'object' || !Array.isArray(w.segs) || !w.segs.length) return null;
  const segs = w.segs.slice(0, 100).filter(Array.isArray).map(s => [num(s[0], 0.25, 240, 5), Math.round(num(s[1], 1, 100, 1))]);
  if (!segs.length) return null;
  return { id: String(w.id || 'c' + Date.now()).slice(0, 40), name: String(w.name || 'Mi entrenamiento').slice(0, 40),
    kind: 'scale', absolute: true, custom: true, segs };
}
const customWorkouts = () => { const c = store.get('custom', []); return Array.isArray(c) ? c.map(cleanWorkout).filter(Boolean) : []; };
const allWorkouts = () => BUILTIN.concat(customWorkouts());
// ---------- Usuarios ----------
function cleanUser(u) {
  if (!u || typeof u !== 'object') return null;
  const name = String(u.name ?? '').trim().slice(0, 20);
  if (!name) return null;
  return { id: String(u.id || 'u' + Date.now()).slice(0, 40), name,
    age: Math.round(num(u.age, 5, 100, 40)), weight: num(u.weight, 20, 250, 0), height: Math.round(num(u.height, 100, 230, 0)) };
}
const users = () => { const u = store.get('users', []); return Array.isArray(u) ? u.map(cleanUser).filter(Boolean) : []; };
function currentUser() {
  const all = users(), id = store.get('currentUser', null);
  return all.find(u => u.id === id) || all[0] || null;
}
// Pulso máximo por edad (Tanaka): 208 − 0,7 × edad. Ámbar desde el 85 %, rojo desde el 95 %.
function hrZones(age) {
  const max = Math.round(208 - 0.7 * age);
  return { max, amber: Math.round(max * 0.85), red: Math.round(max * 0.95) };
}
// ---------- Vídeos ----------
const YT_ID = /^[\w-]{11}$/;
function cleanVideo(v) {
  if (!v || typeof v !== 'object' || !YT_ID.test(String(v.id))) return null;
  return { id: String(v.id), title: String(v.title ?? '').trim().slice(0, 80) || 'Vídeo',
    min: num(v.min, 1, 240, 15), topic: VIDEO_TOPICS[v.topic] ? v.topic : 'otros',
    channel: String(v.channel ?? '').slice(0, 40), custom: !!v.custom };
}
function extractYouTubeId(text) {
  const s = String(text || '').trim();
  if (YT_ID.test(s)) return s;
  let u; try { u = new URL(s); } catch (e) { return null; }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v');
    const m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]{11})/);
    if (!id && m) id = m[2];
  }
  return id && YT_ID.test(id) ? id : null;
}
const customVideos = () => { const v = store.get('videos', []); return Array.isArray(v) ? v.map(x => cleanVideo({ ...x, custom: true })).filter(Boolean) : []; };
const allVideos = () => BUILTIN_VIDEOS.map(cleanVideo).filter(Boolean).concat(customVideos());
const fmtMin = (m) => fmt(Math.round(m * 60));
// Los que encajan con la duración del entreno (±3 min), del más cercano al más lejano; si no hay, todos.
function videosFor(minutes, topic) {
  let v = allVideos().filter(x => topic === 'all' || x.topic === topic);
  if (minutes) {
    const near = v.filter(x => Math.abs(x.min - minutes) <= 3);
    v = (near.length ? near : v).sort((a, b) => Math.abs(a.min - minutes) - Math.abs(b.min - minutes));
  }
  return v;
}
const minutesFor = (w) => { const d = store.get('durations', {}); const m = d && d[w.id]; return Number.isFinite(m) && m >= 5 && m <= 240 ? m : baseMinutes(w); };

// ---------- Utilidades UI ----------
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  window.scrollTo(0, 0);
  if (id === 'home') renderHome();
  if (id === 'history') { const u = currentUser(); histFilter = u ? u.id : 'all'; renderHistory(); }
  if (id === 'settings') renderSettings();
}
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => show(b.dataset.go)));

let toastT;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3000);
}

function drawBars(el, segs, w, opts = {}) {
  el.innerHTML = '';
  const total = segs.reduce((a, s) => a + s.sec, 0);
  const lv = segs.map(s => levelOf(w, s.level, range()));
  const mx = Math.max(...lv, 1);
  segs.forEach((s, i) => {
    const d = document.createElement('div');
    d.style.flex = s.sec;
    d.style.height = Math.max(8, lv[i] / mx * 100) + '%';
    if (opts.cur != null) d.className = i < opts.cur ? 'done' : i === opts.cur ? 'cur' : '';
    el.appendChild(d);
  });
  if (opts.at != null) {
    const n = document.createElement('div');
    n.className = 'now'; n.style.left = Math.min(100, opts.at / total * 100) + '%';
    el.appendChild(n);
  }
}

// ---------- Conexión ----------
function connLabel() {
  const b = $('connBtn');
  if (bike.connected) {
    b.className = 'conn on';
    b.textContent = `● Conectado a ${bike.device.name || 'bici'} · niveles ${range().min}–${range().max}`;
  } else if (connecting) {
    b.className = 'conn wait'; b.textContent = 'Conectando…';
  } else {
    b.className = 'conn off'; b.textContent = 'Conectar bici';
  }
  const rc = $('rConn');
  // El nombre lo anuncia el dispositivo Bluetooth: nunca como HTML.
  const dot = document.createElement('span'); dot.className = bike.connected ? 'dot' : 'dot bad';
  rc.replaceChildren(dot, bike.connected ? (bike.device.name || 'Bici') : (connecting ? 'Conectando…' : 'Sin bici · toca'));
}
let connecting = false;

function browserProblem() {
  const ua = navigator.userAgent;
  if (!window.isSecureContext) return 'La página no se abrió con https.';
  if (/SamsungBrowser/i.test(ua)) return 'Estás en Samsung Internet, que no permite Bluetooth. Abre el enlace en Chrome.';
  if (/FBAN|FBAV|Instagram|WhatsApp|; wv\)/i.test(ua)) return 'Estás en el navegador interno de otra app. Abre el enlace en Chrome.';
  if (!navigator.bluetooth) return 'Este navegador no permite Bluetooth. Abre el enlace en Chrome.';
  return null;
}

// Al tocar: siempre abre el selector de Chrome (necesita el gesto del usuario).
async function connectBike() {
  if (bike.connected && !bike.needRechoose) return;
  if (bike.connected) await bike.disconnect();
  bike.needRechoose = false;
  const p = browserProblem();
  if (p) { setConnMsg(p); toast(p); return; }
  setConnMsg('');
  connecting = true; connLabel();
  try {
    await bike.choose();
  } catch (e) {
    bike._log('Error al conectar: ' + e.name + ' ' + e.message);
    const m = e.name === 'NotFoundError' && /cancel/i.test(e.message) ? 'Búsqueda cancelada'
      : 'No se pudo conectar: ' + (e.message || e.name);
    setConnMsg(m); toast(m);
  }
  connecting = false; connLabel();
}
function setConnMsg(m) { const el = $('connMsg'); el.textContent = m; el.hidden = !m; }
$('connBtn').addEventListener('click', connectBike);
$('rConn').addEventListener('click', connectBike);

bike.addEventListener('connected', () => {
  connecting = false; connLabel();
  if ($('home').classList.contains('active')) renderHome();
  if (ride && !ride.paused) bike.setLevel(currentTarget()).catch(() => {});
});
bike.addEventListener('range', () => { connLabel(); if ($('home').classList.contains('active')) renderHome(); });
bike.addEventListener('disconnected', () => { connLabel(); if (ride) toast('Bici desconectada, reintentando…'); });

bike.addEventListener('log', () => { if ($('settings').classList.contains('active')) $('sLog').textContent = bike.log.join('\n'); });

// ---------- Inicio ----------
function renderHome() {
  connLabel();
  renderUserRow();
  const list = $('workoutList'); list.innerHTML = '';
  allWorkouts().forEach(w => {
    const min = minutesFor(w);
    const b = document.createElement('button');
    b.className = 'w';
    b.innerHTML = `<div class="t"></div><div class="d"></div><div class="mini"></div>`;
    b.querySelector('.t').textContent = `${w.name} ${min}'`;
    b.querySelector('.d').textContent = describe(w, min, range());
    const segs = buildSegments(w, min);
    const lv = segs.map(s => levelOf(w, s.level, range())); const mx = Math.max(...lv, 1);
    segs.forEach((s, i) => { const d = document.createElement('div'); d.style.flex = s.sec; d.style.height = Math.max(10, lv[i] / mx * 100) + '%'; b.querySelector('.mini').appendChild(d); });
    b.addEventListener('click', () => openDetail(w));
    list.appendChild(b);
  });
}
function chip(text, on, extra) {
  const c = document.createElement('button');
  c.className = 'uchip' + (on ? ' on' : '') + (extra ? ' ' + extra : '');
  c.textContent = text; return c;
}
function renderUserRow() {
  const row = $('userRow'), cur = currentUser();
  row.replaceChildren();
  users().forEach(u => {
    const c = chip(u.name, cur && u.id === cur.id);
    // Tocar elige; tocar el ya elegido o mantener pulsado abre su ficha.
    c.addEventListener('click', () => { if (cur && u.id === cur.id) openUser(u); else { store.set('currentUser', u.id); renderUserRow(); } });
    c.addEventListener('contextmenu', (e) => { e.preventDefault(); openUser(u); });
    row.appendChild(c);
  });
  const add = chip('+ Usuario', false, 'add');
  add.addEventListener('click', () => openUser(null));
  row.appendChild(add);
}
function needUser() {
  if (currentUser()) return false;
  toast('Primero crea tu usuario'); openUser(null); return true;
}

// ---------- Ficha de usuario ----------
let editingUser = null;
function openUser(u) {
  editingUser = u;
  const first = !users().length;
  $('uTitle').textContent = u ? u.name : 'Nuevo usuario';
  $('uHint').hidden = !(first && historyList().length);
  $('uName').value = u ? u.name : '';
  $('uAge').value = u ? u.age : '';
  $('uWeight').value = u && u.weight ? u.weight : '';
  $('uHeight').value = u && u.height ? u.height : '';
  $('uDelete').hidden = !u;
  renderUserHr(); show('user');
}
function renderUserHr() {
  const age = +$('uAge').value, box = $('uHr');
  if (!(age >= 5 && age <= 100)) { box.textContent = ''; return; }
  const z = hrZones(age), b = (t) => { const x = document.createElement('b'); x.textContent = t; return x; };
  box.replaceChildren('Pulso máximo estimado ', b(z.max), document.createElement('br'), 'ámbar desde ', b(z.amber), ' · rojo desde ', b(z.red));
}
$('uAge').addEventListener('input', renderUserHr);
$('uSave').addEventListener('click', () => {
  const name = $('uName').value.trim(), age = +$('uAge').value;
  if (!name) { toast('Pon un nombre'); return; }
  if (!(age >= 5 && age <= 100)) { toast('Pon una edad entre 5 y 100'); return; }
  const all = users();
  if (all.some(x => x.name.toLowerCase() === name.toLowerCase() && (!editingUser || x.id !== editingUser.id))) { toast('Ya hay un usuario con ese nombre'); return; }
  const u = cleanUser({ id: editingUser ? editingUser.id : 'u' + Date.now(), name, age, weight: $('uWeight').value, height: $('uHeight').value });
  const i = all.findIndex(x => x.id === u.id);
  if (i >= 0) all[i] = u; else all.push(u);
  if (!editingUser && all.length === 1) {
    // Primer usuario: se queda con el historial que había antes de existir usuarios.
    store.set('history', historyList().map(e => (e.user ? e : { ...e, user: u.id })));
  }
  store.set('users', all);
  if (!editingUser) store.set('currentUser', u.id);
  toast('Guardado'); show('home');
});
$('uDelete').addEventListener('click', () => {
  const u = editingUser; if (!u) return;
  const n = historyList().filter(e => e.user === u.id).length;
  if (!confirm(`¿Borrar a ${u.name}${n ? ` y sus ${n} entrenamientos del historial` : ''}?`)) return;
  store.set('users', users().filter(x => x.id !== u.id));
  store.set('history', historyList().filter(e => e.user !== u.id));
  if (store.get('currentUser', null) === u.id) { const r = users()[0]; store.set('currentUser', r ? r.id : null); }
  show('home');
});

// ---------- Pantalla de vídeos (ver la lista, o elegir uno para el entreno) ----------
let vPick = null, vTopic = 'all';  // vPick: { minutes } cuando se elige para un entreno
function openVideos(pick) {
  vPick = pick; vTopic = 'all';
  $('vTitle').textContent = pick ? `Elige un vídeo (${pick.minutes} min)` : 'Vídeos';
  $('vBack').textContent = pick ? '‹ Volver' : '‹ Entrenamientos';
  $('vAddBtn').hidden = !!pick; $('vForm').hidden = true;
  renderVideos(); show('videos');
}
function videoCard(v, on) {
  const c = document.createElement('button'); c.className = 'vc' + (on ? ' on' : '');
  const th = document.createElement('div'); th.className = 'th';
  if (v) {
    const img = document.createElement('img'); img.loading = 'lazy'; img.alt = '';
    img.src = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`; img.onerror = () => img.remove();
    const b = document.createElement('span'); b.textContent = fmtMin(v.min);
    th.append(img, b);
  } else { const b = document.createElement('span'); b.textContent = '—'; th.append(b); }
  const info = document.createElement('div'); info.className = 'info';
  const t = document.createElement('div'); t.className = 't'; t.textContent = v ? v.title : 'Sin vídeo';
  const d = document.createElement('div'); d.className = 'd';
  d.textContent = v ? `${VIDEO_TOPICS[v.topic]} · ${v.custom ? 'Añadido por ti' : v.channel}` : 'Solo el entreno';
  info.append(t, d); c.append(th, info);
  return c;
}
function renderVideos() {
  const tb = $('vTopics'); tb.replaceChildren();
  const topics = ['all'].concat(Object.keys(VIDEO_TOPICS).filter(k => allVideos().some(v => v.topic === k)));
  topics.forEach(k => {
    const c = chip(k === 'all' ? 'Todos' : VIDEO_TOPICS[k], k === vTopic);
    c.addEventListener('click', () => { vTopic = k; renderVideos(); });
    tb.appendChild(c);
  });
  const list = $('vList'); list.replaceChildren();
  if (vPick) {
    const none = videoCard(null, !selVideo);
    none.addEventListener('click', () => { selVideo = null; openDetail(sel, true); });
    list.appendChild(none);
  }
  const vids = videosFor(vPick ? vPick.minutes : null, vTopic);
  if (!vids.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'No hay vídeos'; list.appendChild(e); }
  vids.forEach(v => {
    const c = videoCard(v, vPick && selVideo && selVideo.id === v.id);
    if (vPick) c.addEventListener('click', () => { selVideo = v; openDetail(sel, true); });
    if (!vPick && v.custom) {
      const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕';
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm(`¿Quitar «${v.title}»?`)) return;
        store.set('videos', customVideos().filter(y => y.id !== v.id)); renderVideos();
      });
      c.appendChild(x);
    }
    list.appendChild(c);
  });
}
$('videosBtn').addEventListener('click', () => openVideos(null));
$('vBack').addEventListener('click', () => { if (vPick) openDetail(sel, true); else show('home'); });
$('vAddBtn').addEventListener('click', () => { $('vForm').hidden = false; $('vUrl').focus(); });
$('vSave').addEventListener('click', () => {
  const id = extractYouTubeId($('vUrl').value);
  if (!id) { toast('Ese enlace no es de un vídeo de YouTube'); return; }
  const min = +$('vMin').value;
  if (!(min >= 1 && min <= 240)) { toast('Pon la duración en minutos'); return; }
  const v = cleanVideo({ id, title: $('vName').value, min, topic: $('vTopic').value, custom: true });
  const list = customVideos().filter(x => x.id !== id); list.push(v);
  store.set('videos', list.map(({ custom, ...x }) => x));
  ['vUrl', 'vName', 'vMin'].forEach(k => { $(k).value = ''; });
  $('vForm').hidden = true; toast('Vídeo añadido'); renderVideos();
});

$('newWorkoutBtn').addEventListener('click', () => openEditor(null));
$('freeRideBtn').addEventListener('click', () => { if (!needUser()) startRide(null, 0); });

// ---------- Elegir duración ----------
let sel = null, selMin = 30, selVideo = null;
function openDetail(w, keep) {
  if (!keep) { selVideo = null; selMin = minutesFor(w); }
  sel = w;
  $('dTitle').textContent = w.name;
  $('dEdit').hidden = !w.custom;
  renderDetail(); show('detail');
}
function renderDetail() {
  const chips = $('dChips'); chips.innerHTML = '';
  [15, 20, 30, 45, 60].forEach(m => {
    const c = document.createElement('button');
    c.className = 'chip' + (m === selMin ? ' on' : ''); c.textContent = m + "'";
    c.addEventListener('click', () => { selMin = m; renderDetail(); });
    chips.appendChild(c);
  });
  $('dVal').textContent = selMin + ' min';
  const segs = buildSegments(sel, selMin);
  drawBars($('dBars'), segs, sel);
  $('dCount').textContent = segs.length + ' tramos';
  $('dEnd').textContent = fmt(selMin * 60);
  $('dVideoName').textContent = selVideo ? `${selVideo.title} · ${fmtMin(selVideo.min)}` : 'Ninguno';
  const list = $('dList'); list.innerHTML = '';
  const row = (a, b) => { const d = document.createElement('div'); d.innerHTML = '<span></span><b></b>'; d.firstChild.textContent = a; d.lastChild.textContent = b; list.appendChild(d); };
  const L = (l) => levelOf(sel, l, range());
  if (sel.kind === 'interval') {
    const reps = segs.filter(s => s.label.startsWith('Esfuerzo')).length;
    row(`Calentamiento · nivel ${L(sel.warm[1])}`, fmt(segs[0].sec));
    row(`${reps} × (${fmt(sel.work[0] * 60)} nivel ${L(sel.work[1])} / ${fmt(sel.rest[0] * 60)} nivel ${L(sel.rest[1])})`, fmt(reps * (sel.work[0] + sel.rest[0]) * 60));
    row(`Vuelta a la calma · nivel ${L(sel.cool[1])}`, fmt(segs[segs.length - 1].sec));
  } else {
    segs.forEach((s, i) => row(`${i + 1}. ${s.label === `Tramo ${i + 1}` ? 'Tramo' : s.label} · nivel ${L(s.level)}`, fmt(s.sec)));
  }
}
$('dMinus').addEventListener('click', () => { selMin = Math.max(5, selMin - 5); renderDetail(); });
$('dPlus').addEventListener('click', () => { selMin = Math.min(120, selMin + 5); renderDetail(); });
$('dEdit').addEventListener('click', () => openEditor(sel));
$('dVideo').addEventListener('click', () => openVideos({ minutes: selMin }));
$('dStart').addEventListener('click', () => {
  if (needUser()) return;
  const d = store.get('durations', {}); d[sel.id] = selMin; store.set('durations', d);
  startRide(sel, selMin, selVideo);
});

// ---------- Sonido y pantalla ----------
let audio;
function beep(freq = 880, ms = 150) {
  if (!settings.beep) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(audio.destination);
    g.gain.setValueAtTime(0.25, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + ms / 1000);
    o.start(); o.stop(audio.currentTime + ms / 1000);
  } catch (e) {}
}
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (ride && document.visibilityState === 'visible') keepAwake(); });

// ---------- Entrenando ----------
let ride = null, tick = null;

// El vídeo va en un iframe de youtube-nocookie y se controla con postMessage (sin scripts externos).
const YT_ORIGIN = 'https://www.youtube-nocookie.com';
function setVideo(v) {
  const box = $('rVideo'); box.replaceChildren();
  box.hidden = !v; $('ride').classList.toggle('withvideo', !!v);
  if (!v) return;
  const f = document.createElement('iframe');
  f.src = `${YT_ORIGIN}/embed/${v.id}?enablejsapi=1&playsinline=1&autoplay=1&rel=0&origin=${encodeURIComponent(location.origin)}`;
  f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  f.title = v.title; f.referrerPolicy = 'strict-origin-when-cross-origin';
  box.appendChild(f);
}
function videoCmd(func) {
  const f = $('rVideo').querySelector('iframe');
  if (f && f.contentWindow) f.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), YT_ORIGIN);
}

function startRide(w, minutes, video) {
  const segs = w ? buildSegments(w, minutes).map(s => ({ ...s, lvl: levelOf(w, s.level, range()) })) : null;
  const user = currentUser();
  ride = {
    user, zones: hrZones(user.age), hrZone: '', video: video || null,
    w, segs, total: segs ? minutes * 60 : null,
    elapsed: 0, last: performance.now(), paused: false, segIdx: -1, adj: 0,
    freeLevel: mapLevel(8, range()),
    live: {}, dist: 0, kcal: 0, lastDist: null, lastKcal: null, bikeKcal: false, bikeDist: false,
    powSum: 0, cadSum: 0, hrSum: 0, n: 0, hrN: 0, maxPow: 0, startedAt: new Date(),
  };
  beep(660, 1);
  $('rName').textContent = w ? `${w.name} ${minutes}'` : 'Rodar libre';
  $('rProf').hidden = !segs;
  $('pauseSheet').hidden = true;
  $('pauseBtn').textContent = '❚❚ Pausa';
  ['mPow', 'mCad', 'mSpd', 'mDist', 'mKcal', 'mHr'].forEach(id => { $(id).textContent = '–'; });
  $('mHrBox').className = 'm';
  setVideo(video || null);
  if (!bike.connected) toast('Bici sin conectar: toca arriba a la izquierda');
  else bike.start().catch(() => {});
  keepAwake();
  show('ride'); connLabel();
  clearInterval(tick); tick = setInterval(loop, 250); loop();
}

function currentTarget() {
  if (!ride) return null;
  if (!ride.segs) return bike.clampLevel(ride.freeLevel);
  const s = ride.segs[Math.max(0, ride.segIdx)];
  return bike.clampLevel(s.lvl + ride.adj);
}

function segAt(t) {
  let acc = 0;
  for (let i = 0; i < ride.segs.length; i++) { acc += ride.segs[i].sec; if (t < acc) return { i, end: acc }; }
  return { i: ride.segs.length - 1, end: acc };
}

let lastSent = null;
function sendLevel() {
  const l = currentTarget();
  if (l == null || !bike.connected || l === lastSent) return;
  lastSent = l;
  bike.setLevel(l).then(ok => { if (!ok) { lastSent = null; } }).catch(() => { lastSent = null; });
}

function loop() {
  if (!ride) return;
  const now = performance.now(), dt = (now - ride.last) / 1000; ride.last = now;
  if (!ride.paused) {
    ride.elapsed += dt;
    const L = ride.live;
    if (L.cadence > 0) {
      ride.n += dt; ride.powSum += (L.power || 0) * dt; ride.cadSum += L.cadence * dt;
      if (!ride.bikeDist && L.speed != null) ride.dist += L.speed / 3.6 * dt;
      if (!ride.bikeKcal && L.power != null) ride.kcal += L.power * dt / 1000; // kJ ≈ kcal con ~24 % eficiencia
    }
    if (L.hr > 0) { ride.hrSum += L.hr * dt; ride.hrN += dt; }
  }
  const t = ride.elapsed;

  if (ride.segs) {
    if (t >= ride.total) { finishRide(true); return; }
    const { i, end } = segAt(t);
    if (i !== ride.segIdx) {
      const first = ride.segIdx === -1;
      ride.segIdx = i; ride.adj = 0; lastSent = null;
      if (!first) { beep(990, 300); if (navigator.vibrate) navigator.vibrate(200); }
    }
    const left = end - t;
    if (!ride.paused && left < 3.2 && Math.floor(left) !== ride.lastCount) { ride.lastCount = Math.floor(left); if (left > 0.2) beep(660, 90); }
    const s = ride.segs[i], nx = ride.segs[i + 1];
    $('rSegLabel').textContent = (s.label.startsWith('Tramo') ? '' : s.label + ' · ') + `tramo ${i + 1} de ${ride.segs.length} · nivel`;
    $('rCd').textContent = fmt(left);
    $('rTot').textContent = 'total ' + fmt(t);
    if (nx) { const b = document.createElement('b'); b.textContent = `nivel ${bike.clampLevel(nx.lvl)} · ${fmt(nx.sec)}`; $('rNext').replaceChildren('Siguiente: ', b); }
    else $('rNext').textContent = 'Último tramo';
    drawBars($('rBars'), ride.segs.map(x => ({ sec: x.sec, level: x.lvl })), { absolute: true }, { cur: i, at: t });
    $('rLeft').textContent = 'quedan ' + fmt(ride.total - t);
    $('rEnd').textContent = fmt(ride.total);
  } else {
    $('rSegLabel').textContent = 'Rodar libre · nivel';
    $('rCd').textContent = fmt(t);
    $('rTot').textContent = '';
    $('rNext').textContent = '';
  }
  const target = currentTarget();
  $('rLvl').textContent = target;
  $('rLvlMax').textContent = ' / ' + range().max;
  const bl = bike.levelFromRaw(ride.live.resistance);
  if (bike.connected && bl != null && bl !== target && ride.sinceSet > 4) { const w = document.createElement('span'); w.className = 'warn'; w.textContent = ` · la bici marca ${bl}`; $('rNext').append(' ', w); }
  ride.sinceSet = (target === ride.prevTarget ? (ride.sinceSet || 0) + dt : 0); ride.prevTarget = target;
  if (!ride.paused) sendLevel();
}

bike.addEventListener('data', (ev) => {
  if (!ride) return;
  const r = ev.detail, L = ride.live;
  Object.assign(L, r);
  if (r.distance != null) {
    ride.bikeDist = true;
    if (ride.lastDist != null && r.distance >= ride.lastDist) ride.dist += r.distance - ride.lastDist;
    ride.lastDist = r.distance;
  }
  if (r.kcal != null) {
    if (ride.lastKcal != null && r.kcal >= ride.lastKcal) { ride.kcal += r.kcal - ride.lastKcal; }
    if (r.kcal > 0) ride.bikeKcal = true;
    ride.lastKcal = r.kcal;
  }
  if (r.power != null) { $('mPow').textContent = Math.max(0, r.power); ride.maxPow = Math.max(ride.maxPow, r.power); }
  if (r.cadence != null) $('mCad').textContent = Math.round(r.cadence);
  if (r.speed != null) $('mSpd').textContent = r.speed.toFixed(1);
  $('mDist').textContent = (ride.dist / 1000).toFixed(2);
  $('mKcal').textContent = Math.round(ride.kcal);
  $('mHr').textContent = L.hr > 0 ? L.hr : '–';
  setHrZone(L.hr);
});

// Color del pulso. Para no parpadear en el límite, solo baja de zona 3 ppm por debajo.
function setHrZone(hr) {
  const z = ride.zones, cur = ride.hrZone;
  let next = '';
  if (hr > 0) {
    if (hr >= z.red || (cur === 'red' && hr > z.red - 3)) next = 'red';
    else if (hr >= z.amber || (cur && hr > z.amber - 3)) next = 'amber';
  }
  if (next !== cur) { ride.hrZone = next; $('mHrBox').className = 'm' + (next ? ' ' + next : ''); }
}

function nudge(d) {
  if (!ride) return;
  if (ride.segs) ride.adj += d; else ride.freeLevel = bike.clampLevel(ride.freeLevel + d);
  // Que el ajuste no se salga del rango.
  if (ride.segs) { const s = ride.segs[Math.max(0, ride.segIdx)]; ride.adj = bike.clampLevel(s.lvl + ride.adj) - s.lvl; }
  loop();
}
$('lvlUp').addEventListener('click', () => nudge(+1));
$('lvlDown').addEventListener('click', () => nudge(-1));

$('pauseBtn').addEventListener('click', () => {
  if (!ride) return;
  ride.paused = true; $('pauseSheet').hidden = false; videoCmd('pauseVideo');
  if (bike.connected) Promise.resolve(bike.pause()).catch(() => {});
});
$('resumeBtn').addEventListener('click', () => {
  ride.paused = false; ride.last = performance.now(); lastSent = null;
  if (bike.connected) Promise.resolve(bike.resume()).catch(() => {});
  $('pauseSheet').hidden = true; videoCmd('playVideo'); loop();
});
$('finishBtn').addEventListener('click', () => finishRide(true));
$('discardBtn').addEventListener('click', () => { if (confirm('¿Descartar este entrenamiento?')) finishRide(false); });

function finishRide(save) {
  clearInterval(tick); tick = null;
  const r = ride; ride = null; lastSent = null;
  if (bike.connected) Promise.resolve(bike.stop()).catch(() => {});
  $('pauseSheet').hidden = true;
  setVideo(null);
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  if (!save || !r || r.elapsed < 30) { show('home'); if (save) toast('Demasiado corto para guardarlo'); return; }
  beep(1200, 500);
  const entry = {
    user: r.user ? r.user.id : '', date: r.startedAt.toISOString(), name: r.w ? r.w.name : 'Rodar libre',
    sec: Math.round(r.elapsed), km: +(r.dist / 1000).toFixed(2), kcal: Math.round(r.kcal),
    avgW: r.n ? Math.round(r.powSum / r.n) : 0, maxW: Math.max(0, r.maxPow),
    avgRpm: r.n ? Math.round(r.cadSum / r.n) : 0, avgHr: r.hrN ? Math.round(r.hrSum / r.hrN) : 0,
    video: r.video ? r.video.title : '',
  };
  const h = historyList(); h.unshift(entry); store.set('history', h.slice(0, 500));
  const g = $('sumGrid'); g.innerHTML = '';
  [['Tiempo', fmt(entry.sec), ''], ['Distancia', entry.km.toFixed(2), 'km'], ['Calorías', entry.kcal, 'kcal'],
   ['Potencia media', entry.avgW, 'W'], ['Potencia máx.', entry.maxW, 'W'], ['Cadencia media', entry.avgRpm, 'rpm']]
    .concat(entry.avgHr ? [['Pulso medio', entry.avgHr, 'ppm']] : [])
    .forEach(([l, v, u]) => { const d = document.createElement('div'); d.className = 'm'; const el = (c, t) => { const x = document.createElement(c === 'u' ? 'span' : 'div'); x.className = c; x.textContent = t; return x; }; const vv = el('v', v + ' '); vv.append(el('u', u)); d.append(el('l', l), vv); g.appendChild(d); });
  show('summary');
}

// ---------- Historial ----------
function historyList() {
  const h = store.get('history', []);
  return Array.isArray(h) ? h.filter(e => e && typeof e === 'object').map(e => ({
    user: String(e.user ?? '').slice(0, 40), date: String(e.date), name: String(e.name ?? '').slice(0, 40), sec: num(e.sec, 0, 1e6, 0), km: num(e.km, 0, 1e4, 0),
    kcal: num(e.kcal, 0, 1e5, 0), avgW: num(e.avgW, 0, 5000, 0), maxW: num(e.maxW, 0, 5000, 0),
    avgRpm: num(e.avgRpm, 0, 500, 0), avgHr: num(e.avgHr, 0, 300, 0), video: String(e.video ?? '').slice(0, 80),
  })) : [];
}
let histFilter = 'all';
function renderHistory() {
  const all = users(), names = Object.fromEntries(all.map(u => [u.id, u.name]));
  const fb = $('histFilter'); fb.replaceChildren();
  if (!all.some(u => u.id === histFilter)) histFilter = 'all';
  [['all', 'Todos']].concat(all.map(u => [u.id, u.name])).forEach(([id, label]) => {
    const c = chip(label, id === histFilter);
    c.addEventListener('click', () => { histFilter = id; renderHistory(); });
    fb.appendChild(c);
  });
  fb.hidden = all.length < 2;
  const list = $('histList'); list.innerHTML = '';
  const h = historyList();
  const shown = h.map((e, idx) => [e, idx]).filter(([e]) => histFilter === 'all' || e.user === histFilter);
  if (!shown.length) { list.innerHTML = '<div class="empty">Aún no hay entrenamientos</div>'; return; }
  shown.forEach(([e, idx]) => {
    const d = document.createElement('div'); d.className = 'h';
    const date = new Date(e.date).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    d.innerHTML = '<div class="t"></div><div class="d"></div>';
    d.querySelector('.t').textContent = `${e.name} · ${fmt(e.sec)}`;
    const d2 = d.querySelector('.d');
    if (names[e.user]) { const w = document.createElement('span'); w.className = 'who'; w.textContent = names[e.user]; d2.append(w); }
    d2.append(`${date} · ${e.km.toFixed(2)} km · ${e.kcal} kcal · ${e.avgW} W med · ${e.avgRpm} rpm${e.avgHr ? ' · ❤ ' + e.avgHr : ''}${e.video ? ' · 🎬 ' + e.video : ''}`);
    d.addEventListener('click', () => {
      if (confirm('¿Borrar este entrenamiento del historial?')) { h.splice(idx, 1); store.set('history', h); renderHistory(); }
    });
    list.appendChild(d);
  });
}

// ---------- Editor ----------
let editing = null, eSegs = [];
function openEditor(w) {
  editing = w;
  $('eTitle').textContent = w ? 'Editar entrenamiento' : 'Nuevo entrenamiento';
  $('eName').value = w ? w.name : '';
  const mid = Math.round((range().min + range().max) / 2);
  eSegs = w ? w.segs.map(s => [...s]) : [[5, Math.round(mid / 2)], [10, mid], [5, Math.round(mid / 2)]];
  $('eDelete').hidden = !w;
  renderEditor(); show('editor');
}
function renderEditor() {
  const box = $('eSegs'); box.innerHTML = '';
  eSegs.forEach((s, i) => {
    const d = document.createElement('div'); d.className = 'seged';
    d.innerHTML = `<span class="n">${i + 1}</span><input type="number" min="0.25" step="0.25" inputmode="decimal"> min · nivel <input type="number" min="${range().min}" max="${range().max}" inputmode="numeric"><button class="x">✕</button>`;
    const [mi, li] = d.querySelectorAll('input');
    mi.value = s[0]; li.value = s[1];
    mi.addEventListener('change', () => { s[0] = Math.max(0.25, +mi.value || 1); renderEditorBars(); });
    li.addEventListener('change', () => { s[1] = bike.clampLevel(+li.value || 1); li.value = s[1]; renderEditorBars(); });
    d.querySelector('.x').addEventListener('click', () => { if (eSegs.length > 1) { eSegs.splice(i, 1); renderEditor(); } });
    box.appendChild(d);
  });
  renderEditorBars();
}
function renderEditorBars() {
  const segs = eSegs.map(s => ({ sec: s[0] * 60, level: s[1] }));
  drawBars($('eBars'), segs, { absolute: true });
  $('eInfo').textContent = `${eSegs.length} tramos · ${fmt(segs.reduce((a, s) => a + s.sec, 0))}`;
}
$('eAdd').addEventListener('click', () => { const l = eSegs[eSegs.length - 1]; eSegs.push(l ? [...l] : [5, 8]); renderEditor(); });
$('eSave').addEventListener('click', () => {
  const name = $('eName').value.trim() || 'Mi entrenamiento';
  const custom = customWorkouts();
  const w = { id: editing ? editing.id : 'c' + Date.now(), name, kind: 'scale', absolute: true, custom: true, segs: eSegs };
  const i = custom.findIndex(x => x.id === w.id);
  if (i >= 0) custom[i] = w; else custom.push(w);
  store.set('custom', custom);
  const d = store.get('durations', {}); delete d[w.id]; store.set('durations', d);
  toast('Guardado'); show('home');
});
$('eDelete').addEventListener('click', () => {
  if (!editing || !confirm('¿Borrar este entrenamiento?')) return;
  store.set('custom', customWorkouts().filter(x => x.id !== editing.id));
  show('home');
});

// ---------- Ajustes ----------
let testLvl = 5;
function renderSettings() {
  $('sBeep').checked = settings.beep;
  const lines = bike.device ? [
    `Bici: ${bike.device.name || '?'} (${bike.connected ? 'conectada' : 'desconectada'})`,
    bike.info.fabricante && `Fabricante: ${bike.info.fabricante}`, bike.info.modelo && `Modelo: ${bike.info.modelo}`,
    bike.info.firmware && `Firmware: ${bike.info.firmware}`,
    `Niveles: ${range().min}–${range().max}` + (bike.rangeRaw ? ` (bruto ${bike.rangeRaw.min}..${bike.rangeRaw.max}, paso ${bike.rangeRaw.inc})` : ''),
    `Control: ${bike.mode === 'ic' ? 'iConsole (0xFFF0)' : bike.mode === 'sim' ? 'pendiente simulada (FTMS)' : 'nivel FTMS (' + bike.resFormat + ')'}`,
    bike.ic && `iConsole: ${bike.ic.ready ? 'listo' : 'esperando respuesta'} · cliente ${bike.ic.cid} · tipo ${bike.ic.mid} · máx ${bike.ic.maxLevel ?? '–'} · nivel ${bike.ic.level ?? '–'} · ${bike.ic.running ? 'en marcha' : 'parado'}`,
    bike.ic && bike.ic.lastRx && `Última trama iConsole: ${bike.ic.lastRx}`,
    bike.mode === 'sim' && `Objetivo ${bike.target ?? '–'} · bici marca ${bike.curLevel ?? '–'} · pendiente ${bike.grade ?? '–'} %`,
    bike.mode === 'sim' && `Tabla aprendida: ${JSON.stringify(JSON.parse(localStorage.getItem('gradeMap') || '{}'))}`,
    bike.info.feature && `Features: ${bike.info.feature}`,
    bike.lastRaw && `Último dato: ${bike.lastRaw}`,
  ].filter(Boolean).join('\n') : 'Sin conectar';
  $('sDiag').textContent = `Versión ${APP_VERSION}\nNavegador: ${navigator.userAgent}\nBluetooth web: ${navigator.bluetooth ? 'sí' : 'NO'}\n` + lines;
  $('sLog').textContent = bike.log.join('\n');
  $('tVal').textContent = testLvl;
}
$('sBeep').addEventListener('change', (e) => { settings.beep = e.target.checked; store.set('settings', settings); });
$('tMinus').addEventListener('click', () => { testLvl = bike.clampLevel(testLvl - 1); $('tVal').textContent = testLvl; });
$('tPlus').addEventListener('click', () => { testLvl = bike.clampLevel(testLvl + 1); $('tVal').textContent = testLvl; });
$('tSend').addEventListener('click', async () => {
  if (!bike.connected) { toast('Conecta primero la bici'); return; }
  const ok = await bike.setLevel(testLvl);
  toast(!ok ? 'La bici no aceptó el nivel (mira el registro)'
    : bike.mode === 'sim' ? `Buscando nivel ${testLvl}… mira «bici marca» arriba` : `Nivel ${testLvl} enviado`);
  renderSettings();
});
$('tCal').addEventListener('click', async () => {
  if (!bike.connected) { toast('Conecta primero la bici'); return; }
  if (bike.mode !== 'sim') { toast('Con el control actual no hace falta calibrar'); return; }
  const b = $('tCal'); b.disabled = true; b.textContent = 'Calibrando…';
  bike._log('Inicio de calibración (pedalea suave)');
  try { await bike.calibrate((g) => { b.textContent = `Calibrando… ${g} %`; }); }
  catch (e) { bike._log('Error calibrando: ' + e.message); }
  b.textContent = 'Calibrar (≈1 min)'; b.disabled = false; toast('Calibración terminada'); renderSettings();
});
setInterval(() => { if ($('settings').classList.contains('active')) renderSettings(); }, 1000);

// ---------- Arranque ----------
renderHome();
if (!users().length) openUser(null);
// Reconexión silenciosa a la última bici (no bloquea el botón).
if (FtmsBike.supported()) bike.tryRemembered().catch(() => {}).finally(() => {
  connecting = false; connLabel();
  if (bike.needRechoose) setConnMsg('Toca «Conectar bici» y vuelve a elegir la bici para dar permiso al canal de control de resistencia.');
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
