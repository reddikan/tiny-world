# Tiny World for Raspberry Pi

A tiny living civilization shaped by Google's trending searches, shown full screen on a monitor.
Built for a Raspberry Pi 3 B running Raspberry Pi OS with desktop.

## Install

1. On the Pi, open Terminal and download Tiny World:

       git clone https://github.com/reddikan/tiny-world.git tinyworld

2. Go into the folder and run the installer:

       cd tinyworld
       bash install.sh

3. Optional: open `config.json` and set your town for real weather, for example
   `"location": "Springfield, Illinois"`. Left on `"auto"`, the Pi guesses from its internet connection.
4. Restart:

       sudo reboot

The Pi then boots straight into Tiny World.

## What runs on the Pi

- `server.py` runs in the background. It fetches the live US trending searches and the real weather,
  saves the world to `data/world.json` every two minutes, and tells the screen when the code has changed.
- `kiosk.sh` opens the Chromium browser full screen on the world.
- `update.sh` checks GitHub every five minutes (only when this folder was installed with `git clone`).

## Settings (`config.json`)

| Setting | Meaning |
|---|---|
| `location` | `"auto"`, a place name like `"Austin, Texas"`, or `"latitude, longitude"` |
| `geo` | Country for trending searches. `"US"` |
| `quality` | `"pi"` (light graphics for the Pi 3 B) or `"full"` |
| `controls` | `true` shows the preview controls (speed, seasons, weather). Press `c` on a keyboard to toggle them |
| `port` | Leave at 8080 |

After changing settings: `sudo systemctl restart tinyworld` and press F5 on the screen, or reboot.

## Handy commands

- See whether the server is running: `systemctl status tinyworld`
- Check what it is fetching: open `http://localhost:8080/api/trends` and `http://localhost:8080/api/weather` in a browser on the Pi
- Start a brand new world: `rm data/world.json*` then reboot
- Leave the full-screen view: press Alt+F4 (with a keyboard attached)
