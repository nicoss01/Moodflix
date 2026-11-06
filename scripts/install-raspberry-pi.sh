#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -m)" != aarch64* && "$(uname -m)" != armv7l* ]]; then
  echo "Attention : ce script est prévu pour Raspberry Pi OS."
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CURRENT_USER="$(id -un)"

echo "Installation des dépendances système…"
sudo apt-get update
sudo apt-get install -y ffmpeg chromium-browser cec-utils xdotool curl qbittorrent-nox build-essential python3

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(`.`)[0])')" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "Compilation de MoodFlix…"
cd "$APP_DIR"
npm ci
npm run build
mkdir -p "$APP_DIR/data" "$HOME/.config/systemd/user" "$HOME/.config/autostart"

sed "s|__APP_DIR__|$APP_DIR|g" "$APP_DIR/systemd/moodflix.service" > "$HOME/.config/systemd/user/moodflix.service"
cat > "$HOME/.config/autostart/moodflix-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=MoodFlix
Exec=$APP_DIR/scripts/start-kiosk.sh
X-GNOME-Autostart-enabled=true
EOF

chmod +x "$APP_DIR/scripts/start-kiosk.sh"
systemctl --user daemon-reload
systemctl --user enable --now moodflix.service
sudo loginctl enable-linger "$CURRENT_USER"

if systemctl list-unit-files | grep -q 'qbittorrent-nox@.service'; then
  sudo systemctl enable --now "qbittorrent-nox@${CURRENT_USER}.service" || true
fi

echo
echo "MoodFlix est installé. Redémarrez le Raspberry Pi pour lancer le mode TV."
echo "Configuration : http://$(hostname -I | awk '{print $1}'):4242/settings"
