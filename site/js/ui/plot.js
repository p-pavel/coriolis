// Простой самописец: несколько дорожек, у каждой своя автошкала, окно по времени.

import { fitCanvas, num } from './common.js';

export class TimePlot {
  /** series: [{ name, color, fmt, min?, max? }] */
  constructor(canvas, series, windowSec = 60) {
    this.canvas = canvas;
    this.series = series;
    this.window = windowSec;
    this.t = [];
    this.v = series.map(() => []);
  }

  clear() {
    this.t = [];
    this.v = this.series.map(() => []);
  }

  push(t, values) {
    this.t.push(t);
    values.forEach((x, i) => this.v[i].push(x));
    while (this.t.length > 2 && this.t[0] < t - this.window) {
      this.t.shift();
      this.v.forEach((a) => a.shift());
    }
  }

  draw() {
    const { ctx, w, h } = fitCanvas(this.canvas);
    ctx.clearRect(0, 0, w, h);
    const n = this.series.length;
    const lane = h / n;
    const t1 = this.t.length ? this.t[this.t.length - 1] : 0;
    const t0 = t1 - this.window;
    const X = (t) => 8 + ((t - t0) / this.window) * (w - 16);
    ctx.font = '12px system-ui, sans-serif';
    this.series.forEach((s, i) => {
      const y0 = i * lane;
      const data = this.v[i];
      let lo = s.min ?? Infinity;
      let hi = s.max ?? -Infinity;
      for (const x of data) {
        if (s.min == null) lo = Math.min(lo, x);
        if (s.max == null) hi = Math.max(hi, x);
      }
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return;
      if (hi - lo < 1e-12 * (Math.abs(hi) + 1)) {
        const pad = Math.abs(hi) * 1e-3 + 1e-9;
        lo -= pad;
        hi += pad;
      }
      const pad = 0.12 * (hi - lo);
      const Y = (x) => y0 + lane - 6 - ((x - (lo - pad)) / (hi - lo + 2 * pad)) * (lane - 22);
      ctx.strokeStyle = '#1d2433';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y0 + lane - 0.5);
      ctx.lineTo(w, y0 + lane - 0.5);
      ctx.stroke();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      data.forEach((x, j) => {
        const px = X(this.t[j]);
        const py = Y(x);
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      const last = data[data.length - 1];
      const fmt = s.fmt || ((x) => num(x, 4));
      ctx.fillStyle = s.color;
      ctx.fillText(`${s.name}: ${fmt(last)}`, 8, y0 + 14);
      ctx.fillStyle = '#6f7a8f';
      ctx.textAlign = 'right';
      ctx.fillText(`${fmt(lo)} … ${fmt(hi)}`, w - 8, y0 + 14);
      ctx.textAlign = 'left';
    });
  }
}
