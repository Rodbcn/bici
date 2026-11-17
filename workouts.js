// Entrenamientos y su adaptación a la duración elegida.
// Los niveles se escriben en una escala de referencia 1–32 y se adaptan al rango real de la bici.
'use strict';

const REF_MAX = 32;

const BUILTIN = [
  { id: 'piramide', name: 'Pirámide', kind: 'scale',
    segs: [[3, 6], [3, 8], [3, 10], [3, 14], [3, 16], [3, 14], [4, 10], [4, 8], [4, 6]] },
  { id: 'intervalos', name: 'Intervalos 1:1', kind: 'interval',
    warm: [4, 5], work: [1, 15], rest: [1, 6], reps: 8, cool: [5, 5] },
  { id: 'subida', name: 'Subida progresiva', kind: 'scale',
    segs: [[4, 5], [4, 7], [4, 9], [4, 11], [4, 13], [4, 15], [4, 17], [4, 19], [4, 20], [4, 8]] },
  { id: 'colinas', name: 'Colinas', kind: 'scale',
    segs: [[4, 6], [3, 13], [2, 8], [3, 15], [2, 8], [3, 17], [2, 8], [3, 15], [2, 8], [3, 13], [3, 6]] },
  { id: 'fondo', name: 'Fondo suave', kind: 'scale',
    segs: [[5, 6], [35, 10], [5, 6]] },
];

function baseMinutes(w) {
  if (w.kind === 'interval') return w.warm[0] + w.reps * (w.work[0] + w.rest[0]) + w.cool[0];
  return w.segs.reduce((a, s) => a + s[0], 0);
}

const round15 = (s) => Math.max(15, Math.round(s / 15) * 15);

// Devuelve [{sec, level, label}] con la duración total pedida (minutos).
function buildSegments(w, minutes) {
  const total = minutes * 60;
  if (w.kind === 'interval') {
    const cycle = (w.work[0] + w.rest[0]) * 60;
    const f = minutes / baseMinutes(w);
    let warm = Math.min(300, Math.max(120, round15(w.warm[0] * 60 * f)));
    let cool = Math.min(300, Math.max(120, round15(w.cool[0] * 60 * f)));
    const reps = Math.max(1, Math.floor((total - warm - cool) / cycle));
    const left = total - warm - cool - reps * cycle;
    warm += Math.round(left / 2 / 15) * 15;
    cool = total - warm - reps * cycle;
    const out = [{ sec: warm, level: w.warm[1], label: 'Calentamiento' }];
    for (let i = 1; i <= reps; i++) {
      out.push({ sec: w.work[0] * 60, level: w.work[1], label: `Esfuerzo ${i}/${reps}` });
      out.push({ sec: w.rest[0] * 60, level: w.rest[1], label: `Descanso ${i}/${reps}` });
    }
    out.push({ sec: Math.max(15, cool), level: w.cool[1], label: 'Vuelta a la calma' });
    return out;
  }
  const f = total / (baseMinutes(w) * 60);
  const out = w.segs.map((s, i) => ({ sec: round15(s[0] * 60 * f), level: s[1], label: `Tramo ${i + 1}` }));
  // Ajuste para clavar la duración total.
  let diff = total - out.reduce((a, s) => a + s.sec, 0);
  while (diff !== 0) {
    const step = diff > 0 ? 15 : -15;
    const idx = out.reduce((bi, s, i) => (s.sec > out[bi].sec ? i : bi), 0);
    if (out[idx].sec + step < 15) break;
    out[idx].sec += step;
    diff -= step;
  }
  if (out.length) { out[0].label = 'Calentamiento'; if (out.length > 2) out[out.length - 1].label = 'Vuelta a la calma'; }
  return out;
}

// Escala de referencia → nivel real de la bici.
function mapLevel(ref, range) {
  if (!range) return ref;
  const v = range.min + (ref - 1) * (range.max - range.min) / (REF_MAX - 1);
  return Math.max(range.min, Math.min(range.max, Math.round(v)));
}

// Nivel real para un entreno: los personalizados ya están en niveles de la bici.
function levelOf(w, ref, range) {
  if (!w.absolute) return mapLevel(ref, range);
  return range ? Math.max(range.min, Math.min(range.max, ref)) : ref;
}

function describe(w, minutes, range) {
  const segs = buildSegments(w, minutes);
  const lv = segs.map(s => levelOf(w, s.level, range));
  const lo = Math.min(...lv), hi = Math.max(...lv);
  if (w.kind === 'interval') {
    const reps = segs.filter(s => s.label.startsWith('Esfuerzo')).length;
    return `${minutes} min · ${reps} × (${w.work[0]}' nivel ${levelOf(w, w.work[1], range)} / ${w.rest[0]}' nivel ${levelOf(w, w.rest[1], range)})`;
  }
  return `${minutes} min · niveles ${lo === hi ? lo : lo + '–' + hi}`;
}

function fmt(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
