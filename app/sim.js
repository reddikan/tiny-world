/* Tiny World: the simulation. No drawing here; this file also runs headless for testing. */
(function (root) {
  'use strict';
  const TX = root.TW_TEXT;
  const WU = 12, HU = 6.75, YEAR = 1800, MONTH = 150, SPEED = 0.03;
  const CATS = ['food', 'money', 'work', 'fun', 'person', 'romance', 'health', 'law', 'politics', 'conflict', 'tech', 'nature', 'weather', 'faith', 'death'];
  const KEYCOL = { capital: '#ff4fa3', port: '#00d8f0', sun: '#a970ff', jungle: '#ffe100', frost: '#5b8cff' };
  let D = null, G = null, buckets = null, S = null, byId = {}, ideaById = {}, here = {};
  const Sim = { trendSource: null, YEAR, MONTH, WU, HU };

  // ---------- helpers
  function rnd() { S.rs = (S.rs + 0x6D2B79F5) | 0; let t = Math.imul(S.rs ^ (S.rs >>> 15), 1 | S.rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const noise = () => rnd() + rnd() + rnd() - 1.5;
  const dist = (a, b, c, d) => Math.hypot(a - c, b - d);
  function b64(s) { if (typeof atob !== 'undefined') { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; } return new Uint8Array(Buffer.from(s, 'base64')); }

  // ---------- terrain
  function gi(x, y) { const cx = clamp(Math.floor(x / G.cell), 0, G.w - 1), cy = clamp(Math.floor(y / G.cell), 0, G.h - 1); return cy * G.w + cx; }
  const inWorld = (x, y) => x > 0.12 && x < WU - 0.12 && y > 0.12 && y < HU - 0.12;
  const biome = (x, y) => (inWorld(x, y) ? G.biome[gi(x, y)] : 5);
  const isLand = (x, y) => biome(x, y) !== 5;
  const tBase = (x, y) => G.t[gi(x, y)] / 170 - 0.5;
  function nearWater(x, y, r) { for (let a = 0; a < 8; a++) if (!isLand(x + r * Math.cos(a * 0.785), y + r * Math.sin(a * 0.785))) return true; return false; }
  function fertAt(x, y) { const b = biome(x, y); if (b === 0) return 1; if (b === 1) return 0.8; if (b === 2) return nearWater(x, y, 0.35) ? 0.45 : 0; return 0; }
  function landNear(x, y, r, tries) { for (let i = 0; i < (tries || 10); i++) { const a = rnd() * 6.283, d = r * Math.sqrt(rnd()); const px = x + d * Math.cos(a) * 1.15, py = y + d * Math.sin(a); if (isLand(px, py)) return [px, py]; } return [x, y]; }

  function init(data) {
    D = data; G = { w: data.grid.w, h: data.grid.h, cell: data.grid.cell, biome: b64(data.grid.biome), e: b64(data.grid.e), t: b64(data.grid.t) };
    buckets = {};
    data.sprites.forEach((s, i) => { const k = Math.floor(s[1] / 0.25) + ',' + Math.floor(s[2] / 0.25); (buckets[k] = buckets[k] || []).push(i); });
  }
  function spritesNear(x, y, r, fn) {
    const x0 = Math.floor((x - r) / 0.25), x1 = Math.floor((x + r) / 0.25), y0 = Math.floor((y - r) / 0.25), y1 = Math.floor((y + r) / 0.25);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) { const b = buckets[cx + ',' + cy]; if (b) for (const i of b) { const s = D.sprites[i]; if (dist(s[1], s[2], x, y) <= r) fn(i, s); } }
  }
  const PLANT = { tree: 1, palm: 1, pine: 1, shrub: 1, flower: 1 };
  function clearPlants(x, y, r, state, until, force) { spritesNear(x, y, r, (i, s) => { if (PLANT[s[0]] && (force || !(S.dead[i] && S.dead[i][0] === 3))) S.dead[i] = [state, until]; }); S.dirty++; }

  // ---------- time, season, weather
  function clock() { const d = new Date(S.time); const start = new Date(d.getFullYear(), 0, 0); const doy = Math.floor((d - start) / 864e5); return { d, hour: d.getHours() + d.getMinutes() / 60, doy, month: d.getMonth() }; }
  function season() {
    const c = clock(); const m = c.month; const name = m <= 1 || m === 11 ? 'Winter' : m <= 4 ? 'Spring' : m <= 7 ? 'Summer' : 'Autumn';
    const cold = Math.max(0, Math.cos((c.doy - 15) / 365 * 6.283)); const tshift = 0.30 * Math.pow(cold, 1.5);
    const anchors = [[15, 'winter'], [105, 'spring'], [196, 'summer'], [288, 'autumn'], [380, 'winter']];
    let a = 'winter', b = 'spring', w = 0; const dd = c.doy < 15 ? c.doy + 365 : c.doy;
    for (let i = 0; i < 4; i++) if (dd >= anchors[i][0] && dd < anchors[i + 1][0]) { a = anchors[i][1]; b = anchors[i + 1][1]; w = (dd - anchors[i][0]) / (anchors[i + 1][0] - anchors[i][0]); }
    const grow = { Winter: 0.5, Spring: 1.0, Summer: 1.1, Autumn: 1.25 }[name];
    return { name, tshift, a, b, w, grow, hour: c.hour, doy: c.doy, date: c.d };
  }
  const isNight = () => { const h = clock().hour; return h < 6 || h >= 21; };
  const snowAt = (x, y) => isLand(x, y) && tBase(x, y) - season().tshift < 0.285;
  function temperature() {
    const c = clock(); let t = 52 + 26 * Math.cos((c.doy - 200) / 365 * 6.283) + 8 * Math.cos((c.hour - 15) / 24 * 6.283);
    const sky = S.weather.sky; if (sky === 'rain' || sky === 'storm') t -= 5; if (sky === 'snow') t = Math.min(t, 31); if (sky === 'clear' && c.hour > 10 && c.hour < 18) t += 3;
    return S.weather.live != null ? S.weather.live : Math.round(t + S.weather.jit);
  }
  function updateWeather() {
    if (S.weather.fixed) return;
    const se = season().name; const r = rnd(); let sky;
    const P = { Winter: [0.25, 0.3, 0.05, 0.03, 0.32, 0.05], Spring: [0.35, 0.3, 0.25, 0.05, 0.0, 0.05], Summer: [0.55, 0.22, 0.13, 0.08, 0, 0.02], Autumn: [0.3, 0.3, 0.25, 0.06, 0.02, 0.07] }[se];
    const names = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog']; let acc = 0; sky = 'clear';
    if (rnd() < 0.45) sky = S.weather.sky; else for (let i = 0; i < 6; i++) { acc += P[i]; if (r < acc) { sky = names[i]; break; } }
    S.weather.sky = sky; S.weather.jit = Math.round(noise() * 4); S.weather.dry = sky === 'clear' ? (S.weather.dry || 0) + 1 : 0;
  }

  // ---------- feed
  function feed(imp, text, o) {
    o = o || {};
    if (imp === 1 && S.lifeT - (S.lastMinor || -99) < 40) return; if (imp === 1) S.lastMinor = S.lifeT;
    S.feed.unshift({ id: S.nextId++, t: S.time, imp, text, trend: o.trend || null, tag: o.tag || null, quotes: o.quotes || [] });
    if (S.feed.length > 60) S.feed.length = 60;
  }
  function flavor(p) { const t = p.tr; const c = [['kind', t.kind], ['temper', t.temper], ['whim', t.whim]].sort((a, b) => b[1] - a[1])[0]; return c[1] > 0.6 ? c[0] : 'plain'; }
  const first = (p) => p.name.split(' ')[0];
  function q(p, lines) { return { n: first(p), c: S.towns[p.home].color, q: pick(lines), id: p.id }; }
  function tq(p, cat) { const Q = TX.QUOTES[cat] || TX.QUOTES.person; return q(p, Q[flavor(p)] || Q.plain); }

  // ---------- towns
  const town = (id) => S.towns[id];
  function mkTown(key, name, color, x, y, style) {
    const T = { id: S.towns.length, key, name, color, x, y, style, houses: [], fields: [], food: 0, wood: 8, leader: null, trust: {}, enemy: null, truce: 0, graves: [], shrines: [], tech: 0, mood: 0, alive: true, parent: null, road: null, pop: 0, adults: 0, fpc: 5, born: 0, died: 0, fish: [], under: 0, small: 0, crowd: 0, lastOust: -1e9, founded: S.lifeT };
    for (let i = 0; i < 60 && T.fish.length < 8; i++) { const a = rnd() * 6.283, r = 0.35 + rnd() * 1.2, fx = x + r * Math.cos(a), fy = y + r * Math.sin(a); if (inWorld(fx, fy) && biome(fx, fy) === 5 && G.e[gi(fx, fy)] < 86) T.fish.push([fx, fy]); }
    S.towns.push(T); return T;
  }
  function trust(a, b) { if (a === b) return 100; const A = town(a); return A.trust[b] == null ? 0 : A.trust[b]; }
  function addTrust(a, b, d) { if (a === b) return; const v = clamp(trust(a, b) + d, -100, 100); town(a).trust[b] = v; town(b).trust[a] = v; }
  function chain(T) { const c = []; while (T) { c.push(T); T = T.parent != null ? town(T.parent) : null; } return c; }
  function route(a, b) {
    const pts = []; if (a === b) return pts;
    const ca = chain(a), cb = chain(b); let i = ca.length - 1, j = cb.length - 1;
    if (ca[i] !== cb[j]) { pts.push([b.x, b.y]); return pts; }
    while (i > 0 && j > 0 && ca[i - 1] === cb[j - 1]) { i--; j--; }
    for (let k = 0; k < i; k++) { const r = ca[k].road; for (let n = r.length - 1; n >= 0; n--) pts.push([r[n][0], r[n][1]]); }
    for (let k = j - 1; k >= 0; k--) { const r = cb[k].road; for (let n = 0; n < r.length; n++) pts.push([r[n][0], r[n][1]]); }
    return pts;
  }
  const liveHouses = (T) => T.houses.reduce((n, h) => n + (h.st === 0 ? 1 : 0), 0);
  function overlapsField(x, y, r) { for (const T of S.towns) for (const f of T.fields) if (Math.abs(x - f.x) < f.w / 2 + r && Math.abs(y - f.y) < f.h / 2 + r) return true; return false; }
  function nearHouse(x, y, r) { for (const T of S.towns) for (const h of T.houses) if (dist(x, y, h.x, h.y) < r) return true; return false; }
  function nearRoad(x, y, r) { for (const T of S.towns) if (T.road) for (const p of T.road) if (dist(x, y, p[0], p[1]) < r) return true; return false; }
  function findFieldSpot(T) {
    const spread = 0.6 + Math.sqrt(T.fields.length) * 0.32 + Math.sqrt(T.houses.length) * 0.09;
    for (let i = 0; i < 50; i++) {
      const a = rnd() * 6.283, r = 0.55 + rnd() * spread, x = T.x + r * Math.cos(a) * 1.3, y = T.y + r * Math.sin(a);
      const w = 0.3 + rnd() * 0.2, h = 0.2 + rnd() * 0.12;
      if (!inWorld(x - w, y - h) || !inWorld(x + w, y + h)) continue;
      const f = Math.min(fertAt(x, y), fertAt(x - w / 2, y - h / 2), fertAt(x + w / 2, y + h / 2), fertAt(x - w / 2, y + h / 2), fertAt(x + w / 2, y - h / 2));
      if (f < 0.3 || overlapsField(x, y, Math.max(w, h) / 2 + 0.05) || nearHouse(x, y, 0.3) || nearRoad(x, y, 0.16) || dist(x, y, T.x, T.y) < 0.35) continue;
      return { x, y, w, h, a: 0.35 + (rnd() - 0.5) * 0.16, ci: Math.floor(rnd() * 4), fert: f * (0.75 + rnd() * 0.25), st: 0, t: S.lifeT, used: 0 };
    }
    return null;
  }
  function addField(T, quiet) {
    const f = findFieldSpot(T); if (!f) return null;
    const wooded = biome(f.x, f.y) === 1; T.fields.push(f); clearPlants(f.x, f.y, Math.max(f.w, f.h) * 0.75, 3, Infinity);
    if (!quiet && wooded && rnd() < 0.5) feed(1, 'Farmers from ' + T.name + ' clear woodland for a new field.');
    return f;
  }
  function findHouseSpot(T) {
    const n = T.houses.length;
    for (let i = 0; i < 60; i++) { const a = rnd() * 6.283, r = 0.1 + rnd() * (0.3 + Math.sqrt(n) * 0.09), x = T.x + r * Math.cos(a) * 1.25, y = T.y + r * Math.sin(a); if (isLand(x, y) && !nearWater(x, y, 0.06) && !nearHouse(x, y, 0.19) && !overlapsField(x, y, 0.1) && dist(x, y, T.x, T.y) > 0.17) return [x, y]; }
    return null;
  }
  function elect(T, quiet) {
    let best = null, bs = -1; for (const p of S.people) if (p.alive && p.home === T.id && p.age >= 18) { const s = p.tr.amb * 0.4 + p.tr.soc * 0.3 + p.tr.kind * 0.1 + rnd() * 0.25; if (s > bs) { bs = s; best = p; } }
    T.leader = best ? best.id : null; if (best && !quiet) { remember(best, 'Chosen to lead ' + T.name); best.pride = 1; bump(best, 'civ', 0.05); fx('👑', T.x, T.y - 0.2, 90); }
    if (best && !quiet) feed(2, best.name + ' is chosen to lead ' + T.name + '.', { quotes: [q(best, TX.SAY.leader)] });
  }

  // ---------- people
  function mkName(sex, fam) { return pick(TX.NAME_A) + pick(sex === 'f' ? TX.NAME_F : TX.NAME_M) + ' ' + fam; }
  const JOBS = {
    capital: { farmer: 0.4, builder: 0.09, baker: 0.07, healer: 0.05, guard: 0.06, trader: 0.09, priest: 0.04, forager: 0.1, fisher: 0.05, scholar: 0.05 },
    port: { fisher: 0.48, trader: 0.15, farmer: 0.1, builder: 0.09, guard: 0.05, healer: 0.05, forager: 0.08 },
    sun: { forager: 0.34, trader: 0.24, farmer: 0.16, builder: 0.09, guard: 0.07, healer: 0.04, priest: 0.06 },
    jungle: { forager: 0.42, farmer: 0.16, fisher: 0.1, healer: 0.1, builder: 0.09, guard: 0.05, priest: 0.08 },
    frost: { forager: 0.42, fisher: 0.26, builder: 0.11, guard: 0.08, healer: 0.06, priest: 0.07 },
    other: { farmer: 0.4, forager: 0.2, builder: 0.15, fisher: 0.08, guard: 0.05, healer: 0.05, trader: 0.07 }
  };
  const JOBNAME = { sun: { forager: 'herder' }, frost: { forager: 'hunter' } };
  function pickJob(T) { const J = JOBS[T.key] || JOBS.other; let r = rnd(), acc = 0; for (const k in J) { acc += J[k]; if (r < acc) return k; } return 'forager'; }
  const jobName = (p) => (p.age < 14 ? 'child' : (JOBNAME[town(p.home).key] || {})[p.job] || p.job);
  function mkPerson(T, age, sex, fam, par) {
    const tr = {}; const keys = ['bold', 'kind', 'cur', 'dev', 'amb', 'soc', 'temper', 'whim', 'civ'];
    for (const k of keys) { let v = rnd(); if (par) { const a = byId[par[0]], b = byId[par[1]]; const m = ((a ? a.tr[k] : 0.5) + (b ? b.tr[k] : 0.5)) / 2; v = clamp(m + (rnd() - 0.5) * 0.5, 0, 1); } tr[k] = Math.round(v * 100) / 100; }
    const int = {}; for (const c of CATS) int[c] = rnd() * 0.6;
    int.faith += tr.dev * 0.4; int.tech += tr.cur * 0.35; int.nature += tr.cur * 0.3; int.money += tr.amb * 0.35; int.politics += tr.amb * 0.3; int.fun += tr.soc * 0.35; int.person += tr.soc * 0.3; int.romance += tr.soc * 0.2; int.conflict += (tr.bold + tr.temper) * 0.2; int.health += tr.kind * 0.25; int.death += tr.kind * 0.15;
    const p = { id: S.nextId++, name: mkName(sex, fam), fam, sex, age, home: T.id, at: T.id, h: -1, x: T.x, y: T.y, path: [], arr: true, until: 0, dur: 0, t0: S.lifeT, act: 'idle', ev: null, tgt: null, job: 'none', tr, int, hunger: rnd() * 0.5, rest: rnd() * 0.5, lonely: rnd() * 0.5, spirit: rnd() * 0.5, mood: 0.2, health: 1, sick: 0, immune: 0, rel: {}, partner: null, par: par || null, kids: 0, faith: null, ideas: {}, thought: '', soldier: false, mil: 0, grief: 0, loot: 0, ret: false, alive: true, gay: rnd() < 0.06, wealth: age >= 14 ? rnd() * 3 : 0, anger: 0, fear: 0, envy: 0, pride: 0, goal: null, mem: [], crimes: 0, foe: null, mark: 0, nextM: S.lifeT + rnd() * MONTH, hit: 0, rep: 0 };
    if (age >= 14) { p.job = pickJob(T); if (p.job === 'farmer') p.int.food += 0.3; if (p.job === 'trader') p.int.money += 0.3; if (p.job === 'healer') p.int.health += 0.4; if (p.job === 'guard') p.int.law += 0.3; }
    const lp = landNear(T.x, T.y, 0.5); p.x = lp[0]; p.y = lp[1];
    S.people.push(p); byId[p.id] = p; return p;
  }
  const bump = (p, k, d) => { p.tr[k] = Math.round(clamp((p.tr[k] == null ? 0.5 : p.tr[k]) + d, 0, 1) * 1000) / 1000; };
  function remember(p, text) { if (p.mem.length && p.mem[p.mem.length - 1][1] === text) return; p.mem.push([Math.floor(p.age), text]); if (p.mem.length > 7) p.mem.shift(); }
  function fx(e, x, y, dur) { S.fx.push({ e, x, y, t: S.lifeT, d: dur || 40 }); if (S.fx.length > 60) S.fx.shift(); }
  function pickGoal(p) { const t = p.tr; const c = [['power', t.amb * 1.0 + t.bold * 0.3 - 1.0], ['wealth', t.amb * 0.8 - t.kind * 0.5 - t.civ * 0.3 - 0.05], ['family', t.soc * 0.7 + t.kind * 0.3 - 0.45], ['faith', t.dev * 1.1 - 0.6], ['knowledge', t.cur * 1.0 - 0.55], ['wander', t.cur * 0.6 + t.whim * 0.6 - 0.7], ['peace', t.kind * 0.9 - t.temper * 0.4 - 0.4], ['craft', 0.12]]; let b = 'craft', bs = -9; for (const x of c) { const v = x[1] + rnd() * 0.25; if (v > bs) { bs = v; b = x[0]; } } return b; }
  function migrate(p) { if (p.tr.civ == null) p.tr.civ = Math.round(rnd() * 100) / 100; if (p.wealth == null) p.wealth = 0; if (p.anger == null) { p.anger = 0; p.fear = 0; p.envy = 0; p.pride = 0; } if (!p.mem) p.mem = []; if (p.crimes == null) p.crimes = 0; if (p.goal === undefined) p.goal = null; if (p.foe === undefined) p.foe = null; }
  function exile(p, T, why) { const others = S.towns.filter((x) => x.alive && x.id !== p.home && x.pop > 0); if (!others.length) return false; const N = pick(others); p.migrate = N.id; if (p.partner != null && byId[p.partner]) byId[p.partner].partner = null; p.partner = null; remember(p, 'Cast out of ' + T.name); feed(2, T.name + ' casts out ' + first(p) + ' ' + why + '. They take the road to ' + N.name + '.', { quotes: [q(p, TX.SAY.exile)] }); return true; }
  const rel = (p, o) => p.rel[o.id] || 0;
  const match = (p, o) => (p.gay ? o.gay && o.sex === p.sex : !o.gay && o.sex !== p.sex);
  function addRel(p, o, d) { p.rel[o.id] = clamp((p.rel[o.id] || 0) + d, -1, 1); }
  function kin(p, o) { if (p.par && (p.par[0] === o.id || p.par[1] === o.id)) return true; if (o.par && (o.par[0] === p.id || o.par[1] === p.id)) return true; if (p.par && o.par && (p.par[0] === o.par[0] || p.par[1] === o.par[1])) return true; return false; }
  function ideaW(p) {
    const w = {}; for (const id in p.ideas) { const I = ideaById[id]; if (!I) { delete p.ideas[id]; continue; } w[I.cat] = Math.min(1, (w[I.cat] || 0) + I.s * p.ideas[id]); }
    if (p.faith != null && S.faiths[p.faith]) { const c = S.faiths[p.faith].cat; w[c] = Math.min(1, (w[c] || 0) + 0.25 * p.tr.dev); }
    return w;
  }
  function topIdea(p) { let b = null, bs = 0; for (const id in p.ideas) { const I = ideaById[id]; if (I && I.s * p.ideas[id] > bs) { bs = I.s * p.ideas[id]; b = I; } } return b; }
  function housePos(p) { const T = town(p.home); const h = T.houses[p.h]; if (h && h.st === 0) return [h.x + (rnd() - 0.5) * 0.05, h.y + 0.05 + rnd() * 0.03]; return landNear(T.x, T.y, 0.18); }
  function assignHouse(p) {
    const T = town(p.home); const occ = T.houses.map(() => 0); for (const o of S.people) if (o.alive && o.home === T.id && o.h >= 0 && o.h < occ.length) occ[o.h]++;
    let best = -1, bo = 99; T.houses.forEach((h, i) => { if (h.st === 0 && occ[i] < bo) { bo = occ[i]; best = i; } }); p.h = best;
  }

  function start(p, act, x, y, dur, pathPrefix) {
    p.act = act; p.path = (pathPrefix || []).concat([[x, y]]); p.arr = false; p.dur = dur; p.t0 = S.lifeT; p.hit = 0;
    const th = TX.THOUGHT[act] || TX.THOUGHT.wander; const r0 = rnd(); const I = r0 < 0.2 ? topIdea(p) : null; let own = null;
    if (!I && r0 < 0.6 && p.age >= 14) { const foe = p.foe != null ? byId[p.foe] : null; if (p.anger > 0.45) own = pick(TX.FEEL.anger).replace('{x}', foe ? first(foe) : 'they'); else if (p.fear > 0.45) own = pick(TX.FEEL.fear); else if (p.envy > 0.45) own = pick(TX.FEEL.envy); else if (p.pride > 0.5) own = pick(TX.FEEL.pride); else if (r0 < 0.38 && p.goal && TX.GOALS[p.goal]) own = pick(TX.GOALS[p.goal].th); else if (p.tr.civ > 0.75) own = pick(TX.FEEL.civic); else if (p.tr.civ < 0.25) own = pick(TX.FEEL.selfish); }
    p.thought = I ? 'Still thinking about "' + I.term + '".' : own || pick(th);
  }
  function townmate(p, T, pred) { const L = here[T.id]; if (!L || !L.length) return null; for (let i = 0; i < 14; i++) { const o = pick(L); if (o.alive && o !== p && o.at === T.id && (!pred || pred(o))) return o; } return null; }
  function census() { here = {}; for (const p of S.people) if (p.alive) (here[p.at] = here[p.at] || []).push(p); }

  function decide(p) {
    const T = town(p.home); p.ev = null; p.tgt = null;
    if (p.ret) { p.ret = false; const hp = housePos(p); start(p, 'return', hp[0], hp[1], 5, route(town(p.at), T)); return; }
    if (p.migrate != null) { const N = town(p.migrate); p.migrate = null; const from = town(p.home); p.home = N.id; p.h = -1; const lp = landNear(N.x, N.y, 0.25); start(p, 'migrate', lp[0], lp[1], 30, route(from, N)); return; }
    const night = isNight(), adult = p.age >= 14, w = ideaW(p), t = p.tr; const iw = (c) => w[c] || 0;
    const c = []; const add = (a, s, x) => c.push([a, s + noise() * (0.22 + t.whim * 0.4), x]);
    add('sleep', p.rest * 1.5 + (night ? 0.9 : 0) + p.fear * 0.5);
    add('eat', p.hunger * 1.9);
    if (!adult) { add('play', 0.7 - (night ? 0.6 : 0)); }
    else {
      const needy = T.fpc < 2.5 || T.crowd > 1; const lead0 = byId[T.leader];
      add('work', 0.6 + t.amb * 0.3 + (T.fpc < 2.5 ? 0.7 : 0) + (needy ? (t.civ - 0.5) * 0.9 : (t.civ - 0.5) * 0.2) + (p.goal === 'craft' ? 0.15 : 0) + iw('work') * 0.4 + iw('food') * 0.2 - (night && T.fpc >= 2.5 ? 0.35 : 0));
      add('steal', (0.45 - t.civ) * 1.3 + p.envy * 0.8 + p.hunger * 0.3 + (p.goal === 'wealth' ? 0.2 : 0) - t.kind * 0.3 - 0.52 + (night ? 0.12 : 0));
      if (p.wealth >= 2 && T.fpc < 2.6) add('give', t.kind * 0.6 + t.civ * 0.6 + 0.15);
      if (p.anger > 0.28 && p.foe != null && byId[p.foe] && byId[p.foe].alive && byId[p.foe].at === p.at) add('confront', p.anger * 1.3 + t.temper * 0.3 - t.kind * 0.3 + 0.25);
      if (t.civ < 0.3 && p.anger > 0.42) add('sabotage', p.anger * 0.9 + (0.3 - t.civ) - t.kind * 0.6 + 0.1);
      if (p.goal === 'power' && T.leader !== p.id && T.id === p.at && S.lifeT - T.lastOust > 2 * YEAR) add('plot', t.amb * 0.5 + (0.5 - t.civ) * 0.6 - T.mood * 0.5 - (lead0 ? rel(p, lead0) * 0.4 : 0) + 0.4);
      add('social', p.lonely * 1.1 + t.soc * 0.4 + iw('fun') * 0.3 + iw('person') * 0.3 - (night ? 0.3 : 0));
      if (p.partner == null && p.age >= 16) add('court', 0.45 + p.lonely * 0.4 + iw('romance') * 0.6 - (p.age > 50 ? 0.3 : 0));
      if (p.faith != null || t.dev > 0.6) add('worship', p.spirit * 0.9 + t.dev * 0.45 + iw('faith') * 0.5 + iw('death') * 0.2 + p.fear * 0.3 + (p.goal === 'faith' ? 0.2 : 0) - 0.25);
      add('wander', 0.1 + t.cur * 0.35 + iw('nature') * 0.4 + (p.goal === 'wander' ? 0.3 : 0) - (night ? 0.2 : 0) - p.fear * 0.3);
      if (S.towns.length > 1 && !night) add('trade', (p.job === 'trader' ? 0.45 : 0) + t.amb * 0.12 + t.cur * 0.1 + iw('money') * 0.55 - 0.1);
      if (p.sick) add('rest', 1.3);
      if (p.faith != null && t.dev > 0.7) add('preach', 0.1 + t.amb * 0.4 + iw('faith') * 0.5 + (p.job === 'priest' ? 0.4 : 0) - (night ? 0.4 : 0));
      add('study', t.cur * 0.3 + iw('tech') * 0.7 + (p.job === 'scholar' ? 0.4 : 0) + (p.goal === 'knowledge' ? 0.3 : 0) - 0.15);
      add('protest', -T.mood * 0.9 - (lead0 && lead0 !== p ? rel(p, lead0) * 0.45 : 0) + p.anger * 0.2 + (T.fpc < 1 ? 0.5 : 0) + iw('politics') * 0.5 + iw('work') * 0.25 + t.temper * 0.2 + t.bold * 0.1 - 0.65);
      if (p.grief > 0.2) add('mourn', p.grief * 1.2);
      if (T.enemy != null) {
        const lead = byId[T.leader]; const enlist = t.civ * 0.3 - p.fear * 0.35 - (p.goal === 'peace' ? 0.3 : 0) + (p.goal === 'revenge' ? 0.3 : 0) + t.bold * 0.7 + p.mil * 0.8 + t.temper * 0.25 - t.kind * 0.55 + (lead && rel(p, lead) > 0.2 ? 0.2 : 0) + iw('conflict') * 0.4 + noise() * 0.2;
        p.soldier = p.age >= 16 && p.age < 60 && enlist > 0.5;
        if (p.soldier) { const W = warOf(T); const agg = W && W.a === T.id, el = W ? S.lifeT - W.start : 0, wave = el > 100 && (el % 420) < 100; if (wave && T.under === 0 && rnd() < (agg ? 0.92 : 0.45)) add('raid', 2.6); else add('defend', T.under > 0 ? 2.6 : 1.6); }
      } else p.soldier = false;
    }
    if (T.under > 0 && !p.soldier && p.at === T.id) add('flee', 1.4 - t.bold * 0.8 + (p.kids > 0 ? 0.3 : 0));
    for (const e of S.events) { if (e.town !== p.at || e.until - S.lifeT < 25) continue; add('attend', e.pull + t.soc * 0.3 + t.cur * 0.25 + iw(e.cat) * 0.9 - (night ? 0.2 : 0) - (p.sick ? 0.6 : 0), e); }
    c.sort((a, b) => b[1] - a[1]); const [act, , x] = c[0];
    doAct(p, act, x, T);
  }

  function doAct(p, act, x, T) {
    let hp;
    switch (act) {
      case 'sleep': hp = housePos(p); start(p, 'sleep', hp[0], hp[1], isNight() ? 200 + rnd() * 200 : 70 + rnd() * 50); break;
      case 'eat': case 'rest': hp = housePos(p); start(p, act, hp[0], hp[1], act === 'rest' ? 150 : 40 + rnd() * 30); break;
      case 'play': hp = landNear(T.x, T.y, 0.45); start(p, 'play', hp[0], hp[1], 60 + rnd() * 80); break;
      case 'work': work(p, T); break;
      case 'social': { const o = townmate(p, town(p.at), (o) => Math.abs(rel(p, o)) > 0.15 || rnd() < 0.35); if (o) { p.tgt = o.id; start(p, 'social', o.x + (rnd() - 0.5) * 0.04, o.y + (rnd() - 0.5) * 0.04, 40 + rnd() * 50); } else { hp = landNear(T.x, T.y, 0.2); start(p, 'social', hp[0], hp[1], 40); } break; }
      case 'court': { let best = null, bs = -9; for (let i = 0; i < 10; i++) { const o = townmate(p, town(p.at), (o) => o.partner == null && o.age >= 16 && Math.abs(o.age - p.age) < 14 && !kin(p, o) && match(p, o)); if (o) { const s = rel(p, o) + rnd() * 0.3; if (s > bs) { bs = s; best = o; } } } if (best) { p.tgt = best.id; start(p, 'court', best.x + 0.02, best.y + 0.02, 50 + rnd() * 40); } else { hp = landNear(T.x, T.y, 0.2); start(p, 'social', hp[0], hp[1], 40); } break; }
      case 'worship': { const sh = T.shrines.find((s) => s.f === p.faith); hp = sh ? [sh.x + (rnd() - 0.5) * 0.12, sh.y + 0.06 + rnd() * 0.08] : housePos(p); start(p, 'worship', hp[0], hp[1], 70 + rnd() * 40); break; }
      case 'attend': p.ev = x.id; start(p, 'attend', x.x + noise() * 0.24, x.y + noise() * 0.18, Math.min(280, Math.max(40, x.until - S.lifeT - 20))); break;
      case 'wander': hp = landNear(p.x, p.y, 1.4); start(p, 'wander', hp[0], hp[1], 40 + rnd() * 40); break;
      case 'trade': { let best = null, bs = -1e9; for (const o of S.towns) if (o.alive && o.id !== T.id && o.id !== T.enemy && trust(T.id, o.id) > -30) { const s = trust(T.id, o.id) / 60 + o.pop / 80 + rnd() * 1.2 - dist(T.x, T.y, o.x, o.y) * 0.12; if (s > bs) { bs = s; best = o; } } if (!best) { doAct(p, 'wander', null, T); break; } p.tgt = best.id; hp = landNear(best.x, best.y, 0.15); start(p, 'trade', hp[0], hp[1], 90, route(town(p.at), best)); break; }
      case 'preach': hp = landNear(T.x, T.y, 0.16); start(p, 'preach', hp[0], hp[1], 80); break;
      case 'study': hp = housePos(p); start(p, 'study', hp[0], hp[1], 160 + rnd() * 80); break;
      case 'protest': { let e = S.events.find((e) => e.town === T.id && e.label === 'Protest'); if (!e) e = mkEvent('Protest', 'politics', T, 260, null, 0.5); p.ev = e.id; start(p, 'protest', e.x + noise() * 0.1, e.y + noise() * 0.08, 220); break; }
      case 'mourn': { const g = T.graves.length ? T.graves[T.graves.length - 1] : [T.x, T.y]; start(p, 'mourn', g[0] + noise() * 0.06, g[1] + 0.04 + rnd() * 0.05, 90); break; }
      case 'raid': { const E = town(T.enemy); p.tgt = E.id; hp = landNear(E.x, E.y, 0.4); start(p, 'raid', hp[0], hp[1], 200 + rnd() * 80, route(town(p.at), E)); break; }
      case 'defend': hp = landNear(T.x, T.y, 0.3); start(p, 'defend', hp[0], hp[1], T.under > 0 ? 150 : 55, route(town(p.at), T)); break;
      case 'flee': { const E = T.enemy != null ? town(T.enemy) : null; const a = E ? Math.atan2(T.y - E.y, T.x - E.x) + noise() * 0.8 : rnd() * 6.283; const r = 0.9 + rnd() * 0.6; hp = landNear(T.x + r * Math.cos(a), T.y + r * Math.sin(a), 0.35); start(p, 'flee', hp[0], hp[1], 220 + rnd() * 80); p.ret = false; break; }
      case 'steal': case 'give': case 'plot': hp = landNear(T.x, T.y, 0.1); start(p, act, hp[0], hp[1], act === 'plot' ? 60 : 30); break;
      case 'confront': { const o = byId[p.foe]; p.tgt = o.id; start(p, 'confront', o.x + 0.02, o.y + 0.01, 30); break; }
      case 'sabotage': { const o = p.foe != null ? byId[p.foe] : null, hh = o && o.home === T.id ? T.houses[o.h] : null; if (hh && hh.st === 0) { p.tgt = o.h; p.sub = 'house'; start(p, 'sabotage', hh.x, hh.y + 0.06, 25); } else { const fs = T.fields.filter((f) => f.st === 0); if (!fs.length) { doAct(p, 'wander', null, T); break; } const f = pick(fs); p.tgt = T.fields.indexOf(f); p.sub = 'field'; start(p, 'sabotage', f.x, f.y, 25); } break; }
      default: hp = landNear(T.x, T.y, 0.3); start(p, 'wander', hp[0], hp[1], 30);
    }
  }

  function work(p, T) {
    let job = p.job; if (T.fpc < 1.2 && job !== 'farmer' && job !== 'fisher') job = 'forager';
    if (job === 'farmer') {
      const want = Math.min(34, Math.ceil(T.adults * 0.22) + 3); const live = T.fields.filter((f) => f.st === 0);
      if (live.length < want && rnd() < 0.3) addField(T);
      const f = live.length ? pick(live) : null;
      if (f) { p.tgt = T.fields.indexOf(f); start(p, 'work', f.x + (rnd() - 0.5) * f.w * 0.8, f.y + (rnd() - 0.5) * f.h * 0.8, 110 + rnd() * 80); return; }
      job = 'forager';
    }
    if (job === 'fisher' && T.fish.length) { const s = pick(T.fish); p.tgt = -2; start(p, 'work', s[0] + noise() * 0.1, s[1] + noise() * 0.1, 110 + rnd() * 80); return; }
    if (job === 'builder') {
      const need = T.houses.some((h) => h.st === 2) || liveHouses(T) * 4.2 < T.pop || T.shrineWant != null;
      if (need && T.wood >= 3) { let site = T.houses.findIndex((h) => h.st === 2), pos; if (T.shrineWant != null) { pos = landNear(T.x, T.y, 0.75); p.tgt = -5; } else if (site >= 0) { pos = [T.houses[site].x, T.houses[site].y]; p.tgt = site; } else { pos = findHouseSpot(T); p.tgt = -4; } if (pos) { p.bx = pos[0]; p.by = pos[1]; start(p, 'work', pos[0], pos[1] + 0.05, 150 + rnd() * 60); p.sub = 'build'; return; } }
      if (T.wood < 14) { let bi = -1, bd = 9; spritesNear(T.x, T.y, 2.4, (i, s) => { if ((s[0] === 'tree' || s[0] === 'pine' || s[0] === 'palm') && !S.dead[i]) { const d = dist(s[1], s[2], T.x, T.y) + rnd() * 0.5; if (d < bd) { bd = d; bi = i; } } }); if (bi >= 0) { const s = D.sprites[bi]; p.tgt = bi; p.sub = 'cut'; start(p, 'work', s[1] + 0.03, s[2] + 0.04, 90 + rnd() * 40); return; } }
      job = 'forager';
    }
    if (job === 'healer') { const o = townmate(p, T, (o) => o.sick > 0); if (o) { p.tgt = o.id; p.sub = 'heal'; start(p, 'work', o.x + 0.02, o.y, 80); return; } }
    if (job === 'guard') { const hp = landNear(T.x, T.y, 0.7); p.sub = 'guard'; start(p, 'work', hp[0], hp[1], 100); return; }
    if (job === 'trader') { doAct(p, 'trade', null, T); return; }
    if (job === 'priest') { doAct(p, p.faith != null ? 'preach' : 'worship', null, T); return; }
    if (job === 'scholar') { doAct(p, 'study', null, T); return; }
    if (job === 'baker') { const hp = housePos(p); p.sub = 'bake'; start(p, 'work', hp[0], hp[1], 100 + rnd() * 50); return; }
    const hp = landNear(T.x, T.y, 1.3); p.sub = 'forage'; start(p, 'work', hp[0], hp[1], 100 + rnd() * 70);
  }

  function finish(p) {
    const T = town(p.home), se = season();
    switch (p.act) {
      case 'sleep': p.rest = 0; break;
      case 'rest': p.rest = 0; p.health = Math.min(1, p.health + 0.1); break;
      case 'eat': if (p.wealth >= 1) { p.wealth -= 1; p.hunger = 0; } else if (T.food >= 1) { T.food -= 1; p.hunger = 0; } else if (rnd() < 0.6) p.hunger = Math.max(0, p.hunger - 0.35); break;
      case 'play': p.lonely = 0; p.mood = Math.min(1, p.mood + 0.05); break;
      case 'work': {
        const tech = 1 + T.tech * 0.12, wx = S.weather.sky; let y = 0;
        if (p.sub === 'build') {
          if (T.wood >= 3) {
            T.wood -= 3;
            if (p.tgt === -5 && T.shrineWant != null) { T.shrines.push({ x: p.bx, y: p.by, f: T.shrineWant }); clearPlants(p.bx, p.by, 0.14, 3, Infinity); feed(2, 'Followers of ' + S.faiths[T.shrineWant].name + ' raise a shrine in ' + T.name + '.'); T.shrineWant = null; }
            else if (p.tgt >= 0 && T.houses[p.tgt] && T.houses[p.tgt].st === 2) { T.houses[p.tgt].st = 0; feed(1, T.name + ' rebuilds a ruined house.', { quotes: [q(p, TX.SAY.build)] }); }
            else if (!nearHouse(p.bx, p.by, 0.17)) { T.houses.push({ x: p.bx, y: p.by, a: 0.2 + (rnd() < 0.5 ? 1.5708 : 0) + (rnd() - 0.5) * 0.24, s: 0.85 + rnd() * 0.35, ci: Math.floor(rnd() * 4), st: 0, t: S.lifeT }); clearPlants(p.bx, p.by, 0.15, 3, Infinity); if (rnd() < 0.4) feed(1, 'A new house goes up in ' + T.name + '.', { quotes: [q(p, TX.SAY.build)] }); for (const o of S.people) if (o.alive && o.home === T.id && (o.h < 0 || !T.houses[o.h] || T.houses[o.h].st !== 0)) assignHouse(o); }
            S.dirty++;
          }
        } else if (p.sub === 'cut') { if (!S.dead[p.tgt]) { S.dead[p.tgt] = [1, S.lifeT + YEAR * (6 + rnd() * 8)]; T.wood += 2; S.dirty++; } }
        else if (p.sub === 'heal') { const o = byId[p.tgt]; if (o && o.alive && o.sick > 0) { o.sick = Math.max(0, o.sick - 2); addRel(o, p, 0.15); bump(o, 'civ', 0.03); bump(o, 'kind', 0.02); if (rnd() < 0.3) remember(o, 'Nursed through sickness by ' + first(p)); p.pride = Math.min(1, p.pride + 0.2); } }
        else if (p.sub === 'guard') { T.guarded = S.lifeT; }
        else if (p.sub === 'bake') { y = 2.2; T.cheer = (T.cheer || 0) + 0.02; }
        else if (p.sub === 'forage') { y = 2.3 * (se.name === 'Winter' ? 0.55 : 1) * (wx === 'storm' ? 0.5 : 1); }
        else if (p.tgt === -2) { y = 3.3 * (wx === 'storm' ? 0.2 : 1) * (snowAt(p.x, p.y) || se.name === 'Winter' ? 0.7 : 1); }
        else { const f = T.fields[p.tgt]; if (f && f.st === 0) { f.used++; y = 4.4 * f.fert * se.grow * (S.drought > S.lifeT ? 0.4 : 1) / (1 + f.used * 0.18); f.fert -= 0.003; } }
        { const out = y * tech, keep = Math.min(12 - p.wealth, out * (0.75 - 0.65 * p.tr.civ) * 0.5); p.wealth += Math.max(0, keep); T.food += out - Math.max(0, keep); } p.sub = null; break;
      }
      case 'social': case 'court': { const o = byId[p.tgt]; if (o && o.alive && dist(p.x, p.y, o.x, o.y) < 0.6) chat(p, o, p.act === 'court'); p.lonely = Math.max(0, p.lonely - 0.6); break; }
      case 'worship': p.spirit = 0; p.mood = Math.min(1, p.mood + 0.04); maybeFoundFaith(p, T); break;
      case 'attend': { p.lonely = 0; p.mood = Math.min(1, p.mood + 0.1); const e = S.events.find((e) => e.id === p.ev); if (e) { const I = e.idea != null ? ideaById[e.idea] : null; if (I) p.ideas[I.id] = Math.min(1, (p.ideas[I.id] || 0) + 0.5); if (e.cat === 'conflict') p.mil = Math.min(1, p.mil + 0.25); if (e.cat === 'tech') T.tech += 0.004; } const o = townmate(p, town(p.at), (o) => o.act === 'attend' && o.ev === p.ev); if (o) chat(p, o, e && e.cat === 'romance'); break; }
      case 'wander': p.mood = Math.min(1, p.mood + 0.03); break;
      case 'trade': { const O = town(p.tgt); if (O && O.alive) { p.at = O.id; addTrust(T.id, O.id, 0.35); if (O.fpc > T.fpc + 1 && O.food > 12) { O.food -= 6; p.loot = 6; } else if (T.fpc > O.fpc + 1 && T.food > 12) { T.food -= 5; O.food += 5; } const o = townmate(p, O); if (o) chat(p, o, false); if (rnd() < 0.03) feed(1, first(p) + ' of ' + T.name + ' trades in ' + O.name + '.', { quotes: [q(p, TX.SAY.trade)] }); } p.ret = true; break; }
      case 'return': p.at = p.home; if (p.loot) { T.food += p.loot; p.loot = 0; } if (p.h < 0 || !T.houses[p.h] || T.houses[p.h].st !== 0) assignHouse(p); break;
      case 'migrate': p.at = p.home; assignHouse(p); break;
      case 'preach': { for (let i = 0; i < 4; i++) { const o = townmate(p, town(p.at)); if (o && o.age >= 12) convert(p, o, 1.6); } break; }
      case 'study': { T.tech += 0.012 * (0.5 + p.tr.cur); if (rnd() < 0.02 * (0.5 + p.tr.cur)) { T.tech += 0.3; p.rep += 0.3; p.pride = 1; remember(p, 'Devised a better way to work'); fx('💡', p.x, p.y, 80); feed(2, p.name + ' of ' + T.name + ' devises a better way to work. The whole town benefits.', { quotes: [q(p, TX.SAY.invent)] }); } break; }
      case 'protest': { let n = 0; for (const o of S.people) if (o.alive && o.act === 'protest' && o.home === T.id) n++; if (n >= Math.max(4, T.adults * 0.14) && S.lifeT - T.lastOust > 2 * YEAR) oust(T, p); p.mood += 0.1; break; }
      case 'mourn': p.grief = Math.max(0, p.grief - 0.35); break;
      case 'raid': p.at = p.tgt; p.ret = true; break;
      case 'defend': break;
      case 'flee': p.ret = false; break;
      case 'steal': {
        const amt = Math.min(3, Math.floor(T.food)); if (amt < 1) break; T.food -= amt; p.wealth = Math.min(12, p.wealth + amt); p.envy *= 0.6;
        const guarded = S.lifeT - (T.guarded || -1e9) < 300; if (rnd() < 0.2 + (guarded ? 0.3 : 0)) {
          p.crimes++; p.mark = S.lifeT + 60; p.rep -= 0.3; bump(p, 'civ', -0.03); p.anger = Math.min(1, p.anger + 0.2); fx('🚨', p.x, p.y, 50); remember(p, 'Caught stealing from the granary'); const I = topIdea(p), w = townmate(p, T);
          for (const o of here[T.id] || []) if (o !== p && rnd() < 0.3) addRel(o, p, -0.08);
          if (p.crimes >= 3) exile(p, T, 'for thieving'); else feed(2, p.name + ' is caught taking grain from the ' + T.name + ' granary.' + (I ? ' All the talk of "' + I.term + '" had them afraid of going short.' : ''), { tag: 'theft', trend: I ? I.term : null, quotes: [q(p, TX.SAY2.steal)].concat(w ? [q(w, TX.SAY2.witness)] : []) });
        } break;
      }
      case 'give': { if (p.wealth < 2) break; p.wealth -= 2; T.food += 2; p.pride = Math.min(1, p.pride + 0.35); p.rep += 0.2; bump(p, 'civ', 0.01); fx('🤝', p.x, p.y, 40); for (const o of here[T.id] || []) if (o !== p && rnd() < 0.15) addRel(o, p, 0.05); if (rnd() < 0.3) { remember(p, 'Gave their own stores to feed ' + T.name); feed(2, p.name + ' carries their own stores to the granary so ' + T.name + ' can eat.', { tag: 'kindness', quotes: [q(p, TX.SAY2.give)] }); } break; }
      case 'confront': { const o = byId[p.tgt]; p.anger *= 0.5; if (!o || !o.alive || dist(p.x, p.y, o.x, o.y) > 0.6) break; addRel(p, o, -0.12); addRel(o, p, -0.15); o.anger = Math.min(1, o.anger + 0.3); o.foe = p.id; fx('💢', p.x, p.y, 40);
        if (rnd() < p.tr.temper * p.tr.bold * 0.8) brawl(p, o); else if (rnd() < 0.3) feed(2, p.name + ' confronts ' + o.name + ' in the street in ' + town(p.at).name + ' over what was said about them.', { tag: 'quarrel', quotes: [q(p, TX.SAY2.confront), { n: first(o), c: town(o.home).color, q: pick(TX.GOSSIP_REPLY[flavor(o)]), id: o.id }] }); break; }
      case 'sabotage': {
        const foe = p.foe != null ? byId[p.foe] : null; let what = null; if (p.sub === 'house' && T.houses[p.tgt] && T.houses[p.tgt].st === 0) { T.houses[p.tgt].st = 1; T.houses[p.tgt].t = S.lifeT; what = 'the home of ' + (foe ? foe.name : 'a neighbor'); } else if (T.fields[p.tgt] && T.fields[p.tgt].st === 0) { T.fields[p.tgt].st = 3; T.fields[p.tgt].t = S.lifeT; what = 'a field of ripe grain'; }
        p.sub = null; if (!what) break; S.dirty++; p.mark = S.lifeT + 300; p.anger = 0; bump(p, 'civ', -0.05); fx('🔥', p.x, p.y, 90); remember(p, 'Set a fire in ' + T.name + ' in a rage'); const w = townmate(p, T);
        feed(3, p.name + ' sets fire to ' + what + ' in ' + T.name + ', in a rage that had been building for months.', { tag: 'attack', quotes: [q(p, TX.SAY2.arson)].concat(w ? [q(w, TX.SAY2.witness)] : []) }); if (rnd() < 0.7) exile(p, T, 'for the burning'); break;
      }
      case 'plot': {
        const old = byId[T.leader]; let sup = 0, loyal = 0; for (const o of here[T.id] || []) if (o.age >= 14 && o !== p) { if (rel(o, p) > 0.3) sup++; if (old && rel(o, old) > 0.3 && o.tr.civ > 0.4) loyal++; }
        if (sup < 4) break; T.lastOust = S.lifeT;
        if (sup * (0.6 + rnd() * 0.8) > loyal * 0.6) { T.leader = p.id; p.pride = 1; p.rep += 0.5; remember(p, 'Seized control of ' + T.name); if (old) { old.anger = 1; old.foe = p.id; old.goal = 'revenge'; remember(old, 'Thrown out of office by ' + first(p)); } fx('👑', T.x, T.y - 0.2, 150); feed(3, p.name + ' seizes control of ' + T.name + ' with ' + sup + ' supporters.' + (old ? ' ' + old.name + ' is turned out.' : ''), { tag: 'coup', quotes: [q(p, TX.SAY2.coup)].concat(old ? [q(old, TX.SAY.ousted)] : []) }); }
        else { p.mark = S.lifeT + 120; fx('🚨', p.x, p.y, 60); remember(p, 'Plot to seize ' + T.name + ' exposed'); feed(3, 'A plot by ' + p.name + ' to take over ' + T.name + ' is exposed.', { tag: 'plot', quotes: [q(p, TX.SAY2.coupFail)] }); if (rnd() < 0.6) exile(p, T, 'for plotting'); else p.goal = 'craft'; }
        break;
      }
    }
  }

  // ---------- relationships, ideas, faith
  function chat(p, o, romance) {
    const a = p.tr, b = o.tr; const w = ideaW(p);
    let compat = 1 - (Math.abs(a.kind - b.kind) + Math.abs(a.soc - b.soc) + Math.abs(a.dev - b.dev) + Math.abs(a.cur - b.cur)) / 4 * 1.3;
    if (p.faith != null && p.faith === o.faith) compat += 0.15; else if (p.faith != null && o.faith != null) compat -= 0.12 * (a.dev + b.dev);
    if (p.home === o.home) compat += 0.05; else compat += trust(p.home, o.home) / 350;
    for (const k in p.ideas) if (o.ideas[k]) { compat += 0.06; break; }
    let d = (compat - 0.5) * 0.22 + (rnd() - 0.5) * 0.12 + (a.kind + b.kind - 1) * 0.04;
    const quarrel = rnd() < (a.temper + b.temper) * 0.05 + (compat < 0.35 ? 0.1 : 0) + ((w.money || 0) + (w.politics || 0) + (w.law || 0)) * 0.04;
    if (quarrel) { d = -0.16 - rnd() * 0.16; p.anger = Math.min(1, p.anger + 0.15); o.anger = Math.min(1, o.anger + 0.15); if (rel(p, o) < -0.25) { p.foe = o.id; o.foe = p.id; } }
    addRel(p, o, d); addRel(o, p, d * (0.7 + rnd() * 0.6));
    p.mood = clamp(p.mood + d * 0.5, -1, 1); o.mood = clamp(o.mood + d * 0.4, -1, 1); o.lonely = Math.max(0, o.lonely - 0.3);
    spread(p, o); spread(o, p); convert(p, o, 1); convert(o, p, 1);
    if (p.partner == null && o.partner == null && p.age >= 16 && o.age >= 16 && Math.abs(p.age - o.age) < 16 && !kin(p, o) && match(p, o)) {
      const m = Math.min(rel(p, o), rel(o, p));
      if (m > 0.3 && rnd() < 0.6 + (w.romance || 0) * 0.3) marry(p, o); else if (romance && !quarrel) { addRel(p, o, 0.07); addRel(o, p, 0.06); }
    }
    if (quarrel && rel(p, o) < -0.5 && rnd() < a.temper * a.bold * 0.55) brawl(p, o);
    if (p.partner === o.id && Math.min(rel(p, o), rel(o, p)) < -0.25) { p.partner = null; o.partner = null; if (rnd() < 0.4) feed(1, first(p) + ' and ' + first(o) + ' of ' + town(p.home).name + ' part ways.', { quotes: [q(p, TX.SAY.breakup)] }); }
  }
  function spread(p, o) { for (const id in p.ideas) { const I = ideaById[id]; if (!I || o.ideas[id]) continue; if (rnd() < I.s * p.ideas[id] * (0.25 + (o.int[I.cat] || 0) * 0.7)) o.ideas[id] = 0.5 + rnd() * 0.5; } if (p.mil > 0.4 && rnd() < 0.2) o.mil = Math.min(1, o.mil + 0.08 * o.tr.bold); }
  function convert(p, o, k) {
    if (p.faith == null || o.faith === p.faith || !S.faiths[p.faith]) return;
    const pr = 0.05 * k * (0.3 + o.tr.dev) * (0.6 + Math.max(0, rel(o, p))) * (o.faith == null ? 1 : 0.22) * (0.5 + p.tr.soc);
    if (rnd() < pr) { fx('🙏', o.x, o.y, 25); remember(o, 'Took up ' + S.faiths[p.faith].name); const was = o.faith; o.faith = p.faith; S.faiths[p.faith].n++; if (was != null && S.faiths[was]) S.faiths[was].n--; p.rep += 0.05; if (rnd() < 0.06) feed(1, first(o) + ' of ' + town(o.home).name + ' takes up ' + S.faiths[p.faith].name + '.', { quotes: [q(o, TX.SAY.convert)] }); }
  }
  function marry(p, o) {
    p.partner = o.id; o.partner = p.id; addRel(p, o, 0.3); addRel(o, p, 0.3); remember(p, 'Married ' + first(o)); remember(o, 'Married ' + first(p)); bump(p, 'soc', 0.02); bump(o, 'soc', 0.02); fx('💕', p.x, p.y, 40);
    if (o.home !== p.home) { const mover = rnd() < 0.5 ? p : o, stay = mover === p ? o : p; mover.home = stay.home; mover.h = stay.h; mover.job = pickJob(town(stay.home)); addTrust(p.home, o.home, 3); }
    else { const occ = (x) => S.people.reduce((n, y) => n + (y.alive && y.home === x.home && y.h === x.h ? 1 : 0), 0); if (occ(p) <= occ(o)) o.h = p.h; else p.h = o.h; }
    const T = town(p.home);
    if (rnd() < 0.3 + (p.tr.soc + o.tr.soc) * 0.2 && !isNight()) { mkEvent('Wedding', 'romance', T, 200, null, 0.55); feed(2, p.name + ' and ' + o.name + ' are wed in ' + T.name + '.', { quotes: [q(pick([p, o]), TX.SAY.wedding)] }); }
  }
  function brawl(p, o) {
    const pp = p.tr.bold + p.health + rnd(), po = o.tr.bold + o.health + rnd(); const lose = pp > po ? o : p, win = lose === p ? o : p;
    const T = town(lose.at != null ? lose.at : lose.home); const guarded = S.lifeT - (T.guarded || -1e9) < 300;
    lose.health -= (0.25 + rnd() * 0.35) * (guarded ? 0.5 : 1); const why = topIdea(win) || topIdea(lose); win.mark = S.lifeT + 90; fx('💥', lose.x, lose.y, 40);
    if (lose.health > 0 && rnd() < 0.5) feed(2, win.name + ' and ' + lose.name + ' come to blows in ' + T.name + (why ? ' after an argument about "' + why.term + '"' : ' over an old grudge') + '. ' + first(lose) + ' limps home.', { tag: 'fight', trend: why ? why.term : null, quotes: [q(win, ['They started it.', 'I am not sorry.', 'Ask them what they said first.']), q(lose, ['This is not over.', 'I said what I said.', 'My jaw hurts.'])] });
    if (lose.health <= 0) {
      die(lose, 'killed'); win.rep -= 0.5;
      for (const k of S.people) if (k.alive && (kin(k, lose) || k.partner === lose.id || rel(k, lose) > 0.5)) { k.rel[win.id] = -1; k.mil = Math.min(1, k.mil + 0.3); k.anger = 1; k.foe = win.id; if (k.tr.bold > 0.5 && k.age >= 14) { k.goal = 'revenge'; remember(k, 'Swore revenge on ' + first(win) + ' for the killing of ' + first(lose)); } }
      fx('☠️', lose.x, lose.y, 90); remember(win, 'Killed ' + first(lose) + ' in a quarrel');
      if (win.home !== lose.home) addTrust(win.home, lose.home, -16);
      const wit = townmate(win, T) || win;
      win.mark = S.lifeT + 300; feed(3, win.name + ' kills ' + lose.name + ' in ' + T.name + (why ? ' after a quarrel about "' + why.term + '" got out of hand.' : ' in a quarrel over an old grudge.'), { tag: 'attack', trend: why ? why.term : null, quotes: [q(wit, TX.SAY.murder)] });
      if (rnd() < 0.6) { const others = S.towns.filter((x) => x.alive && x.id !== win.home); if (others.length) { const N = pick(others); win.migrate = N.id; win.partner != null && byId[win.partner] && (byId[win.partner].partner = null); win.partner = null; feed(2, town(win.home).name + ' casts out ' + first(win) + '. They take the road to ' + N.name + '.', { quotes: [q(win, TX.SAY.exile)] }); } }
    }
  }
  function maybeFoundFaith(p, T) {
    const live = S.faiths.filter((f) => f && f.n > 0).length; const t = p.tr; if (live >= 5 || p.age < 20) return;
    const I = topIdea(p); const schism = p.faith != null;
    const pr = schism ? (t.dev > 0.75 && t.amb > 0.72 ? 0.003 : 0) : (t.dev > 0.7 && t.amb > 0.55 ? 0.008 : 0);
    if (rnd() >= pr * (I ? 1.6 : 1)) return;
    const cat = I ? I.cat : pick(CATS); let name = TX.FAITH_NAME[cat] || 'The New Way'; if (S.faiths.some((f) => f && f.name === name)) name = pick(['The Reformed ', 'The True ', 'The Later ']) + name.replace('The ', '');
    if (S.faiths.some((f) => f && f.name === name)) return;
    const f = { id: S.faiths.length, name, cat, founder: p.id, founderName: p.name, town: T.id, n: 1, born: S.lifeT, from: I ? I.term : null }; S.faiths.push(f);
    const old = p.faith; if (old != null && S.faiths[old]) S.faiths[old].n--; p.faith = f.id; p.rep += 0.6; p.goal = 'faith'; p.pride = 1; remember(p, 'Founded ' + name); fx('✨', p.x, p.y, 150); if (p.job !== 'priest') p.job = 'priest';
    for (const o of S.people) if (o.alive && o !== p && rel(o, p) > 0.35 && rnd() < 0.6) { if (o.faith != null && S.faiths[o.faith]) S.faiths[o.faith].n--; o.faith = f.id; f.n++; }
    feed(3, (schism ? p.name + ' breaks with ' + S.faiths[old].name + ' and founds ' : p.name + ' of ' + T.name + ' founds a new faith, ') + name + ', teaching ' + TX.FAITH_TENET[cat] + '.', { trend: I ? I.term : null, quotes: [q(p, schism ? TX.SAY.schism : TX.SAY.faithNew)] });
  }

  // ---------- birth and death
  function birth(m) {
    const f = byId[m.partner], T = town(m.home); const b = mkPerson(T, 0, rnd() < 0.5 ? 'f' : 'm', (f && f.fam) || m.fam, [m.id, f ? f.id : -1]);
    b.h = m.h; b.x = m.x; b.y = m.y; b.faith = m.faith != null && rnd() < 0.7 ? m.faith : f && f.faith != null && rnd() < 0.5 ? f.faith : null; if (b.faith != null && S.faiths[b.faith]) S.faiths[b.faith].n++;
    m.kids++; if (f) f.kids++; b.rel[m.id] = 0.8; m.rel[b.id] = 0.9; if (f) { b.rel[f.id] = 0.7; f.rel[b.id] = 0.9; }
    T.born++; S.stats.births++; fx('👶', m.x, m.y, 30); remember(m, 'Gave birth to ' + first(b)); bump(m, 'kind', 0.02); bump(m, 'civ', 0.02); if (f) { remember(f, 'Became father to ' + first(b)); bump(f, 'civ', 0.02); }
    if (rnd() < 0.08) feed(1, 'A child, ' + first(b) + ', is born to ' + first(m) + ' in ' + T.name + '.', { quotes: [q(m, TX.SAY.birth)] });
  }
  function die(p, cause) {
    if (!p.alive) return; p.alive = false; const T = town(p.home); T.died++; S.stats.deaths++; S.stats[cause] = (S.stats[cause] || 0) + 1;
    if (p.partner != null && byId[p.partner]) { const w = byId[p.partner]; w.partner = null; w.grief = 0.8; remember(w, 'Lost ' + first(p) + (cause === 'war' ? ' to the war' : cause === 'sick' ? ' to the sickness' : cause === 'hunger' ? ' to hunger' : '')); if (rnd() < 0.5) { bump(w, 'dev', 0.1); if (w.tr.dev > 0.7) w.goal = 'faith'; } else bump(w, 'dev', -0.1); if (cause === 'war' && w.tr.kind > 0.5) w.goal = 'peace'; }
    fx('🪦', p.x, p.y, 25);
    if (p.faith != null && S.faiths[p.faith]) S.faiths[p.faith].n--;
    for (const o of S.people) if (o.alive && (kin(o, p) || rel(o, p) > 0.5)) o.grief = Math.min(1, o.grief + 0.5);
    if (T.graves.length < 70) { T.graves.push([T.x + 0.72 + (T.graves.length % 7) * 0.045 + noise() * 0.008, T.y - 0.26 + Math.floor(T.graves.length / 7) * 0.05]); S.dirty++; }
    const W = warOf(T); if (W && (cause === 'war')) { if (W.a === T.id) W.ka++; else W.kb++; }
    const lead = T.leader === p.id; const founder = S.faiths.some((f) => f && f.founder === p.id && f.n > 0);
    if (lead || founder || (cause === 'age' && p.age > 88)) { if (!isNight()) mkEvent('Funeral', 'death', T, 200, null, 0.5); const m = townmate(p, T); feed(2, p.name + ', ' + (lead ? 'leader of ' + T.name : founder ? 'founder of a faith' : 'eldest of ' + T.name) + ', dies' + (cause === 'age' ? ' at ' + Math.floor(p.age) : cause === 'war' ? ' in battle' : cause === 'sick' ? ' of the sickness' : '') + '.', { quotes: m ? [q(m, TX.SAY.funeral)] : [] }); }
    if (lead) { T.leader = null; elect(T); }
  }

  // ---------- events
  function mkEvent(label, cat, T, dur, trend, pull, idea) {
    let x = T.x + noise() * 0.04, y = T.y + noise() * 0.04;
    if (label === 'Sky watch') { const lp = landNear(T.x + (rnd() < 0.5 ? -1 : 1) * 0.9, T.y - 0.6, 0.3); x = lp[0]; y = lp[1]; }
    const e = { id: S.nextId++, label, cat, x, y, town: T.id, until: S.lifeT + dur, trend, pull: pull == null ? 0.5 : pull, idea: idea == null ? null : idea };
    S.events.push(e); return e;
  }

  // ---------- trends
  function addIdea(term, cat, s) {
    let I = S.ideas.find((i) => i.term === term);
    if (I) I.s = Math.max(I.s, s); else { I = { id: S.nextId++, term, cat, s, born: S.lifeT }; S.ideas.push(I); ideaById[I.id] = I; }
    return I;
  }
  function seed(I, n, T) { const out = []; for (let i = 0; i < n * 6 && out.length < n; i++) { const p = pick(S.people); if (!p.alive || p.age < 12 || (T && p.home !== T.id)) continue; if (rnd() < 0.3 + (p.int[I.cat] || 0)) { p.ideas[I.id] = 1; out.push(p); } } return out; }
  function pull() {
    let list = Sim.trendSource ? Sim.trendSource() : null; const isLive = !!(list && list.length); if (!isLive) { const P = TX.TREND_POOL; list = []; for (let i = 0; i < 10; i++) list.push(P[(S.trendIdx + i) % P.length]); S.trendIdx = (S.trendIdx + 4) % P.length; }
    let skipped = 0; const keep = [];
    for (const t of list) { const cat = t.cat || TX.classify(t.term, t.news); if (cat === 'sports') { skipped++; continue; } keep.push({ term: t.term, cat, vol: t.vol || 20000 }); }
    S.lastPull = { t: S.time, n: keep.length, skipped, live: isLive, terms: keep.map((k) => k.term) };
    keep.sort((a, b) => b.vol - a.vol);
    const fresh = keep.filter((k) => !(S.reacted[k.term] > S.lifeT - 3600)); const stage = (fresh.length ? fresh : keep).slice(0, 2);
    const live = S.towns.filter((T) => T.alive && T.pop > 3);
    for (const k of keep) {
      const s = clamp(0.35 + Math.log10(k.vol / 10000) * 0.22, 0.3, 1); const I = addIdea(k.term, k.cat, s); seed(I, 3 + Math.round(s * 5));
      if (stage.indexOf(k) >= 0 && live.length) {
        S.reacted[k.term] = S.lifeT; let T = live[0], r = rnd() * live.reduce((n, t) => n + t.pop, 0); for (const t of live) { r -= t.pop; if (r <= 0) { T = t; break; } }
        const R = TX.REACT[k.cat] || TX.REACT.person; const who = seed(I, 5, T);
        if (!isNight() || k.cat === 'nature') mkEvent(R.ev, k.cat, T, 420, k.term, 0.75, I.id);
        if (k.cat === 'conflict') for (const o of who) o.mil = Math.min(1, o.mil + 0.4);
        let heard = 0; for (const p of S.people) if (p.ideas[I.id]) heard++;
        feed(2, pick(R.texts).replace('{town}', T.name) + (who[0] ? ' ' + fill(pick(TX.STARTERS), { a: who[0].name, job: jobName(who[0]) }) : '') + ' ' + heard + ' people across the land have heard so far.', { trend: k.term, quotes: who.slice(0, 2).map((p) => tq(p, k.cat)) });
      }
    }
  }

  // ---------- war
  const warOf = (T) => S.wars.find((w) => w.a === T.id || w.b === T.id) || null;
  function declareWar(A, B, why) {
    let gv = (A.griev || {})[B.id] || (B.griev || {})[A.id]; if (!gv) { const ti = townIdea(A) || townIdea(B); if (ti) gv = { term: ti.term, cat: ti.cat }; }
    const causeText = gv && TX.WAR_CAUSE[gv.cat] ? fill(TX.WAR_CAUSE[gv.cat], { A: A.name, B: B.name, t: gv.term }) : 'The cause: ' + (why ? why.replace(/^(over|for|after) /, '') : 'old grudges') + '.';
    fx('⚔️', A.x, A.y - 0.25, 150); fx('⚔️', B.x, B.y - 0.25, 150);
    S.wars.push({ a: A.id, b: B.id, start: S.lifeT, ka: 0, kb: 0, burned: 0, cause: gv ? gv.term : null, causeText, lastFeed: -1e9 }); A.enemy = B.id; B.enemy = A.id; A.trust[B.id] = B.trust[A.id] = -100;
    const la = byId[A.leader], dove = S.people.find((p) => p.alive && p.home === A.id && p.age > 16 && p.tr.kind > 0.75);
    const qs = []; if (la) qs.push(q(la, TX.SAY.warFor)); if (dove) qs.push(q(dove, TX.SAY.warAgainst));
    feed(3, 'WAR. ' + A.name + ' takes up arms against ' + B.name + '. ' + causeText, { quotes: qs, trend: gv ? gv.term : null, tag: 'war' });
  }
  function endWar(W, why) {
    const A = town(W.a), B = town(W.b); S.wars.splice(S.wars.indexOf(W), 1); A.enemy = B.enemy = null; A.truce = B.truce = S.lifeT + 24 * YEAR; A.trust[B.id] = B.trust[A.id] = -15;
    for (const p of S.people) if (p.home === A.id || p.home === B.id) { p.soldier = false; p.mil *= 0.4; }
    fx('🕊️', A.x, A.y - 0.25, 150); fx('🕊️', B.x, B.y - 0.25, 150);
    const loser = W.ka > W.kb ? A : B, winner = loser === A ? B : A; const tribute = Math.floor(loser.food * 0.3); loser.food -= tribute; winner.food += tribute;
    const sp = S.people.find((p) => p.alive && (p.home === A.id || p.home === B.id) && p.age > 16);
    feed(3, 'Peace between ' + A.name + ' and ' + B.name + ' ' + why + '. ' + (W.ka + W.kb) + ' dead, ' + W.burned + ' homes burned.' + (tribute > 5 ? ' ' + loser.name + ' pays tribute.' : ''), { quotes: sp ? [q(sp, TX.SAY.peace)] : [] });
  }
  function combat(p) {
    const T = town(p.at); if (!T) return; const here = p.act === 'raid' ? town(p.tgt) : town(p.home); if (!here) return;
    let foe = null; for (let i = 0; i < 12 && !foe; i++) { const o = pick(S.people); if (o.alive && o.arr && dist(o.x, o.y, p.x, p.y) < 0.45 && ((p.act === 'raid' && o.home === here.id && (o.act === 'defend' || (o.act !== 'flee' && rnd() < 0.06))) || (p.act === 'defend' && o.act === 'raid' && o.home !== p.home))) foe = o; }
    if (foe) {
      const a = p.tr.bold + p.health + rnd() * 1.4 + (p.act === 'defend' ? 0.25 : 0), b = foe.tr.bold + foe.health + rnd() * 1.4; const lose = a > b ? foe : p;
      const Wc = warOf(town(p.home)); const win = lose === p ? foe : p;
      if (win.alive) { bump(win, 'bold', 0.04); bump(win, 'kind', -0.03); if (rnd() < 0.4) remember(win, 'Fought at ' + here.name); if (win.tr.kind > 0.7 && rnd() < 0.3) { win.goal = 'peace'; remember(win, 'Sickened by the fighting, swore off war'); } }
      if (rnd() < 0.42) { die(lose, 'war'); if (Wc && S.lifeT - Wc.lastFeed > 90) { Wc.lastFeed = S.lifeT; feed(2, lose.name + ' of ' + town(lose.home).name + ' is cut down by ' + win.name + ' of ' + town(win.home).name + ' in the fighting at ' + here.name + '.', { tag: 'attack', trend: Wc.cause, quotes: [q(win, TX.SAY.warFor)] }); } } else { lose.health -= 0.35; if (lose.health <= 0) die(lose, 'war'); else { lose.until = S.lifeT; } }
      S.flash.push([p.x, p.y, S.lifeT]); if (S.flash.length > 20) S.flash.shift(); return;
    }
    if (p.act !== 'raid') return; const r = rnd(), W = warOf(here);
    if (r < 0.06) { const hs = here.houses.filter((h) => h.st === 0); if (hs.length) { const h = pick(hs); h.st = 1; h.t = S.lifeT; if (W) W.burned++; S.dirty++; if (W && S.lifeT - W.lastFeed > 90) { W.lastFeed = S.lifeT; const hi = here.houses.indexOf(h), own = S.people.find((o) => o.alive && o.home === here.id && o.h === hi); feed(2, p.name + ' of ' + town(p.home).name + ' sets fire to ' + (own ? 'the ' + own.fam + ' family home' : 'an empty house') + ' in ' + here.name + '.', { tag: 'attack', trend: W.cause, quotes: own ? [q(own, TX.SAY.flee)] : [] }); } } }
    else if (r < 0.14) { const fs = here.fields.filter((f) => f.st === 0); if (fs.length) { const f = pick(fs); f.st = 3; f.t = S.lifeT; S.dirty++; } }
    else if (r < 0.5) { const n = Math.min(4, here.food); here.food -= n; p.loot += n; }
    else if (r < 0.53 && here.shrines.length) { here.shrines.pop(); S.dirty++; feed(2, 'Raiders desecrate a shrine in ' + here.name + '.'); }
  }
  function warMonthly() {
    for (const W of S.wars.slice()) {
      const A = town(W.a), B = town(W.b); const sol = (T) => S.people.reduce((n, p) => n + (p.alive && p.home === T.id && p.soldier ? 1 : 0), 0);
      const dur = S.lifeT - W.start;
      if (!A.alive || !B.alive || A.pop < 3 || B.pop < 3) endWar(W, 'comes when one side can no longer fight');
      else if (dur > 16 * MONTH && (sol(A) < 2 || sol(B) < 2)) endWar(W, 'is agreed; too few are willing to fight on');
      else if (dur > 36 * MONTH || W.ka + W.kb > (A.adults + B.adults) * 0.18) endWar(W, 'is made at last');
    }
  }

  // ---------- leadership, founding towns
  function oust(T, by) {
    const old = byId[T.leader]; let best = by, bs = -1; for (const p of S.people) if (p.alive && p.act === 'protest' && p.home === T.id) { const s = p.tr.amb + p.tr.soc + rnd() * 0.4; if (s > bs) { bs = s; best = p; } }
    T.leader = best.id; T.lastOust = S.lifeT; best.rep += 0.5; remember(best, 'Put in charge of ' + T.name + ' by the crowd'); if (old) remember(old, 'Forced out of office'); for (const p of S.people) if (p.alive && p.home === T.id) p.mood = Math.min(1, p.mood + 0.25);
    feed(3, 'Protesters in ' + T.name + ' force out ' + (old ? old.name : 'their leader') + '. ' + best.name + ' takes charge.', { quotes: [q(best, TX.SAY.protest)].concat(old && old.alive ? [q(old, TX.SAY.ousted)] : []) });
  }
  function foundTown(T) {
    if (S.towns.filter((x) => x.alive).length >= 8 || S.lifeT < S.nextFound || T.pop < 36) return; S.nextFound = S.lifeT + 3 * YEAR;
    let lead = null, bs = 0; for (const p of S.people) if (p.alive && p.home === T.id && p.age >= 18 && p.age < 55 && p.id !== T.leader) { const s = p.tr.amb * 0.5 + p.tr.bold * 0.3 + p.tr.cur * 0.3 + rnd() * 0.3; if (s > bs) { bs = s; lead = p; } }
    if (!lead || bs < 0.75) return;
    let spot = null; for (let i = 0; i < 300 && !spot; i++) { const a = rnd() * 6.283, r = 1.5 + rnd() * 3.2, x = T.x + r * Math.cos(a), y = T.y + r * Math.sin(a); if (!inWorld(x, y) || x < 0.6 || y < 0.5 || x > WU - 0.6 || y > HU - 0.5) continue; const b = biome(x, y); if (b === 5 || b === 3 || nearWater(x, y, 0.2)) continue; if (S.towns.some((o) => o.alive && dist(x, y, o.x, o.y) < 1.5)) continue; let fert = 0; for (let k = 0; k < 8; k++) fert += fertAt(x + 0.6 * Math.cos(k * 0.785), y + 0.6 * Math.sin(k * 0.785)); if (fert < 2.5 && !nearWater(x, y, 1.0)) continue; spot = [x, y]; }
    if (!spot) return;
    let name; do { name = pick(TX.TOWN_A) + pick(TX.TOWN_B); } while (S.towns.some((o) => o.name === name));
    const b = biome(spot[0], spot[1]); const style = b === 4 ? 'cabin' : b === 2 ? 'adobe' : b === 1 && tBase(spot[0], spot[1]) > 0.56 ? 'hut' : rnd() < 0.5 ? 'tile' : 'cabin';
    const colors = ['#f28fb5', '#c9a0ff', '#e6e36a', '#ff7a7a', '#9ad0a0', '#ffffff']; const N = mkTown('other', name, colors[(S.towns.length - 5) % colors.length], spot[0], spot[1], style);
    N.parent = T.id; N.road = []; for (let i = 0; i <= 10; i++) { const u = i / 10, x = T.x + (spot[0] - T.x) * u + Math.sin(u * 3.14) * 0.15, y = T.y + (spot[1] - T.y) * u; N.road.push([x, y, isLand(x, y) ? 0 : 1]); }
    N.food = Math.floor(T.food * 0.15); T.food -= N.food; N.wood = 12; N.leader = lead.id; clearPlants(spot[0], spot[1], 0.2, 3, Infinity);
    for (const o of S.towns) if (o !== N) { N.trust[o.id] = o.id === T.id ? 35 : trust(T.id, o.id) * 0.5; o.trust[N.id] = N.trust[o.id]; }
    const go = [lead]; if (lead.partner != null && byId[lead.partner]) go.push(byId[lead.partner]);
    for (const p of S.people) { if (go.length >= 18) break; if (!p.alive || p.home !== T.id || p.age < 16 || go.indexOf(p) >= 0 || p.id === T.leader) continue; const s = rel(p, lead) * 0.8 + p.tr.cur * 0.4 + p.tr.bold * 0.3 - p.age / 120 - p.kids * 0.08 + (T.crowd > 2 ? 0.25 : 0) + noise() * 0.25; if (s > 0.5) { go.push(p); if (p.partner != null && byId[p.partner] && go.indexOf(byId[p.partner]) < 0) go.push(byId[p.partner]); } }
    if (go.length < 8) { N.alive = false; N.houses = []; return; }
    for (const p of S.people) if (p.alive && p.age < 14 && p.par && go.some((g) => g.id === p.par[0] || g.id === p.par[1])) go.push(p);
    for (const p of go) { p.migrate = N.id; if (p.age >= 14 && rnd() < 0.5) p.job = pickJob(N); }
    go[1 % go.length].job = 'builder'; if (go[2]) go[2].job = 'builder';
    S.dirty++; fx('🚩', spot[0], spot[1] - 0.15, 240); for (const p of go) remember(p, 'Left ' + T.name + ' to found ' + name);
    feed(3, lead.name + ' leads ' + go.length + ' people out of ' + T.name + ' to found a new town, ' + name + '.', { quotes: [q(lead, TX.SAY.found)].concat(go[3] ? [q(go[3], TX.SAY.join)] : []) });
  }

  // ---------- disasters
  function wildfire(x, y, r, T) {
    fx('🔥', x, y, 120); clearPlants(x, y, r, 2, S.lifeT + YEAR * (10 + rnd() * 12)); S.decals.push({ k: 'scorch', x, y, r, t: S.lifeT }); let burned = 0;
    for (const o of S.towns) { for (const h of o.houses) if (h.st === 0 && dist(h.x, h.y, x, y) < r) { h.st = 1; h.t = S.lifeT; burned++; } for (const f of o.fields) if (f.st === 0 && dist(f.x, f.y, x, y) < r) { f.st = 3; f.t = S.lifeT; } }
    let dead = 0; for (const p of S.people) if (p.alive && dist(p.x, p.y, x, y) < r * 0.8 && rnd() < 0.06) { die(p, 'fire'); dead++; }
    const w = T ? townmate(S.people[0], T) : null;
    feed(3, 'Wildfire' + (T ? ' near ' + T.name : ' in the wilds') + '. Woodland burns' + (burned ? ', ' + burned + (burned === 1 ? ' home is' : ' homes are') + ' lost' : '') + (dead ? ' and ' + dead + ' people die' : '') + '.', { quotes: w ? [q(w, TX.SAY.fire)] : [] });
  }
  function disasters() {
    const se = season().name, sky = S.weather.sky, live = S.towns.filter((T) => T.alive && T.pop > 0); if (!live.length) return;
    const T = pick(live), w = townmate(S.people[0], T), Q = (k) => (w ? [q(w, TX.SAY[k])] : []); const r = rnd();
    if (sky === 'storm' && r < 0.02 && nearWater(T.x, T.y, 0.7)) { let n = 1, d = 0; const h0 = T.houses.find((h) => h.st === 0); if (h0) h0.st = 2; for (const h of T.houses) if (h.st === 0 && rnd() < 0.1) { h.st = 2; n++; } for (const p of S.people) if (p.alive && p.home === T.id && p.job === 'fisher' && rnd() < 0.05) { die(p, 'storm'); d++; } S.dirty++; fx('🌊', T.x, T.y - 0.2, 120); feed(3, 'A storm batters ' + T.name + '. ' + n + (n === 1 ? ' home is' : ' homes are') + ' wrecked' + (d ? ' and ' + d + ' fishers are lost at sea' : '') + '.', { quotes: Q('storm') }); }
    else if ((sky === 'rain' || sky === 'storm') && r < 0.007) { let n = 0; for (const f of T.fields) if (n < 3 && f.st === 0 && nearWater(f.x, f.y, 0.3)) { f.st = 2; f.t = S.lifeT; f.fert = 0.1; n++; } if (n) { S.dirty++; T.food *= 0.8; fx('🌊', T.x, T.y - 0.2, 120); feed(3, 'The river floods near ' + T.name + '. ' + n + (n === 1 ? ' field is' : ' fields are') + ' washed out.', { quotes: Q('flood') }); } }
    else if ((se === 'Summer' || se === 'Autumn') && (S.weather.dry || 0) >= 2 && r < 0.007) { let c = null; spritesNear(T.x, T.y, 2.2, (i, s) => { if (s[0] === 'tree' && !S.dead[i] && rnd() < 0.02) c = s; }); if (c) wildfire(c[1], c[2], 0.35 + rnd() * 0.3, T); }
    else if (se === 'Winter' && sky === 'snow' && r < 0.04) { let d = 0; for (const p of S.people) if (p.alive && p.home === T.id && (p.age > 60 || p.age < 3) && rnd() < (T.wood < 4 ? 0.2 : 0.05)) { die(p, 'cold'); d++; } T.wood = Math.max(0, T.wood - 4); fx('❄️', T.x, T.y - 0.2, 150); feed(d ? 3 : 2, 'A blizzard buries ' + T.name + '.' + (d ? ' ' + d + ' do not survive the cold.' : ' Everyone huddles indoors.'), { quotes: Q('blizzard') }); }
    else if (se === 'Summer' && (S.weather.dry || 0) >= 3 && r < 0.03 && S.drought < S.lifeT) { S.drought = S.lifeT + 10 * MONTH; for (const o of live) for (const f of o.fields) f.fert -= 0.08; for (const o of live) fx('🥵', o.x, o.y - 0.2, 150); feed(3, 'Drought. Crops wither across the land and the soil begins to blow away.', { quotes: Q('drought') }); }
    else if (r < 0.004) { let n = 0; for (let i = 0; i < 30 && n < 3; i++) { const p = pick(S.people); if (p.alive && p.home === T.id && !p.sick && p.immune < S.lifeT) { p.sick = 4 + Math.floor(rnd() * 3); n++; } } if (n) feed(3, 'A sickness breaks out in ' + T.name + '.', { quotes: Q('plague') }); }
    else if (r > 0.985 && biome(T.x, T.y - 0.8) === 3 || (r > 0.992 && T.fields.length)) { const f = T.fields.find((f) => f.st === 0); if (f) { f.st = 2; f.t = S.lifeT; f.fert = 0.05; S.decals.push({ k: 'slide', x: f.x, y: f.y, r: 0.22, t: S.lifeT }); S.dirty++; fx('🪨', f.x, f.y, 120); feed(2, 'A landslide buries a field near ' + T.name + '.', { quotes: Q('landslide') }); } }
    else if (se === 'Autumn' && r > 0.95 && T.fpc > 3 && !isNight()) { mkEvent('Harvest feast', 'food', T, 300, null, 0.7); feed(2, T.name + ' brings in a fine harvest and throws a feast.', { quotes: Q('harvest') }); }
  }

  // ---------- gossip and grudges, both grown from the trending searches
  const fill = (str, m) => str.replace(/\{(\w+)\}/g, (x, k) => (m[k] != null ? m[k] : x));
  function townIdea(T) { const w = {}; for (const p of here[T.id] || []) for (const id in p.ideas) { const I = ideaById[id]; if (I) w[id] = (w[id] || 0) + p.ideas[id] * I.s; } let b = null, bs = 0.8; for (const id in w) if (w[id] > bs) { bs = w[id]; b = ideaById[id]; } return b; }
  function gossip() {
    for (let i = 0; i < 30; i++) {
      const A = pick(S.people); if (!A.alive || A.age < 15) continue; const I = topIdea(A), G = I && TX.GOSSIP[I.cat]; if (!G) continue;
      const g = pick(G), T = town(A.at != null ? A.at : A.home); let B = null;
      for (let k = 0; k < 12 && !B; k++) { const o = townmate(A, T, (o) => o.age >= 15); if (o && (g[0] < 0 ? rel(A, o) < 0.25 : rel(A, o) > -0.1)) B = o; }
      if (!B) continue;
      addRel(B, A, g[0] * 0.12); addRel(A, B, g[0] * 0.06); if (g[0] < 0) { B.anger = Math.min(1, B.anger + 0.3); B.foe = A.id; } else B.pride = Math.min(1, B.pride + 0.2); fx('🗣️', A.x, A.y, 45); B.ideas[I.id] = Math.max(B.ideas[I.id] || 0, 0.6); B.mood = clamp(B.mood + g[0] * 0.08, -1, 1);
      const reply = { n: first(B), c: town(B.home).color, q: pick(TX.GOSSIP_REPLY[flavor(B)]), id: B.id };
      feed(2, fill(g[1], { A: first(A), B: first(B), t: I.term, town: T.name }), { trend: I.term, tag: 'gossip in ' + T.name, quotes: [q(A, ['You did not hear it from me.', 'I am only saying what I saw.', 'Everyone knows it already.', 'I would never spread tales. But.', 'Ask anyone on our lane.']), reply] });
      return;
    }
  }

  // ---------- periodic updates
  function personMonth(p) {
    const T = town(p.home); const a = p.age;
    let hz = 0.0005 + (a > 50 ? Math.exp((a - 80) / 8) * 0.013 : 0) + (a < 3 ? 0.0015 : 0); if (rnd() < hz) return die(p, 'age');
    if (p.hunger > 0.97) { p.health -= 0.05; if (p.health <= 0) return die(p, 'hunger'); } else if (!p.sick) p.health = Math.min(1, p.health + 0.04);
    if (p.sick > 0) {
      p.sick--; const healers = S.lifeT - (T.guarded || 0) < 0 ? 0 : 0; if (rnd() < 0.055 * (1 - Math.min(0.5, T.tech * 0.08))) return die(p, 'sick');
      for (let i = 0; i < 2; i++) { const o = townmate(p, town(p.at)); if (o && !o.sick && o.immune < S.lifeT && rnd() < 0.16) o.sick = 4 + Math.floor(rnd() * 3); }
      if (p.sick === 0) p.immune = S.lifeT + 6 * YEAR;
    }
    if (p.sex === 'f' && a >= 17 && a <= 45 && p.partner != null && p.kids < 5) { const f = byId[p.partner]; if (f && f.alive && f.sex === 'm' && f.home === p.home && T.fpc > 2.2 && T.pop < liveHouses(T) * 5.5 + 3 && rnd() < 0.05 * (1 - S.people.length / 460)) birth(p); }
    if (a >= 14 && p.job === 'none') { p.job = pickJob(T); }
    p.grief = Math.max(0, p.grief - 0.04); p.mil = Math.max(0, p.mil - 0.03);
    p.anger *= 0.9; p.envy *= 0.9; p.pride *= 0.92; p.fear = clamp(p.fear * 0.75 + (T.enemy != null ? 0.12 : 0) + (T.under > 0 ? 0.4 : 0) + (p.sick ? 0.1 : 0), 0, 1); if (p.mark && p.mark < S.lifeT) p.mark = 0;
    if (a >= 14) {
      if (!p.goal) p.goal = pickGoal(p);
      if (p.wealth < (T.avgW || 0) * 0.5) p.envy = Math.min(1, p.envy + 0.09 * (1.2 - p.tr.kind)); p.wealth = Math.max(0, p.wealth - 0.05);
      const L = byId[T.leader]; if (L && L !== p) addRel(p, L, (T.fpc > 3 ? 0.015 : T.fpc < 1.5 ? -0.04 : 0) + (L.tr.kind - 0.5) * 0.02 + (L.tr.civ - 0.5) * 0.02 - (T.enemy != null ? 0.012 : 0));
      if (a > 50) { bump(p, 'bold', -0.0015); bump(p, 'dev', 0.001); bump(p, 'temper', -0.001); } else if (a < 25) bump(p, 'whim', -0.0008);
      if (p.hunger > 0.97 && p.health < 0.9 && rnd() < 0.5) { remember(p, 'Went hungry in the lean months'); bump(p, 'amb', 0.03); bump(p, 'civ', p.tr.kind > 0.5 ? 0.02 : -0.04); }
      if (p.goal === 'family' && p.kids >= 3 && rnd() < 0.02) { p.pride = 1; p.goal = 'peace'; } else if (p.goal === 'wander' && rnd() < 0.004 && T.enemy == null && p.partner == null) { const others = S.towns.filter((x) => x.alive && x.id !== p.home && x.pop > 3); if (others.length) { const N = pick(others); p.migrate = N.id; p.goal = 'craft'; remember(p, 'Left ' + T.name + ' to see the world'); if (rnd() < 0.4) feed(1, p.name + ' packs a bag and leaves ' + T.name + ' for ' + N.name + '. They always said they would.'); } }
      else if (p.goal === 'revenge' && (p.foe == null || !byId[p.foe] || !byId[p.foe].alive)) { p.goal = pickGoal(p); p.anger *= 0.3; remember(p, 'Let go of an old hatred'); }
    }
    const target = 0.3 - p.anger * 0.2 - p.fear * 0.3 + p.pride * 0.2 - p.envy * 0.15 - p.hunger * 0.6 - p.grief * 0.6 + (p.partner != null ? 0.1 : 0) + (T.fpc > 3 ? 0.1 : T.fpc < 1.2 ? -0.35 : 0) + (T.cheer || 0) - (T.enemy != null ? 0.15 : 0);
    p.mood = clamp(p.mood + (target - p.mood) * 0.3, -1, 1);
    for (const id in p.ideas) { p.ideas[id] *= 0.9; if (p.ideas[id] < 0.08) delete p.ideas[id]; }
    const keys = Object.keys(p.rel); if (keys.length > 40) { keys.sort((x, y) => Math.abs(p.rel[x]) - Math.abs(p.rel[y])); for (let i = 0; i < keys.length - 40; i++) delete p.rel[keys[i]]; }
  }
  function townMonth(T) {
    let pop = 0, adults = 0, mood = 0, wsum = 0, csum = 0; const fc = {};
    for (const p of S.people) if (p.alive && p.home === T.id) { pop++; if (p.age >= 14) { adults++; wsum += p.wealth || 0; csum += p.tr.civ; } mood += p.mood; if (p.faith != null) fc[p.faith] = (fc[p.faith] || 0) + 1; }
    T.avgW = adults ? wsum / adults : 0; T.spirit = adults ? csum / adults : 0.5;
    { const L = byId[T.leader]; if (L && L.alive && pop > 5) { if (L.tr.kind > 0.6) T.cheer = (T.cheer || 0) + 0.03; if (L.tr.civ < 0.35 && T.food > 20) { const take = Math.min(3, T.food * 0.03); T.food -= take; L.wealth = Math.min(20, L.wealth + take); if (rnd() < 0.06) { for (const o of here[T.id] || []) if (o !== L) addRel(o, L, -0.12); const w = townmate(L, T); feed(2, 'Whispers in ' + T.name + ': ' + L.name + ' has been helping themselves to the granary.', { tag: 'gossip in ' + T.name, quotes: (w ? [q(w, TX.SAY2.witness)] : []).concat([q(L, TX.SAY2.skim)]) }); } } } }
    T.pop = pop; T.adults = adults; T.mood = pop ? mood / pop : 0; T.fpc = pop ? T.food / pop : 9; T.cheer = (T.cheer || 0) * 0.7;
    T.food = Math.min(T.food, pop * 14 + 40); let mf = null, mn = 0; for (const f in fc) if (fc[f] > mn) { mn = fc[f]; mf = +f; } T.faith = mn >= pop * 0.3 ? mf : null;
    for (const f in fc) if (fc[f] >= 6 && !T.shrines.some((s) => s.f === +f) && T.shrineWant == null) T.shrineWant = +f;
    for (let i = T.fields.length - 1; i >= 0; i--) {
      const f = T.fields[i];
      if (f.st === 0) { f.fert += f.used ? -0.002 * Math.min(4, f.used) : 0.012; f.fert = Math.min(1, f.fert); f.used = 0; if (f.fert < 0.2) { f.st = 2; f.t = S.lifeT; S.dirty++; if (rnd() < 0.5) { const w = townmate(S.people[0], T); feed(1, 'A worn-out field near ' + T.name + ' turns to bare dirt.', { quotes: w ? [q(w, TX.SAY.barren)] : [] }); } } }
      else if (f.st === 2 && S.lifeT - f.t > 18 * MONTH) { T.fields.splice(i, 1); clearPlants(f.x, f.y, Math.max(f.w, f.h) * 0.75, 3, S.lifeT + YEAR * (3 + rnd() * 5), true); }
      else if (f.st === 3 && S.lifeT - f.t > 14 * MONTH) { f.st = 0; f.fert = Math.max(f.fert, 0.5); S.dirty++; }
    }
    if (pop === 0) { T.small++; if (T.small > 8 && T.alive && T.id !== 0) { T.alive = false; for (const h of T.houses) h.st = 2; if (T.enemy != null) { const W = warOf(T); if (W) endWar(W, 'comes too late for ' + T.name); } S.dirty++; feed(3, T.name + ' lies abandoned. Grass grows over its lanes.', { quotes: [] }); } return; }
    if (pop < 5 && T.id !== 0) { T.small++; if (T.small > 10) { let best = null, bd = 99; for (const o of S.towns) if (o.alive && o !== T && o.id !== T.enemy && o.pop > 5) { const d = dist(T.x, T.y, o.x, o.y); if (d < bd) { bd = d; best = o; } } if (best) { for (const p of S.people) if (p.alive && p.home === T.id) p.migrate = best.id; feed(2, 'The last families of ' + T.name + ' give up and walk to ' + best.name + '.'); } } } else T.small = 0;
    if (S.lifeT - T.founded > 4 * MONTH || T.id < 5) if (T.leader == null || !byId[T.leader] || !byId[T.leader].alive || byId[T.leader].home !== T.id) elect(T, S.lifeT < 60);
    if (T.fpc < 0.6 && pop > 6 && rnd() < 0.12) { const w = townmate(S.people[0], T); feed(3, 'Famine in ' + T.name + '. The stores are empty.', { quotes: w ? [q(w, TX.SAY.famine)] : [] }); }
    T.crowd = pop > liveHouses(T) * 5 ? T.crowd + 1 : Math.max(0, T.crowd - 1);
    if ((T.crowd > 3 || (pop > 70 && rnd() < 0.02) || (T.fpc < 1 && pop > 25 && rnd() < 0.05)) && T.enemy == null && rnd() < 0.3) foundTown(T);
  }
  function worldMonth() {
    for (const T of S.towns) if (T.alive) townMonth(T);
    const live = S.towns.filter((T) => T.alive && T.pop > 0);
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const A = live[i], B = live[j]; let tr = trust(A.id, B.id); let d = tr < -25 ? 0.1 : -tr * 0.02;
      const hot = rnd() < 0.5 ? townIdea(A) : townIdea(B);
      if (rnd() < (hot ? 0.004 + hot.s * 0.007 : 0.004)) {
        d -= 6 + rnd() * 8; const X = rnd() < 0.5 ? A : B, Y = X === A ? B : A;
        if (hot && TX.DISPUTE[hot.cat]) { fx('💢', X.x, X.y - 0.25, 90); fx('💢', Y.x, Y.y - 0.25, 90); (X.griev = X.griev || {})[Y.id] = { term: hot.term, cat: hot.cat }; const w = townmate(S.people[0], X); feed(2, fill(TX.DISPUTE[hot.cat], { A: X.name, B: Y.name, t: hot.term }), { trend: hot.term, tag: 'dispute', quotes: w ? [tq(w, hot.cat)] : [] }); }
        else if (tr < -20) feed(1, pick(['A boundary quarrel sours things between ', 'Stolen livestock sets tempers flaring between ', 'An insult at market is remembered between ']) + A.name + ' and ' + B.name + '.');
      }
      if (A.faith != null && B.faith != null) d += A.faith === B.faith ? 0.6 : -0.7;
      if ((A.fpc < 1.4 && B.fpc > 3.5) || (B.fpc < 1.4 && A.fpc > 3.5)) d -= 1.6;
      let mil = 0, n = 0; for (const p of S.people) if (p.alive && (p.home === A.id || p.home === B.id) && p.age > 15) { mil += p.mil; n++; } d -= (n ? mil / n : 0) * 9;
      d += noise() * 0.8; addTrust(A.id, B.id, d); tr = trust(A.id, B.id);
      if (tr < -50 && A.enemy == null && B.enemy == null && S.lifeT > A.truce && S.lifeT > B.truce && A.adults > 7 && B.adults > 7) {
        const la = byId[A.leader], lb = byId[B.leader]; const agg = (la ? la.tr.bold + la.tr.temper : 0) + (A.fpc < B.fpc ? 0.4 : 0) > (lb ? lb.tr.bold + lb.tr.temper : 0) + (B.fpc < A.fpc ? 0.4 : 0) ? A : B; const L = byId[agg.leader];
        if (rnd() < 0.03 + (L ? (L.tr.bold + L.tr.temper - L.tr.kind) * 0.03 : 0)) declareWar(agg, agg === A ? B : A, A.faith != null && B.faith != null && A.faith !== B.faith ? 'over faith and old grudges' : agg.fpc < 1.6 ? 'for its grain' : 'after years of bad blood');
      }
    }
    warMonthly();
    for (let i = S.ideas.length - 1; i >= 0; i--) { const I = S.ideas[i]; I.s *= 0.94; if (I.s < 0.06) { delete ideaById[I.id]; S.ideas.splice(i, 1); } }
    let regrow = false; for (const k in S.dead) { const d = S.dead[k]; if (d[1] !== null && d[1] < S.lifeT) { delete S.dead[k]; regrow = true; } } if (regrow) S.dirty++;
    for (let i = S.decals.length - 1; i >= 0; i--) if (S.lifeT - S.decals[i].t > 40 * YEAR / 12 * 12) S.decals.splice(i, 1);
    disasters();
    S.monthN++;
    for (const T of S.towns) T.born = T.died = 0;
    if (rnd() < 0.34) gossip();
  }
  function fastTick() {
    census();
    for (const T of S.towns) { T.under = 0; for (const h of T.houses) if (h.st === 1 && S.lifeT - h.t > 90) { h.st = 2; S.dirty++; } }
    for (const p of S.people) if (p.alive && p.act === 'raid' && p.arr && town(p.tgt)) town(p.tgt).under++;
    for (const T of S.towns) {
      if (T.under > 1 && warOf(T) && S.lifeT - (T.lastAttack || -1e9) > 900) { T.lastAttack = S.lifeT; const W = warOf(T), E = T.enemy != null ? town(T.enemy) : null; let lead = null; for (const p of S.people) if (p.alive && p.act === 'raid' && p.arr && p.tgt === T.id && (!lead || p.tr.bold > lead.tr.bold)) lead = p; const vic = townmate(S.people[0], T, (o) => !o.soldier);
        feed(3, 'ATTACK. ' + T.under + ' raiders' + (E ? ' from ' + E.name : '') + ' break into ' + T.name + (lead ? ', led by ' + lead.name : '') + '. ' + (W && W.causeText ? W.causeText : ''), { tag: 'attack', trend: W ? W.cause : null, quotes: (lead ? [q(lead, TX.SAY.warFor)] : []).concat(vic ? [q(vic, TX.SAY.flee)] : []) }); }
    }
    S.events = S.events.filter((e) => e.until > S.lifeT);
    S.flash = S.flash.filter((f) => S.lifeT - f[2] < 20); S.fx = S.fx.filter((f) => S.lifeT - f.t < f.d);
  }

  function settlers() {
    S.nextShip = S.lifeT + 2 * YEAR; const T = S.towns.find((t) => t.key === 'port') || S.towns[0]; T.alive = true; T.small = 0; T.enemy = null;
    for (const h of T.houses) if (h.st !== 0 && rnd() < 0.7) h.st = 0;
    const fam = TX.FAMILY.other; for (let i = 0; i < 22; i++) { const p = mkPerson(T, 16 + rnd() * 22, i % 2 ? 'f' : 'm', pick(fam), null); assignHouse(p); }
    fx('⛵', T.x, T.y - 0.2, 200); T.food += 160; T.wood += 12; T.pop = 22; T.adults = 22; T.fpc = 7; S.dirty++;
    feed(3, 'A ship of settlers lands at ' + T.name + '. Twenty-two strangers step ashore to begin again.');
    census(); for (const p of S.people) if (p.act === 'idle') decide(p);
  }

  // ---------- main step
  function step(dt) {
    S.time += dt * 1000; S.lifeT += dt; const night = isNight();
    if (S.time >= S.nextPull) { S.nextPull = S.time + 15 * 60000; if (S.people.length) pull(); }
    if (S.lifeT >= S.nextWx) { S.nextWx = S.lifeT + 1200; updateWeather(); }
    if (S.lifeT >= S.nextFast) { S.nextFast = S.lifeT + 10; fastTick(); }
    if (S.lifeT >= S.nextMonth) { S.nextMonth = S.lifeT + MONTH; if (S.people.length) worldMonth(); }
    if (S.people.length < 8 && S.lifeT > S.nextShip) settlers();
    const P = S.people;
    for (let i = 0; i < P.length; i++) {
      const p = P[i]; if (!p.alive) continue;
      p.age += dt / YEAR; p.hunger = Math.min(1, p.hunger + dt / 900); p.rest = Math.min(1, p.rest + dt / (night ? 380 : 900)); p.lonely = Math.min(1, p.lonely + dt / 700 * (0.5 + p.tr.soc)); p.spirit = Math.min(1, p.spirit + dt / 1500 * (0.3 + p.tr.dev));
      if (!p.arr) {
        let rem = SPEED * dt * (p.age < 12 ? 0.8 : p.act === 'flee' || p.act === 'raid' ? 1.25 : 1);
        while (rem > 0 && p.path.length) { const w = p.path[0], dx = w[0] - p.x, dy = w[1] - p.y, d = Math.hypot(dx, dy); if (d <= rem) { p.x = w[0]; p.y = w[1]; rem -= d; p.path.shift(); } else { p.x += dx / d * rem; p.y += dy / d * rem; rem = 0; } }
        if (!p.path.length || S.lifeT - p.t0 > 1500) { p.path = []; p.arr = true; p.until = S.lifeT + p.dur; }
      } else {
        if ((p.act === 'raid' || p.act === 'defend') && S.lifeT >= p.hit) { p.hit = S.lifeT + 14 + rnd() * 8; combat(p); if (!p.alive) continue; }
        if (S.lifeT >= p.until) { finish(p); if (p.alive) decide(p); }
      }
      if (S.lifeT >= p.nextM) { p.nextM += MONTH; personMonth(p); }
    }
    if (S.stats.deaths !== S.reaped) { S.reaped = S.stats.deaths; S.people = P.filter((p) => { if (!p.alive) delete byId[p.id]; return p.alive; }); }
  }

  // ---------- world creation, save, load
  function newWorld(seedN, nowMs) {
    S = { v: 3, rs: seedN | 0, time: nowMs, lifeT: 0, nextId: 1, people: [], towns: [], ideas: [], faiths: [], events: [], wars: [], decals: [], dead: {}, feed: [], flash: [], fx: [], weather: { sky: 'cloudy', jit: 0, dry: 0, fixed: false }, nextPull: nowMs + 20000, nextWx: 0, nextFast: 0, nextMonth: MONTH, monthN: 0, trendIdx: 0, reacted: {}, lastPull: null, stats: { births: 0, deaths: 0 }, reaped: 0, drought: 0, nextShip: 0, nextFound: 0, dirty: 1, lastMinor: -99 };
    byId = {}; ideaById = {};
    const names = { capital: ['Hearthford', KEYCOL.capital], port: ['Tidewatch', KEYCOL.port], sun: ['Sunspire', KEYCOL.sun], jungle: ['Verdance', KEYCOL.jungle], frost: ['Frostholm', KEYCOL.frost] };
    const pops = { capital: 90, port: 34, sun: 26, jungle: 24, frost: 20 };
    for (const t of D.towns) { const T = mkTown(t.key, names[t.key][0], names[t.key][1], t.x, t.y, t.style); T.houses = t.houses.map((h) => ({ x: h[0], y: h[1], a: h[2], s: h[3], ci: h[4], st: 0, t: 0 })); if (t.key !== 'capital') { T.parent = 0; T.road = D.roads[t.key]; } }
    S.towns[0].fields = D.fields.map((f) => ({ x: f[0], y: f[1], w: f[2], h: f[3], a: f[4], ci: f[5], fert: 0.7 + rnd() * 0.3, st: 0, t: 0, used: 0 }));
    S.faiths.push({ id: 0, name: 'The Old Light', cat: 'faith', founder: -1, founderName: 'the ancestors', town: 0, n: 0, born: 0, from: null });
    S.faiths.push({ id: 1, name: 'Children of the Tide', cat: 'weather', founder: -1, founderName: 'the first fishers', town: 1, n: 0, born: 0, from: null });
    for (const T of S.towns) {
      const n = pops[T.key], fam = TX.FAMILY[T.key], folk = [];
      for (let i = 0; i < n; i++) { const child = rnd() < 0.27; const age = child ? rnd() * 14 : 14 + Math.pow(rnd(), 1.5) * 58; folk.push(mkPerson(T, age, rnd() < 0.5 ? 'f' : 'm', pick(fam), null)); }
      const men = folk.filter((p) => p.sex === 'm' && p.age >= 18 && p.age < 58), women = folk.filter((p) => p.sex === 'f' && p.age >= 18 && p.age < 55), couples = [];
      for (let i = 0; i < Math.min(men.length, women.length); i++) if (rnd() < 0.68 && Math.abs(men[i].age - women[i].age) < 18) { const m = men[i], f = women[i]; m.gay = f.gay = false; m.partner = f.id; f.partner = m.id; m.rel[f.id] = 0.7; f.rel[m.id] = 0.7; f.fam = m.fam; f.name = first(f) + ' ' + m.fam; couples.push([f, m]); }
      let hi = 0; for (const c of couples) { c[0].h = c[1].h = hi % T.houses.length; hi++; }
      for (const p of folk) { if (p.age < 14 && couples.length) { const c = pick(couples); if (c[0].age - p.age > 16) { p.par = [c[0].id, c[1].id]; p.h = c[0].h; p.fam = c[1].fam; p.name = first(p) + ' ' + p.fam; c[0].kids++; c[1].kids++; p.rel[c[0].id] = 0.8; c[0].rel[p.id] = 0.9; c[1].rel[p.id] = 0.9; } } if (p.h < 0) p.h = Math.floor(rnd() * T.houses.length); }
      for (const p of folk) { for (let i = 0; i < 3; i++) { const o = pick(folk); if (o !== p) { const v = 0.25 + rnd() * 0.35; p.rel[o.id] = Math.max(p.rel[o.id] || 0, v); o.rel[p.id] = Math.max(o.rel[p.id] || 0, v); } } if (rnd() < 0.25) { const o = pick(folk); if (o !== p && !p.rel[o.id]) { p.rel[o.id] = -0.3 - rnd() * 0.3; o.rel[p.id] = -0.3; } } }
      const fa = T.key === 'capital' || T.key === 'frost' ? [0, 0.45] : T.key === 'port' ? [1, 0.6] : T.key === 'jungle' ? [1, 0.25] : [0, 0.15];
      for (const p of folk) if (rnd() < fa[1] * (0.5 + p.tr.dev)) { p.faith = fa[0]; S.faiths[fa[0]].n++; }
      T.food = n * 5; T.pop = n; T.adults = folk.filter((p) => p.age >= 14).length;
      if (T.key !== 'capital') { const k = T.key === 'frost' ? 0 : 4; for (let i = 0; i < k; i++) addField(T, true); }
      for (const p of folk) { const hp = housePos(p); p.x = hp[0]; p.y = hp[1]; }
      elect(T, true);
    }
    S.towns[0].shrines.push({ x: S.towns[0].x - 0.82, y: S.towns[0].y - 0.42, f: 0 }); const lp = landNear(S.towns[1].x - 0.2, S.towns[1].y - 0.45, 0.15); S.towns[1].shrines.push({ x: lp[0], y: lp[1], f: 1 });
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) addTrust(i, j, Math.round(-5 + rnd() * 35));
    addTrust(2, 3, -45 - trust(2, 3));
    feed(2, 'The world wakes. ' + S.people.length + ' citizens in five towns go about their lives.');
    census(); for (const p of S.people) decide(p);
    return S;
  }
  function save() { const o = Object.assign({}, S); return JSON.stringify(o, (k, v) => (v === Infinity ? '__inf' : v)); }
  function load(json) {
    const o = JSON.parse(json, (k, v) => (v === '__inf' ? Infinity : v)); if (!o || o.v !== 3) return null; S = o; byId = {}; ideaById = {};
    if (!S.fx) S.fx = []; for (const p of S.people) { byId[p.id] = p; migrate(p); } for (const I of S.ideas) ideaById[I.id] = I; for (const T of S.towns) if (KEYCOL[T.key]) T.color = KEYCOL[T.key]; for (const f of S.feed) for (const qq of f.quotes) { const p = byId[qq.id]; if (p) qq.c = S.towns[p.home].color; } census(); S.dirty++; return S;
  }

  function describe(p) {
    const T = town(p.home), t = p.tr; const ws = Object.keys(TX.TRAIT_WORDS).map((k) => [Math.abs(t[k] - 0.5), TX.TRAIT_WORDS[k][t[k] > 0.5 ? 1 : 0]]).sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]);
    let friends = 0, rivals = 0; for (const k in p.rel) if (byId[k]) { if (p.rel[k] > 0.4) friends++; else if (p.rel[k] < -0.3) rivals++; }
    const I = topIdea(p); const L = byId[T.leader]; const feels = [['angry', p.anger], ['afraid', p.fear], ['envious', p.envy], ['proud', p.pride], ['grieving', p.grief]].filter((x) => x[1] > 0.35).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    return { goal: p.goal && TX.GOALS[p.goal] ? TX.GOALS[p.goal].label : null, feels, civic: p.tr.civ > 0.66 ? 'puts the town first' : p.tr.civ < 0.33 ? 'looks out for themselves' : 'does their share', wealth: p.wealth > 7 ? 'well off' : p.wealth > 2.5 ? 'getting by' : 'poor', leaderView: L && L !== p ? (rel(p, L) > 0.25 ? 'trusts the leader' : rel(p, L) < -0.2 ? 'resents the leader' : 'unsure about the leader') : null, mem: p.mem.slice(-4), name: p.name, age: Math.floor(p.age), job: jobName(p), town: T.name, color: T.color, traits: ws, mood: p.mood > 0.35 ? 'content' : p.mood > 0 ? 'steady' : p.mood > -0.35 ? 'troubled' : 'miserable', partner: p.partner != null && byId[p.partner] ? byId[p.partner].name : null, kids: p.kids, faith: p.faith != null && S.faiths[p.faith] ? S.faiths[p.faith].name : null, friends, rivals, doing: p.act, thought: p.thought, idea: I ? I.term : null, sick: p.sick > 0, soldier: p.soldier, leader: T.leader === p.id };
  }

  Object.assign(Sim, { init, newWorld, load, save, step, season, isNight, temperature, snowAt, describe, pullNow: () => pull(), biome, isLand, tBase, jobName, setWeather: (sky) => { S.weather.sky = sky; S.weather.fixed = true; S.weather.live = null; }, setLiveWeather: (sky, temp) => { S.weather.sky = sky; S.weather.fixed = true; S.weather.live = temp; }, clearWeather: () => { S.weather.fixed = false; S.weather.live = null; } });
  Object.defineProperty(Sim, 'S', { get: () => S }); Object.defineProperty(Sim, 'D', { get: () => D });
  root.TW_SIM = Sim;
})(typeof window !== 'undefined' ? window : globalThis);
