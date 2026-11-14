#!/bin/bash
# Opens Tiny World full screen. Started automatically when the Pi's desktop loads.
DIR="$(cd "$(dirname "$0")" && pwd)"
exec 9>/tmp/tinyworld-kiosk.lock
flock -n 9 || exit 0          # already running: do not open a second window
PORT=$(python3 -c "import json;print(json.load(open('$DIR/config.json')).get('port',8080))" 2>/dev/null || echo 8080)
for i in $(seq 1 90); do      # wait for the local server to answer
  (echo > /dev/tcp/127.0.0.1/$PORT) 2>/dev/null && break
  sleep 1
done
BROWSER=$(command -v chromium-browser || command -v chromium)
if [ -z "$BROWSER" ]; then echo "Chromium is not installed. Run install.sh again."; exit 1; fi
# stop the "Chromium did not shut down correctly" bubble after a power cut
PREFS="$HOME/.config/chromium/Default/Preferences"
[ -f "$PREFS" ] && sed -i 's/"exited_cleanly":false/"exited_cleanly":true/; s/"exit_type":"Crashed"/"exit_type":"Normal"/' "$PREFS"
exec "$BROWSER" --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble \
  --disable-features=Translate --check-for-update-interval=31536000 --password-store=basic \
  --overscroll-history-navigation=0 "http://localhost:$PORT/"
