#!/usr/bin/env bash
set -euo pipefail

APP_URL="${MOODFLIX_URL:-http://127.0.0.1:4242}"
export XCURSOR_THEME="${XCURSOR_THEME:-MoodFlixInvisible}"
export XCURSOR_SIZE="${XCURSOR_SIZE:-1}"

if [[ -z "${WAYLAND_DISPLAY:-}" ]]; then
  xset s off
  xset -dpms
  xset s noblank
  openbox-session &
  unclutter -idle 0 -root &
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
  --hide-scrollbars
  --overscroll-history-navigation=0
  --autoplay-policy=no-user-gesture-required
  --user-data-dir="$HOME/.config/moodflix-chromium"
)

# Cage/Wayland doit toujours recevoir une surface Chromium à la résolution native.
# Un facteur supérieur à 1 réduit la surface du navigateur (quart d'écran en 4K).
# L'agrandissement 1440p/4K est donc géré par les media queries de l'interface.
CHROMIUM_FLAGS+=(--high-dpi-support=1 --force-device-scale-factor=1)

if [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
  CHROMIUM_FLAGS+=(--ozone-platform=wayland --enable-features=UseOzonePlatform)
fi

exec "$BROWSER_BIN" "${CHROMIUM_FLAGS[@]}" "$APP_URL"
