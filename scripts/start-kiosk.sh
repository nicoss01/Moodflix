#!/usr/bin/env bash
set -euo pipefail

APP_URL="${MOODFLIX_URL:-http://127.0.0.1:4242}"

# Transforme les touches HDMI-CEC de la télécommande en touches clavier comprises
# par l'interface. Le pont est facultatif : clavier et télécommande USB restent utilisables.
if command -v cec-client >/dev/null 2>&1 && command -v xdotool >/dev/null 2>&1; then
  (
    echo 'scan' | stdbuf -oL cec-client -d 8 -t p 2>/dev/null | while IFS= read -r line; do
      case "$line" in
        *"key pressed: left"*) xdotool key Left ;;
        *"key pressed: right"*) xdotool key Right ;;
        *"key pressed: up"*) xdotool key Up ;;
        *"key pressed: down"*) xdotool key Down ;;
        *"key pressed: select"*) xdotool key Return ;;
        *"key pressed: exit"*|*"key pressed: previous channel"*) xdotool key BackSpace ;;
        *"key pressed: play"*) xdotool key space ;;
        *"key pressed: pause"*) xdotool key space ;;
        *"key pressed: stop"*) xdotool key BackSpace ;;
      esac
    done
  ) &
fi

for _ in $(seq 1 40); do
  curl -fsS "$APP_URL/api/health" >/dev/null 2>&1 && break
  sleep 1
done

exec chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --autoplay-policy=no-user-gesture-required \
  --enable-features=OverlayScrollbar \
  "$APP_URL"
