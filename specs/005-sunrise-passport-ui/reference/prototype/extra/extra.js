/* Sunrise Passport v2 - EXTRA screens: wiring (photos, flags, stamps, maps, poster globe, ?only, long strings).
   Theme / contrast / scale / long attributes are applied by ../tokens.js. */
(function () {
  const qs = new URLSearchParams(location.search);
  const root = document.documentElement;
  const only = qs.get('only');
  if (only) { document.body.classList.add('only', 'static'); }
  if (qs.get('static')) document.body.classList.add('static');

  /* ------------------------------------------------------------ photos (local copies of Unsplash, see photos.json) */
  const photo = (k) => `img/${k}.jpg`;
  function paintPhotos(scope) {
    (scope || document).querySelectorAll('[data-ph]').forEach(el => {
      const parts = el.getAttribute('data-ph').split('@');
      el.style.backgroundImage = `url(${photo(parts[0])})`;
      if (parts[1]) el.style.backgroundPosition = parts[1];
    });
  }

  /* ------------------------------------------------------------ flags (flat, 30x20 viewBox) */
  const H = (cols, hs) => { let y = 0; return cols.map((c, i) => { const h = hs ? hs[i] : 20 / cols.length; const r = `<rect y="${y}" width="30" height="${h}" fill="${c}"/>`; y += h; return r; }).join(''); };
  const V = (cols) => cols.map((c, i) => `<rect x="${i * 30 / cols.length}" width="${30 / cols.length + .2}" height="20" fill="${c}"/>`).join('');
  const star = (cx, cy, r, fill, stroke) => { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .4 : r; p.push((cx + rr * Math.cos(a)).toFixed(2) + ',' + (cy + rr * Math.sin(a)).toFixed(2)); } return `<polygon points="${p.join(' ')}" fill="${fill || 'none'}" ${stroke ? `stroke="${stroke}" stroke-width="1"` : ''}/>`; };
  const FLAGS = {
    pt: V(['#046A38', '#046A38', '#DA291C', '#DA291C', '#DA291C']).replace(/width="6.2"/g, 'width="6.2"') + '<circle cx="12" cy="10" r="4.2" fill="#FFD100"/><circle cx="12" cy="10" r="2.4" fill="#fff" stroke="#DA291C" stroke-width="1"/>',
    es: H(['#AA151B', '#F1BF00', '#AA151B'], [5, 10, 5]),
    fr: V(['#0055A4', '#FFFFFF', '#EF4135']),
    it: V(['#009246', '#FFFFFF', '#CE2B37']),
    de: H(['#000000', '#DD0000', '#FFCE00']),
    nl: H(['#AE1C28', '#FFFFFF', '#21468B']),
    at: H(['#ED2939', '#FFFFFF', '#ED2939']),
    gb: '<rect width="30" height="20" fill="#012169"/><path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0L30 20M30 0L0 20" stroke="#C8102E" stroke-width="1.4"/><path d="M15 0V20M0 10H30" stroke="#fff" stroke-width="6"/><path d="M15 0V20M0 10H30" stroke="#C8102E" stroke-width="3.4"/>',
    gr: (() => { let s = '<rect width="30" height="20" fill="#0D5EAF"/>'; for (let i = 1; i < 9; i += 2) s += `<rect y="${i * 20 / 9}" width="30" height="${20 / 9}" fill="#fff"/>`; return s + '<rect width="11.1" height="11.1" fill="#0D5EAF"/><path d="M5.55 0V11.1M0 5.55H11.1" stroke="#fff" stroke-width="2.2"/>'; })(),
    cz: '<rect width="30" height="10" fill="#fff"/><rect y="10" width="30" height="10" fill="#D7141A"/><path d="M0 0L15 10L0 20Z" fill="#11457E"/>',
    mx: V(['#006847', '#FFFFFF', '#CE1126']) + '<circle cx="15" cy="10" r="2.4" fill="#8C6A2F"/>',
    us: (() => { let s = '<rect width="30" height="20" fill="#fff"/>'; for (let i = 0; i < 13; i += 2) s += `<rect y="${i * 20 / 13}" width="30" height="${20 / 13}" fill="#B22234"/>`; return s + '<rect width="13" height="10.8" fill="#3C3B6E"/>' + [[2.5, 2.4], [6.5, 2.4], [10.5, 2.4], [4.5, 5.4], [8.5, 5.4], [2.5, 8.2], [6.5, 8.2], [10.5, 8.2]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r=".7" fill="#fff"/>`).join(''); })(),
    jp: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#BC002D"/>',
    ma: '<rect width="30" height="20" fill="#C1272D"/>' + star(15, 10.4, 5.4, 'none', '#006233'),
    th: H(['#A51931', '#F4F5F8', '#2D2A4A', '#F4F5F8', '#A51931'], [3.33, 3.33, 6.67, 3.33, 3.33]),
    is: '<rect width="30" height="20" fill="#02529C"/><path d="M0 10H30M10 0V20" stroke="#fff" stroke-width="5"/><path d="M0 10H30M10 0V20" stroke="#DC1E35" stroke-width="2.4"/>',
    ch: '<rect width="30" height="20" fill="#DA291C"/><path d="M15 5V15M10 10H20" stroke="#fff" stroke-width="3.6"/>',
    se: '<rect width="30" height="20" fill="#006AA7"/><path d="M0 10H30M10 0V20" stroke="#FECC00" stroke-width="3.6"/>',
    no: '<rect width="30" height="20" fill="#BA0C2F"/><path d="M0 10H30M10 0V20" stroke="#fff" stroke-width="5"/><path d="M0 10H30M10 0V20" stroke="#00205B" stroke-width="2.4"/>',
    br: '<rect width="30" height="20" fill="#009C3B"/><path d="M15 2.5L27 10L15 17.5L3 10Z" fill="#FFDF00"/><circle cx="15" cy="10" r="4.2" fill="#002776"/>',
    ar: H(['#74ACDF', '#FFFFFF', '#74ACDF'], [6.67, 6.67, 6.66]) + '<circle cx="15" cy="10" r="1.8" fill="#F6B40E"/>',
    pe: V(['#D91023', '#FFFFFF', '#D91023']),
    ca: '<rect width="30" height="20" fill="#fff"/><rect width="7.5" height="20" fill="#D52B1E"/><rect x="22.5" width="7.5" height="20" fill="#D52B1E"/><path d="M15 4.5L16.3 8L19 7.2L17.6 11.2L19.5 12L15.6 13.6V16.2H14.4V13.6L10.5 12L12.4 11.2L11 7.2L13.7 8Z" fill="#D52B1E"/>',
    tr: '<rect width="30" height="20" fill="#E30A17"/><circle cx="11.5" cy="10" r="5" fill="#fff"/><circle cx="13" cy="10" r="4" fill="#E30A17"/>' + star(17.5, 10, 2.4, '#fff'),
    kr: '<rect width="30" height="20" fill="#fff"/><path d="M10.5 10a4.5 4.5 0 0 1 9 0z" fill="#CD2E3A"/><path d="M10.5 10a4.5 4.5 0 0 0 9 0z" fill="#0047A0"/>',
    vn: '<rect width="30" height="20" fill="#DA251D"/>' + star(15, 10.6, 6, '#FFFF00'),
    in: H(['#FF9933', '#FFFFFF', '#138808'], [6.67, 6.66, 6.67]) + '<circle cx="15" cy="10" r="2.3" fill="none" stroke="#000080" stroke-width=".8"/>',
    cn: '<rect width="30" height="20" fill="#EE1C25"/>' + star(6, 6, 3.6, '#FFFF00') + star(11.5, 2.8, 1.1, '#FFFF00') + star(13, 5.2, 1.1, '#FFFF00') + star(13, 8.2, 1.1, '#FFFF00') + star(11.5, 10.6, 1.1, '#FFFF00'),
    au: '<rect width="30" height="20" fill="#012169"/>' + star(7.5, 15, 2.6, '#fff') + star(22, 5, 1.5, '#fff') + star(25, 9, 1.5, '#fff') + star(22, 14, 1.5, '#fff') + star(19, 9, 1.5, '#fff') + '<path d="M0 0L13 7M13 0L0 7" stroke="#fff" stroke-width="2"/><path d="M6.5 0V7M0 3.5H13" stroke="#fff" stroke-width="3.4"/><path d="M6.5 0V7M0 3.5H13" stroke="#C8102E" stroke-width="1.8"/>'
  };
  function paintFlags(scope) {
    (scope || document).querySelectorAll('.flag[data-flag], [data-flag]:not(.flag)').forEach(el => {
      const c = el.getAttribute('data-flag');
      if (!el.classList.contains('flag')) el.classList.add('flag');
      el.innerHTML = `<svg viewBox="0 0 30 20" preserveAspectRatio="none" aria-hidden="true">${FLAGS[c] || '<rect width="30" height="20" fill="#CBD2DB"/>'}</svg>`;
    });
  }

  /* ------------------------------------------------------------ stamps: 6 shapes x 4 inks, rotation seeded per country */
  let sid = 0;
  const seed = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rotFor = (code) => ((seed(code) % 1700) / 100) - 8.5;          // -8.5 .. +8.5 deg, deterministic
  const SHAPES = ['circle', 'oval', 'rect', 'hex', 'octagon', 'scallop'];
  const INKS = ['coral', 'navy', 'teal', 'green'];
  const esc = (s) => String(s).replace(/&/g, '&amp;');
  function polygonPts(n, r, rot) { const p = []; for (let i = 0; i < n; i++) { const a = rot + i * 2 * Math.PI / n; p.push((60 + r * Math.cos(a)).toFixed(1) + ',' + (60 + r * Math.sin(a)).toFixed(1)); } return p.join(' '); }
  function scallopPath(n, r, amp) { let d = ''; for (let i = 0; i <= n; i++) { const a = i * 2 * Math.PI / n, am = (i - .5) * 2 * Math.PI / n; const p = [60 + r * Math.cos(a), 60 + r * Math.sin(a)], c = [60 + (r + amp) * Math.cos(am), 60 + (r + amp) * Math.sin(am)]; d += i === 0 ? `M${p[0].toFixed(1)} ${p[1].toFixed(1)}` : `Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`; } return d + 'Z'; }
  function stampSVG(o) {
    const id = 'stp' + (sid++), W1 = o.bold ? 4.4 : 3.4, W2 = o.bold ? 2.2 : 1.5;
    const f = 'font-family="Bricolage Grotesque,sans-serif"';
    const T = (x, y, size, w, ls, t) => `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" font-weight="${w}" letter-spacing="${ls}" fill="currentColor" ${f}>${esc(t)}</text>`;
    let inner = '';
    const dash = o.dashed ? 'stroke-dasharray="6 4"' : '';
    if (o.shape === 'circle') inner = `<circle cx="60" cy="60" r="55" fill="none" stroke="currentColor" stroke-width="${W1}" ${dash}/><circle cx="60" cy="60" r="48.5" fill="none" stroke="currentColor" stroke-width="${W2}"/><circle cx="60" cy="60" r="29" fill="none" stroke="currentColor" stroke-width="${W2}"/><path id="${id}t" d="M 23 60 a 37 37 0 0 1 74 0" fill="none"/><path id="${id}b" d="M 16 60 a 44 44 0 0 0 88 0" fill="none"/><text font-size="11" font-weight="700" letter-spacing="2.2" fill="currentColor" ${f}><textPath href="#${id}t" startOffset="50%" text-anchor="middle">${esc(o.top)}</textPath></text><text font-size="10" font-weight="700" letter-spacing="2" fill="currentColor" ${f}><textPath href="#${id}b" startOffset="50%" text-anchor="middle">${esc(o.bottom)}</textPath></text>${T(60, 69, 25, 800, 0, o.code)}<path d="M18.5 55.5L22 60L18.5 64.5L15 60Z M101.5 55.500L105 60L101.500 64.500L98 60Z" fill="currentColor"/>`;
    else if (o.shape === 'oval') inner = `<ellipse cx="60" cy="60" rx="57" ry="42" fill="none" stroke="currentColor" stroke-width="${W1}" ${dash}/><ellipse cx="60" cy="60" rx="50" ry="35" fill="none" stroke="currentColor" stroke-width="${W2}"/>${T(60, 45, 10, 700, 3, o.top)}${T(60, 69, 27, 800, 0, o.code)}${T(60, 83, 10, 700, 2, o.bottom)}`;
    else if (o.shape === 'rect') inner = `<rect x="6" y="20" width="108" height="80" rx="12" fill="none" stroke="currentColor" stroke-width="${W1}" ${dash}/><rect x="13" y="27" width="94" height="66" rx="7" fill="none" stroke="currentColor" stroke-width="${W2}"/>${T(60, 43, 10, 700, 3, o.top)}${T(60, 71, 30, 800, 0, o.code)}<line x1="24" x2="96" y1="78" y2="78" stroke="currentColor" stroke-width="${W2}"/>${T(60, 90, 10, 700, 2, o.bottom)}`;
    else if (o.shape === 'hex') inner = `<polygon points="115,60 87.5,107.6 32.5,107.6 5,60 32.5,12.4 87.5,12.4" fill="none" stroke="currentColor" stroke-width="${W1}" stroke-linejoin="round" ${dash}/><polygon points="107,60 83.5,100.7 36.5,100.7 13,60 36.5,19.3 83.5,19.3" fill="none" stroke="currentColor" stroke-width="${W2}" stroke-linejoin="round"/>${T(60, 38, 10, 700, 2.5, o.top)}${T(60, 71, 29, 800, 0, o.code)}${T(60, 90, 10, 700, 1.6, o.bottom)}`;
    else if (o.shape === 'octagon') inner = `<polygon points="${polygonPts(8, 57, Math.PI / 8)}" fill="none" stroke="currentColor" stroke-width="${W1}" stroke-linejoin="round" ${dash}/><polygon points="${polygonPts(8, 49, Math.PI / 8)}" fill="none" stroke="currentColor" stroke-width="${W2}" stroke-linejoin="round"/>${T(60, 40, 10, 700, 2.5, o.top)}${T(60, 70, 28, 800, 0, o.code)}<path d="M40 79h40m-6-4l6 4-6 4" fill="none" stroke="currentColor" stroke-width="${W2 + .4}" stroke-linecap="round" stroke-linejoin="round"/>${T(60, 94, 10, 700, 1.6, o.bottom)}`;
    else inner = `<path d="${scallopPath(24, 53, 5)}" fill="none" stroke="currentColor" stroke-width="${W1 - .6}" stroke-linejoin="round" ${dash}/><circle cx="60" cy="60" r="41" fill="none" stroke="currentColor" stroke-width="${W2}"/>${T(60, 42, 10, 700, 2.5, o.top)}${T(60, 70, 28, 800, 0, o.code)}${T(60, 88, 10, 700, 1.6, o.bottom)}`;
    return `<svg viewBox="0 0 120 120" aria-hidden="true"><g ${o.clean ? '' : 'filter="url(#grunge)"'}>${inner}</g></svg>`;
  }
  const STAMPS = {
    pt: { shape: 'circle', ink: 'coral', top: 'LISBOA · SINTRA', bottom: '12 OCT 2026' },
    jp: { shape: 'rect', ink: 'navy', top: 'ARRIVAL', bottom: '03 MAR 2026' },
    mx: { shape: 'hex', ink: 'teal', top: 'CDMX', bottom: 'NOV 2025' },
    es: { shape: 'octagon', ink: 'green', top: 'MADRID', bottom: 'APR 2024' },
    fr: { shape: 'scallop', ink: 'coral', top: 'PARIS', bottom: 'JUN 2024' },
    it: { shape: 'oval', ink: 'navy', top: 'ROMA', bottom: 'SEP 2023' },
    gb: { shape: 'rect', ink: 'green', top: 'LONDON', bottom: 'MAY 2023' },
    is: { shape: 'oval', ink: 'teal', top: 'REYKJAVIK', bottom: 'JAN 2027', dashed: true },
    th: { shape: 'hex', ink: 'coral', top: 'BANGKOK', bottom: 'FEB 2025' },
    ma: { shape: 'scallop', ink: 'teal', top: 'MARRAKECH', bottom: 'MAR 2025' },
    us: { shape: 'octagon', ink: 'navy', top: 'NEW YORK', bottom: 'OCT 2022' },
    de: { shape: 'circle', ink: 'green', top: 'BERLIN', bottom: 'DEC 2022' },
    nl: { shape: 'oval', ink: 'coral', top: 'AMSTERDAM', bottom: 'JUL 2022' },
    gr: { shape: 'circle', ink: 'teal', top: 'ATHINA', bottom: 'AUG 2021' },
    cz: { shape: 'hex', ink: 'navy', top: 'PRAHA', bottom: 'NOV 2021' }
  };
  function paintStamps(scope) {
    (scope || document).querySelectorAll('[data-stamp]').forEach(el => {
      const code = el.getAttribute('data-stamp');
      const o = Object.assign({ code: code.toUpperCase(), shape: SHAPES[seed(code) % 6], ink: INKS[seed(code + 'i') % 4], top: code.toUpperCase(), bottom: '2026' }, STAMPS[code] || {});
      if (el.hasAttribute('data-bold')) o.bold = true;
      if (el.hasAttribute('data-clean')) o.clean = true;
      o.code = code.toUpperCase();
      el.classList.add('stamp', 'ink-' + (el.getAttribute('data-ink') || o.ink));
      if (!el.hasAttribute('data-norot')) el.style.setProperty('--r', rotFor(code).toFixed(1) + 'deg');
      el.innerHTML = stampSVG(o);
    });
  }
  window.SPStamp = { stampSVG, rotFor, seed };

  /* ------------------------------------------------------------ mini maps for offline regions (d3 + world-atlas 110m) */
  let land = null;
  function getLand() { if (!land && window.topojson && window.WORLD) land = topojson.feature(WORLD, WORLD.objects.countries); return land; }
  function paintMaps(scope) {
    const L = getLand(); if (!L || !window.d3) return;
    (scope || document).querySelectorAll('[data-map]').forEach(el => {
      const [x0, y0, x1, y1] = el.getAttribute('data-map').split(',').map(Number);   // region bbox lon/lat
      const w = el.clientWidth || +el.getAttribute('data-w') || 72, h = el.clientHeight || +el.getAttribute('data-h') || 72;
      const pad = +el.getAttribute('data-pad') || 1.8;
      const dx = pad * (x1 - x0), dy = pad * (y1 - y0);
      const ext = { type: 'MultiPoint', coordinates: [[x0 - dx, y0 - dy], [x1 + dx, y1 + dy], [x0 - dx, y1 + dy], [x1 + dx, y0 - dy]] };
      const proj = d3.geoMercator().fitExtent([[0, 0], [w, h]], ext);
      const path = d3.geoPath(proj);
      const a = proj([x0, y1]), b = proj([x1, y0]);
      const dl = el.getAttribute('data-state');
      el.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><rect class="m-sea" width="${w}" height="${h}"/><path class="m-land" d="${path(L)}"/><rect class="m-box ${dl || ''}" x="${a[0].toFixed(1)}" y="${a[1].toFixed(1)}" width="${(b[0] - a[0]).toFixed(1)}" height="${(b[1] - a[1]).toFixed(1)}" rx="3"/></svg>`;
    });
  }

  /* ------------------------------------------------------------ poster globe (orthographic SVG, lifted arcs) */
  const C = { lisbon: [-9.14, 38.72], porto: [-8.61, 41.15], reykjavik: [-21.9, 64.15], mexico: [-99.13, 19.43], tokyo: [139.69, 35.68], madrid: [-3.7, 40.4], paris: [2.35, 48.86], london: [-0.13, 51.5], rome: [12.5, 41.9], marrakech: [-8.0, 31.63], nyc: [-74, 40.7], bangkok: [100.5, 13.75] };
  const VISITED = ['724', '250', '380', '276', '528', '826', '300', '203', '484', '840', '392', '504', '764', '620'];
  function paintGlobes(scope) {
    const L = getLand(); if (!L || !window.d3) return;
    (scope || document).querySelectorAll('[data-globe]').forEach(el => {
      const [lon, lat, R] = el.getAttribute('data-globe').split(',').map(Number);
      const w = el.clientWidth, h = el.clientHeight, cx = w / 2, cy = h / 2;
      const proj = d3.geoOrthographic().scale(R).translate([cx, cy]).rotate([-lon, -lat]).clipAngle(90);
      const path = d3.geoPath(proj);
      const vis = { type: 'FeatureCollection', features: L.features.filter(f => VISITED.includes(String(f.id))) };
      const arcs = el.getAttribute('data-arcs') ? el.getAttribute('data-arcs').split(';').map(s => s.split('>')) : [];
      let arcSvg = '';
      arcs.forEach(([a, b, kind]) => {
        const pa = proj(C[a]), pb = proj(C[b]); if (!pa || !pb) return;
        const dx = pb[0] - pa[0], dy = pb[1] - pa[1], dist = Math.hypot(dx, dy), mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2;
        const ox = mx - cx, oy = my - cy, ol = Math.hypot(ox, oy) || 1, lift = Math.min(dist * .42, R * .55);
        const qx = mx + ox / ol * lift, qy = my + oy / ol * lift;
        const d = `M${pa[0].toFixed(1)} ${pa[1].toFixed(1)}Q${qx.toFixed(1)} ${qy.toFixed(1)} ${pb[0].toFixed(1)} ${pb[1].toFixed(1)}`;
        arcSvg += `<path d="${d}" class="g-arc-case"/><path d="${d}" class="g-arc ${kind || ''}"/>`;
      });
      const dots = (el.getAttribute('data-pins') || '').split(',').filter(Boolean).map(k => { const p = proj(C[k]); return p ? `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="5" class="g-pin"/>` : ''; }).join('');
      el.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><circle class="g-ocean" cx="${cx}" cy="${cy}" r="${R}"/><path class="g-grat" d="${path(d3.geoGraticule10())}"/><path class="g-land" d="${path(L)}"/><path class="g-vis" d="${path(vis)}"/>${arcSvg}${dots}<circle class="g-limb" cx="${cx}" cy="${cy}" r="${R}"/></svg>`;
    });
  }


  /* ------------------------------------------------------------ pseudo QR (decor only, seeded) */
  function paintQR(scope) {
    (scope || document).querySelectorAll('[data-qr]').forEach(el => {
      const N = 25, cell = 4; let h = seed(el.getAttribute('data-qr')); const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
      const finder = (x, y) => (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8);
      let r = '';
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { if (finder(x, y)) continue; if (rnd() > .52) r += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}"/>`; }
      const f = (x, y) => `<rect x="${x * cell}" y="${y * cell}" width="${7 * cell}" height="${7 * cell}" fill="#000"/><rect x="${(x + 1) * cell}" y="${(y + 1) * cell}" width="${5 * cell}" height="${5 * cell}" fill="#fff"/><rect x="${(x + 2) * cell}" y="${(y + 2) * cell}" width="${3 * cell}" height="${3 * cell}" fill="#000"/>`;
      el.innerHTML = `<svg viewBox="0 0 ${N * cell} ${N * cell}" aria-hidden="true"><rect width="${N * cell}" height="${N * cell}" fill="#fff"/><g fill="#000">${r}</g>${f(0, 0)}${f(N - 7, 0)}${f(0, N - 7)}</svg>`;
    });
  }

  /* ------------------------------------------------------------ long strings (tokens.js sets data-long on <html>) */
  function applyLong() {
    if (!root.hasAttribute('data-long-mode')) return;
    document.querySelectorAll('[data-long]').forEach(el => { if (el !== root) el.textContent = el.getAttribute('data-long'); });
  }

  /* ------------------------------------------------------------ interactions (prototype only) */
  function wire() {
    document.addEventListener('click', e => {
      const chip = e.target.closest('[data-pick] .chip');
      if (chip) { chip.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('is-on')); chip.classList.add('is-on'); }
      const sb = e.target.closest('.seg button');
      if (sb) { sb.parentElement.querySelectorAll('button').forEach(t => { t.classList.remove('is-on'); t.setAttribute('aria-checked', 'false'); }); sb.classList.add('is-on'); sb.setAttribute('aria-checked', 'true');
        if (sb.parentElement.hasAttribute('data-theme-seg')) { const i = [...sb.parentElement.children].indexOf(sb); if (i === 1) root.setAttribute('data-theme', 'dark'); else if (i === 0) root.removeAttribute('data-theme'); } }
      const tab = e.target.closest('.tabs .tab');
      if (tab) { tab.parentElement.querySelectorAll('.tab').forEach(t => t.classList.remove('is-on')); tab.classList.add('is-on'); }
    });
    document.querySelectorAll('[data-set-theme]').forEach(b => b.addEventListener('click', () => {
      const t = b.getAttribute('data-set-theme');
      if (t === 'dark') root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
      document.querySelectorAll('[data-set-theme]').forEach(x => x.classList.toggle('is-on', x === b));
      requestAnimationFrame(() => { paintMaps(); paintGlobes(); });
    }));
  }

  function init() {
    if (only) { const s = document.querySelector(`.slot[data-slot="${only}"]`); if (s) s.classList.add('is-only'); }
    paintPhotos(); paintFlags(); paintStamps(); paintQR(); applyLong(); wire();
    const go = () => { paintMaps(); paintGlobes(); };
    go();
    const t = root.getAttribute('data-theme') === 'dark';
    document.querySelectorAll('.seg[data-theme-seg]').forEach(sg => { [...sg.children].forEach((b, i) => { const on = (i === 1) === t && i !== 2; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on)); }); });
    document.querySelectorAll('[data-set-theme]').forEach(b => b.classList.toggle('is-on', (b.getAttribute('data-set-theme') === 'dark') === t));
    document.fonts && document.fonts.ready.then(() => { document.body.classList.add('fonts-ready'); go(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
