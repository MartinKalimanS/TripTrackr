/* SUNRISE PASSPORT v2 - prototype wiring: globe layout (camera padding formula), markers, stamps, long mode, board tools. */
(function () {
  const qs = new URLSearchParams(location.search);
  const root = document.documentElement;
  const only = qs.get('only');
  const theme = qs.get('theme') === 'dark' ? 'dark' : 'light';
  const contrast = qs.get('contrast') === 'more';
  const staticMode = !!(only || qs.get('static'));
  if (only) document.body.classList.add('only');
  if (staticMode) document.body.classList.add('static');
  if (qs.get('fixture') === 'white') document.body.classList.add('fixture-white');
  if (qs.get('bgonly')) document.body.classList.add('bgonly');
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------ stamps: 6 shapes x 4 inks (ink = CSS colour on .stamp) */
  let sid = 0;
  const esc = s => String(s).replace(/&/g, '&amp;');
  function stampSVG(o) {
    const id = 'stp' + (sid++);
    const W1 = o.bold === false ? 3.2 : 4.2, W2 = 1.8;
    const f = "font-family=\"'Bricolage Grotesque',sans-serif\"";
    const T = (x, y, size, weight, ls, txt) => `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" font-weight="${weight}" letter-spacing="${ls}" fill="currentColor" ${f}>${esc(txt)}</text>`;
    const dash = o.dashed ? 'stroke-dasharray="7 5"' : '';
    let inner = '';
    if (o.shape === 'circle') {
      inner = `<circle cx="60" cy="60" r="55" fill="none" stroke="currentColor" stroke-width="${W1}" ${dash}/>
        <circle cx="60" cy="60" r="48" fill="none" stroke="currentColor" stroke-width="${W2}"/>
        <circle cx="60" cy="60" r="29" fill="none" stroke="currentColor" stroke-width="${W2}"/>
        <path id="${id}t" d="M 23 60 a 37 37 0 0 1 74 0" fill="none"/><path id="${id}b" d="M 15 60 a 45 45 0 0 0 90 0" fill="none"/>
        <text font-size="11" font-weight="700" letter-spacing="2.2" fill="currentColor" ${f}><textPath href="#${id}t" startOffset="50%" text-anchor="middle">${esc(o.top)}</textPath></text>
        <text font-size="10" font-weight="700" letter-spacing="2" fill="currentColor" ${f}><textPath href="#${id}b" startOffset="50%" text-anchor="middle">${esc(o.bottom)}</textPath></text>
        ${T(60, 69, 25, 800, '0', o.code)}`;
    } else if (o.shape === 'rect') {
      inner = `<rect x="6" y="20" width="108" height="80" rx="12" fill="none" stroke="currentColor" stroke-width="${W1}" ${dash}/>
        <rect x="13" y="27" width="94" height="66" rx="7" fill="none" stroke="currentColor" stroke-width="${W2}"/>
        ${T(60, 43, 10, 700, '3', o.top)}${T(60, 71, 30, 800, '0', o.code)}
        <line x1="24" x2="96" y1="78" y2="78" stroke="currentColor" stroke-width="${W2}"/>${T(60, 90, 10, 700, '2', o.bottom)}`;
    } else if (o.shape === 'hex') {
      inner = `<polygon points="115,60 87.5,107.6 32.5,107.6 5,60 32.5,12.4 87.5,12.4" fill="none" stroke="currentColor" stroke-width="${W1}" stroke-linejoin="round" ${dash}/>
        <polygon points="107,60 83.5,100.7 36.5,100.7 13,60 36.5,19.3 83.5,19.3" fill="none" stroke="currentColor" stroke-width="${W2}" stroke-linejoin="round"/>
        ${T(60, 38, 10, 700, '2.5', o.top)}${T(60, 71, 29, 800, '0', o.code)}${T(60, 90, 10, 700, '1.6', o.bottom)}`;
    } else if (o.shape === 'oct') {
      const pts = r => [...Array(8)].map((_, k) => { const a = (22.5 + k * 45) * Math.PI / 180; return (60 + r * Math.cos(a)).toFixed(1) + ',' + (60 + r * Math.sin(a)).toFixed(1); }).join(' ');
      inner = `<polygon points="${pts(58)}" fill="none" stroke="currentColor" stroke-width="${W1}" stroke-linejoin="round" ${dash}/>
        <polygon points="${pts(50)}" fill="none" stroke="currentColor" stroke-width="${W2}" stroke-linejoin="round"/>
        ${T(60, 40, 10, 700, '2.5', o.top)}${T(60, 71, 29, 800, '0', o.code)}${T(60, 90, 10, 700, '2', o.bottom)}`;
    } else if (o.shape === 'scallop') {
      inner = `<circle cx="60" cy="60" r="55" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-dasharray="0.1 9.6"/>
        <circle cx="60" cy="60" r="47" fill="none" stroke="currentColor" stroke-width="${W2}"/>
        <path id="${id}t" d="M 24 60 a 36 36 0 0 1 72 0" fill="none"/>
        <text font-size="10" font-weight="700" letter-spacing="2.4" fill="currentColor" ${f}><textPath href="#${id}t" startOffset="50%" text-anchor="middle">${esc(o.top)}</textPath></text>
        ${T(60, 69, 25, 800, '0', o.code)}${T(60, 86, 10, 700, '2', o.bottom)}`;
    } else {
      inner = `<ellipse cx="60" cy="60" rx="57" ry="42" fill="none" stroke="currentColor" stroke-width="${W1}" ${dash}/>
        <ellipse cx="60" cy="60" rx="50" ry="35" fill="none" stroke="currentColor" stroke-width="${W2}" ${o.dashed ? 'stroke-dasharray="3 4"' : ''}/>
        ${T(60, 45, 10, 700, '3', o.top)}${T(60, 69, 27, 800, '0', o.code)}${T(60, 83, 10, 700, '2', o.bottom)}`;
    }
    return `<svg viewBox="0 0 120 120" aria-hidden="true"><g ${o.grunge === false ? '' : 'filter="url(#grunge)"'}>${inner}</g></svg>`;
  }
  const STAMPS = {
    pt: { shape: 'circle', top: 'LISBOA · SINTRA', bottom: '12 OCT 2026', code: 'PT' },
    jp: { shape: 'rect', top: 'ARRIVAL', bottom: '03 MAR 2026', code: 'JP' },
    mx: { shape: 'hex', top: 'CDMX', bottom: 'NOV 2025', code: 'MX' },
    es: { shape: 'oct', top: 'MADRID', bottom: 'APR 2024', code: 'ES' },
    it: { shape: 'scallop', top: 'ROMA', bottom: 'SEP 2023', code: 'IT' },
    ghost: { shape: 'oval', top: 'ICELAND', bottom: 'JAN 2027', code: 'IS', dashed: true, grunge: false },
    welcome: { shape: 'circle', top: 'FIRST STAMP', bottom: '14 OCT 2026', code: 'TT' },
  };
  function paintStamps(scope) {
    (scope || document).querySelectorAll('[data-stamp]').forEach(el => { el.innerHTML = stampSVG(STAMPS[el.getAttribute('data-stamp')] || {}); });
  }

  /* ------------------------------------------------------------ globe: camera padding formula + markers */
  const C = { lisbon: [-9.14, 38.72], reykjavik: [-21.9, 64.15], mexico: [-99.13, 19.43], pt: [-8.9, 40.0], alps: [7.5, 46.2], madrid: [-3.7, 40.4], london: [-0.13, 51.5] };
  const VISITED = [724, 250, 380, 276, 528, 826, 300, 203, 484, 840, 392, 504, 764];
  const ARCS = [
    { from: C.mexico, to: C.lisbon, kind: 'past', lift: .17 },
    { from: C.lisbon, to: C.reykjavik, kind: 'planned', lift: .12 },
    { from: C.london, to: C.lisbon, kind: 'past', lift: .06 },
  ];
  const state = {};
  const frameBox = el => el.closest('.phone').getBoundingClientRect();
  function cameraFor(kind, headerBottom, coverTop) {
    // R and centre from the free band [headerBottom, coverTop]: the same rule the RN camera padding uses
    const band = coverTop - headerBottom;
    if (kind === 'peek') { const R = Math.max(110, Math.min(175, (band - 24) / 2)); return { R, cx: 195, cy: headerBottom + band / 2 + 4 }; }
    const R = Math.max(150, Math.min(286, band * 0.95));
    return { R, cx: 205, cy: headerBottom + 28 + R };
  }
  function layout(screen) {
    const fr = frameBox(screen);
    const kind = screen.dataset.globe;
    const head = screen.querySelector('.home-head, .wordmark');
    const headerBottom = head ? head.getBoundingClientRect().bottom - fr.top : 110;
    const cover = screen.querySelector('.sheet, .invite, .wl-sheet');
    let coverTop = cover ? cover.getBoundingClientRect().top - fr.top : 844;
    if (screen.querySelector('.invite')) coverTop -= 44;
    return { kind, headerBottom, coverTop, fr };
  }
  const MARKS = {
    half: [
      { ll: C.pt, s: 56, ph: 'tram', active: true, tag: { t: 'Portugal Road Trip', long: 'Lisbon to the Algarve via Sintra, Porto and the Douro Valley', s: 'Day 3 of 8 · Sintra' } },
      { ll: C.reykjavik, s: 44, ph: 'iceland', planned: true },
      { ll: C.mexico, s: 40, ph: 'mexico' },
      { ll: C.alps, s: 40, cluster: 3 },
    ],
    peek: [
      { ll: C.pt, s: 48, ph: 'tram', active: true, tag: { t: 'Portugal Road Trip', long: 'Lisbon to the Algarve via Sintra, Porto and the Douro Valley', s: 'Day 3 of 8 · Sintra' } },
      { ll: C.reykjavik, s: 40, ph: 'iceland', planned: true },
      { ll: C.mexico, s: 36, ph: 'mexico' },
      { ll: C.alps, s: 36, cluster: 3 },
    ],
  };
  const PHFILE = {
    tram: 'photo-1585208798174-6cedd86e019a', iceland: 'photo-1476610182048-b716b8518aae', mexico: 'photo-1518105779142-d975f22f1b0a',
  };
  function draw(screen) {
    const canvas = screen.querySelector('canvas.globe'); if (!canvas) return;
    const L = layout(screen); const kind = L.kind;
    const cam = cameraFor(kind === 'welcome' || kind === 'empty' ? 'half' : kind, L.headerBottom, L.coverTop);
    const st = state[screen.closest('.phone').id] || (state[screen.closest('.phone').id] = { lon: kind === 'peek' ? -24 : kind === 'welcome' ? 8 : kind === 'empty' ? -12 : -20, lat: kind === 'peek' ? 24 : kind === 'empty' ? 30 : 15, spun: 0 });
    const visited = kind === 'empty' ? [] : VISITED;
    const cfg = { w: 390, h: 844, cx: cam.cx, cy: cam.cy, R: cam.R, lon: st.lon, lat: st.lat, theme, contrast,
      visited, active: kind === 'empty' ? [] : [620], planned: kind === 'empty' ? [] : [352], arcs: kind === 'empty' ? [] : ARCS };
    const res = SPGlobe.render(canvas, cfg);
    const layer = screen.querySelector('.markers'); layer.innerHTML = '';
    const marks = MARKS[kind];
    if (!marks) return;
    const fr = L.fr;
    const placed = [];
    marks.forEach(m => {
      const p = res.project(m.ll);
      const maxY = L.coverTop - 6;
      if (p.z < 0.14 || p.x < m.s / 2 + 8 || p.x > 390 - m.s / 2 - 8 || p.y < L.headerBottom + 10 || p.y > maxY - m.s / 2) return;
      const el = document.createElement('div');
      el.className = 'roundel' + (m.active ? ' is-active' : '') + (m.planned ? ' is-planned' : '') + (m.cluster ? ' cluster' : '');
      el.style.setProperty('--s', m.s + 'px'); el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
      if (m.ph && !document.body.classList.contains('fixture-white')) el.style.backgroundImage = `url(img/${PHFILE[m.ph]}.jpg)`;
      if (m.cluster) el.textContent = '+' + m.cluster;
      if (m.active) { const pu = document.createElement('div'); pu.className = 'rpulse'; pu.style.left = p.x + 'px'; pu.style.top = p.y + 'px'; layer.appendChild(pu); }
      layer.appendChild(el);
      placed.push({ x: p.x, y: p.y, s: m.s });
      if (m.tag) {
        const t = document.createElement('div'); t.className = 'tag';
        const title = qs.get('long') === '1' ? m.tag.long : m.tag.t;
        t.innerHTML = `<b>${title}</b><span><i class="live-dot" style="width:7px;height:7px;box-shadow:0 0 0 2px rgba(224,74,51,.22);background:#E04A33"></i>${m.tag.s}</span>`;
        t.style.visibility = 'hidden'; layer.appendChild(t);
        const w = t.offsetWidth, h = t.offsetHeight, gap = m.s / 2 + 14;
        const opts = [
          { side: 'right', cls: 's-right', x: p.x - gap - w, y: p.y - h / 2 },
          { side: 'left', cls: 's-left', x: p.x + gap, y: p.y - h / 2 },
          { side: 'above', cls: 's-below', x: p.x - w / 2, y: p.y - m.s / 2 - 14 - h },
          { side: 'below', cls: 's-above', x: p.x - w / 2, y: p.y + m.s / 2 + 14 },
        ];
        const ok = o => o.x >= 12 && o.x + w <= 378 && o.y >= L.headerBottom + 6 && o.y + h <= maxY;
        const pick = opts.find(ok) || opts[2];
        t.classList.add(pick.cls);
        t.style.left = Math.max(12, Math.min(378 - w, pick.x)) + 'px'; t.style.top = pick.y + 'px'; t.style.visibility = '';
      }
    });
  }
  function drawSkeleton(screen) {
    const el = screen.querySelector('[data-skdisc]'); if (!el) return;
    const L = layout(screen); const cam = cameraFor('half', L.headerBottom, L.coverTop);
    el.style.width = el.style.height = cam.R * 2 + 'px'; el.style.left = cam.cx - cam.R + 'px'; el.style.top = cam.cy - cam.R + 'px';
  }
  function attachDrag(screen) {
    const canvas = screen.querySelector('canvas.globe'); if (!canvas) return;
    const id = screen.closest('.phone').id; let drag = null;
    canvas.addEventListener('pointerdown', e => { const st = state[id]; if (!st) return; drag = { x: e.clientX, y: e.clientY, lon: st.lon, lat: st.lat }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return; const st = state[id]; const k = 57.3 / 280;
      st.lon = drag.lon - (e.clientX - drag.x) * k; st.lat = Math.max(-55, Math.min(75, drag.lat + (e.clientY - drag.y) * k)); draw(screen);
    });
    const end = () => { drag = null; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  }
  function spin(screen) {   // idle rotation (Welcome). Off under Reduce Motion and in static renders.
    if (staticMode || reduceMotion || screen.dataset.globe !== 'welcome') return;
    const st = state[screen.closest('.phone').id]; let last = performance.now();
    const tick = t => { st.lon += (t - last) * 0.004; last = t; draw(screen); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------ profile period switch */
  const PERIODS = {
    all: { c: '14', t: '22', d: '61,480', k: '4', cs: '/195', label: 'Passport · all time', lap: '1.5× around the Earth' },
    2026: { c: '3', t: '3', d: '21,380', k: '2', cs: '/195', label: 'Passport · 2026', lap: '0.5× around the Earth' },
    2025: { c: '5', t: '6', d: '14,210', k: '3', cs: '/195', label: 'Passport · 2025', lap: '0.4× around the Earth' },
  };
  function setPeriod(p) {
    const d = PERIODS[p];
    ['c', 't', 'd', 'k'].forEach(k => { const e = document.querySelector(`[data-pp="${k}"]`); if (e) e.textContent = d[k]; });
    const l = document.querySelector('[data-pp-label]'); if (l) l.textContent = d.label;
    const lp = document.querySelector('[data-pp-lap]'); if (lp) lp.textContent = d.lap;
  }

  /* ------------------------------------------------------------ board tools */
  function tools() {
    const el = document.getElementById('tools'); if (!el) return;
    const mk = (label, key, val) => {
      const u = new URL(location.href); const on = qs.get(key) === val;
      if (on) u.searchParams.delete(key); else u.searchParams.set(key, val);
      return `<a class="${on ? 'on' : ''}" href="${u.search || '?'}">${label}</a>`;
    };
    el.innerHTML = mk('Nightfall', 'theme', 'dark') + mk('Contrast+', 'contrast', 'more') + mk('Android', 'platform', 'android') + mk('Text 1.5x', 'scale', '1.5') + mk('Text 2x', 'scale', '2') + mk('Long strings', 'long', '1') + mk('White-photo test', 'fixture', 'white');
  }


  /* ------------------------------------------------------------ audit (?audit=1): text/icon boxes + colours, clip + overlap checks -> <pre id=audit> */
  function audit() {
    const ph = document.querySelector('.slot.is-only .phone') || document.querySelector('.phone'); if (!ph) return;
    const pr = ph.getBoundingClientRect(); const out = { frame: ph.id, texts: [], icons: [], issues: [] };
    const SCROLL = ['list', 'td-scroll', 'sheet-body', 'fbody', 'screen', 'phone', 'sheet', 'fsheet', 'td-sheet', 'days', 'form-backdrop', 'tabbar', 'wl-sheet'];
    const isScroller = a => SCROLL.some(c => a.classList && a.classList.contains(c));
    const alphaOf = el => { let o = 1; for (let a = el; a && a !== document.body; a = a.parentElement) o *= parseFloat(getComputedStyle(a).opacity); return o; };
    const rgba = c => { const m = c.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1]; };
    const rel = r => ({ x: +(r.left - pr.left).toFixed(1), y: +(r.top - pr.top).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) });
    const walker = document.createTreeWalker(ph, NodeFilter.SHOW_TEXT);
    const items = [];
    for (let n; (n = walker.nextNode());) {
      const t = n.nodeValue.trim(); if (!t) continue;
      const el = n.parentElement; if (el.closest('svg, canvas, .stamp, .form-backdrop, .kbd, [data-skdisc]')) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      const rects = [...rg.getClientRects()].filter(r => r.width > 0.5 && r.height > 0.5); if (!rects.length) continue;
      const u = rects.reduce((a, r) => ({ left: Math.min(a.left, r.left), top: Math.min(a.top, r.top), right: Math.max(a.right, r.right), bottom: Math.max(a.bottom, r.bottom) }), { left: 1e9, top: 1e9, right: -1e9, bottom: -1e9 });
      const cs = getComputedStyle(el); const col = rgba(cs.color); col[3] *= alphaOf(el);
      const fs = parseFloat(cs.fontSize), fw = parseInt(cs.fontWeight);
      const trunc = (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) || (cs.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1);
      const rec = { text: t.slice(0, 28), rect: rel({ left: u.left, top: u.top, width: u.right - u.left, height: u.bottom - u.top }), color: col, fs, fw, large: fs >= 24 || (fs >= 18.66 && fw >= 700), trunc,
        decor: !!el.closest('[aria-hidden="true"]'), disabled: !!el.closest('.is-disabled'), chrome: !!el.closest('.status') ? 'status' : (el.closest('.tabbar, .fab, .toast, .year-scrub') ? 'chrome' : '') };
      if (!rec.chrome) { const cr0 = [...ph.querySelectorAll('.tabbar, .fab, .toast, .kbd, .ffoot.abs')].map(c => c.getBoundingClientRect()); if (cr0.some(c => u.left < c.right && u.right > c.left && u.top < c.bottom && u.bottom > c.top)) rec.under = true; }
      out.texts.push(rec); items.push({ el, u, rec });
    }
    ph.querySelectorAll('svg.ic, .status svg').forEach(sv => {
      if (sv.closest('.stamp, .form-backdrop, .kbd, .mark') ) return; const r = sv.getBoundingClientRect(); if (r.width < 4) return;
      const cs = getComputedStyle(sv); const col = rgba(cs.color); col[3] *= alphaOf(sv);
      out.icons.push({ rect: rel(r), color: col, chrome: sv.closest('.status') ? 'status' : (sv.closest('.tabbar, .fab, .toast') ? 'chrome' : ''), warn: !!sv.closest('.sk') });
    });
    // clipping: text outside the phone horizontally, or outside a non-scroller overflow:hidden ancestor
    items.forEach(({ el, u, rec }) => {
      if (rec.trunc) return;
      if ((u.left < pr.left - 1 || u.right > pr.right + 1) && !el.closest('.days')) out.issues.push({ k: 'outside-phone', text: rec.text });
      for (let a = el; a && a !== ph; a = a.parentElement) {
        const cs = getComputedStyle(a); if (!/hidden|clip/.test(cs.overflow + cs.overflowX)) continue; if (isScroller(a)) continue;
        const ar = a.getBoundingClientRect();
        if (u.left < ar.left - 1.5 || u.right > ar.right + 1.5 || u.top < ar.top - 1.5 || u.bottom > ar.bottom + 1.5) { out.issues.push({ k: 'clipped-by:' + a.className.toString().slice(0, 24), text: rec.text }); break; }
      }
    });
    // overlap between text boxes (ignore chrome that content legitimately scrolls under)
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j]; if (a.el.contains(b.el) || b.el.contains(a.el) || a.rec.chrome || b.rec.chrome) continue;
      const w = Math.min(a.u.right, b.u.right) - Math.max(a.u.left, b.u.left), h = Math.min(a.u.bottom, b.u.bottom) - Math.max(a.u.top, b.u.top);
      if (w > 2 && h > 3) out.issues.push({ k: 'overlap', text: a.rec.text + ' / ' + b.rec.text });
    }
    const pre = document.createElement('pre'); pre.id = 'audit'; pre.style.cssText = 'position:fixed;left:-9999px;top:0'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre);
  }

  /* ------------------------------------------------------------ init */
  function init() {
    const trips = document.querySelector('#trips .screen');
    document.querySelectorAll('.form-backdrop').forEach(bd => { if (trips) bd.innerHTML = '<div class="screen" style="background:var(--paper)">' + trips.innerHTML + '</div>'; });
    if (qs.get('long') === '1') document.querySelectorAll('[data-long]').forEach(el => { el.textContent = el.getAttribute('data-long'); });
    paintStamps(); tools();
    if (only) { const s = document.querySelector(`.slot[data-slot="${only}"]`); if (s) s.classList.add('is-only'); }
    const run = () => {
      document.querySelectorAll('.screen[data-globe]').forEach(s => { if (s.dataset.globe === 'loading') drawSkeleton(s); else { draw(s); attachDrag(s); spin(s); } });
      document.body.classList.add('ready');
      if (qs.get('audit')) setTimeout(audit, 30);
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(run); else run();
    document.addEventListener('click', e => {
      const seg = e.target.closest('.seg button');
      if (seg) { seg.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('is-on')); seg.classList.add('is-on'); if (seg.dataset.p) setPeriod(seg.dataset.p); }
      const tab = e.target.closest('.tabbar .tab'); if (tab) { tab.parentElement.querySelectorAll('.tab').forEach(t => t.classList.remove('is-on')); tab.classList.add('is-on'); }
      const day = e.target.closest('.day'); if (day) { day.parentElement.querySelectorAll('.day').forEach(t => t.classList.remove('is-on')); day.classList.add('is-on'); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
