// home.js — the instruments on the home page. Every glass colour is computed from absorption
// spectra in optics.json through spectra.js; nothing here is a hand-picked colour.
import optics from '../data/optics.json';
import {
  GRID, toGrid, spectrumColor, densityOnGrid, transmission, glow, glowStrength,
  SPECTRAL, bandEdge, dichroicBand, encode, css,
} from './spectra.js';

const DAY = toGrid(optics.wavelengths, optics.illuminants.find((i) => i.id === 'daylight').spd);
const COLORANT = Object.fromEntries(optics.colorants.map((c) => [c.id, c]));
const DENS = Object.fromEntries(optics.colorants.map((c) => [c.id, densityOnGrid(optics.wavelengths, c.absorbance)]));
const ONES = GRID.map(() => 1);
const $ = (id) => document.getElementById(id);
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const tColor = (T) => spectrumColor(T, DAY);
const mixT = (parts, thickness = 1) => transmission(parts.map(([id, c]) => [DENS[id], c]), thickness);
const colorOf = (parts, thickness = 1) => tColor(mixT(parts, thickness));

// A spectrum strip: light in (top band) and light out (bottom band, with its curve drawn on).
function strip(canvas, top, bottom) {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d'), n = GRID.length;
  const half = Math.round(h * 0.42), gap = Math.round(h * 0.08);
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const x0 = Math.floor((i / n) * w), x1 = Math.ceil(((i + 1) / n) * w);
    ctx.fillStyle = css(SPECTRAL[i].map((v) => encode(v * top[i])));
    ctx.fillRect(x0, 0, x1 - x0, half);
    ctx.fillStyle = css(SPECTRAL[i].map((v) => encode(v * bottom[i])));
    ctx.fillRect(x0, half + gap, x1 - x0, h - half - gap);
  }
  ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.2 * dpr; ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n) * w, y = h - 3 * dpr - bottom[i] * (h - half - gap - 6 * dpr);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
}

// An isometric slab: the face shows a thin path through the glass, the edges a long one.
function slab(svg) {
  const id = svg.id;
  svg.innerHTML = `
    <defs><linearGradient id="${id}-sh" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <filter id="${id}-bl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14"/></filter></defs>
    <ellipse class="cast" cx="270" cy="250" rx="220" ry="34" filter="url(#${id}-bl)" opacity=".55"/>
    <polygon class="face" points="40,120 300,40 490,110 230,190"/>
    <polygon points="40,120 300,40 490,110 230,190" fill="url(#${id}-sh)"/>
    <polygon class="edge" points="40,120 230,190 230,212 40,142"/>
    <polygon class="edge" points="230,190 490,110 490,132 230,212" opacity=".82"/>
    <path d="M40 120 L230 190 L490 110" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="1.2"/>
    <text x="200" y="110" fill="rgba(20,20,20,.45)" font-family="IBM Plex Mono, monospace" font-size="12" letter-spacing="1">FACE</text>
    <text x="300" y="196" fill="rgba(20,20,20,.45)" font-family="IBM Plex Mono, monospace" font-size="12" letter-spacing="1">EDGE</text>`;
  const face = svg.querySelector('.face'), cast = svg.querySelector('.cast'), edges = svg.querySelectorAll('.edge');
  return (faceColor, edgeColor) => {
    face.setAttribute('fill', faceColor); cast.setAttribute('fill', faceColor);
    for (const e of edges) e.setAttribute('fill', edgeColor);
  };
}

function chips(box, ids, label, onPick) {
  for (const id of ids) {
    const b = document.createElement('button');
    b.className = 'chip'; b.dataset.id = id;
    b.innerHTML = `<i style="--c:${colorOf([[id, 1]], 1.2).css}"></i>${label(id)}`;
    b.addEventListener('click', () => onPick(id));
    box.appendChild(b);
  }
  return (cur) => { for (const b of box.children) b.setAttribute('aria-pressed', String(b.dataset.id === cur)); };
}

/* ---------- the light table ---------- */
function lightTable() {
  const table = $('table');
  const shard = (pts) => `polygon(${pts})`;
  const pieces = [
    { lab: 'cobalt', parts: [['cobalt', 0.9]], x: 0.08, y: 0.10, s: 0.30, r: '50%' },
    { lab: 'gold ruby', parts: [['gold-colloid', 1.1]], x: 0.19, y: 0.30, s: 0.30, clip: shard('8% 18%, 62% 0%, 100% 46%, 78% 100%, 14% 84%') },
    { lab: 'cadmium yellow', parts: [['cds', 1]], x: 0.52, y: 0.12, s: 0.26, r: '50% 50% 50% 8%' },
    { lab: 'chromium', parts: [['chromium', 1.2]], x: 0.60, y: 0.32, s: 0.24, clip: shard('0% 30%, 46% 0%, 100% 22%, 88% 92%, 26% 100%') },
    { lab: 'copper', parts: [['copper', 1]], x: 0.07, y: 0.62, s: 0.20, r: '6px' },
    { lab: 'manganese', parts: [['manganese', 1.3]], x: 0.82, y: 0.10, s: 0.18, r: '50%' },
    { lab: 'neodymium', parts: [['neodymium', 1.6]], x: 0.38, y: 0.56, s: 0.17, clip: shard('50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%') },
  ];
  let z = 10;
  const els = pieces.map((p) => {
    const el = document.createElement('div');
    el.className = 'piece' + (p.r === '50%' ? ' round' : '');
    el.innerHTML = `<div class="g"></div><span class="lab">${p.lab}</span>`;
    const g = el.firstChild;
    g.style.setProperty('--c', colorOf(p.parts).css);
    if (p.clip) g.style.setProperty('--clip', p.clip);
    if (p.r) g.style.setProperty('--r', p.r);
    table.appendChild(el);
    return { el, p };
  });
  function layout() {
    const w = table.clientWidth, h = table.clientHeight, base = Math.min(w * 0.9, h * 1.25);
    for (const { el, p } of els) {
      const s = Math.max(70, p.s * base * 0.92);
      el.style.width = el.style.height = `${s}px`;
      el.style.left = `${Math.min(w - s, p.x * w)}px`;
      el.style.top = `${Math.min(h - s - 18, p.y * h)}px`;
    }
  }
  layout();
  addEventListener('resize', layout);
  for (const { el, p } of els) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); el.setPointerCapture(e.pointerId); el.style.zIndex = ++z;
      const ox = e.clientX - el.offsetLeft, oy = e.clientY - el.offsetTop;
      const move = (ev) => {
        const x = Math.max(-el.offsetWidth * 0.4, Math.min(table.clientWidth - el.offsetWidth * 0.6, ev.clientX - ox));
        const y = Math.max(-el.offsetHeight * 0.4, Math.min(table.clientHeight - el.offsetHeight * 0.6, ev.clientY - oy));
        el.style.left = `${x}px`; el.style.top = `${y}px`;
        p.x = x / table.clientWidth; p.y = y / table.clientHeight;
      };
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
  }
}

/* ---------- 01 the batch: face versus edge ---------- */
function batch() {
  const draw = slab($('slab1')), s = $('iron');
  const render = () => {
    const c = (s.valueAsNumber / 100) ** 1.5 * 0.6, parts = [['iron-ferrous', c * 0.6], ['iron-ferric', c * 0.4]];
    draw(colorOf(parts, 0.5).css, colorOf(parts, 20).css);
    $('ironOut').textContent = c < 0.02 ? 'almost none' : c < 0.12 ? 'a trace' : c < 0.3 ? 'window glass' : 'a lot';
    $('ironRead').textContent = c < 0.02
      ? 'Low-iron glass stays nearly colourless even edge on. It is used where the green would show: display cases, solar panels, aquariums.'
      : 'Face on, the light crosses a thin sheet and barely changes. Edge on, it crosses forty times as much glass, and the same iron reads as green.';
  };
  s.addEventListener('input', render); render();
}

/* ---------- 02 the melt: redox ---------- */
function redox() {
  const draw = slab($('slab2')), s = $('redoxR');
  const render = () => {
    const r = s.valueAsNumber / 100, parts = [['iron-ferrous', 0.9 * r], ['iron-ferric', 1.6 * (1 - r)]];
    draw(colorOf(parts, 1).css, colorOf(parts, 6).css);
    $('redoxOut').textContent = `${Math.round(r * 100)}% Fe²⁺`;
    $('redoxRead').textContent = r > 0.65 ? 'Reducing flame: most iron is Fe²⁺, absorbing in the red and near infrared. Blue-green.'
      : r < 0.3 ? 'Oxidizing flame: most iron is Fe³⁺, absorbing violet and blue. A pale straw yellow.'
      : 'A mix of both ions. Each subtracts its own band, and the result is a muddy olive.';
  };
  s.addEventListener('input', render); render();
}

/* ---------- 03 the colour rod: ions ---------- */
const ROD_NOTES = {
  cobalt: 'Co²⁺ absorbs across orange and red in three overlapping bands. A tiny amount is enough: cobalt is among the strongest colorants in glass.',
  copper: 'Cu²⁺ absorbs a broad band in the red and near infrared, leaving turquoise to blue.',
  chromium: 'Cr³⁺ has two bands, one in the violet and one in the orange-red. What gets through is a green window, the green of old bottle glass.',
  manganese: "Mn³⁺ absorbs in the green and lets red and blue through: amethyst. Glassmakers used it as 'glassmaker's soap' to cancel iron's green.",
  neodymium: 'Nd³⁺ has narrow f-electron lines, sharpest near yellow (around 585 nm). The colour shifts with the light it is viewed under.',
  'iron-ferrous': 'Fe²⁺ absorbs a broad band in the red and near infrared. This is the green-blue of window edges.',
};
function ions() {
  const s = $('conc'), draw = slab($('slab3'));
  let cur = 'cobalt';
  const press = chips($('rods'), Object.keys(ROD_NOTES), (id) => COLORANT[id].label, (id) => { cur = id; render(); });
  function render() {
    const k = 2 ** (s.valueAsNumber / 100), T = mixT([[cur, 1]], k);
    draw(tColor(T).css, colorOf([[cur, 1]], k * 5).css);
    strip($('strip3'), ONES, T);
    $('concOut').textContent = `×${k.toFixed(2)}`;
    $('ionRead').textContent = ROD_NOTES[cur];
    press(cur);
  }
  s.addEventListener('input', render); addEventListener('resize', render); render();
}

/* ---------- 04 the glory hole: incandescence hides colour ---------- */
const HOT = 1150; // °C, soda-lime furnace
function heat() {
  const s = $('temp'), ids = ['cobalt', 'copper', 'chromium', 'manganese'];
  let cur = 'cobalt', body = colorOf([[cur, 1]], 1.4).rgb, raf = 0;
  const press = chips($('heatRods'), ids, (id) => id, (id) => { cur = id; body = colorOf([[id, 1]], 1.4).rgb; render(s.valueAsNumber); });
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const el = (id) => document.getElementById(id);
  function render(t) {
    const g = glow(t + 273.15), a = glowStrength(g.luminance);
    const hot = lerp(g.rgb, [1, 0.82, 0.45], a ** 3 * 0.45); // the hottest glass reads yellow-orange
    const col = css(lerp(body, hot, a));
    el('g-body').setAttribute('fill', col);
    el('g-cast').setAttribute('fill', col); el('g-cast').setAttribute('opacity', 0.2 + a * 0.5);
    el('g-halo').setAttribute('fill', css(g.rgb)); el('g-halo').setAttribute('opacity', a * 0.85);
    el('g-rim').setAttribute('opacity', 1 - a * 0.9); // hot glass glows from within; the dark rim appears as it cools
    el('g-rig').setAttribute('transform', `translate(${-(1 - t / HOT) * 330} 0)`);
    $('tempOut').innerHTML = `${Math.round(t)}<small> °C</small>`;
    s.setAttribute('aria-valuetext', `${Math.round(t)} degrees Celsius`);
    $('heatRead').textContent = t > 1000 ? 'In the glory hole. The gather is brighter than any color it carries.'
      : t > 800 ? 'Working heat. Still orange: you are reading temperature, not color.'
      : t > 525 ? 'Cooling through cherry red. The glow is dimming and the colorant starts to show.'
      : t > 200 ? 'Past the Draper point. The glow is too faint to see; this is the colorant.'
      : `Cooled: ${COLORANT[cur].label}. This is the color it carried all along.`;
    press(cur);
  }
  s.addEventListener('input', () => { cancelAnimationFrame(raf); render(s.valueAsNumber); });
  render(HOT);
  // Play the cool-down once, when the scene first comes into view.
  if (!reduceMotion() && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      const t0 = performance.now() + 1200, dur = 7000;
      const tick = (now) => {
        const f = Math.min(1, Math.max(0, (now - t0) / dur)), e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
        const t = HOT - (HOT - 20) * e;
        s.value = String(t); render(t);
        if (f < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    io.observe($('scene'));
  }
}

/* ---------- 05 the reheat: struck gold and band-gap crystals ---------- */
function strike() {
  const base = DENS['gold-colloid'], sG = $('gold'), sE = $('gap');
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // Model: particles form (density rises), then over-strike shifts the band ~30 nm red and broadens it.
  function goldT(t) {
    const amount = smooth(0.1, 0.6, t), over = smooth(0.6, 1, t), shift = over * 6, width = 1 + over * 5; // steps of 5 nm
    const reach = Math.ceil(width * 2);
    return GRID.map((_, i) => {
      let sum = 0, norm = 0;
      for (let k = -reach; k <= reach; k++) {
        const j = Math.min(GRID.length - 1, Math.max(0, Math.round(i - shift + k))), wt = Math.exp(-0.5 * (k / width) ** 2);
        sum += wt * base[j]; norm += wt;
      }
      return 10 ** -((sum / norm) * (amount * 2.2 + 0.02) * (1 + over * 0.6));
    });
  }
  const renderGold = () => {
    const t = sG.valueAsNumber / 100, T = goldT(t);
    $('goldPane').style.setProperty('--c', tColor(T).css);
    strip($('stripGold'), ONES, T);
    const lab = t < 0.15 ? 'unstruck' : t < 0.4 ? 'pink' : t < 0.7 ? 'ruby' : 'over-struck';
    $('goldTag').textContent = lab; $('goldOut').textContent = lab;
    $('goldRead').textContent = t < 0.15 ? 'Gold dissolved as atoms. They absorb almost nothing, so the glass is close to clear.'
      : t < 0.7 ? 'Particles have formed. Their electrons resonate with green light (a surface plasmon) and absorb it; red and some blue pass.'
      : 'Particles grow and clump. The band shifts toward longer wavelengths and broadens, and the ruby goes dull and brown.';
  };
  const renderGap = () => {
    const eV = sE.valueAsNumber / 100, edge = 1240 / eV, T = bandEdge(eV);
    $('gapPane').style.setProperty('--c', tColor(T).css);
    strip($('stripGap'), ONES, T);
    $('gapOut').textContent = `${eV.toFixed(2)} eV · edge ${Math.round(edge)} nm`;
    $('gapTag').textContent = eV > 2.3 ? 'yellow' : eV > 2.05 ? 'orange' : eV > 1.85 ? 'red' : 'deep red';
    $('gapRead').textContent = `Every photon above ${eV.toFixed(2)} eV (shorter than ${Math.round(edge)} nm) is absorbed; everything longer passes. A sharp edge gives these colors their clean, saturated look.`;
  };
  sG.addEventListener('input', renderGold); sE.addEventListener('input', renderGap);
  addEventListener('resize', () => { renderGold(); renderGap(); });
  renderGold(); renderGap();
}

/* ---------- 06 the cold shop: dichroic ---------- */
function dichroic() {
  const s = $('angle');
  const set = (id, attrs) => { const el = document.getElementById(id); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); };
  const render = () => {
    const deg = s.valueAsNumber, th = (deg * Math.PI) / 180, { center, R } = dichroicBand(deg), T = R.map((r) => 1 - r);
    const rc = tColor(R), tc = tColor(T);
    // the reflected band is dim overall but vivid at the specular angle: show it at full brightness
    const pk = Math.max(...rc.lin, 1e-6), refl = css(rc.lin.map((v) => encode(Math.max(0, v) / pk)));
    const L = 150, x0 = 260, y0 = 150, dx = Math.sin(th) * L, dy = Math.cos(th) * L * 0.8;
    const thr = Math.asin(Math.sin(th) / 1.5), bx = x0 + Math.tan(thr) * 34, ex = bx + Math.sin(th) * 110, ey = y0 + 34 + Math.cos(th) * 110;
    set('d-in', { x1: x0 - dx, y1: y0 - dy, x2: x0, y2: y0 });
    set('d-ref', { x1: x0, y1: y0, x2: x0 + dx, y2: y0 - dy, stroke: refl });
    set('d-tr', { x1: bx, y1: y0 + 34, x2: ex, y2: ey, stroke: tc.css });
    set('d-tref', { x: Math.min(505, x0 + dx + 4), y: Math.max(16, y0 - dy - 10) });
    set('d-ttr', { x: Math.min(420, ex + 12), y: Math.min(312, ey) });
    strip($('stripDi'), R.map((r) => Math.min(1, r / 0.9)), T);
    $('angleOut').textContent = `${deg}° · band at ${Math.round(center)} nm`;
  };
  s.addEventListener('input', render); addEventListener('resize', render); render();
}

/* ---------- 07 the rack: real supplier colours on hue shelves ---------- */
function rack() {
  const items = JSON.parse($('rack-data').textContent);
  const MECH = [['all', 'everything'], ['ions', 'ions'], ['colloids', 'metal colloids'], ['bandgap', 'semiconductors'], ['structure', 'structure'], ['unknown', 'unclassified']];
  const MECH_NOTE = { ions: 'ions', colloids: 'metal colloid', bandgap: 'semiconductor', structure: 'structural', unknown: 'mechanism not published' };
  const SHELVES = [['reds', 345, 15], ['ambers & browns', 15, 45], ['yellows', 45, 70], ['greens', 70, 160], ['teals', 160, 195], ['blues', 195, 250], ['violets', 250, 290], ['pinks', 290, 345]];
  const NEUTRAL = 'whites, greys & blacks', names = [...SHELVES.map((x) => x[0]), NEUTRAL];
  const hsl = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, d ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
  };
  for (const it of items) {
    const [h, sat, l] = (it.hsl = hsl(it.hex));
    it.shelf = sat < 0.14 || l < 0.1 || l > 0.94 ? NEUTRAL : SHELVES.find(([, a, b]) => (a > b ? h >= a || h < b : h >= a && h < b))[0];
  }
  items.sort((a, b) => names.indexOf(a.shelf) - names.indexOf(b.shelf) || b.hsl[2] - a.hsl[2]);
  $('rackN').textContent = items.length.toLocaleString('en');

  const mosaic = $('mosaic'), rows = {};
  for (const n of names) {
    const row = document.createElement('div');
    row.className = 'shelf';
    row.innerHTML = `<span>${n}<b></b></span><div class="rods"></div>`;
    mosaic.appendChild(row); rows[n] = row;
  }
  items.forEach((it, i) => {
    const d = document.createElement('div');
    d.style.setProperty('--c', it.hex); d.dataset.i = i;
    if (it.opacity === 'opaque') d.className = 'op';
    rows[it.shelf].lastChild.appendChild(d);
  });
  const recount = () => {
    for (const n of names) {
      const shown = [...rows[n].lastChild.children].filter((d) => d.style.display !== 'none').length;
      rows[n].querySelector('b').textContent = shown;
      rows[n].classList.toggle('empty', !shown);
    }
  };
  recount();

  const tag = $('tag');
  let on = null;
  const show = (el) => {
    if (!el?.dataset?.i) return;
    const it = items[el.dataset.i];
    on?.classList.remove('on'); on = el; el.classList.add('on');
    const colorants = it.colorant.length ? ` · ${it.colorant.join(', ')}` : '';
    tag.innerHTML = `<i style="--c:${it.hex}"></i><div><strong></strong><span></span></div>`;
    tag.querySelector('strong').textContent = it.name;
    tag.querySelector('span').textContent = `${it.supplier} · ${it.code} · ${it.opacity}${colorants} · ${MECH_NOTE[it.mechanism] ?? it.mechanism}`;
  };
  mosaic.addEventListener('pointerover', (e) => show(e.target));
  mosaic.addEventListener('click', (e) => show(e.target));

  const counts = items.reduce((m, it) => ((m[it.mechanism] = (m[it.mechanism] || 0) + 1), m), { all: items.length });
  const box = $('filters');
  for (const [id, lab] of MECH) {
    const b = document.createElement('button');
    b.className = 'chip'; b.setAttribute('aria-pressed', String(id === 'all'));
    b.innerHTML = `${lab} <span>${counts[id] || 0}</span>`;
    b.addEventListener('click', () => {
      for (const x of box.children) x.setAttribute('aria-pressed', String(x === b));
      for (const d of mosaic.querySelectorAll('.rods div')) d.style.display = id === 'all' || items[d.dataset.i].mechanism === id ? '' : 'none';
      recount();
    });
    box.appendChild(b);
  }
}

export function initHome() {
  lightTable(); batch(); redox(); ions(); heat(); strike(); dichroic(); rack();
}
