#!/usr/bin/env bash
set -euo pipefail

APP_URL="${MOODFLIX_URL:-http://127.0.0.1:4242}"

xset s off
xset -dpms
xset s noblank
openbox-session &
unclutter -idle 0.25 -root &

# Raspberry Pi OS Lite n'a pas d'automontage de supports amovibles.
if command -v udiskie >/dev/null 2>&1; then
  dbus-run-session -- udiskie --automount --no-notify &
fi

for _ in $(seq 1 40); do
  curl -fsS "$APP_URL/api/health" >/dev/null 2>&1 && break
  sleep 1
done

BROWSER_BIN="$(command -v chromium || command -v chromium-browser || true)"
if [[ -z "$BROWSER_BIN" ]]; then
  echo "Chromium est introuvable" >&2
  exit 1
fi

exec "$BROWSER_BIN" \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --autoplay-policy=no-user-gesture-required \
  --user-data-dir="$HOME/.config/moodflix-chromium" \
  "$APP_URL"
