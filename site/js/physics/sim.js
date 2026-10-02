// Динамика «два корабля на тросе» в плоскости вращения, инерциальная система отсчёта.
//
// Модель:
//  • корабли — твёрдые тела (масса, момент инерции, положение ЦМ относительно носа);
//    трос крепится к носу, поэтому корабль может качаться (тангаж);
//  • трос — цепочка из N упругих отрезков с массами в узлах (сосредоточенные массы);
//    отрезок работает только на растяжение (сжать трос нельзя — он провисает);
//    внутреннее трение — модель Кельвина–Фойгта, T = k·(d − l) + β·k·(ḋ − l̇);
//    половинки крайних отрезков присоединены к кораблям (точечная масса на носу);
//  • лебёдка меняет длину троса в ненапряжённом состоянии (все отрезки пропорционально);
//    масса выпущенного троса при этом не меняется (упрощение: трос ≪ корабля);
//  • двигатели — касательная сила, приложенная к ЦМ корабля.
// Интегратор — скоростной Верле (kick–drift–kick) с постоянным шагом; остаток времени
// переносится на следующий вызов, чтобы шаг не дробился. Для центральных парных сил
// и «толчок», и «дрейф» сохраняют момент импульса точно (до округления), а энергия
// колеблется около точного значения с ошибкой O(Δt²) без дрейфа.

export class TetherSim {
  /**
   * cfg: { M, I, a, deckFromNose, EA, rhoA, N, Ra, omega, zeta }
   *   Ra — расстояние от оси до носа в стационарном вращении (растянутый трос);
   *   zeta — относительное демпфирование самой высокой моды троса.
   */
  constructor(cfg) {
    this.cfg = { zeta: 0.1, N: 24, Tbreak: Infinity, ...cfg };
    this.ctrl = { mode: 'manual', reelRate: 0, Tref: 0, tau: 2, uMax: 5, thrust: 0 };
    this.init();
  }

  init() {
    const c = this.cfg;
    const N = c.N;
    const w = c.omega;
    this.N = N;
    this.t = 0;
    this.x = new Float64Array(N + 1);
    this.y = new Float64Array(N + 1);
    this.vx = new Float64Array(N + 1);
    this.vy = new Float64Array(N + 1);
    this.m = new Float64Array(N + 1);
    this.fx = new Float64Array(N + 1);
    this.fy = new Float64Array(N + 1);
    this.l0 = new Float64Array(N);
    this.T = new Float64Array(N);
    this.broken = new Uint8Array(N);
    this.s = 1;
    this.u = 0;

    const h = (2 * c.Ra) / N;
    for (let k = 0; k <= N; k++) this.x[k] = -c.Ra + k * h;

    // Равновесие стационарного вращения: натяжение каждого отрезка находим из баланса
    // сил узлов снаружи от него, затем длину в ненапряжённом состоянии l = h/(1 + T/EA).
    // Массы узлов зависят от этих длин, поэтому несколько итераций.
    const rest = new Float64Array(N).fill(h);
    let mEnd = 0;
    for (let it = 0; it < 5; it++) {
      for (let k = 1; k < N; k++) this.m[k] = (c.rhoA * (rest[k - 1] + rest[k])) / 2;
      mEnd = (c.rhoA * rest[0]) / 2;
      this.setupShips(mEnd);
      const Tend = this.Ms * w * w * (c.Ra + this.as);
      for (let j = 0; j < N; j++) {
        const xm = -c.Ra + (j + 0.5) * h;
        let T = Tend;
        for (let k = 1; k < N; k++) {
          const xk = this.x[k];
          if (xm >= 0 ? xk > xm : xk < xm) T += this.m[k] * w * w * Math.abs(xk);
        }
        this.T[j] = T;
        rest[j] = h / (1 + T / c.EA);
      }
    }
    this.l0.set(rest);
    this.L0sum = rest.reduce((p, q) => p + q, 0);
    this.mEnd = mEnd;

    for (let k = 0; k <= N; k++) {
      this.y[k] = 0;
      this.vx[k] = -w * this.y[k];
      this.vy[k] = w * this.x[k];
    }
    const R = c.Ra + this.as;
    this.ships = [
      { x: -R, y: 0, vx: 0, vy: -w * R, th: 0, w, Fx: 0, Fy: 0, tau: 0 },
      { x: R, y: 0, vx: 0, vy: w * R, th: Math.PI, w, Fx: 0, Fy: 0, tau: 0 },
    ];
    this.syncNoses();

    const cWave = Math.sqrt(c.EA / c.rhoA);
    this.cWave = cWave;
    this.beta = (c.zeta * h) / cWave;
    this.debt = 0;
    this.computeForces();
  }

  // Корабль + половина крайнего отрезка троса как одно твёрдое тело.
  setupShips(mEnd) {
    const c = this.cfg;
    this.Ms = c.M + mEnd;
    this.as = (c.M * c.a) / this.Ms; // нос → ЦМ составного тела
    this.Is = c.I + c.M * (c.a - this.as) ** 2 + mEnd * this.as * this.as;
  }

  restLength() {
    return this.s * this.L0sum;
  }

  // Шаг по условию устойчивости явной схемы для самого короткого отрезка.
  // Лебёдка меняет длины в s раз, а массы узлов — нет: жёсткость EA/(s·l0), масса ρA·l0,
  // поэтому предельный шаг ∝ √s·l0/c, а не s·l0/c.
  stableDt() {
    let lmin = Infinity;
    for (let j = 0; j < this.N; j++) lmin = Math.min(lmin, this.l0[j]);
    return Math.min((0.35 * Math.sqrt(this.s) * lmin) / this.cWave, 2e-3);
  }

  syncNoses() {
    const N = this.N;
    const a = this.as;
    for (let i = 0; i < 2; i++) {
      const sh = this.ships[i];
      const k = i === 0 ? 0 : N;
      const cs = Math.cos(sh.th);
      const sn = Math.sin(sh.th);
      this.x[k] = sh.x + a * cs;
      this.y[k] = sh.y + a * sn;
      this.vx[k] = sh.vx - sh.w * a * sn;
      this.vy[k] = sh.vy + sh.w * a * cs;
    }
  }

  winchRate() {
    const ct = this.ctrl;
    let u = ct.reelRate;
    if (ct.mode === 'hold') {
      const Tm = 0.5 * (this.T[0] + this.T[this.N - 1]);
      u = (this.restLength() * (Tm - ct.Tref)) / (this.cfg.EA * ct.tau);
    }
    u = Math.max(-ct.uMax, Math.min(ct.uMax, u));
    const sdot = u / this.L0sum;
    if ((this.s <= 0.05 && sdot < 0) || (this.s >= 20 && sdot > 0)) return 0;
    return sdot;
  }

  /** Силы при текущих положениях и скоростях: узлы — в fx/fy, корабли — в Fx/Fy/tau. */
  computeForces() {
    const c = this.cfg;
    const N = this.N;
    const { x, y, vx, vy, fx, fy, l0, T, broken } = this;
    const EA = c.EA;
    const beta = this.beta;
    const sdot = this.winchRate();
    this.sdot = sdot;
    this.u = sdot * this.L0sum;
    const s = this.s;

    this.syncNoses();
    fx.fill(0);
    fy.fill(0);
    for (let j = 0; j < N; j++) {
      if (broken[j]) {
        T[j] = 0;
        continue;
      }
      const dx = x[j + 1] - x[j];
      const dy = y[j + 1] - y[j];
      const d = Math.hypot(dx, dy);
      const l = s * l0[j];
      let Tj = 0;
      if (d > l) {
        const ux = dx / d;
        const uy = dy / d;
        const k = EA / l;
        const ddot = (vx[j + 1] - vx[j]) * ux + (vy[j + 1] - vy[j]) * uy;
        Tj = k * (d - l) + beta * k * (ddot - sdot * l0[j]);
        if (Tj < 0) Tj = 0;
        if (Tj > c.Tbreak) {
          broken[j] = 1;
          this.snapped = { t: this.t, T: Tj };
          T[j] = 0;
          continue;
        }
        fx[j] += Tj * ux;
        fy[j] += Tj * uy;
        fx[j + 1] -= Tj * ux;
        fy[j + 1] -= Tj * uy;
      }
      T[j] = Tj;
    }

    const cmx = 0.5 * (this.ships[0].x + this.ships[1].x);
    const cmy = 0.5 * (this.ships[0].y + this.ships[1].y);
    for (let i = 0; i < 2; i++) {
      const sh = this.ships[i];
      const k = i === 0 ? 0 : N;
      let Fx = fx[k];
      let Fy = fy[k];
      const cs = Math.cos(sh.th);
      const sn = Math.sin(sh.th);
      sh.tau = this.as * (cs * Fy - sn * Fx);
      if (this.ctrl.thrust) {
        const rx = sh.x - cmx;
        const ry = sh.y - cmy;
        const r = Math.hypot(rx, ry) || 1;
        Fx += (-ry / r) * this.ctrl.thrust;
        Fy += (rx / r) * this.ctrl.thrust;
      }
      sh.Fx = Fx;
      sh.Fy = Fy;
    }
  }

  kick(h) {
    const { vx, vy, fx, fy, m } = this;
    for (let k = 1; k < this.N; k++) {
      vx[k] += (fx[k] / m[k]) * h;
      vy[k] += (fy[k] / m[k]) * h;
    }
    for (const sh of this.ships) {
      sh.vx += (sh.Fx / this.Ms) * h;
      sh.vy += (sh.Fy / this.Ms) * h;
      sh.w += (sh.tau / this.Is) * h;
    }
  }

  step(dt) {
    const { x, y, vx, vy } = this;
    this.computeForces();
    this.kick(dt / 2);
    for (let k = 1; k < this.N; k++) {
      x[k] += vx[k] * dt;
      y[k] += vy[k] * dt;
    }
    for (const sh of this.ships) {
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      sh.th += sh.w * dt;
    }
    this.s += this.sdot * dt;
    this.computeForces();
    this.kick(dt / 2);
    this.t += dt;
  }

  /** Продвинуть время на span секунд шагами постоянной длины; остаток копится. */
  advance(span) {
    this.debt = (this.debt || 0) + span;
    let dt = this.stableDt();
    while (this.debt >= dt) {
      this.step(dt);
      this.debt -= dt;
      dt = this.stableDt();
    }
    this.syncNoses();
  }

  // --- возмущения ---------------------------------------------------------

  /** Радиальный толчок: корабли получают скорости ±dv/2 вдоль линии между ними. */
  kickRadial(dv) {
    const [a, b] = this.ships;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    a.vx -= ((dv / 2) * dx) / d;
    a.vy -= ((dv / 2) * dy) / d;
    b.vx += ((dv / 2) * dx) / d;
    b.vy += ((dv / 2) * dy) / d;
  }

  /** Толчок по тангажу: symmetric — оба корабля в одну сторону, иначе навстречу. */
  kickPitch(dw, symmetric = true) {
    this.ships[0].w += dw;
    this.ships[1].w += symmetric ? dw : -dw;
  }

  /** «Щипок» троса: поперечная скорость по форме моды n. */
  pluck(dv, mode = 1) {
    const N = this.N;
    this.syncNoses();
    const dx = this.x[N] - this.x[0];
    const dy = this.y[N] - this.y[0];
    const d = Math.hypot(dx, dy);
    const px = -dy / d;
    const py = dx / d;
    for (let k = 1; k < N; k++) {
      const amp = dv * Math.sin((mode * Math.PI * k) / N);
      this.vx[k] += amp * px;
      this.vy[k] += amp * py;
    }
  }

  cut() {
    this.broken[Math.floor(this.N / 2)] = 1;
  }

  // --- измерения ----------------------------------------------------------

  /** Угол качания корабля i относительно линии «ось → нос» (рад). */
  pitchAngle(i) {
    const sh = this.ships[i];
    const N = this.N;
    const mx = 0.5 * (this.x[0] + this.x[N]);
    const my = 0.5 * (this.y[0] + this.y[N]);
    const k = i === 0 ? 0 : N;
    const inward = Math.atan2(my - this.y[k], mx - this.x[k]);
    let d = sh.th - inward;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return d;
  }

  /** Ощущаемая тяжесть на палубе корабля i: модуль (м/с²) и наклон от оси корабля (рад). */
  deckGravity(i) {
    const sh = this.ships[i];
    const rho = this.as - this.cfg.deckFromNose;
    const ex = Math.cos(sh.th);
    const ey = Math.sin(sh.th);
    const px = rho * ex;
    const py = rho * ey;
    const alpha = sh.tau / this.Is;
    const ax = sh.Fx / this.Ms - alpha * py - sh.w * sh.w * px;
    const ay = sh.Fy / this.Ms + alpha * px - sh.w * sh.w * py;
    // ощущаемая «вниз» = −a; ось корабля «вниз» (к хвосту) = −e
    const gx = -ax;
    const gy = -ay;
    const tilt = Math.atan2(-ex * gy + ey * gx, -ex * gx - ey * gy);
    return { g: Math.hypot(ax, ay), tilt };
  }

  spinRate() {
    const [a, b] = this.ships;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return (dx * (b.vy - a.vy) - dy * (b.vx - a.vx)) / (dx * dx + dy * dy);
  }

  angularMomentum() {
    let L = 0;
    for (let k = 1; k < this.N; k++) L += this.m[k] * (this.x[k] * this.vy[k] - this.y[k] * this.vx[k]);
    for (const sh of this.ships) L += this.Ms * (sh.x * sh.vy - sh.y * sh.vx) + this.Is * sh.w;
    return L;
  }

  energy() {
    let E = 0;
    for (let k = 1; k < this.N; k++) E += 0.5 * this.m[k] * (this.vx[k] ** 2 + this.vy[k] ** 2);
    for (const sh of this.ships) E += 0.5 * this.Ms * (sh.vx ** 2 + sh.vy ** 2) + 0.5 * this.Is * sh.w ** 2;
    this.syncNoses();
    for (let j = 0; j < this.N; j++) {
      if (this.broken[j]) continue;
      const d = Math.hypot(this.x[j + 1] - this.x[j], this.y[j + 1] - this.y[j]);
      const l = this.s * this.l0[j];
      if (d > l) E += (0.5 * this.cfg.EA * (d - l) ** 2) / l;
    }
    return E;
  }

  shipDistance() {
    const [a, b] = this.ships;
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  noseRadius() {
    const N = this.N;
    return 0.5 * Math.hypot(this.x[N] - this.x[0], this.y[N] - this.y[0]);
  }

  /** Есть ли провисшие (ненатянутые) отрезки. */
  slackCount() {
    let n = 0;
    for (let j = 0; j < this.N; j++) if (!this.broken[j] && this.T[j] === 0) n++;
    return n;
  }
}

/** Параметры симуляции из результата designTether и параметров корабля. */
export function simConfigFromDesign(design, ship, N = 24) {
  return {
    M: ship.M,
    I: ship.M * ship.gyration * ship.gyration,
    a: ship.cmFromNose,
    deckFromNose: ship.deckFromNose,
    EA: design.EA,
    rhoA: design.rhoA,
    N,
    Ra: design.Ra,
    omega: design.w,
    zeta: 0.1,
    Tbreak: design.Tbreak,
  };
}
