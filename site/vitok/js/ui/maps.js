// Плоская карта (equirectangular) и простой глобус с орбитой / трассой.

import { fitCanvas } from '../../../js/shared/ui.js';

export function lonLatToMap(lon, lat, w, h) {
  const x = ((lon + Math.PI) / (2 * Math.PI)) * w;
  const y = ((Math.PI / 2 - lat) / Math.PI) * h;
  return [x, y];
}

export function drawFlatMap(canvas, track, site, opts = {}) {
  const { ctx, w, h } = fitCanvas(canvas, opts.aspect ?? 2);
  const returnPt = opts.returnPt;
  ctx.fillStyle = '#071018';
  ctx.fillRect(0, 0, w, h);

  // Сетка
  ctx.strokeStyle = '#1a2740';
  ctx.lineWidth = 1;
  for (let d = -150; d <= 150; d += 30) {
    const [x] = lonLatToMap((d * Math.PI) / 180, 0, w, h);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let d = -60; d <= 60; d += 30) {
    const [, y] = lonLatToMap(0, (d * Math.PI) / 180, w, h);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // Экватор / Гринвич
  ctx.strokeStyle = '#2a3d5c';
  const [, yEq] = lonLatToMap(0, 0, w, h);
  const [xGr] = lonLatToMap(0, 0, w, h);
  ctx.beginPath();
  ctx.moveTo(0, yEq);
  ctx.lineTo(w, yEq);
  ctx.moveTo(xGr, 0);
  ctx.lineTo(xGr, h);
  ctx.stroke();

  const strokePhase = (pts, phase, color, width) => {
    if (!pts?.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    let pen = false;
    let prevLon = null;
    for (const p of pts) {
      if (p.phase !== phase) {
        pen = false;
        continue;
      }
      const [x, y] = lonLatToMap(p.lon, p.lat, w, h);
      if (!pen || (prevLon != null && Math.abs(p.lon - prevLon) > Math.PI)) {
        ctx.moveTo(x, y);
        pen = true;
      } else ctx.lineTo(x, y);
      prevLon = p.lon;
    }
    ctx.stroke();
  };

  // Полная трасса (приглушённо), поверх — видимый участок.
  if (opts.ghost?.length) {
    strokePhase(opts.ghost, 'ascent', 'rgba(255,184,107,0.25)', 1.5);
    strokePhase(opts.ghost, 'orbit', 'rgba(127,209,255,0.22)', 1.2);
  }
  if (track?.length) {
    strokePhase(track, 'ascent', '#ffb86b', 2);
    strokePhase(track, 'orbit', '#7fd1ff', 1.5);
    const last = track[track.length - 1];
    const [lx, ly] = lonLatToMap(last.lon, last.lat, w, h);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(lx, ly, 3.5, 0, 2 * Math.PI);
    ctx.fill();
  } else if (opts.marker) {
    const [lx, ly] = lonLatToMap(opts.marker.lon, opts.marker.lat, w, h);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(lx, ly, 3.5, 0, 2 * Math.PI);
    ctx.fill();
  }

  if (opts.closest) {
    const [px, py] = lonLatToMap(opts.closest.lon, opts.closest.lat, w, h);
    ctx.fillStyle = '#c9a0ff';
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.font = '12px system-ui';
    ctx.fillStyle = '#c9a0ff';
    ctx.fillText(opts.closest.label ?? 'ближ.', px + 8, py + 12);
    if (site) {
      const [sx, sy] = lonLatToMap(site.lon, site.lat, w, h);
      ctx.strokeStyle = 'rgba(201,160,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  if (opts.afterOne) {
    const [ax, ay] = lonLatToMap(opts.afterOne.lon, opts.afterOne.lat, w, h);
    ctx.fillStyle = '#ff7272';
    ctx.beginPath();
    ctx.arc(ax, ay, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.font = '12px system-ui';
    ctx.fillStyle = '#ff7272';
    ctx.fillText(opts.afterOne.label ?? 'через 1 виток', ax + 8, ay - 6);
  }

  if (returnPt) {
    const [rx, ry] = lonLatToMap(returnPt.lon, returnPt.lat, w, h);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(rx, ry, 8, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.font = '12px system-ui';
    ctx.fillText(returnPt.label ?? 'возврат', rx + 10, ry + 4);
  }

  if (site) {
    const [sx, sy] = lonLatToMap(site.lon, site.lat, w, h);
    ctx.fillStyle = '#7ee08a';
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.font = '12px system-ui';
    ctx.fillText(site.name ?? 'старт', sx + 8, sy - 4);
  }

  return { w, h };
}

/** Глобус: ортографическая проекция, вращение мышью через yaw/pitch. opts.ghost — полная трасса. */
export function drawGlobe(canvas, track, site, mission, view = { yaw: 0.6, pitch: 0.35 }, opts = {}) {
  const { ctx, w, h } = fitCanvas(canvas, 1);
  ctx.fillStyle = '#05070b';
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.42;

  // Диск Земли
  const grd = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
  grd.addColorStop(0, '#1a3a5c');
  grd.addColorStop(1, '#0a1520');
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * Math.PI);
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.strokeStyle = '#3a5070';
  ctx.stroke();

  // pitch=0 — вид с экватора (камера в плоскости XY); pitch поднимает к полюсу.
  const cyA = Math.cos(view.yaw);
  const syA = Math.sin(view.yaw);
  const cp = Math.cos(view.pitch);
  const sp = Math.sin(view.pitch);

  const project = (lat, lon) => {
    const cl = Math.cos(lat);
    let x = cl * Math.cos(lon);
    let y = cl * Math.sin(lon);
    let z = Math.sin(lat);
    // yaw around z (долгота)
    const x1 = x * cyA - y * syA;
    const y1 = x * syA + y * cyA;
    const z1 = z;
    // pitch around x: 0 → смотрим вдоль −y (экватор в фас)
    const y2 = y1 * cp - z1 * sp;
    const z2 = y1 * sp + z1 * cp;
    // Зеркало по X: восток справа при взгляде снаружи (как на привычных глобусах).
    return { x: cx - R * x1, y: cy - R * z2, z: y2, front: y2 > -0.02 };
  };

  // Сетка
  ctx.strokeStyle = 'rgba(127,209,255,0.15)';
  ctx.lineWidth = 1;
  for (let latd = -60; latd <= 60; latd += 30) {
    ctx.beginPath();
    let first = true;
    for (let lond = -180; lond <= 180; lond += 5) {
      const p = project((latd * Math.PI) / 180, (lond * Math.PI) / 180);
      if (!p.front) {
        first = true;
        continue;
      }
      if (first) {
        ctx.moveTo(p.x, p.y);
        first = false;
      } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  const strokeTrack = (pts, phase, color, width) => {
    if (!pts?.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    let pen = false;
    for (const pt of pts) {
      if (pt.phase !== phase) {
        pen = false;
        continue;
      }
      const p = project(pt.lat, pt.lon);
      if (!p.front) {
        pen = false;
        continue;
      }
      if (!pen) {
        ctx.moveTo(p.x, p.y);
        pen = true;
      } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  };
  if (opts.ghost?.length) {
    strokeTrack(opts.ghost, 'orbit', 'rgba(127,209,255,0.22)', 1.2);
    strokeTrack(opts.ghost, 'ascent', 'rgba(255,184,107,0.25)', 1.4);
  }
  strokeTrack(track, 'orbit', '#7fd1ff', 1.6);
  strokeTrack(track, 'ascent', '#ffb86b', 2.2);

  // Орбита в пространстве (круг в плоскости) — тонкая линия на сфере радиуса r/R_earth визуально ≈ поверхность+
  if (mission?.ok) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    let pen = false;
    for (let k = 0; k <= 128; k++) {
      const u = (2 * Math.PI * k) / 128;
      // широта/долгота на сфере единичного радиуса для направления на спутник
      // используем точку на единичной сфере в направлении ECI
      const { x, y, z } = (() => {
        const cu = Math.cos(u);
        const su = Math.sin(u);
        const ci = Math.cos(mission.i);
        const si = Math.sin(mission.i);
        const cO = Math.cos(mission.Omega);
        const sO = Math.sin(mission.Omega);
        return {
          x: cO * cu - sO * su * ci,
          y: sO * cu + cO * su * ci,
          z: su * si,
        };
      })();
      const lat = Math.asin(z);
      const lon = Math.atan2(y, x);
      // инерциальная → для глобуса «земли сейчас» вычтем theta0 (статичный кадр на t=0 земли)
      const p = project(lat, lon - mission.theta0);
      if (!p.front) {
        pen = false;
        continue;
      }
      if (!pen) {
        ctx.moveTo(p.x, p.y);
        pen = true;
      } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  if (opts.returnPt) {
    const p = project(opts.returnPt.lat, opts.returnPt.lon);
    if (p.front) {
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }

  if (site) {
    const p = project(site.lat, site.lon);
    if (p.front) {
      ctx.fillStyle = '#7ee08a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  if (track?.length) {
    const last = track[track.length - 1];
    const p = project(last.lat, last.lon);
    if (p.front) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  return { w, h };
}
