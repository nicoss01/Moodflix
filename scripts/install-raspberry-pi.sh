#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CURRENT_USER="$(id -un)"
TOTAL_STEPS=7
CURRENT_STEP=0
LOG_FILE="$(mktemp /tmp/moodflix-install.XXXXXX.log)"
INSTALL_OK=0

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  red=$'\033[38;5;197m'; white=$'\033[97m'; cyan=$'\033[38;5;45m'
  green=$'\033[38;5;82m'; dim=$'\033[2m'; bold=$'\033[1m'; reset=$'\033[0m'
else
  red=''; white=''; cyan=''; green=''; dim=''; bold=''; reset=''
fi

cleanup() { [[ "$INSTALL_OK" -eq 1 ]] && rm -f "$LOG_FILE"; }
trap cleanup EXIT
clear_screen() { if [[ -t 1 ]]; then printf '\033[2J\033[H'; fi; }
logo_line() { printf "  %b%s%b%s%b%s%b%s%b\n" "$bold$white" "$1" "$red" "$2" "$white" "$3" "$red" "$4" "$reset"; }
show_logo() {
  printf '\n'
  logo_line '███╗   ███╗' ' ██████╗  ██████╗ ' '██████╗ ███████╗██╗     ██╗██╗  ██╗' ''
  logo_line '████╗ ████║' '██╔═══██╗██╔═══██╗' '██╔══██╗██╔════╝██║     ██║╚██╗██╔╝' ''
  logo_line '██╔████╔██║' '██║   ██║██║   ██║' '██║  ██║█████╗  ██║     ██║ ╚███╔╝ ' ' ▶'
  logo_line '██║╚██╔╝██║' '██║   ██║██║   ██║' '██║  ██║██╔══╝  ██║     ██║ ██╔██╗ ' ''
  logo_line '██║ ╚═╝ ██║' '╚██████╔╝╚██████╔╝' '██████╔╝██║     ███████╗██║██╔╝ ██╗' ''
  logo_line '╚═╝     ╚═╝' ' ╚═════╝  ╚═════╝ ' '╚═════╝ ╚═╝     ╚══════╝╚═╝╚═╝  ╚═╝' ''
  printf "\n  %bINSTALLATION DU CENTRE MULTIMÉDIA%b\n\n" "$dim$cyan" "$reset"
}

draw_progress() {
  local done="$1" tick="$2" spinner="${3:-✓}" width=34 filled percent cursor span i bar=''
  filled=$((done * width / TOTAL_STEPS)); percent=$((done * 100 / TOTAL_STEPS)); span=$((width - filled))
  cursor=-1
  [[ "$span" -gt 0 && "$tick" -ge 0 ]] && cursor=$((filled + tick % span))
  for ((i=0; i<width; i++)); do
    if ((i < filled)); then bar+="${red}━"
    elif ((span > 0 && i == cursor)); then bar+="${cyan}●"
    else bar+="${dim}─"
    fi
  done
  printf "\r\033[2K  %3d%%  %b%b  %s%b" "$percent" "$bar" "$reset" "$spinner" "$reset"
}

fail() {
  printf "\n\n%b✗ Installation interrompue : %s%b\n" "$red$bold" "$1" "$reset" >&2
  printf "%bJournal détaillé conservé dans %s%b\n" "$dim" "$LOG_FILE" "$reset" >&2
  tail -n 30 "$LOG_FILE" >&2 || true
  exit 1
}

run_step() {
  local label="$1"; shift
  local step_label="Étape $((CURRENT_STEP + 1))/$TOTAL_STEPS · $label"
  local frames=('◐' '◓' '◑' '◒') frame=0 tick=0
  printf "\n  %b▶ %s%b\n" "$white$bold" "$step_label" "$reset"
  printf '\n--- %s ---\n' "$step_label" >>"$LOG_FILE"
  "$@" >>"$LOG_FILE" 2>&1 & local pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    draw_progress "$CURRENT_STEP" "$tick" "${frames[$frame]}"
    frame=$(((frame + 1) % ${#frames[@]})); tick=$((tick + 1)); sleep 0.12
  done
  if ! wait "$pid"; then fail "$label"; fi
  CURRENT_STEP=$((CURRENT_STEP + 1)); draw_progress "$CURRENT_STEP" -1 '✓'; printf '\n'
}

if [[ "${MOODFLIX_BOOTSTRAP:-0}" != 1 ]]; then clear_screen; show_logo; fi
printf "  %bInstallation légère · sans environnement de bureau%b\n\n" "$cyan" "$reset"
sudo -v || fail "autorisation administrateur refusée"

install_packages() {
  sudo env DEBIAN_FRONTEND=noninteractive apt-get update
  sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ffmpeg chromium cec-utils curl qbittorrent-nox build-essential python3 \
    xserver-xorg-core xserver-xorg-legacy xserver-xorg-input-libinput xinit openbox \
    x11-xserver-utils unclutter fonts-dejavu-core udisks2 udiskie dbus-x11
}

install_node() {
  if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(`.`)[0])')" -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
  fi
}

install_dependencies() { cd "$APP_DIR" && npm ci; }
build_application() { cd "$APP_DIR" && npm run build; }
prepare_storage() {
  mkdir -p "$APP_DIR/data"
  sudo mkdir -p /srv/media/downloads
  sudo chown -R "$CURRENT_USER:$CURRENT_USER" /srv/media
}

render_unit() {
  sed -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__USER__|$CURRENT_USER|g" -e "s|__HOME__|$HOME|g" "$1" | sudo tee "$2" >/dev/null
}

configure_services() {
  render_unit "$APP_DIR/systemd/moodflix.service" /etc/systemd/system/moodflix.service
  render_unit "$APP_DIR/systemd/moodflix-kiosk.service" /etc/systemd/system/moodflix-kiosk.service
  render_unit "$APP_DIR/systemd/moodflix-qbittorrent.service" /etc/systemd/system/moodflix-qbittorrent.service
  chmod +x "$APP_DIR/scripts/start-kiosk.sh"
  sudo usermod -aG video,render,input "$CURRENT_USER"
  printf 'allowed_users=anybody\nneeds_root_rights=yes\n' | sudo tee /etc/X11/Xwrapper.config >/dev/null
  sudo systemctl daemon-reload
}

enable_services() {
  sudo systemctl enable moodflix.service moodflix-kiosk.service moodflix-qbittorrent.service
  sudo systemctl restart moodflix.service
  sudo systemctl restart moodflix-qbittorrent.service
}

run_step 'Paquets multimédia et affichage minimal' install_packages
run_step 'Moteur Node.js' install_node
run_step 'Dépendances MoodFlix' install_dependencies
run_step 'Compilation de l’interface' build_application
run_step 'Bibliothèque et stockage' prepare_storage
run_step 'Configuration des services' configure_services
run_step 'Activation au démarrage' enable_services

INSTALL_OK=1
rm -f "$LOG_FILE"
ip_address="$(hostname -I | awk '{print $1}')"
printf '\n'
printf "  %b╭────────────────────────────────────────────────────────╮%b\n" "$green$bold" "$reset"
printf "  %b│  ✓ MoodFlix est installé et prêt à démarrer           │%b\n" "$green$bold" "$reset"
printf "  %b╰────────────────────────────────────────────────────────╯%b\n" "$green$bold" "$reset"
printf "\n  Configuration mobile : %bhttp://%s:4242/settings%b\n" "$cyan" "$ip_address" "$reset"
printf "  Dernière étape       : %bsudo reboot%b\n\n" "$white$bold" "$reset"
