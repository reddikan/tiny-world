#!/usr/bin/env python3
"""Tiny World: the small local server that runs on the Raspberry Pi.

It serves the page to the Pi's own browser and does the things a web page cannot:
  /api/config   settings from config.json
  /api/trends   live US trending searches from Google Trends (refreshed every 10 minutes)
  /api/weather  real current weather for the configured place (Open-Meteo, no key needed)
  /api/state    the saved world (GET to load, POST to save) kept in data/world.json
  /api/version  changes whenever the code changes, so the screen can reload itself
  /api/ping     heartbeat from the screen; if it stops, the browser is restarted
  /api/log      errors from the screen, kept in data/errors.log

Only the Python standard library is used, so nothing needs installing.
"""
import json, os, re, subprocess, sys, threading, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(ROOT, 'app')
DATA = os.path.join(ROOT, 'data')
STATE = os.path.join(DATA, 'world.json')
os.makedirs(DATA, exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux aarch64) TinyWorld/1.0'}
lock = threading.Lock()
cache = {}
LOG = os.path.join(DATA, 'errors.log')
beat = {'t': None, 'info': {}}
WATCHDOG_SECS = int(os.environ.get('TW_WATCHDOG_SECS', '300'))
BROWSER_PATTERN = os.environ.get('TW_BROWSER_PATTERN', 'chromium.*--kiosk')


def log(text):
    try:
        if os.path.exists(LOG) and os.path.getsize(LOG) > 300000:
            os.replace(LOG, LOG + '.old')
        with open(LOG, 'a') as f:
            f.write(time.strftime('%Y-%m-%d %H:%M:%S ') + text.rstrip() + '\n')
    except Exception as e:
        print('log failed:', e, file=sys.stderr)


def restart_browser():
    """The screen stopped answering: close the browser and let the kiosk script open it again."""
    env = None
    try:
        pid = subprocess.run(['pgrep', '-o', '-f', BROWSER_PATTERN], capture_output=True, text=True).stdout.split()
        if pid:
            with open('/proc/%s/environ' % pid[0], 'rb') as f:
                env = dict(kv.split('=', 1) for kv in f.read().decode(errors='ignore').split('\0') if '=' in kv)
        subprocess.run(['pkill', '-f', BROWSER_PATTERN])
        time.sleep(12)
        still = subprocess.run(['pgrep', '-f', BROWSER_PATTERN], capture_output=True, text=True).stdout.split()
        if not still and env is not None:  # nothing reopened it, so open it ourselves on the same screen
            subprocess.Popen([os.path.join(ROOT, 'kiosk.sh')], env=env, start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        log('watchdog could not restart the browser: %s' % e)


def self_update():
    """When an update replaces this file, stop; the system starts the new version a few seconds later.
    This way updates never need an administrator password."""
    me = os.path.abspath(__file__); born = os.path.getmtime(me)
    while True:
        time.sleep(15)
        try:
            if os.path.getmtime(me) != born:
                log('server code was updated; restarting to load it')
                os._exit(0)
        except OSError:
            pass


def watchdog():
    while True:
        time.sleep(20)
        t = beat['t']
        if t is not None and time.time() - t > WATCHDOG_SECS:
            log('watchdog: no heartbeat from the screen for %d seconds (last report %s). Restarting the browser.' % (time.time() - t, json.dumps(beat['info'])))
            beat['t'] = None
            restart_browser()


def config():
    cfg = {'port': 8080, 'location': 'auto', 'quality': 'pi', 'controls': False, 'geo': 'US'}
    try:
        with open(os.path.join(ROOT, 'config.json')) as f:
            cfg.update(json.load(f))
    except Exception as e:  # a broken config file should not stop the world
        print('config.json not read:', e, file=sys.stderr)
    return cfg


def get(url, timeout=20):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def cached(key, ttl, fn):
    """Return fn() at most once per ttl seconds. On failure keep serving the last good answer."""
    with lock:
        hit = cache.get(key)
        if hit and time.time() - hit[0] < ttl:
            return hit[1]
    try:
        val = fn()
        with lock:
            cache[key] = (time.time(), val)
        return val
    except Exception as e:
        print(key, 'failed:', e, file=sys.stderr)
        with lock:
            if key in cache:
                old = dict(cache[key][1]); old['stale'] = True
                cache[key] = (time.time() - ttl + 120, old)  # try again in two minutes
                return old
        return {'ok': False, 'error': str(e)}


def volume(text):
    m = re.match(r'\s*([\d.,]+)\s*([KMB]?)', (text or '').upper())
    if not m:
        return 20000
    return int(float(m.group(1).replace(',', '')) * {'': 1, 'K': 1e3, 'M': 1e6, 'B': 1e9}[m.group(2)])


def fetch_trends():
    geo = config().get('geo', 'US')
    root = ET.fromstring(get('https://trends.google.com/trending/rss?geo=' + urllib.parse.quote(geo)))
    items = []
    for it in root.iter('item'):
        term, vol, news = None, 20000, []
        for ch in it:
            tag = ch.tag.split('}')[-1]
            if tag == 'title':
                term = (ch.text or '').strip()
            elif tag == 'approx_traffic':
                vol = volume(ch.text)
            elif tag == 'news_item':
                for n in ch:
                    if n.tag.split('}')[-1] in ('news_item_title', 'news_item_source') and n.text:
                        news.append(n.text.strip())
        if term:
            items.append({'term': term[:80], 'vol': vol, 'news': ' | '.join(news)[:400]})
    if not items:
        raise RuntimeError('trend feed had no items')
    return {'ok': True, 'fetched': int(time.time() * 1000), 'items': items}


WMO = {'clear': (0, 1), 'cloudy': (2, 3), 'fog': (45, 48), 'snow': (71, 73, 75, 77, 85, 86), 'storm': (95, 96, 99)}


def locate():
    loc = str(config().get('location', 'auto')).strip()
    if loc.lower() != 'auto' and loc:
        m = re.match(r'^\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*$', loc)
        if m:
            return float(m.group(1)), float(m.group(3)), loc
        name = loc.split(',')[0].strip()
        j = json.loads(get('https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&name=' + urllib.parse.quote(name)))
        res = j.get('results') or []
        want = loc.split(',')[1].strip().lower() if ',' in loc else ''
        for r in res:  # prefer the result whose state or country matches what came after the comma
            if want and want in ((r.get('admin1') or '') + ' ' + (r.get('country_code') or '') + ' ' + (r.get('country') or '')).lower():
                return r['latitude'], r['longitude'], r['name'] + ', ' + (r.get('admin1') or r.get('country') or '')
        if res:
            r = res[0]
            return r['latitude'], r['longitude'], r['name'] + ', ' + (r.get('admin1') or r.get('country') or '')
        raise RuntimeError('could not find the place named in config.json: ' + loc)
    j = json.loads(get('https://ipapi.co/json/'))  # rough location from the internet connection
    return float(j['latitude']), float(j['longitude']), (j.get('city') or 'here') + ', ' + (j.get('region_code') or '')


def fetch_weather():
    place = cached('place', 86400, lambda: {'v': locate()})
    if 'v' not in place:
        raise RuntimeError('location unknown: ' + str(place.get('error')))
    lat, lon, name = place['v']
    j = json.loads(get('https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit' % (lat, lon)))
    cur = j['current']; code = int(cur['weather_code']); sky = 'rain'
    for k, codes in WMO.items():
        if code in codes:
            sky = k
    return {'ok': True, 'place': name, 'temp': round(cur['temperature_2m']), 'sky': sky, 'code': code, 'wind': cur.get('wind_speed_10m')}


def version():
    try:
        out = subprocess.run(['git', '-C', ROOT, 'rev-parse', 'HEAD'], capture_output=True, text=True, timeout=5)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except Exception:
        pass
    newest = 0
    for base, _, files in os.walk(APP):
        for f in files:
            newest = max(newest, os.path.getmtime(os.path.join(base, f)))
    return str(int(newest))


def updated():
    """When the code now on this Pi was last changed: the time of the newest update from GitHub."""
    try:
        out = subprocess.run(['git', '-C', ROOT, 'log', '-1', '--format=%ct'], capture_output=True, text=True, timeout=5)
        if out.returncode == 0 and out.stdout.strip().isdigit():
            return int(out.stdout.strip())
    except Exception:
        pass
    newest = 0
    for base, _, files in os.walk(APP):
        for f in files:
            newest = max(newest, os.path.getmtime(os.path.join(base, f)))
    return int(newest)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=APP, **k)

    def log_message(self, fmt, *args):  # keep the SD card quiet
        pass

    def send_json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        if not self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_GET(self):
        p = self.path.split('?')[0]
        if p == '/api/config':
            c = config(); return self.send_json({'ok': True, 'quality': c.get('quality', 'pi'), 'controls': bool(c.get('controls')), 'fps': c.get('fps'), 'host': 'pi'})
        if p == '/api/trends':
            return self.send_json(cached('trends', 600, fetch_trends))
        if p == '/api/weather':
            return self.send_json(cached('weather', 600, fetch_weather))
        if p == '/api/version':
            return self.send_json({'ok': True, 'version': version(), 'updated': updated()})
        if p == '/api/health':
            return self.send_json({'ok': True, 'lastHeartbeatSecondsAgo': None if beat['t'] is None else int(time.time() - beat['t']), 'screen': beat['info'], 'savedSecondsAgo': int(time.time() - os.path.getmtime(STATE)) if os.path.exists(STATE) else None})
        if p == '/api/state':
            try:
                with open(STATE, 'rb') as f:
                    body = f.read()
            except FileNotFoundError:
                try:  # fall back to the previous save if the newest one is missing
                    with open(STATE + '.bak', 'rb') as f:
                        body = f.read()
                except FileNotFoundError:
                    return self.send_json({'ok': False, 'empty': True})
            self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(body); return
        return super().do_GET()

    def do_POST(self):
        p = self.path.split('?')[0]
        n = int(self.headers.get('Content-Length') or 0)
        if p == '/api/ping':
            try:
                beat['info'] = json.loads(self.rfile.read(min(n, 4000)) or b'{}')
            except Exception:
                beat['info'] = {}
            beat['t'] = time.time()
            return self.send_json({'ok': True})
        if p == '/api/log':
            log(self.rfile.read(min(n, 8000)).decode(errors='replace'))
            return self.send_json({'ok': True})
        if p != '/api/state':
            return self.send_json({'ok': False}, 404)
        if n <= 0 or n > 20 * 1024 * 1024:
            return self.send_json({'ok': False, 'error': 'bad size'}, 400)
        body = self.rfile.read(n)
        try:
            json.loads(body)  # never replace a good save with a broken one
        except Exception:
            return self.send_json({'ok': False, 'error': 'not json'}, 400)
        tmp = STATE + '.tmp'
        with open(tmp, 'wb') as f:
            f.write(body); f.flush(); os.fsync(f.fileno())
        if os.path.exists(STATE):
            os.replace(STATE, STATE + '.bak')
        os.replace(tmp, STATE)
        self.send_json({'ok': True})


if __name__ == '__main__':
    port = int(config().get('port', 8080))
    print('Tiny World server on http://localhost:%d' % port)
    log('server started')
    threading.Thread(target=watchdog, daemon=True).start()
    threading.Thread(target=self_update, daemon=True).start()
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
