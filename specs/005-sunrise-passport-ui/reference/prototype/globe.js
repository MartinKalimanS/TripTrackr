/* Sunrise Passport globe: d3-geo orthographic on <canvas>.
   Bright friendly sphere, soft atmosphere, tinted visited countries, lifted gradient arcs. */
(function () {
  const D2R = Math.PI / 180;

  const THEMES = {
    light: {
      halo: [[0, 'rgba(96,196,236,.62)'], [.22, 'rgba(130,212,242,.40)'], [.55, 'rgba(190,233,247,.16)'], [1, 'rgba(255,255,255,0)']],
      sun: 'rgba(255,186,110,.55)',
      ocean: [[0, '#DDF3FA'], [.30, '#8FD6EC'], [.68, '#4FB3D9'], [1, '#2E9CC4']],
      land: ['#FFFCF5', '#F6E9D2'],
      landShadow: 'rgba(9,74,128,.20)',
      border: 'rgba(205,176,130,.55)',
      grat: 'rgba(255,255,255,.34)',
      visited: ['#FFCFBF', '#FFB29B'], visitedStroke: '#E04A33',
      active: ['#FF7A58', '#E8452F'], activeStroke: '#B92A1D',
      planned: ['#FFE7B5', '#FFD07A'], plannedStroke: '#B86E00',
      visitedBorder: 'rgba(255,255,255,.9)',
      limb: 'rgba(8,62,132,.30)',
      hi: 'rgba(255,255,255,.38)',
      rim: [[0, 'rgba(255,255,255,0)'], [.55, 'rgba(200,240,255,.18)'], [1, 'rgba(255,255,255,.72)']],
      edge: 'rgba(255,255,255,.75)',
      groundArc: 'rgba(8,62,132,.22)',
      arcPast: ['#E04A33', '#FF9A45'],
      arcActive: ['#E8452F', '#FFB547'],
      arcPlanned: '#B86E00',
      endPast: '#E04A33', endPlanned: '#FFB547',
      casing: '255,255,255'
    },
    dark: {
      halo: [[0, 'rgba(53,201,214,.50)'], [.2, 'rgba(53,201,214,.26)'], [.55, 'rgba(53,150,214,.09)'], [1, 'rgba(10,22,38,0)']],
      sun: 'rgba(255,130,102,.20)',
      ocean: [[0, '#2C74AE'], [.34, '#18538B'], [.72, '#0E3465'], [1, '#08224A']],
      land: ['#3C6E99', '#2A557E'],
      landShadow: 'rgba(2,12,30,.38)',
      border: 'rgba(170,215,245,.20)',
      grat: 'rgba(170,215,255,.11)',
      visited: ['#FFA48E', '#FF8A70'], visitedStroke: '#FFC4B4',
      active: ['#FF9078', '#FF6B4A'], activeStroke: '#FFE0D6',
      planned: ['#FFD98A', '#FFC25E'], plannedStroke: '#FFE3A8',
      visitedBorder: 'rgba(10,22,38,.55)',
      limb: 'rgba(2,10,28,.5)',
      hi: 'rgba(160,215,255,.22)',
      rim: [[0, 'rgba(53,201,214,0)'], [.6, 'rgba(53,201,214,.10)'], [1, 'rgba(120,228,238,.85)']],
      edge: 'rgba(120,228,238,.75)',
      groundArc: 'rgba(2,10,28,.35)',
      arcPast: ['#FF8266', '#FFC25E'],
      arcActive: ['#FFA08C', '#FFE0A0'],
      arcPlanned: '#FFC25E',
      endPast: '#FF8266', endPlanned: '#FFC25E',
      casing: '255,255,255'
    }
  };

  let world = null;
  function prep() {
    if (world) return world;
    const topo = window.WORLD;
    const countries = topojson.feature(topo, topo.objects.countries);
    const land = topojson.feature(topo, topo.objects.land);
    const borders = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
    const byId = {};
    countries.features.forEach(f => { byId[String(f.id)] = f; });
    // France in world-atlas includes French Guiana; tint the mainland only
    const fr = byId['250'];
    if (fr && fr.geometry.type === 'MultiPolygon') {
      byId['250'] = Object.assign({}, fr, { geometry: { type: 'MultiPolygon', coordinates: fr.geometry.coordinates.filter(p => p[0][0][0] > -20) } });
    }
    world = { countries, land, borders, byId, grat: d3.geoGraticule10() };
    return world;
  }

  function lerpHex(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const c = i => Math.round(((pa >> i) & 255) * (1 - t) + ((pb >> i) & 255) * t);
    return `rgb(${c(16)},${c(8)},${c(0)})`;
  }

  function render(canvas, o) {
    const w = prep();
    const T = THEMES[o.theme || 'light'];
    const dpr = o.dpr || window.devicePixelRatio || 1;
    const W = o.w, H = o.h, cx = o.cx, cy = o.cy, R = o.R;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const proj = d3.geoOrthographic().scale(R).translate([cx, cy]).clipAngle(90).precision(0.4)
      .rotate([-o.lon, -o.lat, o.tilt || 0]);
    const path = d3.geoPath(proj, ctx);
    const rot = d3.geoRotation(proj.rotate());
    const vec = ll => { const r = rot(ll); const l = r[0] * D2R, p = r[1] * D2R; return { x: Math.cos(p) * Math.sin(l), y: Math.sin(p), z: Math.cos(p) * Math.cos(l) }; };
    const scr = (ll, h = 0) => { const v = vec(ll); const k = 1 + h; return { x: cx + R * v.x * k, y: cy - R * v.y * k, z: v.z, vis: v.z > 0 || (v.x * v.x + v.y * v.y) * k * k > 1 }; };

    /* ---- atmosphere halo (outside the disc) ---- */
    let g = ctx.createRadialGradient(cx, cy, R * .985, cx, cy, R * 1.34);
    T.halo.forEach(s => g.addColorStop(s[0], s[1]));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(cx + R * .62, cy - R * .78, R * .05, cx + R * .62, cy - R * .78, R * .75);
    g.addColorStop(0, T.sun); g.addColorStop(1, 'rgba(255,186,110,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    /* ---- sphere base ---- */
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    g = ctx.createRadialGradient(cx - R * .34, cy - R * .42, R * .06, cx - R * .1, cy - R * .12, R * 1.28);
    T.ocean.forEach(s => g.addColorStop(s[0], s[1]));
    ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

    // graticule
    ctx.beginPath(); path(w.grat); ctx.strokeStyle = T.grat; ctx.lineWidth = .7; ctx.stroke();

    // land (soft drop for depth, then fill)
    ctx.save(); ctx.translate(1.2, 2.2); ctx.beginPath(); path(w.land); ctx.fillStyle = T.landShadow; ctx.fill(); ctx.restore();
    g = ctx.createLinearGradient(cx - R * .8, cy - R * .8, cx + R * .8, cy + R * .8);
    g.addColorStop(0, T.land[0]); g.addColorStop(1, T.land[1]);
    ctx.beginPath(); path(w.land); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); path(w.borders); ctx.strokeStyle = T.border; ctx.lineWidth = .6; ctx.stroke();

    // tinted countries
    const K = o.contrast ? 1.7 : 1;
    const tint = (ids, pair, lw, stroke, dash) => {
      (ids || []).forEach(id => {
        const f = w.byId[String(id)]; if (!f) return;
        const gg = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
        gg.addColorStop(0, pair[0]); gg.addColorStop(1, pair[1]);
        ctx.beginPath(); path(f); ctx.fillStyle = gg; ctx.fill();
        ctx.lineJoin = 'round';
        ctx.setLineDash([]); ctx.strokeStyle = T.visitedBorder; ctx.lineWidth = lw * K + 1.6; ctx.stroke();      // keyline
        ctx.setLineDash(dash || []); ctx.strokeStyle = stroke; ctx.lineWidth = lw * K; ctx.stroke(); ctx.setLineDash([]);
      });
    };
    tint(o.visited, T.visited, 1.0, T.visitedStroke);
    tint(o.planned, T.planned, 1.1, T.plannedStroke, [3.2, 2.4]);
    tint(o.active, T.active, 1.6, T.activeStroke);

    // lighting
    g = ctx.createRadialGradient(cx - R * .30, cy - R * .36, R * .10, cx, cy, R * 1.03);
    g.addColorStop(0, T.hi); g.addColorStop(.34, 'rgba(255,255,255,0)'); g.addColorStop(.72, 'rgba(0,0,0,0)'); g.addColorStop(1, T.limb);
    ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    g = ctx.createRadialGradient(cx, cy, R * .86, cx, cy, R);
    T.rim.forEach(s => g.addColorStop(s[0], s[1]));
    ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.restore();

    ctx.beginPath(); ctx.arc(cx, cy, R - .6, 0, Math.PI * 2); ctx.strokeStyle = T.edge; ctx.lineWidth = 1.2; ctx.stroke();

    /* ---- arcs ---- */
    (o.arcs || []).forEach(a => drawArc(a));

    function drawArc(a) {
      const interp = d3.geoInterpolate(a.from, a.to);
      const dist = d3.geoDistance(a.from, a.to);
      const N = Math.max(28, Math.round(dist * 90));
      const lift = a.lift != null ? a.lift : (0.05 + 0.15 * Math.min(1, dist / 2.0));
      const pts = [], gnd = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, ll = interp(t), h = lift * Math.pow(Math.sin(Math.PI * t), .85);
        pts.push(scr(ll, h)); gnd.push(scr(ll, 0));
      }
      // ground track
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      ctx.beginPath(); let pen = false;
      gnd.forEach(p => { if (p.z > 0) { pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; } else pen = false; });
      ctx.strokeStyle = T.groundArc; ctx.lineWidth = 1.6; ctx.setLineDash([1, 5]); ctx.lineCap = 'round'; ctx.stroke(); ctx.restore();

      // visible runs
      const runs = []; let cur = [];
      pts.forEach(p => { if (p.vis) cur.push(p); else { if (cur.length > 1) runs.push(cur); cur = []; } });
      if (cur.length > 1) runs.push(cur);
      const kind = a.kind || 'past';
      runs.forEach(run => {
        const p0 = run[0], p1 = run[run.length - 1];
        const stroke = (width, colorFn, dash) => {
          ctx.beginPath(); run.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
          ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash(dash || []);
          ctx.strokeStyle = colorFn(); ctx.stroke(); ctx.setLineDash([]);
        };
        const lg = (stops) => () => { const gr = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y); stops.forEach(s => gr.addColorStop(s[0], s[1])); return gr; };
        if (kind === 'planned') {
          stroke(7 + (o.contrast ? 1.5 : 0), () => `rgba(${T.casing},.9)`);
          stroke(3 + (o.contrast ? 1 : 0), () => T.arcPlanned, [7, 6]);
        } else {
          const [c0, c1] = kind === 'active' ? T.arcActive : T.arcPast;
          const wCore = (kind === 'active' ? 3.2 : 2.6) + (o.contrast ? 1 : 0);
          stroke(wCore + 5, lg([[0, `rgba(${T.casing},0)`], [.18, `rgba(${T.casing},.55)`], [.85, `rgba(${T.casing},.55)`], [1, `rgba(${T.casing},0)`]]));
          stroke(wCore, lg([[0, c0 + '00'], [.14, c0], [.86, c1], [1, c1 + '00']]));
        }
      });
      // endpoints
      [a.from, a.to].forEach((ll, idx) => {
        if (a.noEnds || (a.noEnd && idx)) return;
        const p = scr(ll, 0); if (p.z <= 0) return;
        ctx.beginPath(); ctx.arc(p.x, p.y, 5.2, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.1, 0, 7); ctx.fillStyle = kind === 'planned' ? T.endPlanned : T.endPast; ctx.fill();
      });
    }

    return { project: ll => scr(ll, 0), proj };
  }

  window.SPGlobe = { render, THEMES };
})();
