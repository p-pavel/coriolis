// Общий UI для песочниц «Зелёного кота»: KaTeX, формат, контролы, canvas.

export const REPO_URL = 'https://github.com/p-pavel/coriolis';

const KATEX = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/';

export function loadKatex() {
  if (!document.querySelector('.math, [data-math]') && !/\\\(|\$\$/.test(document.body.innerHTML)) return;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = KATEX + 'katex.min.css';
  document.head.append(css);
  const s1 = document.createElement('script');
  s1.src = KATEX + 'katex.min.js';
  s1.onload = () => {
    const s2 = document.createElement('script');
    s2.src = KATEX + 'contrib/auto-render.min.js';
    s2.onload = () =>
      window.renderMathInElement(document.body, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\(', right: '\\)', display: false },
        ],
        throwOnError: false,
      });
    document.head.append(s2);
  };
  document.head.append(s1);
}

/**
 * Шапка и подвал. pages: [[href, title, id], ...] (без главной проекта).
 * hubHref — ссылка на общий индекс дискуссий.
 */
export function mountChrome({ brand, brandHref, pages, active, footerHtml, hubHref = '../index.html', hubLabel = 'Зелёный кот' }) {
  const header = document.createElement('header');
  header.className = 'site';
  const items = pages
    .map(([href, title, id]) => `<a class="item${id === active ? ' active' : ''}" href="${href}">${title}</a>`)
    .join('');
  header.innerHTML = `<nav>
    <a class="brand" href="${brandHref}">${brand}</a>${items}
    <a class="item hub" href="${hubHref}">${hubLabel}</a>
  </nav>`;
  document.body.prepend(header);

  const footer = document.createElement('footer');
  footer.innerHTML = footerHtml;
  document.body.append(footer);
  loadKatex();
}

const nfCache = new Map();
function nf(d) {
  if (!nfCache.has(d)) nfCache.set(d, new Intl.NumberFormat('ru-RU', { maximumSignificantDigits: d }));
  return nfCache.get(d);
}

export const num = (x, d = 3) => (Number.isFinite(x) ? nf(d).format(x) : '—');

export function fixed(x, digits = 1) {
  return Number.isFinite(x) ? x.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
}

export function force(N, d = 3) {
  const a = Math.abs(N);
  if (a >= 1e6) return `${num(N / 1e6, d)} МН`;
  if (a >= 1e3) return `${num(N / 1e3, d)} кН`;
  return `${num(N, d)} Н`;
}

export function mass(kg, d = 3) {
  if (kg >= 1e9) return `${num(kg / 1e9, d)} млн т`;
  if (kg >= 1e6) return `${num(kg / 1e6, d)} тыс. т`;
  if (kg >= 1e3) return `${num(kg / 1e3, d)} т`;
  return `${num(kg, d)} кг`;
}

export function len(m, d = 3) {
  const a = Math.abs(m);
  if (a >= 1e4) return `${num(m / 1e3, d)} км`;
  if (a >= 1) return `${num(m, d)} м`;
  if (a >= 0.01) return `${num(m * 100, d)} см`;
  return `${num(m * 1000, d)} мм`;
}

export function period(s) {
  if (s >= 86400 * 2) return `${num(s / 86400, 3)} сут`;
  if (s >= 3600) return `${num(s / 3600, 3)} ч`;
  if (s >= 120) return `${num(s / 60, 3)} мин`;
  return `${num(s, 3)} с`;
}

export function angleDeg(rad, d = 2) {
  return `${fixed((rad * 180) / Math.PI, d)}°`;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export function slider(parent, { label, min, max, step, value, fmt = (v) => num(v), hint, onInput, scale = 'lin' }) {
  const wrap = el('div', 'ctl');
  const lab = el('label');
  const name = el('span', null, label);
  const val = el('span', 'val');
  lab.append(name, val);
  const inp = el('input');
  inp.type = 'range';
  // Больше делений на дорожке → стрелки/клик дают более мелкий шаг (тонкая настройка).
  const logDivs = 1000;
  const toPos = (v) => (scale === 'log' ? Math.log(v) : v);
  const fromPos = (p) => (scale === 'log' ? Math.exp(p) : p);
  let lo = min;
  let hi = max;
  let st = step;
  const applyRange = () => {
    inp.min = toPos(lo);
    inp.max = toPos(hi);
    if (scale === 'log') inp.step = (toPos(hi) - toPos(lo)) / logDivs;
    else inp.step = st === 'any' ? 'any' : st;
  };
  applyRange();
  inp.value = toPos(value);
  wrap.append(lab, inp);
  if (hint) wrap.append(el('div', 'hint', hint));
  parent.append(wrap);
  let current = value;
  const update = () => {
    let v = fromPos(+inp.value);
    if (scale === 'log' && st && st !== 'any') v = Math.round(v / st) * st;
    else if (scale === 'lin' && st && st !== 'any') {
      v = Math.round(v / st) * st;
      const a = Math.min(lo, hi);
      const b = Math.max(lo, hi);
      v = Math.min(b, Math.max(a, v));
    }
    current = v;
    val.textContent = fmt(v);
  };
  inp.addEventListener('input', () => {
    update();
    onInput && onInput(current);
  });
  update();
  return {
    get value() {
      return current;
    },
    set value(v) {
      inp.value = toPos(v);
      update();
    },
    setRange(min2, max2, step2) {
      lo = min2;
      hi = max2;
      if (step2 != null) st = step2;
      applyRange();
      // clamp current into new range
      const a = Math.min(lo, hi);
      const b = Math.max(lo, hi);
      if (current < a || current > b) {
        current = Math.min(b, Math.max(a, current));
        inp.value = toPos(current);
      }
      update();
    },
    el: wrap,
  };
}

export function select(parent, { label, options, value, onChange, hint }) {
  const wrap = el('div', 'ctl');
  const lab = el('label', null, `<span>${label}</span>`);
  const sel = el('select');
  for (const o of options) {
    const opt = el('option', null, o.text);
    opt.value = o.value;
    sel.append(opt);
  }
  sel.value = value;
  wrap.append(lab, sel);
  if (hint) wrap.append(el('div', 'hint', hint));
  parent.append(wrap);
  sel.addEventListener('change', () => onChange && onChange(sel.value));
  return {
    get value() {
      return sel.value;
    },
    set value(v) {
      sel.value = v;
    },
    el: wrap,
  };
}

export function button(parent, text, onClick, cls) {
  const b = el('button', cls, text);
  b.addEventListener('click', onClick);
  parent.append(b);
  return b;
}

export function kvTable(target, rows) {
  target.innerHTML =
    '<table class="kv">' +
    rows
      .map((r) => (typeof r === 'string' ? `<tr class="sec"><td colspan="2">${r.slice(1)}</td></tr>` : `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`))
      .join('') +
    '</table>';
}

export function fitCanvas(canvas, aspect) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = aspect ? w / aspect : canvas.clientHeight;
  if (aspect) canvas.style.height = `${h}px`;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
