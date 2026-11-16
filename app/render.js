/* Tiny World: drawing, polygon style. Flat-shaded facets lit by a moving sun; seasons recolor the land. */
(function (root) {
  'use strict';
  const Sim = root.TW_SIM; const W = 1920, H = 1080, PPU = 160, TAU = Math.PI * 2;
  const R = { ready: false, sel: null, cfg: {} };
  const CFG = { scale: 1, fps: 60, tipStride: 1, tipEvery: 1, layers: 'auto', merge: false, budget: 9, repaintGap: 1400, shadowChunk: 1e9, keyRes: 1, lite: false };
  let bstat, bsctx, btop, btctx, lit2, tipsBuild = null, tipN = 0, job = null, jobL = null, firstPaint = true;
  let ctx, stat, sctx, top, tctx, order, sy, dyn = [], lastKey = '', lastDirty = -1, lastStat = -1e9, band = 0, flashUntil = 0;
  let nt, tpx, tnr, tcode, tdep, ttb, tpk, tjit, lit, openList = [], phase;
  let glow, nextCloud = 0;
  // light state
  let aR, aG, aB, sR, sG, sB, mR, mG, mB, lx, ly, lz, shx, shy, shA, nightN = 0, warmN = 0, sunSide = 1, wind = 1, tshift = 0, cover = 0, SE = null;
  const MX = 0.4477, MY = -0.4975, MZ = 0.7362;

  function b64(s) { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function rng(seed) { let a = seed | 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const mix3 = (a, b, w) => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const SNOW = [246, 250, 255];
  function shade(c, nx, ny, nz) {
    const l = Math.max(0, nx * lx + ny * ly + nz * lz), m = Math.max(0, nx * MX + ny * MY + nz * MZ);
    const r = c[0] * (aR + sR * l + mR * m), g = c[1] * (aG + sG * l + mG * m), b = c[2] * (aB + sB * l + mB * m);
    return 'rgb(' + (r > 255 ? 255 : r | 0) + ',' + (g > 255 ? 255 : g | 0) + ',' + (b > 255 ? 255 : b | 0) + ')';
  }
  const flat = (c) => shade(c, 0, 0, 1);

  // ---------- light: where the sun is, what color it is, how dark it is
  function sunTimes(doy) { const hd = 6 + 1.5 * Math.cos((doy - 172) / 365 * TAU); return [12.5 - hd, 12.5 + hd]; }
  function calcLight(S) {
    const se = Sim.season(); SE = se; const st = sunTimes(se.doy), h = se.hour; const u = Math.min(1, Math.max(0, (h - st[0]) / (st[1] - st[0])));
    const n = h >= st[0] && h <= st[1] ? 0 : Math.min(1, (h < st[0] ? st[0] - h : h - st[1]) / 0.9);
    const el = Math.sin(Math.PI * u), warm = Math.pow(1 - el, 1.6); const sky = S.weather.sky;
    const k = { clear: 1, cloudy: 0.66, rain: 0.48, storm: 0.34, snow: 0.6, fog: 0.55 }[sky] || 1;
    let x = Math.cos(Math.PI * u) * 0.95, y = -0.42, z = 0.22 + 0.78 * el; const len = Math.hypot(x, y, z); lx = x / len; ly = y / len; lz = z / len;
    tshift = se.tshift; cover = sm(0.45, 0.9, se.tshift / 0.30);
    const sun = mix3([0.78, 0.757, 0.702], [0.98, 0.7, 0.45], warm), amb = mix3(mix3([0.5, 0.53, 0.58], [0.55, 0.49, 0.54], warm), [0.13, 0.17, 0.34], n);
    const g = ((1 - k) * 0.16 + cover * 0.1) * (1 - n), kk = k * (1 - 0.2 * cover); sR = sun[0] * (1 - n) * kk; sG = sun[1] * (1 - n) * kk; sB = sun[2] * (1 - n) * kk; aR = amb[0] + g; aG = amb[1] + g; aB = amb[2] + g * 1.1;
    mR = 0.2 * n; mG = 0.26 * n; mB = 0.42 * n; const d = Math.max(lz, 0.66); shx = -lx / d; shy = -ly / d; shA = 0.38 * (1 - n) * (0.35 + 0.65 * k * k);
    nightN = n; warmN = warm * (1 - n) * k; sunSide = h < 12.5 ? 1 : -1; wind = sky === 'storm' ? 2.6 : sky === 'rain' ? 1.5 : 1;
    const q = CFG.keyRes; return se.a + se.b + Math.round(se.w * 40 * q) + ':' + Math.round(tshift * 150 * q) + ':' + Math.round(lx * 36 * q) + ':' + Math.round(lz * 36 * q) + ':' + Math.round(warm * 20 * q) + ':' + Math.round(n * 24 * q) + ':' + sky;
  }
  const getL = () => [aR, aG, aB, sR, sG, sB, mR, mG, mB, lx, ly, lz, shx, shy, shA, tshift, cover, SE];
  function setL(a) { aR = a[0]; aG = a[1]; aB = a[2]; sR = a[3]; sG = a[4]; sB = a[5]; mR = a[6]; mG = a[7]; mB = a[8]; lx = a[9]; ly = a[10]; lz = a[11]; shx = a[12]; shy = a[13]; shA = a[14]; tshift = a[15]; cover = a[16]; SE = a[17]; }
  const snowHere = (x, y) => Sim.isLand(x, y) && Sim.tBase(x, y) - tshift < 0.285;
  const snowAmt = (x, y) => (snowHere(x, y) ? 1 : cover);

  // ---------- palettes
  const PAL = {
    spring: { mead: [[140, 224, 90], [176, 238, 104], [110, 206, 96]], floor: [70, 180, 96], desert: [[255, 210, 116], [255, 194, 100]] },
    summer: { mead: [[118, 214, 70], [160, 232, 84], [96, 196, 78]], floor: [52, 168, 82], desert: [[255, 208, 112], [255, 190, 96]] },
    autumn: { mead: [[198, 204, 78], [224, 196, 72], [170, 186, 74]], floor: [150, 124, 62], desert: [[255, 204, 112], [250, 186, 98]] },
    winter: { mead: [[160, 186, 104], [178, 192, 110], [146, 172, 100]], floor: [104, 132, 90], desert: [[240, 210, 150], [230, 196, 140]] }
  };
  const ROCK = [[142, 128, 162], [120, 110, 146]];
  const LEAF = {
    spring: [[120, 226, 110], [150, 236, 96], [255, 170, 204], [255, 232, 240], [96, 210, 120], [255, 196, 214]],
    summer: [[46, 204, 96], [34, 184, 88], [96, 222, 92], [22, 168, 110], [60, 210, 80], [40, 190, 104]],
    autumn: [[255, 92, 54], [255, 152, 32], [255, 208, 44], [232, 54, 84], [255, 122, 96], [214, 70, 150]],
    winter: [[168, 132, 118], [150, 120, 112], [176, 146, 124], [140, 116, 116], [160, 128, 110], [150, 130, 126]]
  };
  const JUNG = [[0, 192, 124], [24, 172, 92], [70, 214, 112], [0, 160, 140]];
  const SHRUB = { spring: [130, 222, 96], summer: [120, 210, 84], autumn: [214, 176, 70], winter: [160, 150, 110] };
  const FCOL = { spring: [[200, 150, 96], [170, 236, 100], [120, 214, 96], [214, 160, 100]], summer: [[250, 214, 80], [150, 226, 86], [90, 196, 84], [196, 140, 86]], autumn: [[246, 190, 70], [214, 150, 62], [176, 116, 70], [226, 206, 90]], winter: [[196, 170, 130], [176, 160, 120], [160, 130, 100], [150, 150, 110]] };
  const ROOF = { tile: [[232, 84, 62], [246, 128, 60], [214, 62, 84], [240, 164, 52]], cabin: [[150, 100, 66], [170, 116, 72], [132, 88, 70], [184, 126, 76]], adobe: [[250, 206, 140], [240, 190, 124], [255, 220, 156], [232, 178, 118]], hut: [[236, 190, 104], [220, 170, 92], [246, 206, 122], [206, 160, 88]] };
  const seas = (T, f) => { const a = f(T[SE.a]), b = f(T[SE.b]); return mix3(a, b, SE.w); };

  // ---------- mesh
  function buildMesh() {
    const M = root.WORLD_MESH; nt = M.nt; const pts = new Float32Array(b64(M.pts).buffer), z = new Float32Array(b64(M.z).buffer), tri = new Uint16Array(b64(M.tri).buffer);
    tcode = b64(M.code); tdep = b64(M.dep); ttb = b64(M.tb); const op = b64(M.open); const g = rng(12345);
    tpx = new Float32Array(nt * 6); tnr = new Float32Array(nt * 3); tpk = new Uint8Array(nt); tjit = new Float32Array(nt); lit = new Uint8Array(nt * 3); phase = new Float32Array(nt);
    for (let i = 0; i < nt; i++) {
      const a = tri[i * 3], b = tri[i * 3 + 1], c = tri[i * 3 + 2]; const w = tcode[i] === 5;
      const ax = pts[a * 2], ay = pts[a * 2 + 1], bx = pts[b * 2], by = pts[b * 2 + 1], cx = pts[c * 2], cy = pts[c * 2 + 1];
      const az = w ? M.sea + (g() - 0.5) * 0.07 : z[a], bz = w ? M.sea + (g() - 0.5) * 0.07 : z[b], cz = w ? M.sea + (g() - 0.5) * 0.07 : z[c];
      let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      tnr[i * 3] = nx; tnr[i * 3 + 1] = ny; tnr[i * 3 + 2] = nz;
      const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3; const P = [ax, ay, bx, by, cx, cy];
      for (let k = 0; k < 3; k++) { const dx = P[k * 2] - mx, dy = P[k * 2 + 1] - my, d = Math.hypot(dx, dy) || 1; tpx[i * 6 + k * 2] = P[k * 2] * PPU + dx / d * 0.7; tpx[i * 6 + k * 2 + 1] = P[k * 2 + 1] * PPU + dy / d * 0.7; }
      tpk[i] = Math.floor(g() * 3); tjit[i] = 0.93 + g() * 0.14; phase[i] = g() * TAU; if (op[i]) openList.push(i);
    }
  }
  function triBase(i, P) {
    const code = tcode[i];
    if (code === 5) {
      const dep = tdep[i] / 255; let c = dep < 0.3 ? mix3([70, 232, 214], [24, 150, 226], dep / 0.3) : mix3([24, 150, 226], [16, 92, 186], (dep - 0.3) / 0.7);
      const cold = sm(0.30, 0.27, (ttb[i] / 170 - 0.5) - tshift); const ice = Math.max(cold * 0.45, dep < 0.22 ? Math.max(cover, cold) * 0.78 : cover * cold * 0.6); return ice > 0.01 ? mix3(c, [206, 234, 250], ice) : c;
    }
    let c = code === 1 ? P.floor : code === 2 ? P.desert[tpk[i] % 2] : code === 6 ? [255, 234, 164] : code === 3 ? ROCK[tpk[i] % 2] : P.mead[tpk[i]];
    const ws = sm(0.30, 0.27, (ttb[i] / 170 - 0.5) - tshift); let sc = Math.max(ws, cover * (code === 3 ? 0.62 : 0.86)); if (code === 3 && ws > 0.5) sc = Math.min(sc, 0.72);
    return sc > 0.01 ? mix3(c, SNOW, sc) : c;
  }
  function terrainPalette() { return { mead: [0, 1, 2].map((k) => seas(PAL, (p) => p.mead[k])), floor: seas(PAL, (p) => p.floor), desert: [0, 1].map((k) => seas(PAL, (p) => p.desert[k])) }; }
  function paintTerrain(c, P, from, to, out) {
    for (let i = from; i < to; i++) {
      const b = triBase(i, P), j = tjit[i], nx = tnr[i * 3], ny = tnr[i * 3 + 1], nz = tnr[i * 3 + 2];
      const l = Math.max(0, nx * lx + ny * ly + nz * lz), m = Math.max(0, nx * MX + ny * MY + nz * MZ);
      const r = Math.min(255, b[0] * j * (aR + sR * l + mR * m)) | 0, g = Math.min(255, b[1] * j * (aG + sG * l + mG * m)) | 0, bl = Math.min(255, b[2] * j * (aB + sB * l + mB * m)) | 0;
      out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = bl; c.fillStyle = 'rgb(' + r + ',' + g + ',' + bl + ')';
      c.beginPath(); c.moveTo(tpx[i * 6], tpx[i * 6 + 1]); c.lineTo(tpx[i * 6 + 2], tpx[i * 6 + 3]); c.lineTo(tpx[i * 6 + 4], tpx[i * 6 + 5]); c.fill();
    }
  }
  function shimmer(c, now) {
    const n = Math.min(openList.length, (CFG.lite ? 45 : 110) * (MERGE ? 3 : 1)); if (!n) return;
    for (let k = 0; k < n; k++) {
      const i = openList[(Math.random() * openList.length) | 0]; if (MERGE && (under(tpx[i * 6], tpx[i * 6 + 1]) || under(tpx[i * 6 + 2], tpx[i * 6 + 3]) || under(tpx[i * 6 + 4], tpx[i * 6 + 5]))) continue; const f = 1 + 0.085 * Math.sin(now * 0.0016 + phase[i]) + 0.04 * Math.sin(now * 0.0041 + phase[i] * 3);
      c.fillStyle = 'rgb(' + Math.min(255, lit[i * 3] * f | 0) + ',' + Math.min(255, lit[i * 3 + 1] * f | 0) + ',' + Math.min(255, lit[i * 3 + 2] * f | 0) + ')';
      c.beginPath(); c.moveTo(tpx[i * 6], tpx[i * 6 + 1]); c.lineTo(tpx[i * 6 + 2], tpx[i * 6 + 3]); c.lineTo(tpx[i * 6 + 4], tpx[i * 6 + 5]); c.fill();
    }
  }

  // ---------- polygon primitives (world units in, pixels out)
  function poly(c, pts, fill) { c.fillStyle = fill; c.beginPath(); c.moveTo(pts[0][0] * PPU, pts[0][1] * PPU); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0] * PPU, pts[i][1] * PPU); c.closePath(); c.fill(); }
  function rot(pts, x, y, a) { const ca = Math.cos(a), sa = Math.sin(a); return pts.map((p) => [x + p[0] * ca - p[1] * sa, y + p[0] * sa + p[1] * ca]); }
  function ringOf(x, y, r, n, ro, sq) { const o = []; for (let i = 0; i < n; i++) o.push([x + r * Math.cos(ro + i * TAU / n), y + r * (sq || 1) * Math.sin(ro + i * TAU / n)]); return o; }
  function cone(c, x, y, r, n, col, k, ro, ax, ay) {
    const inv = 1 / Math.hypot(1, k); let px = x + r * Math.cos(ro), py = y + r * Math.sin(ro);
    for (let i = 0; i < n; i++) {
      const a1 = ro + (i + 1) * TAU / n, qx = x + r * Math.cos(a1), qy = y + r * Math.sin(a1), am = ro + (i + 0.5) * TAU / n;
      c.fillStyle = shade(col, Math.cos(am) * inv, Math.sin(am) * inv, k * inv);
      c.beginPath(); c.moveTo(ax * PPU, ay * PPU); c.lineTo(px * PPU, py * PPU); c.lineTo(qx * PPU, qy * PPU); c.closePath(); c.fill(); px = qx; py = qy;
    }
  }
  // shadows: all collected into one path so overlaps do not stack
  function subPath(c, pts) { let ar = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; ar += p[0] * q[1] - q[0] * p[1]; } const n = pts.length; if (ar < 0) { c.moveTo(pts[n - 1][0] * PPU, pts[n - 1][1] * PPU); for (let i = n - 2; i >= 0; i--) c.lineTo(pts[i][0] * PPU, pts[i][1] * PPU); } else { c.moveTo(pts[0][0] * PPU, pts[0][1] * PPU); for (let i = 1; i < n; i++) c.lineTo(pts[i][0] * PPU, pts[i][1] * PPU); } c.closePath(); }
  function castShadow(c, ring, h) {
    const ox = shx * h, oy = shy * h; let a = ring[0], b = ring[0], ca = -1e9, cb = 1e9;
    for (const p of ring) { const cr = p[0] * oy - p[1] * ox; if (cr > ca) { ca = cr; a = p; } if (cr < cb) { cb = cr; b = p; } }
    subPath(c, ring.map((p) => [p[0] + ox, p[1] + oy])); subPath(c, [a, [a[0] + ox, a[1] + oy], [b[0] + ox, b[1] + oy], b]);
  }

  // ---------- sprites
  function leafCol(s) { if (s[5] === 1) return JUNG[Math.floor(s[4] * 3.999)]; const k = Math.floor(s[4] * 5.999); return mix3(LEAF[SE.a][k], LEAF[SE.b][k], SE.w); }
  function sway(x, y, t) { return (Math.sin(t * 0.0011 + x * 2.3 + y * 1.7) + 0.6 * Math.sin(t * 0.0023 + x * 5.1)) * wind; }
  function drawTree(c, s, t) {
    const x = s[1], y = s[2], r = s[3] * 1.12, q = s[4]; let col = leafCol(s); const sn = snowAmt(x, y); if (sn > 0.02) col = mix3(col, SNOW, sn * (s[5] === 1 ? 0.5 : 0.82));
    cone(c, x, y, r, 6, col, 0.75, q * 6, x, y - r * 0.12);
    addTip(c, x, y - r * 0.1, r * 0.52, 6, q * 6 + 0.5, [Math.min(255, col[0] * 1.12), Math.min(255, col[1] * 1.12), Math.min(255, col[2] * 1.12)], 1.3, r * 0.2);
  }
  // treetops are drawn every frame so they sway smoothly; the trunks and lower canopy stay still
  let tips = [];
  function addTip(c, x, y, r, n, ro, col, k, amp) {
    if (CFG.tipStride > 1 && (tipN++ % CFG.tipStride)) { cone(c, x, y, r, n, col, k, ro, x, y - r * 0.14); return; }
    const pts = new Float32Array(n * 2); for (let i = 0; i < n; i++) { pts[i * 2] = r * Math.cos(ro + i * TAU / n) * PPU; pts[i * 2 + 1] = r * Math.sin(ro + i * TAU / n) * PPU; }
    const h = n >> 1, inv = 1 / Math.hypot(1, k), a1 = ro + h * 0.5 * TAU / n, a2 = ro + (h + (n - h) * 0.5) * TAU / n;
    tipsBuild.push({ x, y, px: x * PPU, py: y * PPU, pts, n, h, c1: shade(col, Math.cos(a1) * inv, Math.sin(a1) * inv, k * inv), c2: shade(col, Math.cos(a2) * inv, Math.sin(a2) * inv, k * inv), amp: amp * PPU, lift: r * 0.14 * PPU });
  }
  function drawTips(now) {
    for (let i = 0; i < tips.length; i++) {
      const t = tips[i], w = sway(t.x, t.y, now) * t.amp, cx = t.px + w * 0.55, cy = t.py + w * 0.12, ax = t.px + w, ay = t.py - t.lift + w * 0.2, p = t.pts, n = t.n, h = t.h;
      ctx.fillStyle = t.c1; ctx.beginPath(); ctx.moveTo(ax, ay); for (let k = 0; k <= h; k++) ctx.lineTo(cx + p[k * 2], cy + p[k * 2 + 1]); ctx.fill();
      ctx.fillStyle = t.c2; ctx.beginPath(); ctx.moveTo(ax, ay); for (let k = h; k <= n; k++) { const j = k % n; ctx.lineTo(cx + p[j * 2], cy + p[j * 2 + 1]); } ctx.fill();
    }
  }
  function drawPine(c, s, t) {
    const x = s[1], y = s[2], r = s[3] * 1.15, q = s[4], sn = Math.max(s[5] === 1 ? 1 : 0, snowAmt(x, y));
    cone(c, x, y, r, 7, [20, 120, 104], 0.6, q * 6, x, y - r * 0.12); cone(c, x, y - r * 0.08, r * 0.62, 7, mix3([40, 164, 124], SNOW, sn * 0.9), 0.6, q * 6 + 0.4, x, y - r * 0.14);
    addTip(c, x, y - r * 0.12, r * 0.3, 5, q * 6, mix3([70, 190, 140], SNOW, sn * 0.95), 0.6, r * 0.12);
  }
  function drawPalm(c, s, t) {
    const x = s[1], y = s[2], r = s[3], q = s[4]; let col = s[5] ? [40, 200, 110] : [110, 196, 70]; col = mix3(col, SNOW, snowAmt(x, y) * 0.45); const w = sway(x, y, t) * 0.06;
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + q * 6 + w, tx = x + r * 1.25 * Math.cos(a), ty = y + r * 1.25 * Math.sin(a);
      poly(c, [[x, y], [x + r * 0.5 * Math.cos(a - 0.5), y + r * 0.5 * Math.sin(a - 0.5)], [tx, ty]], shade(col, Math.cos(a - 0.4) * 0.74, Math.sin(a - 0.4) * 0.74, 0.67));
      poly(c, [[x, y], [tx, ty], [x + r * 0.5 * Math.cos(a + 0.5), y + r * 0.5 * Math.sin(a + 0.5)]], shade(col, Math.cos(a + 0.4) * 0.74, Math.sin(a + 0.4) * 0.74, 0.67));
    }
    poly(c, [[x - r * 0.12, y], [x, y - r * 0.12], [x + r * 0.12, y], [x, y + r * 0.12]], flat([150, 104, 60]));
  }
  const rockCache = {};
  function rockShape(i, s) { if (rockCache[i]) return rockCache[i]; const g = rng(Math.floor(s[4] * 1e6) + i), n = 5 + Math.floor(g() * 3), ro = g() * 6, ring = []; for (let k = 0; k < n; k++) { const rr = s[3] * (0.7 + g() * 0.4), a = ro + k * TAU / n; ring.push([s[1] + rr * Math.cos(a) * 1.1, s[2] + rr * Math.sin(a) * 0.9]); } return (rockCache[i] = { ring, n, ro, ax: s[1] + (g() - 0.5) * 0.5 * s[3], ay: s[2] + (g() * 0.4 - 0.3) * s[3] }); }
  function drawRock(c, i, s, col) { const k = rockShape(i, s); for (let j = 0; j < k.n; j++) { const a = k.ro + (j + 0.5) * TAU / k.n; poly(c, [[k.ax, k.ay], k.ring[j], k.ring[(j + 1) % k.n]], shade(col, Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0.6)); } }
  function rockCol(s) { const sn = Math.max(s[5] ? 1 : 0, snowAmt(s[1], s[2])); return mix3([160, 138, 150], [176, 180, 204], sn); }
  function drawStump(c, s, burnt) { const r = s[3] * 0.4; poly(c, ringOf(s[1], s[2], r, 6, s[4] * 6), flat(burnt ? [40, 34, 32] : [120, 84, 54])); poly(c, ringOf(s[1], s[2], r * 0.55, 6, s[4] * 6), flat(burnt ? [66, 56, 52] : [214, 176, 118])); }
  function drawHouse(c, h, style) {
    const x = h.x, y = h.y, a = h.a, w = 0.11 * h.s, d = 0.075 * h.s; let col = ROOF[style][h.ci % 4];
    if (h.st === 2) { const g = rng(Math.floor(x * 9973 + y * 131)); poly(c, rot([[-w, -d], [w, -d * 0.7], [w * 0.8, d], [-w * 0.9, d * 0.8]], x, y, a), flat([70, 60, 58])); for (let i = 0; i < 4; i++) { const px = x + (g() - 0.5) * w * 1.6, py = y + (g() - 0.5) * d * 1.6, r = 0.02 + g() * 0.02; poly(c, [[px - r, py + r * 0.6], [px, py - r], [px + r, py + r * 0.6]], flat(i % 2 ? [44, 38, 38] : [128, 112, 104])); } return; }
    if (style !== 'adobe') col = mix3(col, SNOW, snowAmt(x, y) * 0.85);
    if (style === 'hut') { cone(c, x, y, w * 0.85, 8, col, 0.9, 0, x, y - w * 0.1); return; }
    if (style === 'adobe') { poly(c, rot([[-w * 1.05, -d * 1.05], [w * 1.05, -d * 1.05], [w * 1.05, d * 1.05], [-w * 1.05, d * 1.05]], x, y, a), shade(col, 0.62, 0.62, 0.49)); poly(c, rot([[-w, -d], [w, -d], [w, d], [-w, d]], x, y, a), flat(col)); poly(c, rot([[-w * 0.7, -d * 0.6], [w * 0.7, -d * 0.6], [w * 0.7, d * 0.6], [-w * 0.7, d * 0.6]], x, y, a), flat([col[0] * 0.9, col[1] * 0.9, col[2] * 0.9])); return; }
    const ca = Math.cos(a), sa = Math.sin(a);
    poly(c, rot([[-w, -d], [w, -d], [w, 0], [-w, 0]], x, y, a), shade(col, sa * 0.75, -ca * 0.75, 0.66)); poly(c, rot([[-w, 0], [w, 0], [w, d], [-w, d]], x, y, a), shade(col, -sa * 0.75, ca * 0.75, 0.66));
  }
  const FAITHC = [[255, 210, 122], [127, 214, 232], [255, 154, 138], [183, 156, 255], [155, 227, 155], [255, 255, 255], [240, 160, 208]];
  function drawShrine(c, s) { cone(c, s.x, s.y, 0.09, 4, [244, 240, 230], 0.7, 0.785, s.x, s.y - 0.01); cone(c, s.x, s.y - 0.008, 0.042, 4, FAITHC[s.f % 7], 1.2, 0.785, s.x, s.y - 0.014); }
  function drawField(c, f) {
    let col = mix3(FCOL[SE.a][f.ci % 4], FCOL[SE.b][f.ci % 4], SE.w); col = mix3([176, 140, 100], col, Math.min(1, Math.max(0.3, f.fert * 1.2)));
    if (f.st === 2) col = [170, 138, 106]; if (f.st === 3) col = [62, 50, 46]; else col = mix3(col, SNOW, snowAmt(f.x, f.y) * 0.86);
    const w = f.w, h = f.h, n = 6; poly(c, rot([[-w / 2 - 0.014, -h / 2 - 0.014], [w / 2 + 0.014, -h / 2 - 0.014], [w / 2 + 0.014, h / 2 + 0.014], [-w / 2 - 0.014, h / 2 + 0.014]], f.x, f.y, f.a), flat([col[0] * 0.7, col[1] * 0.7, col[2] * 0.7]));
    for (let i = 0; i < n; i++) { const v0 = -h / 2 + i * h / n, v1 = v0 + h / n, k = f.st === 0 ? (i % 2 ? 1 : 0.88) : 1 - ((i * 7) % 3) * 0.06; poly(c, rot([[-w / 2, v0], [w / 2, v0], [w / 2, v1], [-w / 2, v1]], f.x, f.y, f.a), flat([col[0] * k, col[1] * k, col[2] * k])); }
  }
  function drawBoat(c, x, y, a) { const L = 0.1, B = 0.04, hull = [[-L, 0], [-L * 0.6, -B], [L * 0.5, -B], [L, 0], [L * 0.5, B], [-L * 0.6, B]]; poly(c, rot(hull, x, y, a), flat([120, 76, 48])); poly(c, rot(hull.map((p) => [p[0] * 0.75, p[1] * 0.65]), x, y, a), flat([206, 150, 96])); }

  function drawSprite(c, i, S, t) {
    const s = Sim.D.sprites[i], kd = s[0], dead = S.dead[i];
    if (dead) { if (dead[0] !== 3 && (kd === 'tree' || kd === 'pine' || kd === 'palm')) drawStump(c, s, dead[0] === 2); return; }
    if (kd === 'tree') drawTree(c, s, t); else if (kd === 'pine') drawPine(c, s, t); else if (kd === 'palm') drawPalm(c, s, t);
    else if (kd === 'rock') drawRock(c, i, s, rockCol(s)); else if (kd === 'mesa') drawRock(c, i, s, mix3([255, 168, 90], SNOW, snowAmt(s[1], s[2]) * 0.5));
    else if (kd === 'floe') { if (s[5] || cover > 0.3) drawRock(c, i, s, [236, 246, 255]); }
    else if (kd === 'shrub') { const col = s[5] === 2 ? [214, 180, 80] : seas(SHRUB, (p) => p); cone(c, s[1], s[2], s[3] * 1.2, 5, mix3(col, SNOW, snowAmt(s[1], s[2]) * 0.8), 0.9, s[4] * 6, s[1], s[2] - s[3] * 0.15); }
    else if (kd === 'flower') { const on = (SE.a === 'spring' || SE.a === 'summer' ? 1 - SE.w : 0) + (SE.b === 'spring' || SE.b === 'summer' ? SE.w : 0); if (on > 0.5 && snowAmt(s[1], s[2]) < 0.3) poly(c, [[s[1] - 0.012, s[2]], [s[1], s[2] - 0.012], [s[1] + 0.012, s[2]], [s[1], s[2] + 0.012]], flat([[255, 240, 110], [255, 255, 255], [255, 130, 170]][Math.floor(s[4] * 2.999)])); }
  }
  function lowerBound(v) { let lo = 0, hi = sy.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sy[m] < v) lo = m + 1; else hi = m; } return lo; }
  function drawRange(c, S, y0, y1, t) {
    let k = lowerBound(y0), di = 0; while (di < dyn.length && dyn[di][0] < y0) di++;
    for (; ; k++) {
      const yy = k < sy.length ? sy[k] : 1e9, lim = Math.min(yy, y1);
      while (di < dyn.length && dyn[di][0] <= lim) { const d = dyn[di++]; if (d[1] === 0) drawHouse(c, d[2], d[3]); else drawShrine(c, d[2]); }
      if (k >= sy.length || yy > y1) break; drawSprite(c, order[k], S, t);
    }
  }
  function shadowOf(c, i, s) { const kd = s[0]; if (kd === 'tree') castShadow(c, ringOf(s[1], s[2], s[3] * 1.12, 6, s[4] * 6), s[3] * 1.4); else if (kd === 'pine') castShadow(c, ringOf(s[1], s[2], s[3] * 1.15, 7, s[4] * 6), s[3] * 2.1); else if (kd === 'palm') castShadow(c, ringOf(s[1], s[2], s[3] * 1.1, 5, s[4] * 6), s[3] * 1.7); else if (kd === 'rock') castShadow(c, rockShape(i, s).ring, s[3] * 1.2); else if (kd === 'mesa') castShadow(c, rockShape(i, s).ring, s[3] * 1.6); }
  // The still parts of the picture are repainted into spare canvases a slice at a time, then swapped in,
  // so a change of light or season never freezes the screen (this matters on a Raspberry Pi).
  function* paintGen(S, now) {
    const c = bsctx, tc = btctx; c.globalAlpha = 1; c.fillStyle = 'rgb(20,110,190)'; c.fillRect(0, 0, W, H);
    const P = terrainPalette(); for (let i = 0; i < nt; i += 1000) { paintTerrain(c, P, i, Math.min(nt, i + 1000), lit2); yield; }
    for (const d of S.decals) { const g = rng(Math.floor(d.x * 7717 + d.y * 331)), ring = []; for (let k = 0; k < 9; k++) { const rr = d.r * (0.75 + g() * 0.45); ring.push([d.x + rr * Math.cos(k * TAU / 9), d.y + rr * Math.sin(k * TAU / 9)]); } c.globalAlpha = 0.72; poly(c, ring, flat(d.k === 'scorch' ? [52, 42, 38] : [170, 146, 120])); c.globalAlpha = 1; }
    const roadC = (x, y) => flat(mix3([240, 214, 150], SNOW, snowAmt(x, y) * 0.8));
    for (const T of S.towns) { if (!T.road) continue; c.lineCap = 'round'; for (let i = 0; i < T.road.length - 1; i++) { const a = T.road[i], b = T.road[i + 1], wat = a[2] || b[2]; c.strokeStyle = wat ? flat([120, 80, 52]) : roadC(a[0], a[1]); c.lineWidth = (wat ? 0.06 : T.key === 'other' ? 0.028 : 0.042) * PPU; c.beginPath(); c.moveTo(a[0] * PPU, a[1] * PPU); c.lineTo(b[0] * PPU, b[1] * PPU); c.stroke(); } }
    for (const T of S.towns) { if (!T.houses.length) continue; const big = T.id === 0; poly(c, ringOf(T.x, T.y, big ? 0.15 : 0.09, big ? 8 : 6, 0), roadC(T.x, T.y)); poly(c, ringOf(T.x, T.y, big ? 0.05 : 0.032, 6, 0), flat([150, 150, 160])); poly(c, ringOf(T.x, T.y, big ? 0.032 : 0.02, 6, 0), flat(snowHere(T.x, T.y) ? [190, 226, 246] : [60, 190, 230])); }
    for (const T of S.towns) for (const f of T.fields) drawField(c, f);
    for (const T of S.towns) for (const g of T.graves) poly(c, [[g[0] - 0.013, g[1]], [g[0], g[1] - 0.02], [g[0] + 0.013, g[1]], [g[0], g[1] + 0.012]], flat([196, 196, 210]));
    yield;
    const D = []; for (const T of S.towns) { for (const h of T.houses) D.push([h.y, 0, h, T.style]); for (const s of T.shrines) D.push([s.y, 1, s, null]); } D.sort((a, b) => a[0] - b[0]);
    const SP = Sim.D.sprites;
    if (shA >= 0.01) {
      const fillS = () => { c.fillStyle = 'rgba(18,22,58,' + shA.toFixed(3) + ')'; c.fill('nonzero'); c.beginPath(); }; c.beginPath();
      for (let k = 0; k < order.length; k++) { const i = order[k]; if (!S.dead[i]) shadowOf(c, i, SP[i]); if (k % CFG.shadowChunk === CFG.shadowChunk - 1) { fillS(); yield; } }
      for (const d of D) { if (d[1] === 0) { const h = d[2]; if (h.st === 2) continue; const w = 0.11 * h.s, dd = 0.075 * h.s; castShadow(c, rot([[-w, -dd], [w, -dd], [w, dd], [-w, dd]], h.x, h.y, h.a), 0.17 * h.s); } else castShadow(c, ringOf(d[2].x, d[2].y, 0.09, 4, 0.785), 0.2); }
      fillS(); yield;
    }
    tc.clearRect(0, 0, W, H); tipN = 0; let di = 0;
    for (let k = 0; ; k++) {
      const yy = k < sy.length ? sy[k] : 1e9;
      while (di < D.length && D[di][0] <= yy) { const d = D[di++]; if (d[1] === 0) drawHouse(tc, d[2], d[3]); else drawShrine(tc, d[2]); }
      if (k >= sy.length) break; drawSprite(tc, order[k], S, now); if (k % 140 === 139) yield;
    }
  }
  function startPaint(S, now) { jobL = getL(); tipsBuild = []; job = paintGen(S, now); }
  // In merged mode roofs and trees are painted into the ground picture; this map remembers what they cover so people walking under them are not drawn on top.
  const MW = 480, MH = 270;
  function under(x, y) { const mx = x * MW / W | 0, my = y * MH / H | 0; return mx >= 0 && my >= 0 && mx < MW && my < MH && mask[my * MW + mx] === 1; }
  function buildMask() {
    if (!maskCv) { maskCv = document.createElement('canvas'); maskCv.width = MW; maskCv.height = MH; mask = new Uint8Array(MW * MH); }
    const m = maskCv.getContext('2d', { willReadFrequently: true }); m.clearRect(0, 0, MW, MH); m.drawImage(btop, 0, 0, MW, MH); const d = m.getImageData(0, 0, MW, MH).data; for (let i = 0; i < MW * MH; i++) mask[i] = d[i * 4 + 3] > 110 ? 1 : 0;
  }
  function runPaint(budget) {
    const live = getL(), t0 = performance.now(); setL(jobL); let done = false;
    do { done = job.next().done; } while (!done && performance.now() - t0 < budget);
    jobL = getL(); setL(live);
    if (done) { // show the freshly painted layers
      gctx.drawImage(bstat, 0, 0, W, H); if (MERGE) { gctx.drawImage(btop, 0, 0, W, H); buildMask(); } else { vtctx.clearRect(0, 0, W, H); vtctx.drawImage(btop, 0, 0, W, H); }
      const t = lit; lit = lit2; lit2 = t; tips = tipsBuild; job = null; R.paints = (R.paints || 0) + 1; lightsAt = -1e9;
    }
  }
  function mkSprite(size, stops) { const cv = document.createElement('canvas'); cv.width = cv.height = size; const c = cv.getContext('2d'), g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); for (const s of stops) g.addColorStop(s[0], s[1]); c.fillStyle = g; c.fillRect(0, 0, size, size); return cv; }

  // ---------- layers. The map is a stack: ground, people, roofs and trees, swaying treetops, then
  // lights, clouds, weather and labels. Only the people and treetop layers are redrawn every frame;
  // clouds, weather and labels are moved by the browser itself, which is far cheaper on a small computer.
  let FLAT = false, MERGE = false, mask = null, maskCv = null, EL = null, gctx, pctx, vtctx, lctx, lightsAt = -1e9, lightsN = -1, frameN = 0, fpsT = 0, fpsC = 0, overlayAt = 0, cloudEls = [], wxMode = null, rainURL = null, snowURL = null;
  const K = 1280 / W; // logical map units to page pixels
  function sizeCanvases() {
    const SC = CFG.scale, set = (cv) => { cv.width = Math.round(W * SC); cv.height = Math.round(H * SC); const x = cv.getContext('2d'); x.setTransform(SC, 0, 0, SC, 0, 0); return x; };
    gctx = set(EL.ground); pctx = set(EL.people); vtctx = set(EL.top); ctx = set(EL.tips); lctx = set(EL.lights);
    if (!bstat) { bstat = document.createElement('canvas'); btop = document.createElement('canvas'); } bsctx = set(bstat); btctx = set(btop);
    firstPaint = true; job = null; lastKey = ''; lightsAt = -1e9;
  }
  function init(els, done) {
    Object.assign(CFG, R.cfg || {}); EL = els; sizeCanvases(); for (const k of ['lights', 'wash', 'flash', 'wx']) EL[k].style.display = 'none';
    try { const g = document.createElement('canvas').getContext('webgl'), x = g && g.getExtension('WEBGL_debug_renderer_info'); R.gl = g ? String(x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'yes').slice(0, 60) : 'none'; } catch (e) { R.gl = 'none'; }
    // With a graphics chip the browser stacks the layers for free; without one, a single picture is cheaper.
    R.gpu = !/none|swiftshader|llvmpipe|softpipe|software/i.test(R.gl); FLAT = CFG.layers === 'flat' || (CFG.layers !== 'stack' && !R.gpu); R.flat = FLAT;
    if (FLAT) { for (const k of ['ground', 'people', 'top', 'clouds', 'labels']) EL[k].style.display = 'none'; flatInit(); }
    MERGE = !FLAT && !!CFG.merge; if (MERGE) { mask = new Uint8Array(MW * MH); for (const k of ['people', 'top']) EL[k].style.display = 'none'; }
    order = Sim.D.sprites.map((s, i) => i); sy = Sim.D.sprites.map((s) => s[2]); buildMesh(); lit2 = new Uint8Array(nt * 3);
    glow = mkSprite(128, [[0, 'rgba(255,214,130,1)'], [0.35, 'rgba(255,170,72,0.45)'], [1, 'rgba(255,150,60,0)']]);
    R.ready = true; done && done();
  }
  // change quality while running (used when the computer cannot keep up)
  R.setLevel = function (o) { const sc = CFG.scale; Object.assign(CFG, o); if (CFG.noClouds) { for (const c of cloudEls) c.remove(); cloudEls = []; clouds = []; } if (CFG.scale !== sc) sizeCanvases(); else lastKey = ''; };

  function tile(draw) { const cv = document.createElement('canvas'); cv.width = cv.height = 256; draw(cv.getContext('2d')); return 'url(' + cv.toDataURL() + ')'; }
  function setWeatherLayer(sky) {
    if (CFG.noWx && sky !== 'fog') sky = 'none'; if (sky === wxMode) return; wxMode = sky; const box = EL.wx; box.textContent = ''; box.style.background = 'none'; box.style.display = 'none';
    if (sky === 'fog') { box.style.background = 'rgba(226,232,238,0.2)'; box.style.display = 'block'; return; }
    if (sky !== 'rain' && sky !== 'storm' && sky !== 'snow') return; box.style.display = 'block';
    const m = document.createElement('div'); m.style.position = 'absolute'; m.style.willChange = 'transform';
    if (sky === 'snow') {
      if (!snowURL) snowURL = tile((c) => { const g = rng(77); c.fillStyle = '#fff'; for (let i = 0; i < 16; i++) { c.globalAlpha = 0.55 + g() * 0.4; c.beginPath(); c.arc(g() * 256, g() * 256, 1 + g() * 1.6, 0, TAU); c.fill(); } });
      m.style.cssText += 'left:-40px;top:-256px;width:1360px;height:976px;background-image:' + snowURL + ';';
      m.animate([{ transform: 'translate(0px,0px)' }, { transform: 'translate(0px,256px)' }], { duration: 5200, iterations: Infinity, easing: 'linear' });
      box.animate([{ transform: 'translateX(-12px)' }, { transform: 'translateX(12px)' }], { duration: 3800, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
    } else {
      if (!rainURL) rainURL = tile((c) => { const g = rng(31); c.strokeStyle = 'rgba(214,230,255,0.55)'; c.lineWidth = 1.2; c.beginPath(); for (let i = 0; i < 13; i++) { const x = g() * 256, y = g() * 256; c.moveTo(x, y); c.lineTo(x - 4.5, y + 18); } c.stroke(); });
      m.style.cssText += 'left:0;top:-1024px;width:1536px;height:1744px;background-image:' + rainURL + ';opacity:' + (sky === 'storm' ? 1 : 0.75) + ';';
      m.animate([{ transform: 'translate(0px,0px)' }, { transform: 'translate(-256px,1024px)' }], { duration: sky === 'storm' ? 1050 : 1400, iterations: Infinity, easing: 'linear' });
    }
    box.appendChild(m);
  }
  function spawnCloud(sky, frac) {
    const cv = document.createElement('canvas'); cv.width = 320; cv.height = 150; const c = cv.getContext('2d'), n = 3 + Math.floor(Math.random() * 4), grey = sky === 'rain' || sky === 'storm' ? 1 : sky === 'cloudy' || sky === 'snow' ? 0.4 : 0;
    const base = mix3(mix3([255, 255, 255], [196, 204, 220], grey), [255, 206, 170], Math.min(1, warmN * 1.2)), puffs = [];
    for (let i = 0; i < n; i++) puffs.push([80 + Math.random() * 160, 55 + Math.random() * 40, 42 + Math.random() * 36]);
    const blob = (x, y, r, rgb, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(0.5, 'rgba(' + rgb + ',' + (a * 0.55).toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); };
    c.save(); c.scale(1, 0.62); for (const p of puffs) blob(p[0] + 10, (p[1] + 16) / 0.62, p[2], '14,20,44', 0.1 + 0.1 * grey); for (const p of puffs) blob(p[0], p[1] / 0.62, p[2], base.map((v) => v | 0).join(','), 0.3 - 0.1 * grey); c.restore();
    const w = 520 + Math.random() * 420, h = w * 150 / 320, y = Math.random() * 760 - h / 2 - 20, v = (6 + Math.random() * 9) * wind, dur = (1280 + w * 2) / v * 1000;
    cv.style.cssText = 'position:absolute;left:0;top:0;width:' + w.toFixed(0) + 'px;height:' + h.toFixed(0) + 'px;will-change:transform;';
    EL.clouds.appendChild(cv); cloudEls.push(cv);
    const an = cv.animate([{ transform: 'translate(' + (-w) + 'px,' + y.toFixed(0) + 'px)' }, { transform: 'translate(' + (1280 + w) + 'px,' + y.toFixed(0) + 'px)' }], { duration: dur, easing: 'linear', fill: 'both', delay: -dur * (frac || 0) });
    an.onfinish = () => { const i = cloudEls.indexOf(cv); if (i >= 0) cloudEls.splice(i, 1); cv.remove(); };
  }
  const EV_EMOJI = { 'Wedding': '💍', 'Funeral': '🕯️', 'Festival': '🎶', 'Food fair': '🍲', 'Market rush': '💰', 'Guild meeting': '🛠️', 'Gossip circle': '🗣️', 'Courting dance': '💃', "Healer's queue": '🩺', 'Open court': '⚖️', 'Town debate': '📣', 'Muster': '🛡️', "Tinkerers' meet": '💡', 'Sky watch': '🔭', 'Storm prep': '⛈️', 'Vigil': '🙏', 'Remembrance': '🕊️', 'Protest': '✊', 'Harvest feast': '🌾' };
  function darkText(h) { const c = townRGB(h); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) > 120 ? '#10131c' : '#ffffff'; }
  const marks = new Map();
  function mark(key, cls, x, y, seen, build) {
    let m = marks.get(key); if (!m) { m = document.createElement('div'); m.className = 'mk ' + cls; const inner = document.createElement('div'); inner.className = 'in'; inner.style.animationDelay = (-Math.random() * 6).toFixed(2) + 's'; m.appendChild(inner); EL.labels.appendChild(m); marks.set(key, m); m._in = inner; if (build) build(inner, m); }
    const px = Math.round(x * K), py = Math.round(y * K); if (m._x !== px || m._y !== py) { m._x = px; m._y = py; m.style.transform = 'translate(' + px + 'px,' + py + 'px)'; }
    seen.add(key); return m._in;
  }
  function setText(el, t) { if (el._t !== t) { el._t = t; el.textContent = t; } }
  // Everything that floats above the map: labels, tags, emojis, clouds, weather, sunrise glow, night lights.
  function overlay(S, now) {
    const sky = S.weather.sky, P = S.people, seen = new Set(), count = {}, evn = {}, sickN = {};
    for (let i = 0; i < P.length; i++) { const p = P[i]; if (p.ev != null && p.arr) evn[p.ev] = (evn[p.ev] || 0) + 1; if (p.sick > 0) sickN[p.home] = (sickN[p.home] || 0) + 1; }
    for (const T of S.towns) {
      if (!T.alive || !T.pop) continue; const lx0 = Math.max(600, Math.min(W - 110, T.x * PPU)), ly0 = Math.max(70, T.y * PPU - 62);
      const el = mark('t' + T.id, 'tl', lx0, ly0, seen, (inn) => { inn.innerHTML = '<div class="tlb"><b></b><span></span></div><div class="tlx"></div>'; });
      const box = el.firstChild; if (box._c !== T.color) { box._c = T.color; box.style.background = T.color; box.style.color = darkText(T.color); }
      setText(box.firstChild, T.name); setText(box.lastChild, 'population: ' + T.pop);
      let ex = ''; if (T.enemy != null) ex += '⚔️'; if ((sickN[T.id] || 0) >= 3) ex += '🤒'; if (T.fpc < 0.6 && T.pop > 6) ex += '🥣'; if (T.houses.some((h) => h.st === 1)) ex += '🔥';
      const xb = el.lastChild; if (xb._t !== ex) { xb._t = ex; xb.textContent = ''; for (const ch of Array.from(ex.match(/\p{Extended_Pictographic}️?/gu) || [])) { const s = document.createElement('i'); s.className = 'em sm'; s.textContent = ch; xb.appendChild(s); } }
      if (T.under > 0) setText(mark('a' + T.id, 'pl red', T.x * PPU, T.y * PPU + 96, seen), 'Under attack · ' + T.under + (T.under === 1 ? ' raider' : ' raiders'));
    }
    const bestEv = {}; for (const e of S.events) { const n = evn[e.id] || 0, k = Math.round(e.x * 3) + ':' + Math.round(e.y * 3); if (n >= 3 && (!bestEv[k] || n > bestEv[k][1])) bestEv[k] = [e, n]; }
    for (const k in bestEv) { const e = bestEv[k][0]; setText(mark('p' + e.id, 'pl', e.x * PPU, e.y * PPU + 58, seen), e.label + ' · ' + bestEv[k][1] + ' gathered'); }
    for (const e of S.events) if (EV_EMOJI[e.label]) setText(mark('e' + e.id, 'em', e.x * PPU, e.y * PPU - 6, seen), EV_EMOJI[e.label]);
    for (const f of S.fx) { const a = (S.lifeT - f.t) / f.d; if (a < 0 || a > 1) continue; setText(mark('f' + f.t + ':' + f.x + f.e, f.d > 100 ? 'em' : 'em sm', f.x * PPU, f.y * PPU - 24, seen), f.e); }
    for (const [k, m] of marks) if (!seen.has(k)) { m.remove(); marks.delete(k); }
    // clouds
    const want = CFG.noClouds ? 0 : Math.ceil(({ clear: 3, cloudy: 8, rain: 10, storm: 12, snow: 9, fog: 6 }[sky] || 3) * (CFG.lite ? 0.6 : 1));
    if (cloudEls.length === 0 && nextCloud === 0) { for (let i = 0; i < Math.min(3, want); i++) spawnCloud(sky, 0.15 + Math.random() * 0.7); nextCloud = now + 4000; }
    else if (cloudEls.length < want && now > nextCloud) { spawnCloud(sky, 0); nextCloud = now + (cloudEls.length < want - 3 ? 2500 : 7000 + Math.random() * 16000); }
    EL.clouds.style.opacity = (1 - nightN * 0.72).toFixed(2);
    // rain, snow, fog, lightning
    setWeatherLayer(sky); if (sky === 'storm' && Math.random() < 0.03) { EL.flash.style.display = 'block'; EL.flash.animate([{ opacity: 0.28 }, { opacity: 0 }], { duration: 180 }).onfinish = () => { EL.flash.style.display = 'none'; }; }
    // sunrise and sunset glow from the side the sun is on
    const wa = warmN > 0.03 ? 0.2 * warmN : 0; if (EL.wash._a !== wa.toFixed(2) + sunSide) { EL.wash._a = wa.toFixed(2) + sunSide; EL.wash.style.display = wa ? 'block' : 'none'; EL.wash.style.background = wa ? 'linear-gradient(to ' + (sunSide > 0 ? 'left' : 'right') + ', rgba(255,150,70,' + wa.toFixed(3) + '), rgba(255,150,70,0))' : 'none'; }
    // village lights at night: painted occasionally, faded in and out with the darkness
    if (nightN > 0.05) {
      if (now - lightsAt > 5000) {
        lightsAt = now; const c = lctx; c.clearRect(0, 0, W, H);
        for (const T of S.towns) { if (!T.alive || !T.pop) continue; const hs = T.houses; c.globalAlpha = 0.16; c.drawImage(glow, T.x * PPU - 330, T.y * PPU - 290, 660, 580);
          for (let i = 0; i < hs.length; i++) { const h = hs[i]; if (h.st !== 0 || (i * 7 + T.id + Math.floor(now / 60000)) % 5 === 0) continue; c.globalAlpha = 0.5; c.drawImage(glow, h.x * PPU - 62, h.y * PPU - 62, 124, 124); c.globalAlpha = 1; c.fillStyle = '#ffdc96'; c.fillRect(h.x * PPU - 3.5, h.y * PPU - 2.5, 7, 6); } }
        c.globalAlpha = 1;
      }
    }
    const lo = nightN > 0.05 ? nightN.toFixed(2) : '0'; if (lightsN !== lo) { lightsN = lo; EL.lights.style.display = lo === '0' ? 'none' : 'block'; EL.lights.style.opacity = lo; }
  }

  // ---------- single-picture mode: everything is drawn into one picture, for computers with no working graphics chip
  let puffW, puffD, puffO, clouds = [], drops = [];
  function newCloud(x) { const n = CFG.lite ? 2 + Math.floor(Math.random() * 2) : 3 + Math.floor(Math.random() * 4), puffs = []; for (let i = 0; i < n; i++) puffs.push({ dx: (Math.random() - 0.5) * 380, dy: (Math.random() - 0.5) * 120, r: 150 + Math.random() * 190 }); return { x, y: Math.random() * H, v: 9 + Math.random() * 14, puffs, a: 0.7 + Math.random() * 0.5 }; }
  function pill(text, x, y, bg, fg, dot) {
    ctx.font = '500 19px Rubik, system-ui, sans-serif'; const tw = ctx.measureText(text).width, w = tw + (dot ? 40 : 24), h = 30; const px = Math.max(560, Math.min(W - w - 8, x - w / 2)), py = Math.max(6, y - h);
    ctx.fillStyle = bg; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(px, py, w, h, dot ? 15 : 8); else ctx.rect(px, py, w, h); ctx.fill();
    if (dot) { ctx.fillStyle = dot; ctx.beginPath(); ctx.arc(px + 15, py + 15, 6, 0, TAU); ctx.fill(); }
    ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.fillText(text, px + (dot ? 28 : 12), py + 16);
  }

  function townLabel(T, now, extra) {
    ctx.font = '500 20px Rubik, system-ui, sans-serif'; const w1 = ctx.measureText(T.name).width; ctx.font = '400 14px Rubik, system-ui, sans-serif'; const sub = 'population: ' + T.pop, w2 = ctx.measureText(sub).width;
    const w = Math.max(w1, w2) + 28, h = 50, cx = Math.max(560 + w / 2, Math.min(W - w / 2 - 8, T.x * PPU)), cy = Math.max(6 + h / 2, T.y * PPU - 62 - h / 2) + 2.5 * Math.sin(now / 760 + T.id * 1.9);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(0.028 * Math.sin(now / 980 + T.id * 2.3));
    ctx.fillStyle = 'rgba(8,12,22,0.28)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-w / 2 + 2, -h / 2 + 4, w, h, 12); else ctx.rect(-w / 2 + 2, -h / 2 + 4, w, h); ctx.fill();
    ctx.fillStyle = T.color; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, 12); else ctx.rect(-w / 2, -h / 2, w, h); ctx.fill();
    const fg = darkText(T.color); ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillStyle = fg; ctx.font = '500 20px Rubik, system-ui, sans-serif'; ctx.fillText(T.name, 0, -8);
    ctx.globalAlpha = 0.86; ctx.font = '400 14px Rubik, system-ui, sans-serif'; ctx.fillText(sub, 0, 13); ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.restore();
    if (extra) for (let i = 0; i < extra.length; i++) emoji(extra[i], cx + w / 2 + 26 + i * 44, cy, 30, 1, now + i * 300);
  }
  const EFONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
  function emoji(e, x, y, size, alpha, now) {
    const bob = Math.sin(now / 420 + x * 0.01) * 3; ctx.globalAlpha = alpha; ctx.fillStyle = 'rgba(8,12,22,0.3)'; ctx.beginPath(); ctx.arc(x + 2, y + bob + 4, size * 0.72, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.beginPath(); ctx.arc(x, y + bob, size * 0.72, 0, TAU); ctx.fill();
    ctx.font = size + 'px ' + EFONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000'; ctx.fillText(e, x, y + bob + size * 0.06); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  }
  function flatInit() {
    puffW = mkSprite(256, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
    puffD = mkSprite(256, [[0, 'rgba(14,20,44,1)'], [0.5, 'rgba(14,20,44,0.55)'], [1, 'rgba(14,20,44,0)']]);
    puffO = mkSprite(256, [[0, 'rgba(255,170,96,1)'], [0.5, 'rgba(255,170,96,0.5)'], [1, 'rgba(255,170,96,0)']]);
    for (let i = 0; i < (CFG.lite ? 2 : 3); i++) clouds.push(newCloud(Math.random() * W));
    for (let i = 0; i < 260; i++) drops.push({ x: Math.random() * W, y: Math.random() * H, v: 0.7 + Math.random() * 0.6 });
  }
  function flatOverlay(S, realDt, now) {
    const P = S.people; let sky = S.weather.sky; if (CFG.noWx && sky !== 'fog') sky = 'clear';
    // warm wash at sunrise and sunset, from the side the sun is on
    if (warmN > 0.03) { const g = ctx.createLinearGradient(sunSide > 0 ? W : 0, 0, sunSide > 0 ? 0 : W, 0); g.addColorStop(0, 'rgba(255,150,70,' + (0.13 * warmN).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,150,70,0)'); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    // village lights
    if (nightN > 0.08) {
      ctx.globalCompositeOperation = 'lighter';
      for (const T of S.towns) { if (!T.alive || !T.pop) continue; const hs = T.houses; for (let i = 0; i < hs.length; i++) { const h = hs[i]; if (h.st !== 0 || (i * 7 + T.id) % 5 === 0) continue; const fl = 0.92 + 0.08 * Math.sin(now / 700 + i * 1.7); ctx.globalAlpha = nightN * 0.34 * fl; ctx.drawImage(glow, h.x * PPU - 62, h.y * PPU - 62, 124, 124); ctx.globalAlpha = nightN * 0.95; ctx.fillStyle = '#ffdc96'; ctx.fillRect(h.x * PPU - 3.5, h.y * PPU - 2.5, 7, 6); } ctx.globalAlpha = nightN * 0.1; ctx.drawImage(glow, T.x * PPU - 330, T.y * PPU - 290, 660, 580); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // soft clouds drifting overhead
    const want = CFG.noClouds ? 0 : Math.ceil(({ clear: 3, cloudy: 9, rain: 11, storm: 13, snow: 10, fog: 7 }[sky] || 3) * (CFG.lite ? 0.45 : 1));
    if (clouds.length < want && now > nextCloud) { clouds.push(newCloud(-500 - Math.random() * 300)); nextCloud = now + (clouds.length < want - 3 ? 1500 : 6000 + Math.random() * 16000); }
    const grey = sky === 'rain' || sky === 'storm' ? 1 : sky === 'cloudy' || sky === 'snow' ? 0.4 : 0;
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i]; c.x += c.v * wind * realDt; if (c.x > W + 700) { clouds.splice(i, 1); continue; }
      for (const p of c.puffs) {
        const px = c.x + p.dx, py = c.y + p.dy, r = p.r;
        if (!CFG.lite) { ctx.globalAlpha = (0.06 + 0.1 * grey) * c.a * (1 - nightN * 0.5); ctx.drawImage(puffD, px - r + 46, py - r * 0.62 + 64, r * 2, r * 1.24); }
        ctx.globalAlpha = (0.2 - 0.08 * grey) * c.a * (1 - nightN * 0.82); ctx.drawImage(puffW, px - r, py - r * 0.62, r * 2, r * 1.24);
        if (warmN > 0.05) { ctx.globalAlpha = 0.16 * warmN * c.a; ctx.drawImage(puffO, px - r, py - r * 0.62, r * 2, r * 1.24); }
      }
    }
    ctx.globalAlpha = 1;
    // precipitation
    if (sky === 'rain' || sky === 'storm') { ctx.strokeStyle = 'rgba(214,230,255,' + (sky === 'storm' ? 0.5 : 0.36) + ')'; ctx.lineWidth = 1.6; ctx.beginPath(); const sp = sky === 'storm' ? 1500 : 1100; for (const d of drops) { d.y += sp * d.v * realDt; d.x -= sp * 0.22 * d.v * realDt; if (d.y > H) { d.y = -20; d.x = Math.random() * (W + 300); } ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 6, d.y + 26); } ctx.stroke(); if (sky === 'storm' && Math.random() < realDt * 0.12) flashUntil = now + 140; if (now < flashUntil) { ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(0, 0, W, H); } }
    else if (sky === 'snow') { ctx.fillStyle = 'rgba(255,255,255,0.85)'; for (const d of drops) { d.y += 90 * d.v * realDt; d.x += Math.sin(now / 900 + d.v * 20) * 22 * realDt; if (d.y > H) { d.y = -10; d.x = Math.random() * W; } ctx.beginPath(); ctx.arc(d.x, d.y, 1.6 + d.v * 1.4, 0, TAU); ctx.fill(); } }
    else if (sky === 'fog') { ctx.fillStyle = 'rgba(226,232,238,' + (0.2 * (1 - nightN * 0.6)).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
    // labels
    const count = {}, evn = {}, sickN = {};
    for (let i = 0; i < P.length; i++) { const p = P[i]; for (const T of S.towns) if (T.alive && Math.abs(p.x - T.x) < 1.0 && Math.abs(p.y - T.y) < 0.8) count[T.id] = (count[T.id] || 0) + 1; if (p.ev != null && p.arr) evn[p.ev] = (evn[p.ev] || 0) + 1; if (p.sick > 0) sickN[p.home] = (sickN[p.home] || 0) + 1; }
    for (const T of S.towns) { if (!T.alive || (!T.pop && !count[T.id])) continue; { const ex = []; if (T.enemy != null) ex.push('⚔️'); if ((sickN[T.id] || 0) >= 3) ex.push('🤒'); if (T.fpc < 0.6 && T.pop > 6) ex.push('🥣'); if (T.houses.some((h) => h.st === 1)) ex.push('🔥'); townLabel(T, now, ex); } if (T.under > 0) pill('Under attack · ' + T.under + (T.under === 1 ? ' raider' : ' raiders'), T.x * PPU, T.y * PPU + 96, '#e5484d', '#ffffff'); else if (T.houses.some((h) => h.st === 1)) pill('Fire', T.x * PPU, T.y * PPU + 96, '#e5484d', '#ffffff'); }
    const bestEv = {}; for (const e of S.events) { const n = evn[e.id] || 0, k = Math.round(e.x * 3) + ':' + Math.round(e.y * 3); if (n >= 3 && (!bestEv[k] || n > bestEv[k][1])) bestEv[k] = [e, n]; }
    for (const k in bestEv) { const e = bestEv[k][0]; pill(e.label + ' · ' + bestEv[k][1] + ' gathered', e.x * PPU, e.y * PPU + 58, '#ffcf66', '#1a1408'); }
    for (const e of S.events) if (EV_EMOJI[e.label]) emoji(EV_EMOJI[e.label], e.x * PPU, e.y * PPU - 6, 34, 1, now + e.id * 50);
    for (const f of S.fx) { const a = (S.lifeT - f.t) / f.d; if (a < 0 || a > 1) continue; emoji(f.e, f.x * PPU, f.y * PPU - 20 - a * 26, f.d > 100 ? 34 : 26, a > 0.8 ? (1 - a) * 5 : Math.min(1, a * 12 + 0.3), now + f.t * 13); }
  }

  function frame(S, realDt, now) {
    if (!R.ready) return; const key = calcLight(S); frameN++;
    fpsC++; if (now - fpsT > 2000) { R.fps = fpsT ? Math.round(fpsC * 1000 / (now - fpsT)) : 0; fpsT = now; fpsC = 0; }
    if (!job && (S.dirty !== lastDirty || key !== lastKey) && (firstPaint || now - lastStat > CFG.repaintGap)) { lastDirty = S.dirty; lastKey = key; lastStat = now; startPaint(S, now); }
    if (job) { runPaint(firstPaint ? 1e9 : CFG.budget); firstPaint = false; } else if (!MERGE || frameN % 3 === 0) shimmer(gctx, now);
    if (!FLAT && now - overlayAt > 240) { overlayAt = now; overlay(S, now); }
    // people walk on the ground, under roofs and treetops: glow where they gather, small shadows, then faceted figures
    const P = S.people, c = FLAT || MERGE ? ctx : pctx, one = FLAT || MERGE; if (FLAT) c.drawImage(EL.ground, 0, 0, W, H); else c.clearRect(0, 0, W, H);
    if (MERGE) for (let i = 0; i < P.length; i++) P[i]._u = under(P[i].x * PPU, P[i].y * PPU); c.globalAlpha = 0.11 + 0.05 * nightN;
    for (let i = 0; i < P.length; i++) { const p = P[i]; if ((CFG.lite && p.ev == null) || (MERGE && p._u)) continue; c.drawImage(glow, p.x * PPU - 44, p.y * PPU - 44, 88, 88); }
    c.globalAlpha = 1;
    for (let i = 0; i < P.length; i++) { const p = P[i]; if (p.act === 'work' && p.tgt === -2 && p.arr && !Sim.isLand(p.x, p.y)) drawBoat(c, p.x + 0.004 * Math.sin(now / 600 + p.id), p.y + 0.012 + 0.004 * Math.sin(now / 800 + p.id), (p.id % 6)); }
    if (shA > 0.02) { c.beginPath(); for (let i = 0; i < P.length; i++) { const p = P[i]; if (MERGE && p._u) continue; const r = p.age < 14 ? 4.2 : 6.2, x = p.x * PPU + shx * 6, y = p.y * PPU + shy * 6 + 1.5; c.moveTo(x - r, y); c.lineTo(x, y - r * 0.8); c.lineTo(x + r, y); c.lineTo(x, y + r * 0.8); c.closePath(); } c.fillStyle = 'rgba(18,22,58,' + Math.min(0.6, shA * 1.4).toFixed(3) + ')'; c.fill('nonzero'); }
    const dim = 1 - 0.3 * nightN, dx = nightN > 0.5 ? MX : lx, dy = nightN > 0.5 ? MY : ly;
    for (let i = 0; i < P.length; i++) {
      const p = P[i]; if (MERGE && p._u) continue; const x = p.x * PPU, y = p.y * PPU, r = p.age < 14 ? 4.4 : 6.4, col = townRGB(S.towns[p.home].color), ro = (p.id % 9) * 0.7;
      let px = x + r * Math.cos(ro), py = y + r * Math.sin(ro);
      for (let k = 0; k < 4; k++) {
        const a1 = ro + (k + 1) * TAU / 4, qx = x + r * Math.cos(a1), qy = y + r * Math.sin(a1), am = ro + (k + 0.5) * TAU / 4, f = Math.min(1.18, 0.62 + 0.62 * Math.max(0, Math.cos(am) * dx + Math.sin(am) * dy + 0.35)) * dim;
        c.fillStyle = 'rgb(' + Math.min(255, col[0] * f | 0) + ',' + Math.min(255, col[1] * f | 0) + ',' + Math.min(255, col[2] * f | 0) + ')';
        c.beginPath(); c.moveTo(x, y - 1); c.lineTo(px, py); c.lineTo(qx, qy); c.closePath(); c.fill(); px = qx; py = qy;
      }
      if (p.soldier) { c.fillStyle = '#e02626'; c.beginPath(); c.moveTo(x - 2.4, y + 1.4); c.lineTo(x, y - 3); c.lineTo(x + 2.4, y + 1.4); c.closePath(); c.fill(); }
    }
    for (const f of S.flash) { const a = 1 - (S.lifeT - f[2]) / 20; if (a > 0) { c.strokeStyle = 'rgba(255,80,60,' + a.toFixed(2) + ')'; c.lineWidth = 3; c.beginPath(); c.arc(f[0] * PPU, f[1] * PPU, 10 + (1 - a) * 22, 0, TAU); c.stroke(); } }
    // the layer above the roofs: swaying treetops, fires, and the red rings that pinpoint attackers
    if (one || frameN % CFG.tipEvery === 0) {
      if (FLAT) ctx.drawImage(EL.top, 0, 0, W, H); else if (!MERGE) ctx.clearRect(0, 0, W, H); drawTips(now);
      const pulse = 0.5 + 0.5 * Math.sin(now / 220); ctx.lineWidth = 3;
      for (let i = 0; i < P.length; i++) { const p = P[i]; if (!(p.act === 'raid' || (p.mark && p.mark > S.lifeT))) continue; const x = p.x * PPU, y = p.y * PPU, rr = 15 + pulse * 4;
        ctx.strokeStyle = 'rgba(255,40,40,' + (0.75 + 0.25 * pulse).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.moveTo(x - rr - 6, y); ctx.lineTo(x - rr + 4, y); ctx.moveTo(x + rr - 4, y); ctx.lineTo(x + rr + 6, y); ctx.moveTo(x, y - rr - 6); ctx.lineTo(x, y - rr + 4); ctx.moveTo(x, y + rr - 4); ctx.lineTo(x, y + rr + 6); ctx.stroke(); }
      if (R.sel != null) { const p = P.find((q) => q.id === R.sel); if (p) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p.x * PPU, p.y * PPU, 12, 0, TAU); ctx.stroke(); } }
      for (const T of S.towns) for (const h of T.houses) if (h.st === 1) { for (let i = 0; i < 4; i++) { const fx = (h.x + Math.sin(now / 130 + i * 2.1) * 0.04) * PPU, fy = (h.y - 0.02 - Math.abs(Math.sin(now / 170 + i)) * 0.07) * PPU, r = (0.035 + 0.02 * Math.sin(now / 90 + i)) * PPU; ctx.fillStyle = i % 2 ? 'rgba(255,200,60,0.9)' : 'rgba(255,90,30,0.85)'; ctx.beginPath(); ctx.moveTo(fx - r, fy + r); ctx.lineTo(fx, fy - r * 1.6); ctx.lineTo(fx + r, fy + r); ctx.fill(); } ctx.globalAlpha = 0.6; ctx.drawImage(glow, h.x * PPU - 90, h.y * PPU - 90, 180, 180); ctx.globalAlpha = 1; }
    }
    if (FLAT) flatOverlay(S, realDt, now);
  }
  const rgbCache = {};
  function townRGB(h) { return rgbCache[h] || (rgbCache[h] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]); }
  function pickAt(S, wx, wy) {
    let best = null, bd = 0.09; for (const p of S.people) { const d = Math.hypot(p.x - wx, p.y - wy); if (d < bd) { bd = d; best = p; } } if (best) return { person: best };
    for (const T of S.towns) if (T.alive && Math.hypot(T.x - wx, T.y - wy) < 0.45) return { town: T }; return null;
  }
  Object.assign(R, { init, frame, pickAt, W, H, PPU });
  root.TW_RENDER = R;
})(window);
