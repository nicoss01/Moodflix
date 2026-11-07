#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${MOODFLIX_REPO_URL:-https://github.com/nicoss01/Moodflix.git}"
BRANCH="${MOODFLIX_BRANCH:-main}"
INSTALL_DIR="${MOODFLIX_INSTALL_DIR:-/opt/moodflix}"
TOTAL_STEPS=3
CURRENT_STEP=0
LOG_FILE="$(mktemp /tmp/moodflix-bootstrap.XXXXXX.log)"
INSTALL_OK=0
RESET_INSTALL=0
PREVIEW=0

while (($#)); do
  case "$1" in
    --reset|--reset-settings) RESET_INSTALL=1 ;;
    --preview) PREVIEW=1 ;;
    --help|-h)
      echo 'Installation : curl -fsSL https://raw.githubusercontent.com/nicoss01/Moodflix/main/install.sh | bash'
      echo 'Remise à zéro: curl -fsSL https://raw.githubusercontent.com/nicoss01/Moodflix/main/install.sh | bash -s -- --reset'
      echo 'Aperçu      : bash install.sh --preview'
      rm -f "$LOG_FILE"
      exit 0
      ;;
    *) echo "Option inconnue : $1" >&2; rm -f "$LOG_FILE"; exit 2 ;;
  esac
  shift
done

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
  printf "\n  %bCENTRE MULTIMÉDIA PERSONNEL · RASPBERRY PI%b\n\n" "$dim$cyan" "$reset"
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
  printf "\n\n%b✗ Erreur : %s%b\n" "$red$bold" "$1" "$reset" >&2
  printf "%bJournal détaillé : %s%b\n" "$dim" "$LOG_FILE" "$reset" >&2
  tail -n 25 "$LOG_FILE" >&2 || true
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

if [[ "$PREVIEW" -eq 1 ]]; then
  clear_screen
  show_logo
  run_step 'Outils de téléchargement' sleep 0.35
  run_step 'Récupération de MoodFlix sur GitHub' sleep 0.35
  run_step 'Préparation de l’installation système' sleep 0.35
  INSTALL_OK=1
  exit 0
fi

clear_screen
show_logo
if [[ "$RESET_INSTALL" -eq 1 ]]; then
  printf "  %bMode remise à zéro : réglages, profils et cache seront recréés.%b\n" "$red$bold" "$reset"
  printf "  %bLes médias et téléchargements ne seront pas supprimés.%b\n\n" "$cyan" "$reset"
fi
[[ "$(id -u)" -ne 0 ]] || fail "lancez cette commande sans sudo ; le script demandera sudo au bon moment."
command -v sudo >/dev/null 2>&1 || fail "sudo est nécessaire."
printf "  %bMot de passe administrateur requis pour préparer le Raspberry Pi.%b\n" "$cyan" "$reset"
sudo -v || fail "autorisation administrateur refusée"

prepare_tools() {
  sudo env DEBIAN_FRONTEND=noninteractive apt-get update
  sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git ca-certificates curl
}

sync_repository() {
  local target_parent current_remote
  target_parent="$(dirname "$INSTALL_DIR")"
  sudo install -d -m 0755 "$target_parent"
  if [[ -e "$INSTALL_DIR" && ! -d "$INSTALL_DIR/.git" ]] && [[ -n "$(find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
    echo "$INSTALL_DIR existe déjà et n'est pas un dépôt MoodFlix" >&2; return 1
  fi
  if [[ ! -d "$INSTALL_DIR/.git" ]]; then
    sudo install -d -o "$(id -un)" -g "$(id -gn)" "$INSTALL_DIR"
    git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$INSTALL_DIR"
  else
    current_remote="$(git -C "$INSTALL_DIR" remote get-url origin 2>/dev/null || true)"
    [[ "$current_remote" == "$REPO_URL" ]] || { echo "Dépôt inattendu : $current_remote" >&2; return 1; }
    git -C "$INSTALL_DIR" config core.fileMode false
    [[ -z "$(git -C "$INSTALL_DIR" status --porcelain --untracked-files=no)" ]] || { echo "Modifications locales présentes" >&2; return 1; }
    git -C "$INSTALL_DIR" fetch --prune origin "$BRANCH"
    git -C "$INSTALL_DIR" checkout "$BRANCH"
    git -C "$INSTALL_DIR" merge --ff-only "origin/$BRANCH"
  fi
}

run_step 'Outils de téléchargement' prepare_tools
run_step 'Récupération de MoodFlix sur GitHub' sync_repository
run_step 'Préparation de l’installation système' chmod +x "$INSTALL_DIR/scripts/install-raspberry-pi.sh" "$INSTALL_DIR/scripts/start-kiosk.sh"

INSTALL_OK=1
rm -f "$LOG_FILE"
export MOODFLIX_BOOTSTRAP=1
if [[ "$RESET_INSTALL" -eq 1 ]]; then
  exec "$INSTALL_DIR/scripts/install-raspberry-pi.sh" --reset
fi
exec "$INSTALL_DIR/scripts/install-raspberry-pi.sh"
