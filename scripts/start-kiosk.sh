#!/usr/bin/env bash
set -euo pipefail

APP_URL="${MOODFLIX_URL:-http://127.0.0.1:4242}"

if [[ -z "${WAYLAND_DISPLAY:-}" ]]; then
  xset s off
  xset -dpms
  xset s noblank
  openbox-session &
  unclutter -idle 0.25 -root &
fi

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

CHROMIUM_FLAGS=(
  --kiosk
  --start-maximized
  --no-first-run
  --no-default-browser-check
  --lang=fr-FR
  --noerrdialogs
  --disable-infobars
  --disable-translate
  --disable-features=Translate,TranslateUI
  --disable-session-crashed-bubble
  --disable-pinch
  --overscroll-history-navigation=0
  --autoplay-policy=no-user-gesture-required
  --user-data-dir="$HOME/.config/moodflix-chromium"
)

# Normalise automatiquement la taille de l'interface sur une base 1920x1080.
# MOODFLIX_UI_SCALE permet de forcer une valeur (par exemple 1.5) si nécessaire.
UI_SCALE="${MOODFLIX_UI_SCALE:-}"
if [[ -z "$UI_SCALE" ]]; then
  SCREEN_WIDTH=""
  for STATUS_FILE in /sys/class/drm/card*-*/status; do
    [[ -r "$STATUS_FILE" && "$(<"$STATUS_FILE")" == "connected" ]] || continue
    MODE_FILE="${STATUS_FILE%/status}/modes"
    [[ -r "$MODE_FILE" ]] || continue
    IFS=x read -r SCREEN_WIDTH _ < "$MODE_FILE"
    [[ "$SCREEN_WIDTH" =~ ^[0-9]+$ ]] && break
    SCREEN_WIDTH=""
  done
  if [[ "${SCREEN_WIDTH:-0}" -ge 3500 ]]; then
    UI_SCALE="2"
  elif [[ "${SCREEN_WIDTH:-0}" -ge 2500 ]]; then
    UI_SCALE="1.333333"
  else
    UI_SCALE="1"
  fi
fi
CHROMIUM_FLAGS+=(--high-dpi-support=1 --force-device-scale-factor="$UI_SCALE")
echo "MoodFlix : facteur d'interface ${UI_SCALE} (${SCREEN_WIDTH:-résolution non détectée}px)"

if [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
  CHROMIUM_FLAGS+=(--ozone-platform=wayland --enable-features=UseOzonePlatform)
fi

exec "$BROWSER_BIN" "${CHROMIUM_FLAGS[@]}" "$APP_URL"
