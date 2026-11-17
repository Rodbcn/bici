// Cliente Bluetooth FTMS (Fitness Machine Service) para bicis estáticas.
'use strict';

const FTMS = {
  SERVICE: 0x1826,
  FEATURE: 0x2acc,
  BIKE_DATA: 0x2ad2,
  TRAINING_STATUS: 0x2ad3,
  RES_RANGE: 0x2ad6,
  POWER_RANGE: 0x2ad8,
  CONTROL: 0x2ad9,
  STATUS: 0x2ada,
};

// Interpreta una notificación Indoor Bike Data (0x2AD2). Devuelve solo los campos presentes.
function parseBikeData(dv) {
  const f = dv.getUint16(0, true);
  let o = 2;
  const r = {};
  const u16 = () => { const v = dv.getUint16(o, true); o += 2; return v; };
  const s16 = () => { const v = dv.getInt16(o, true); o += 2; return v; };
  const u8 = () => dv.getUint8(o++);
  const u24 = () => { const v = dv.getUint16(o, true) | (dv.getUint8(o + 2) << 16); o += 3; return v; };
  try {
    if (!(f & 0x0001)) r.speed = u16() / 100;        // bit0 = 0 → velocidad presente
    if (f & 0x0002) r.avgSpeed = u16() / 100;
    if (f & 0x0004) r.cadence = u16() / 2;
    if (f & 0x0008) r.avgCadence = u16() / 2;
    if (f & 0x0010) r.distance = u24();               // metros
    if (f & 0x0020) r.resistance = s16();             // bruto, escala según bici
    if (f & 0x0040) r.power = s16();
    if (f & 0x0080) r.avgPower = s16();
    if (f & 0x0100) { r.kcal = u16(); r.kcalHour = u16(); r.kcalMin = u8(); }
    if (f & 0x0200) r.hr = u8();
    if (f & 0x0400) r.met = u8() / 10;
    if (f & 0x0800) r.elapsed = u16();
    if (f & 0x1000) r.remaining = u16();
  } catch (e) { /* paquete truncado: devolvemos lo leído */ }
  if (r.kcal === 0xffff) delete r.kcal;
  return r;
}

function hex(dv) {
  return Array.from(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength))
    .map(b => b.toString(16).padStart(2, '0')).join(' ');
}

class FtmsBike extends EventTarget {
  constructor() {
    super();
    this.device = null;
    this.ctrl = null;
    this.range = null;        // {min,max,inc} en niveles
    this.rangeRaw = null;
    this.resFormat = localStorage.getItem('resFormat') || 's16'; // 's16' | 'u8'
    this.info = {};
    this.connected = false;
    this.hasControl = false;
    this._pending = null;
    this._wantConnected = false;
    this.log = [];
  }

  _log(msg) {
    const t = new Date().toLocaleTimeString('es-ES');
    this.log.unshift(`${t} ${msg}`);
    this.log.length = Math.min(this.log.length, 60);
    this.dispatchEvent(new Event('log'));
  }

  static supported() { return !!(navigator.bluetooth && navigator.bluetooth.requestDevice); }

  async choose() {
    this.device = await navigator.bluetooth.requestDevice({
      // Muchas bicis no anuncian el servicio FTMS hasta conectar: buscamos también por nombre.
      filters: [{ services: [FTMS.SERVICE] }, { namePrefix: 'ADIDAS' }, { namePrefix: 'adidas' }, { namePrefix: 'Adidas' }],
      optionalServices: [FTMS.SERVICE, 0xfff0, 'device_information'],
    });
    this.device.addEventListener('gattserverdisconnected', () => this._onDisconnect());
    await this.connect();
  }

  // Reconexión automática a una bici ya autorizada (si el navegador lo permite).
  async tryRemembered() {
    if (!navigator.bluetooth.getDevices) return false;
    const devs = await navigator.bluetooth.getDevices();
    const id = localStorage.getItem('bikeId');
    const d = devs.find(x => x.id === id) || devs[0];
    if (!d) return false;
    this.device = d;
    d.addEventListener('gattserverdisconnected', () => this._onDisconnect());
    // Hay que esperar a que la bici anuncie antes de conectar.
    if (d.watchAdvertisements) {
      const ac = new AbortController();
      await new Promise((res) => {
        const to = setTimeout(res, 6000);
        d.addEventListener('advertisementreceived', () => { clearTimeout(to); ac.abort(); res(); }, { once: true });
        d.watchAdvertisements({ signal: ac.signal }).catch(() => { clearTimeout(to); res(); });
      });
    }
    await this.connect();
    return true;
  }

  async connect() {
    this._wantConnected = true;
    this.dispatchEvent(new Event('connecting'));
    const server = await this.device.gatt.connect();
    localStorage.setItem('bikeId', this.device.id);
    const svc = await server.getPrimaryService(FTMS.SERVICE);

    // Rango de resistencia (resolución 0,1 según la norma; algunas bicis usan 1).
    try {
      const dv = await (await svc.getCharacteristic(FTMS.RES_RANGE)).readValue();
      const raw = { min: dv.getInt16(0, true), max: dv.getInt16(2, true), inc: dv.getUint16(4, true) };
      this.rangeRaw = raw;
      const k = raw.max > 60 ? 10 : 1;
      this.scale = k;
      this.range = { min: Math.max(1, raw.min / k), max: raw.max / k, inc: Math.max(1, raw.inc / k) };
      this._log(`Rango resistencia bruto ${raw.min}..${raw.max} paso ${raw.inc} → niveles ${this.range.min}–${this.range.max}`);
    } catch (e) {
      this.scale = 10;
      this.range = { min: 1, max: 32, inc: 1 };
      this._log('Sin rango de resistencia: supongo 1–32');
    }
    try {
      const dv = await (await svc.getCharacteristic(FTMS.FEATURE)).readValue();
      this.info.feature = hex(dv);
      const tf = dv.byteLength >= 8 ? dv.getUint32(4, true) : 0;
      // Bit 2: nivel de resistencia directo. Bit 13: simulación (pendiente), lo único que acepta la adidas C-24c.
      this.mode = (tf & 0x0004) ? 'res' : (tf & 0x2000) ? 'sim' : 'res';
      this._log(`Control por ${this.mode === 'sim' ? 'pendiente simulada' : 'nivel de resistencia'} (target features ${tf.toString(16)})`);
    } catch (e) {}
    try {
      const dis = await server.getPrimaryService('device_information');
      const dec = new TextDecoder();
      for (const [k, uuid] of [['fabricante', 0x2a29], ['modelo', 0x2a24], ['firmware', 0x2a26]]) {
        try { this.info[k] = dec.decode(await (await dis.getCharacteristic(uuid)).readValue()).replace(/\0/g, ''); } catch (e) {}
      }
    } catch (e) {}

    const data = await svc.getCharacteristic(FTMS.BIKE_DATA);
    data.addEventListener('characteristicvaluechanged', (ev) => {
      if (this.mode === 'ic') return; // con iConsole los datos vienen por su canal
      const r = parseBikeData(ev.target.value);
      this.lastRaw = hex(ev.target.value);
      if (r.resistance != null) { this.curLevel = this.levelFromRaw(r.resistance); this._simAdjust(); }
      this.dispatchEvent(new CustomEvent('data', { detail: r }));
    });
    await data.startNotifications();

    try {
      const st = await svc.getCharacteristic(FTMS.STATUS);
      st.addEventListener('characteristicvaluechanged', (ev) => this._log('Estado máquina: ' + hex(ev.target.value)));
      await st.startNotifications();
    } catch (e) {}

    this.ctrl = await svc.getCharacteristic(FTMS.CONTROL);
    this.ctrl.addEventListener('characteristicvaluechanged', (ev) => this._onCtrlResponse(ev.target.value));
    await this.ctrl.startNotifications();

    // Canal propio iConsole (0xFFF0): el único que mueve la resistencia en la adidas C-24c.
    if (this.ic) { this.ic.stop(); this.ic = null; }
    try {
      const ics = await server.getPrimaryService(0xfff0);
      const wr = await ics.getCharacteristic(0xfff2);
      const nt = await ics.getCharacteristic(0xfff1);
      this.ic = new IConsole(this, wr);
      nt.addEventListener('characteristicvaluechanged', (ev) => this.ic && this.ic.onNotify(ev.target.value));
      await nt.startNotifications();
      this.mode = 'ic';
      this._log('Usando protocolo iConsole (0xFFF0) para el control');
    } catch (e) {
      if (this.ic) { this.ic.stop(); this.ic = null; }
      this._log('Sin acceso a 0xFFF0: ' + e.name + ' ' + e.message);
      if (e.name === 'SecurityError') this.needRechoose = true;
    }

    this.connected = true;
    this.hasControl = false;
    this.dispatchEvent(new Event('connected'));
    this._log(`Conectado a ${this.device.name}`);
    if (this.mode !== 'ic') { try { await this.requestControl(); } catch (e) { this._log('No se pudo tomar el control: ' + e.message); } }
  }

  _onCtrlResponse(dv) {
    // 0x80, opcode pedido, resultado (1 = OK)
    if (dv.getUint8(0) !== 0x80) return;
    const op = dv.getUint8(1), res = dv.getUint8(2);
    this._log(`Respuesta op 0x${op.toString(16)}: ${['?', 'OK', 'no soportado', 'parámetro inválido', 'fallo', 'sin control'][res] || res}`);
    if (this._pending && this._pending.op === op) {
      const p = this._pending; this._pending = null; clearTimeout(p.to); p.resolve(res);
    }
  }

  async _cmd(bytes) {
    if (!this.ctrl) throw new Error('sin conexión');
    // Una orden cada vez: esperar la anterior.
    while (this._pending) await new Promise(r => setTimeout(r, 30));
    const op = bytes[0];
    const p = new Promise((resolve) => {
      this._pending = { op, resolve, to: setTimeout(() => { this._pending = null; resolve(-1); }, 2500) };
    });
    await this.ctrl.writeValueWithResponse(new Uint8Array(bytes));
    return p;
  }

  async requestControl() {
    const r = await this._cmd([0x00]);
    this.hasControl = r === 1;
    if (this.hasControl) await this._cmd([0x07]); // Start/Resume
    return this.hasControl;
  }

  async start() {
    if (!this.connected) return;
    if (this.ic) { this.ic.start(); return; }
    if (!this.hasControl) await this.requestControl();
    await this._cmd([0x07]);
  }
  async pause() { if (!this.connected) return; if (this.ic) return this.ic.pause(); await this._cmd([0x08, 0x02]); }
  async resume() { if (!this.connected) return; if (this.ic) return this.ic.resume(); await this._cmd([0x07]); }
  async stop() { if (!this.connected) return; if (this.ic) return this.ic.finish(); await this._cmd([0x08, 0x01]); }

  clampLevel(l) {
    const { min, max } = this.range || { min: 1, max: 32 };
    if (!Number.isFinite(+l)) return min;
    return Math.max(min, Math.min(max, Math.round(+l)));
  }

  // Fija el nivel de resistencia (en niveles de la bici).
  async setLevel(level) {
    if (!this.connected) return false;
    level = this.clampLevel(level);
    if (this.ic) { if (!this.ic.running) this.ic.start(); return this.ic.setLevel(level); }
    if (!this.hasControl) await this.requestControl();
    if (this.mode === 'sim') return this._simSetLevel(level);
    const v = Math.round(level * (this.scale || 10));
    const send = async (fmt) => fmt === 'u8'
      ? this._cmd([0x04, Math.min(255, v) & 0xff])
      : this._cmd([0x04, v & 0xff, (v >> 8) & 0xff]);
    let r = await send(this.resFormat);
    if (r === 5) { await this.requestControl(); r = await send(this.resFormat); }
    if (r !== 1) {
      const alt = this.resFormat === 's16' ? 'u8' : 's16';
      const r2 = await send(alt);
      if (r2 === 1) { this.resFormat = alt; localStorage.setItem('resFormat', alt); this._log('Formato de resistencia: ' + alt); r = 1; }
    }
    return r === 1;
  }

  // ---- Modo simulación: la bici convierte la pendiente en nivel; buscamos la pendiente de cada nivel ----
  _gradeMap() { try { return JSON.parse(localStorage.getItem('gradeMap') || '{}'); } catch (e) { return {}; } }

  _gradeGuess(level) {
    const m = this._gradeMap();
    if (m[level] != null) return m[level];
    const ks = Object.keys(m).map(Number).sort((a, b) => a - b);
    const lo = ks.filter(k => k < level).pop(), hi = ks.find(k => k > level);
    if (lo != null && hi != null) return m[lo] + (m[hi] - m[lo]) * (level - lo) / (hi - lo);
    if (lo != null) return m[lo] + (level - lo) * 1;
    if (hi != null) return m[hi] - (hi - level) * 1;
    return (level - 1) * 0.7;
  }

  async sendGrade(grade) {
    grade = Math.max(-30, Math.min(40, Math.round(grade * 100) / 100));
    this.grade = grade;
    this._lastSimT = performance.now();
    const g = Math.round(grade * 100);
    // viento 0 m/s, pendiente (0,01 %), Crr 0,004, Cw 0,51
    return this._cmd([0x11, 0, 0, g & 0xff, (g >> 8) & 0xff, 40, 51]);
  }

  async _simSetLevel(level) {
    this.target = level;
    this._step = 2; this._lastDir = 0;
    const r = await this.sendGrade(this._gradeGuess(level));
    return r === 1;
  }

  // Corrección en bucle cerrado: compara el nivel que informa la bici con el objetivo.
  _simAdjust() {
    if (this.mode !== 'sim' || this.target == null || this._busySim || this._calibrating) return;
    const cur = this.curLevel, t = this.target;
    if (cur == null) return;
    if (cur === t) {
      const m = this._gradeMap();
      if (m[t] !== this.grade) { m[t] = this.grade; localStorage.setItem('gradeMap', JSON.stringify(m)); }
      return;
    }
    if (performance.now() - (this._lastSimT || 0) < 1500) return;
    const dir = Math.sign(t - cur);
    if (this._lastDir && dir !== this._lastDir) this._step = Math.max(0.1, this._step / 2);
    this._lastDir = dir;
    const next = this.grade + dir * this._step * Math.min(3, Math.abs(t - cur));
    if ((next >= 40 && dir > 0) || (next <= -30 && dir < 0)) return;
    this._busySim = true;
    this.sendGrade(next).finally(() => { this._busySim = false; });
  }

  // Barrido de pendientes para ver qué nivel da cada una (diagnóstico).
  async calibrate(onStep) {
    this._calibrating = true;
    const out = [];
    try {
      for (let g = -10; g <= 30; g += 2) {
        await this.sendGrade(g);
        await new Promise(r => setTimeout(r, 2500));
        out.push([g, this.curLevel]);
        this._log(`Pendiente ${g}% → nivel ${this.curLevel}`);
        if (onStep) onStep(g);
      }
      const m = {};
      for (const [g, l] of out) if (l != null && m[l] == null) m[l] = g;
      localStorage.setItem('gradeMap', JSON.stringify(Object.assign(this._gradeMap(), m)));
    } finally { this._calibrating = false; }
    return out;
  }

  // Convierte el nivel que informa la bici en Indoor Bike Data a niveles.
  levelFromRaw(raw) {
    if (raw == null) return null;
    const max = this.range ? this.range.max : 32;
    return raw > max * 1.5 ? Math.round(raw / 10) : raw;
  }

  async disconnect() {
    this._wantConnected = false;
    if (this.device && this.device.gatt.connected) this.device.gatt.disconnect();
  }

  _onDisconnect() {
    this.connected = false;
    if (this.ic) { this.ic.stop(); this.ic = null; }
    this.hasControl = false;
    this.ctrl = null;
    if (this._pending) { this._pending.resolve(-1); this._pending = null; }
    this.dispatchEvent(new Event('disconnected'));
    this._log('Desconectado');
    if (this._wantConnected) this._retry(1);
  }

  async _retry(n) {
    if (!this._wantConnected || this.connected || n > 20) return;
    await new Promise(r => setTimeout(r, Math.min(1000 * n, 5000)));
    try { await this.connect(); } catch (e) { this._retry(n + 1); }
  }
}
