#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${MOODFLIX_REPO_URL:-https://github.com/nicoss01/Moodflix.git}"
BRANCH="${MOODFLIX_BRANCH:-main}"
INSTALL_DIR="${MOODFLIX_INSTALL_DIR:-/opt/moodflix}"

red='\033[0;31m'
green='\033[0;32m'
cyan='\033[0;36m'
reset='\033[0m'

fail() {
  printf "${red}Erreur : %s${reset}\n" "$1" >&2
  exit 1
}

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Installation de MoodFlix depuis GitHub

Usage :
  curl -fsSL https://raw.githubusercontent.com/nicoss01/Moodflix/main/install.sh | bash

Variables facultatives :
  MOODFLIX_BRANCH       branche à installer (défaut : main)
  MOODFLIX_INSTALL_DIR  dossier d'installation (défaut : /opt/moodflix)
  MOODFLIX_REPO_URL     dépôt Git alternatif
EOF
  exit 0
fi

[[ "$(id -u)" -ne 0 ]] || fail "lancez cette commande sans sudo ; le script demandera sudo uniquement lorsque nécessaire."
command -v sudo >/dev/null 2>&1 || fail "sudo est nécessaire."

if [[ -r /etc/os-release ]]; then
  . /etc/os-release
  case "${ID:-}" in
    raspbian|debian) ;;
    *) printf "${cyan}Attention : Raspberry Pi OS Lite 64 bits est la plateforme recommandée (système détecté : %s).${reset}\n" "${PRETTY_NAME:-inconnu}" ;;
  esac
fi

if [[ -r /proc/device-tree/model ]] && ! tr -d '\0' < /proc/device-tree/model | grep -qi 'raspberry pi'; then
  printf "${cyan}Attention : le matériel détecté ne semble pas être un Raspberry Pi.${reset}\n"
fi

printf "${cyan}Préparation du téléchargement…${reset}\n"
sudo apt-get update
sudo apt-get install -y --no-install-recommends git ca-certificates curl

target_parent="$(dirname "$INSTALL_DIR")"
sudo install -d -m 0755 "$target_parent"

if [[ -e "$INSTALL_DIR" && ! -d "$INSTALL_DIR/.git" ]]; then
  if [[ -n "$(find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
    fail "$INSTALL_DIR existe déjà et n'est pas un dépôt MoodFlix."
  fi
fi

if [[ ! -d "$INSTALL_DIR/.git" ]]; then
  sudo install -d -o "$(id -un)" -g "$(id -gn)" "$INSTALL_DIR"
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$INSTALL_DIR"
else
  current_remote="$(git -C "$INSTALL_DIR" remote get-url origin 2>/dev/null || true)"
  [[ "$current_remote" == "$REPO_URL" ]] || fail "$INSTALL_DIR utilise un autre dépôt Git : $current_remote"
  if [[ -n "$(git -C "$INSTALL_DIR" status --porcelain --untracked-files=no)" ]]; then
    fail "des modifications locales sont présentes dans $INSTALL_DIR ; conservez-les ou annulez-les avant la mise à jour."
  fi
  printf "${cyan}Mise à jour de l'installation existante…${reset}\n"
  git -C "$INSTALL_DIR" fetch --prune origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" merge --ff-only "origin/$BRANCH"
fi

chmod +x "$INSTALL_DIR/scripts/install-raspberry-pi.sh" "$INSTALL_DIR/scripts/start-kiosk.sh"
printf "${green}Dépôt MoodFlix prêt. Lancement de l'installation système…${reset}\n"
exec "$INSTALL_DIR/scripts/install-raspberry-pi.sh"
