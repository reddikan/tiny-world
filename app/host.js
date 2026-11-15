/* Tiny World: where the page is running. On the Raspberry Pi a small local server supplies live
   trends, real weather, saving to disk and update checks. Anywhere else the page runs on its own. */
(function (root) {
  'use strict';
  const KEY = 'tinyworld.v3';
  const H = { mode: 'web', cfg: { quality: 'full', controls: true }, trends: null, trendsAt: 0, weather: null, version: null };
  async function getJSON(url, ms) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 8000);
    try { const r = await fetch(url, { cache: 'no-store', signal: ctl.signal }); if (!r.ok) throw new Error('http ' + r.status); return await r.json(); } finally { clearTimeout(t); }
  }
  H.boot = async function () {
    try { const j = await getJSON('api/config', 2500); if (j && j.ok && j.host === 'pi') { H.mode = 'pi'; H.cfg = j; } } catch (e) { H.mode = 'web'; }
    return H;
  };
  H.loadState = async function () {
    if (H.mode === 'pi') { try { const r = await fetch('api/state', { cache: 'no-store' }); const txt = await r.text(); if (txt && txt.charAt(0) === '{' && txt.indexOf('"people"') > 0) return txt; } catch (e) { } return null; }
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  };
  H.saveState = function (json) {
    if (H.mode === 'pi') return fetch('api/state', { method: 'POST', body: json, headers: { 'Content-Type': 'application/json' } }).catch(() => { });
    try { localStorage.setItem(KEY, json); } catch (e) { }
  };
  H.clearState = function () { try { localStorage.removeItem(KEY); } catch (e) { } };
  // Ask the Pi's server for fresh trends and weather. Old answers are kept if the internet is down.
  H.refresh = async function () {
    if (H.mode !== 'pi') return;
    try { const j = await getJSON('api/trends', 25000); if (j && j.ok && j.items && j.items.length) { H.trends = j.items; H.trendsAt = Date.now(); H.trendsStale = !!j.stale; } } catch (e) { }
    try { const j = await getJSON('api/weather', 25000); H.weather = j && j.ok ? j : null; } catch (e) { H.weather = null; }
  };
  // True when the code on the Pi has changed since this page loaded.
  H.changed = async function () {
    if (H.mode !== 'pi') return false;
    try { const j = await getJSON('api/version', 5000); if (!j || !j.ok) return false; if (H.version == null) { H.version = j.version; return false; } return j.version !== H.version; } catch (e) { return false; }
  };
  H.log = function (text) { if (H.mode !== 'pi') { try { console.error(text); } catch (e) { } return; } fetch('api/log', { method: 'POST', body: String(text).slice(0, 4000) }).catch(() => { }); };
  H.ping = function (info) { if (H.mode !== 'pi') return; fetch('api/ping', { method: 'POST', body: JSON.stringify(info || {}) }).catch(() => { }); };
  root.TW_HOST = H;
})(window);
