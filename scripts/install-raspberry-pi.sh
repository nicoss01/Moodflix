#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -m)" != aarch64* && "$(uname -m)" != armv7l* ]]; then
  echo "Attention : ce script est prévu pour Raspberry Pi OS."
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CURRENT_USER="$(id -un)"

echo "Installation du socle minimal (aucun environnement de bureau)…"
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  ffmpeg chromium cec-utils curl qbittorrent-nox build-essential python3 \
  xserver-xorg-core xserver-xorg-input-libinput xinit openbox \
  x11-xserver-utils unclutter fonts-dejavu-core \
  udisks2 udiskie dbus-x11

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(`.`)[0])')" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "Compilation de MoodFlix…"
cd "$APP_DIR"
npm ci
npm run build
mkdir -p "$APP_DIR/data"
sudo mkdir -p /srv/media/downloads
sudo chown -R "$CURRENT_USER:$CURRENT_USER" /srv/media

render_unit() {
  sed -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__USER__|$CURRENT_USER|g" -e "s|__HOME__|$HOME|g" "$1" | sudo tee "$2" >/dev/null
}

render_unit "$APP_DIR/systemd/moodflix.service" /etc/systemd/system/moodflix.service
render_unit "$APP_DIR/systemd/moodflix-kiosk.service" /etc/systemd/system/moodflix-kiosk.service
render_unit "$APP_DIR/systemd/moodflix-qbittorrent.service" /etc/systemd/system/moodflix-qbittorrent.service

chmod +x "$APP_DIR/scripts/start-kiosk.sh"
sudo usermod -aG video,render,input "$CURRENT_USER"
sudo systemctl daemon-reload
sudo systemctl enable moodflix.service moodflix-kiosk.service moodflix-qbittorrent.service
sudo systemctl restart moodflix.service
sudo systemctl restart moodflix-qbittorrent.service

echo
echo "MoodFlix est installé sur le système Lite. Redémarrez le Raspberry Pi pour lancer le mode TV."
echo "Configuration : http://$(hostname -I | awk '{print $1}'):4242/settings"
