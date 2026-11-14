#!/bin/bash
# Tiny World installer for Raspberry Pi OS (with desktop). Run once:  bash install.sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
ME="$(whoami)"
if [ "$ME" = "root" ]; then echo "Run this as your normal user, not with sudo."; exit 1; fi

echo "1/5 Installing what Tiny World needs (this can take a few minutes)"
sudo apt-get update -y
sudo apt-get install -y python3 git fonts-noto-color-emoji
if ! command -v chromium-browser >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1; then
  sudo apt-get install -y chromium-browser || sudo apt-get install -y chromium
fi

echo "2/5 Settings"
[ -f "$DIR/config.json" ] || cp "$DIR/config.example.json" "$DIR/config.json"
mkdir -p "$DIR/data"
chmod +x "$DIR/kiosk.sh" "$DIR/update.sh" "$DIR/server.py"

echo "3/5 Starting the Tiny World server and the update check"
sudo tee /etc/systemd/system/tinyworld.service >/dev/null <<UNIT
[Unit]
Description=Tiny World server
After=network-online.target
Wants=network-online.target

[Service]
User=$ME
WorkingDirectory=$DIR
ExecStart=/usr/bin/python3 $DIR/server.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
sudo tee /etc/systemd/system/tinyworld-update.service >/dev/null <<UNIT
[Unit]
Description=Tiny World update check

[Service]
Type=oneshot
User=$ME
ExecStart=$DIR/update.sh
UNIT
sudo tee /etc/systemd/system/tinyworld-update.timer >/dev/null <<UNIT
[Unit]
Description=Check for Tiny World updates every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now tinyworld.service
sudo systemctl enable --now tinyworld-update.timer

echo "4/5 Opening Tiny World full screen whenever the desktop starts"
mkdir -p "$HOME/.config/autostart" "$HOME/.config/labwc"
cat > "$HOME/.config/autostart/tinyworld.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Tiny World
Exec=$DIR/kiosk.sh
X-GNOME-Autostart-enabled=true
DESK
touch "$HOME/.config/labwc/autostart"
grep -q "tinyworld" "$HOME/.config/labwc/autostart" || echo "$DIR/kiosk.sh &  # tinyworld" >> "$HOME/.config/labwc/autostart"
if [ -f "$HOME/.config/wayfire.ini" ] && ! grep -q "tinyworld" "$HOME/.config/wayfire.ini"; then
  if grep -q "^\[autostart\]" "$HOME/.config/wayfire.ini"; then
    sed -i "/^\[autostart\]/a tinyworld = $DIR/kiosk.sh" "$HOME/.config/wayfire.ini"
  else
    printf "\n[autostart]\ntinyworld = %s/kiosk.sh\n" "$DIR" >> "$HOME/.config/wayfire.ini"
  fi
fi

echo "5/5 Boot straight to the desktop and keep the screen awake"
if command -v raspi-config >/dev/null 2>&1; then
  sudo raspi-config nonint do_boot_behaviour B4 || true
  sudo raspi-config nonint do_blanking 1 || true
fi

echo
echo "Done. Restart the Pi to see Tiny World:  sudo reboot"
echo "To set your town for real weather, edit $DIR/config.json first."
