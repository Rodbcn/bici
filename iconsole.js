// Protocolo propio "iConsole" de ChangYow (servicio 0xFFF0) que usaba Console+ 1.x.
// Trama: F0 <código> <datos+1 ...> <checksum = suma de todos los bytes & 0xFF>.
// Se envía una trama cada 500 ms: la orden pendiente, o un sondeo de estado / un "ack".
'use strict';

const IC = {
  SERVICE: 0xfff0, NOTIFY: 0xfff1, WRITE: 0xfff2,
  ACK: 0xa0, MAX_LEVEL: 0xa1, STATUS: 0xa2, MODE: 0xa3, PARAMS: 0xa4, STATE: 0xa5, LEVEL: 0xa6,
  // Longitud de cada respuesta (código respuesta = código orden + 0x10)
  RESP_LEN: { 0xb0: 5, 0xb1: 6, 0xb2: 21, 0xb3: 6, 0xb4: 15, 0xb5: 6, 0xb6: 6, 0xb7: 6 },
};

class IConsole {
  constructor(bike, writeChar) {
    this.bike = bike;
    this.w = writeChar;
    this.cid = 0; this.mid = -1;
    this.ready = false;
    this.running = false;
    this.queue = [];
    this.buf = [];
    this.maxLevel = null;
    this.level = null;
    this.lastRx = null;
    this.timer = setInterval(() => this._tick(), 500);
    this.noResp = !(writeChar.properties && writeChar.properties.write) || !writeChar.writeValueWithResponse;
  }

  stop() { clearInterval(this.timer); }

  _frame(code, data) {
    const b = [0xf0, code, ...data.map(x => (x + 1) & 0xff)];
    b.push(b.reduce((a, x) => a + x, 0) & 0xff);
    return b;
  }
  _ids() { return [this.cid & 0xff, this.mid & 0xff]; }

  async _write(bytes) {
    const v = new Uint8Array(bytes);
    try {
      if (this.w.properties.writeWithoutResponse && this.w.writeValueWithoutResponse) await this.w.writeValueWithoutResponse(v);
      else await this.w.writeValueWithResponse(v);
    } catch (e) { /* ocupado: se reintenta en el siguiente ciclo */ }
  }

  async _tick() {
    if (this._busy) return;
    this._busy = true;
    try {
      const q = this.queue[0];
      if (q) {
        q.tries = (q.tries || 0) + 1;
        if (q.tries > 8) { this.queue.shift(); this.bike._log(`iConsole: sin respuesta a 0x${q.code.toString(16)}`); }
        else await this._write(this._frame(q.code, [...this._ids(), ...q.data]));
      } else if (this.ready && this.running) {
        await this._write(this._frame(IC.STATUS, this._ids()));
      } else {
        await this._write(this._frame(IC.ACK, this._ids()));
      }
    } finally { this._busy = false; }
  }

  _send(code, data = []) {
    // Sustituye una orden igual pendiente (p. ej. varios cambios de nivel seguidos).
    const i = this.queue.findIndex(q => q.code === code);
    if (i > 0 || (i === 0 && !this.queue[0].tries)) this.queue.splice(i, 1);
    this.queue.push({ code, data });
  }

  onNotify(dv) {
    for (let i = 0; i < dv.byteLength; i++) this.buf.push(dv.getUint8(i));
    for (;;) {
      const s = this.buf.indexOf(0xf0);
      if (s < 0) { this.buf = []; return; }
      if (s > 0) this.buf.splice(0, s);
      if (this.buf.length < 2) return;
      const len = IC.RESP_LEN[this.buf[1]];
      if (!len) { this.buf.shift(); continue; }
      if (this.buf.length < len) return;
      const pkt = this.buf.splice(0, len);
      const sum = pkt.slice(0, -1).reduce((a, x) => a + x, 0) & 0xff;
      if (sum !== pkt[len - 1]) { this.bike._log('iConsole: checksum incorrecto ' + pkt.map(h2).join(' ')); continue; }
      this._handle(pkt);
    }
  }

  _handle(p) {
    const code = p[1];
    const d = p.map((x, i) => (i >= 2 && i < p.length - 1 ? (x - 1) & 0xff : x));
    this.lastRx = p.map(h2).join(' ');
    const q = this.queue[0];
    if (q && q.code + 0x10 === code) this.queue.shift();

    if (code === 0xb0 || (code === 0xb7 && (d[4] === 0 || d[4] === 3))) {
      const first = !this.ready;
      this.cid = d[2]; this.mid = d[3];
      this.ready = true;
      if (first) {
        this.bike._log(`iConsole listo (cliente ${this.cid}, tipo ${this.mid})`);
        this._send(IC.MAX_LEVEL);
      }
    } else if (code === 0xb1) {
      this.maxLevel = d[4];
      this.bike._log(`iConsole: nivel máximo ${this.maxLevel}`);
      if (this.maxLevel > 0 && this.maxLevel <= 64) this.bike.range = { min: 1, max: this.maxLevel, inc: 1 };
      this.bike.dispatchEvent(new Event('range'));
    } else if (code === 0xb6) {
      this.level = d[4];
      this.bike._log(`iConsole: nivel ${this.level} confirmado`);
    } else if (code === 0xb5) {
      this.bike._log(`iConsole: estado ${d[4]}`);
    } else if (code === 0xb2) {
      const n = (a, b) => d[a] * 100 + d[b];
      const r = {
        elapsed: d[4] * 60 + d[5],
        speed: n(6, 7) / 10,
        cadence: n(8, 9),
        distance: Math.round(n(10, 11) / 10 * 1000), // km → m
        kcal: n(12, 13),
        hr: n(14, 15),
        power: Math.round(n(16, 17) / 10),
        resistance: d[18],
        icState: d[19],
      };
      this.level = r.resistance;
      this.bike.curLevel = r.resistance;
      this.bike.dispatchEvent(new CustomEvent('data', { detail: r }));
    }
  }

  start() {
    this.running = true;
    this._send(IC.MODE, [0]);
    this._send(IC.PARAMS, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    this._send(IC.STATE, [1]);
  }
  pause() { this._send(IC.STATE, [2]); }
  resume() { this._send(IC.STATE, [1]); }
  finish() { this._send(IC.STATE, [2]); this.running = false; }
  setLevel(l) {
    l = this.bike.clampLevel(l);
    this.target = l; this._send(IC.LEVEL, [l]); return true; }
}

function h2(x) { return x.toString(16).padStart(2, '0'); }
