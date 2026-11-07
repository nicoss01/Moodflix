#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CURRENT_USER="$(id -un)"
RESET_INSTALL=0
while (($#)); do
  case "$1" in
    --reset|--reset-settings) RESET_INSTALL=1 ;;
    --help|-h)
      echo 'Usage : scripts/install-raspberry-pi.sh [--reset]'
      echo '  --reset  Efface les réglages, profils, historique et cache sans supprimer les médias.'
      exit 0
      ;;
    *) echo "Option inconnue : $1" >&2; exit 2 ;;
  esac
  shift
done
TOTAL_STEPS=$((7 + RESET_INSTALL))
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
if [[ "$RESET_INSTALL" -eq 1 ]]; then
  printf "  %bRemise à zéro demandée · les médias et téléchargements sont conservés%b\n\n" "$red$bold" "$reset"
fi
sudo -v || fail "autorisation administrateur refusée"

install_packages() {
  sudo env DEBIAN_FRONTEND=noninteractive apt-get update
  sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ffmpeg chromium cec-utils curl qbittorrent-nox build-essential python3 \
    cage seatd fonts-dejavu-core udisks2 udiskie dbus-x11 unclutter-xfixes x11-apps
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

install_invisible_cursor() {
  local work theme cursor name
  work="$(mktemp -d /tmp/moodflix-cursor.XXXXXX)"
  theme="/usr/share/icons/MoodFlixInvisible"
  cursor="$work/left_ptr"
  ffmpeg -loglevel error -f lavfi -i 'color=c=black@0.0:s=32x32,format=rgba' -frames:v 1 -y "$work/transparent.png"
  printf '32 0 0 transparent.png\n' > "$work/cursor.cfg"
  xcursorgen -p "$work" "$work/cursor.cfg" "$cursor"
  sudo install -d -m 0755 "$theme/cursors"
  sudo install -m 0644 "$cursor" "$theme/cursors/left_ptr"
  for name in default arrow top_left_arrow hand1 hand2 pointer text xterm watch wait progress crosshair move not-allowed ew-resize ns-resize nesw-resize nwse-resize; do
    sudo ln -sfn left_ptr "$theme/cursors/$name"
  done
  printf '[Icon Theme]\nName=MoodFlix Invisible\nComment=Curseur transparent pour le kiosque TV\n' | sudo tee "$theme/index.theme" >/dev/null
  if [[ "$work" == /tmp/moodflix-cursor.* ]]; then rm -rf -- "$work"; fi
}

reset_configuration() {
  sudo systemctl stop moodflix-kiosk.service moodflix.service moodflix-qbittorrent.service 2>/dev/null || true
  rm -f "$APP_DIR/data/moodflix.db" "$APP_DIR/data/moodflix.db-shm" "$APP_DIR/data/moodflix.db-wal"
  rm -rf "$APP_DIR/data/artwork"
  rm -f "$HOME/.config/qBittorrent/qBittorrent.conf"
  rm -rf "$HOME/.cache/qBittorrent"
}

render_unit() {
  sed -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__USER__|$CURRENT_USER|g" -e "s|__HOME__|$HOME|g" -e "s|__UID__|$(id -u)|g" "$1" | sudo tee "$2" >/dev/null
}

configure_services() {
  render_unit "$APP_DIR/systemd/moodflix.service" /etc/systemd/system/moodflix.service
  render_unit "$APP_DIR/systemd/moodflix-kiosk.service" /etc/systemd/system/moodflix-kiosk.service
  render_unit "$APP_DIR/systemd/moodflix-qbittorrent.service" /etc/systemd/system/moodflix-qbittorrent.service
  chmod +x "$APP_DIR/scripts/start-kiosk.sh"
  sudo usermod -aG video,render,input,audio "$CURRENT_USER"
  printf '%s ALL=(root) NOPASSWD: /usr/bin/systemctl reboot\n' "$CURRENT_USER" | sudo tee /etc/sudoers.d/moodflix-reboot >/dev/null
  sudo chmod 0440 /etc/sudoers.d/moodflix-reboot
  sudo visudo -cf /etc/sudoers.d/moodflix-reboot
  # Cage affiche un curseur dès qu'un périphérique est classé comme pointeur.
  # Les contrôleurs HDMI du Raspberry Pi déclarent parfois cette capacité à tort.
  sudo tee /etc/udev/rules.d/99-moodflix-no-pointer.rules >/dev/null <<'EOF'
ACTION!="remove", KERNEL=="event[0-9]*", ENV{ID_INPUT_MOUSE}="", ENV{ID_INPUT_TOUCHPAD}="", ENV{ID_INPUT_POINTINGSTICK}=""
EOF
  sudo udevadm control --reload-rules
  sudo udevadm trigger --subsystem-match=input
  sudo systemctl daemon-reload
  sudo systemctl reset-failed moodflix-kiosk.service || true
}

save_qbittorrent_settings() {
  local password="$1"
  (cd "$APP_DIR" && MOODFLIX_DB_PATH="$APP_DIR/data/moodflix.db" MOODFLIX_QBIT_PASSWORD="$password" node --input-type=module -e '
    import Database from "better-sqlite3";
    const db=new Database(process.env.MOODFLIX_DB_PATH);
    db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    const save=db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
    save.run("QBITTORRENT_URL","http://127.0.0.1:8080");
    save.run("QBITTORRENT_USER","admin");
    save.run("QBITTORRENT_PASSWORD",process.env.MOODFLIX_QBIT_PASSWORD||"");
    db.close();
  ')
}

read_saved_qbittorrent_password() {
  [[ -f "$APP_DIR/data/moodflix.db" ]] || return 0
  (cd "$APP_DIR" && MOODFLIX_DB_PATH="$APP_DIR/data/moodflix.db" node --input-type=module -e '
    import Database from "better-sqlite3";
    const db=new Database(process.env.MOODFLIX_DB_PATH,{readonly:true});
    try{process.stdout.write(db.prepare("SELECT value FROM settings WHERE key=?").get("QBITTORRENT_PASSWORD")?.value||"")}catch{}
    db.close();
  ') 2>/dev/null || true
}

configure_qbittorrent_credentials() {
  local password started_at response cookie_file preferences config_file
  password="$(read_saved_qbittorrent_password)"
  if [[ -n "$password" ]]; then
    save_qbittorrent_settings "$password"
    return 0
  fi

  # On ne réinitialise que le secret WebUI : les torrents existants restent intacts.
  sudo systemctl stop moodflix-qbittorrent.service || true
  config_file="$HOME/.config/qBittorrent/qBittorrent.conf"
  if [[ -f "$config_file" ]]; then
    sed -i '/^WebUI\\Password_/d;/^WebUI\\Username=/d' "$config_file"
  fi
  started_at="$(date --iso-8601=seconds)"
  sudo systemctl start moodflix-qbittorrent.service
  for _ in $(seq 1 30); do
    password="$(sudo journalctl -u moodflix-qbittorrent.service --since "$started_at" --no-pager 2>/dev/null | sed -nE 's/.*temporary password is provided for this session: (.*)$/\1/Ip' | tail -n 1 | tr -d '\r' || true)"
    [[ -n "$password" ]] && break
    sleep 1
  done
  [[ -n "$password" ]] || { echo 'Mot de passe temporaire qBittorrent introuvable dans le journal du service.' >&2; return 1; }

  cookie_file="$(mktemp /tmp/moodflix-qbit-cookie.XXXXXX)"
  response="$(curl -sS -c "$cookie_file" -H 'Referer: http://127.0.0.1:8080/' \
    --data-urlencode 'username=admin' --data-urlencode "password=$password" \
    http://127.0.0.1:8080/api/v2/auth/login)"
  if [[ "$response" != 'Ok.' ]]; then rm -f "$cookie_file"; echo 'qBittorrent a refusé son mot de passe temporaire.' >&2; return 1; fi
  preferences="$(MOODFLIX_QBIT_PASSWORD="$password" node -e 'process.stdout.write(JSON.stringify({web_ui_username:"admin",web_ui_password:process.env.MOODFLIX_QBIT_PASSWORD}))')"
  curl -fsS -b "$cookie_file" -H 'Referer: http://127.0.0.1:8080/' \
    --data-urlencode "json=$preferences" http://127.0.0.1:8080/api/v2/app/setPreferences >/dev/null
  rm -f "$cookie_file"
  save_qbittorrent_settings "$password"
}

enable_services() {
  sudo systemctl enable moodflix.service moodflix-kiosk.service moodflix-qbittorrent.service
  sudo systemctl restart moodflix-qbittorrent.service
  configure_qbittorrent_credentials
  sudo systemctl restart moodflix.service
}

run_step 'Paquets multimédia et affichage minimal' install_packages
run_step 'Moteur Node.js' install_node
run_step 'Dépendances MoodFlix' install_dependencies
run_step 'Compilation de l’interface' build_application
run_step 'Bibliothèque et stockage' prepare_storage
run_step 'Curseur invisible du kiosque' install_invisible_cursor
if [[ "$RESET_INSTALL" -eq 1 ]]; then run_step 'Remise à zéro des réglages' reset_configuration; fi
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
