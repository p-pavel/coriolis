// Рисование: корабль, звёзды, стрелки. Мировые координаты — метры, ось y вверх.

/**
 * Силуэт корабля класса Starship. Нос в точке (nx, ny), ось направлена углом `angle`
 * (направление от хвоста к носу). k — масштаб (пикселей на метр), toScreen — функция мир→экран.
 */
export function drawShip(ctx, toScreen, k, nx, ny, angle, L = 50, D = 9, opts = {}) {
  const [sx, sy] = toScreen(nx, ny);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-angle);
  ctx.scale(k, k);
  const r = D / 2;
  const cone = 0.17 * L;
  const lw = 1.2 / k;

  // аэродинамические рули
  ctx.fillStyle = '#5d6470';
  for (const s of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo(-0.08 * L, s * r * 0.8);
    ctx.lineTo(-0.13 * L, s * r * 1.75);
    ctx.lineTo(-0.24 * L, s * r * 1.75);
    ctx.lineTo(-0.26 * L, s * r * 0.9);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.78 * L, s * r);
    ctx.lineTo(-0.84 * L, s * r * 2.0);
    ctx.lineTo(-0.98 * L, s * r * 2.0);
    ctx.lineTo(-0.99 * L, s * r);
    ctx.fill();
  }

  // корпус с носовым обтекателем
  const grad = ctx.createLinearGradient(0, -r, 0, r);
  grad.addColorStop(0, '#eef1f5');
  grad.addColorStop(0.45, '#b9c0ca');
  grad.addColorStop(0.5, '#2a2d33');
  grad.addColorStop(1, '#16181c');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-cone * 0.35, r * 0.95, -cone, r);
  ctx.lineTo(-L, r);
  ctx.lineTo(-L, -r);
  ctx.lineTo(-cone, -r);
  ctx.quadraticCurveTo(-cone * 0.35, -r * 0.95, 0, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = lw;
  ctx.stroke();

  // двигатели
  ctx.fillStyle = '#3a3f48';
  for (const y of [-r * 0.55, 0, r * 0.55]) {
    ctx.beginPath();
    ctx.moveTo(-L, y - r * 0.15);
    ctx.lineTo(-L - 2.2, y - r * 0.28);
    ctx.lineTo(-L - 2.2, y + r * 0.28);
    ctx.lineTo(-L, y + r * 0.15);
    ctx.fill();
  }

  if (opts.deckFromNose != null) {
    ctx.strokeStyle = 'rgba(255,184,107,0.9)';
    ctx.lineWidth = 2 / k;
    ctx.beginPath();
    ctx.moveTo(-opts.deckFromNose, -r * 0.92);
    ctx.lineTo(-opts.deckFromNose, r * 0.92);
    ctx.stroke();
  }
  if (opts.flame) {
    const g = ctx.createLinearGradient(-L, 0, -L - 14, 0);
    g.addColorStop(0, 'rgba(255,200,120,0.9)');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-L - 2, -r * 0.7);
    ctx.lineTo(-L - 14, 0);
    ctx.lineTo(-L - 2, r * 0.7);
    ctx.fill();
  }
  if (opts.thrusterSide) {
    // боковые двигатели ориентации: струя поперёк корпуса
    const s = opts.thrusterSide;
    const g = ctx.createLinearGradient(0, s * r, 0, s * (r + 9));
    g.addColorStop(0, 'rgba(180,220,255,0.9)');
    g.addColorStop(1, 'rgba(180,220,255,0)');
    ctx.fillStyle = g;
    for (const x of [-0.3 * L, -0.7 * L]) {
      ctx.beginPath();
      ctx.moveTo(x - 1.2, s * r);
      ctx.lineTo(x, s * (r + 9));
      ctx.lineTo(x + 1.2, s * r);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function makeStars(n = 260, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, () => ({ x: rnd(), y: rnd(), r: rnd() ** 3 * 1.4 + 0.25, a: 0.35 + rnd() * 0.65 }));
}

export function drawStars(ctx, stars, w, h, ox = 0, oy = 0) {
  for (const st of stars) {
    const x = (((st.x * w + ox) % w) + w) % w;
    const y = (((st.y * h + oy) % h) + h) % h;
    ctx.fillStyle = `rgba(220,230,255,${st.a})`;
    ctx.beginPath();
    ctx.arc(x, y, st.r, 0, 2 * Math.PI);
    ctx.fill();
  }
}

export function arrow(ctx, x0, y0, x1, y1, color, width = 2, head = 8) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  if (L < 1) return;
  const ux = dx / L;
  const uy = dy / L;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - ux * head * 0.8, y1 - uy * head * 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * head - uy * head * 0.5, y1 - uy * head + ux * head * 0.5);
  ctx.lineTo(x1 - ux * head + uy * head * 0.5, y1 - uy * head - ux * head * 0.5);
  ctx.fill();
}

export function drawApple(ctx, x, y, r = 6) {
  ctx.fillStyle = '#e8463b';
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y, r * 0.75, 0, 2 * Math.PI);
  ctx.arc(x + r * 0.35, y, r * 0.75, 0, 2 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = '#6b3b12';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.5);
  ctx.lineTo(x + r * 0.2, y - r * 1.2);
  ctx.stroke();
  ctx.fillStyle = '#5cc25c';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.55, y - r * 1.05, r * 0.4, r * 0.18, -0.4, 0, 2 * Math.PI);
  ctx.fill();
}
