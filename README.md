# MoodFlix

MoodFlix est un media center personnel conçu pour Raspberry Pi et l’usage sur téléviseur. Son interface plein écran reprend les maquettes fournies : bleu nuit, accent rouge, navigation à grandes cibles et focus très visible.

## Fonctions disponibles

- profils, classification d’âge et notes individuelles ;
- proposition « On regarde quoi ce soir ? » selon les participants, la durée et le type ;
- découverte des films et épisodes sur les dossiers locaux et disques montés ;
- reprise de lecture, lecteur plein écran et contrôles télécommande ;
- recherche via une API Torznab compatible Prowlarr ou Jackett ;
- téléchargement et suivi via qBittorrent (progression, seeds, estimation, partage) ;
- page de réglages locale et QR code pour l’ouvrir depuis un téléphone ;
- lancement automatique en mode kiosque et pont HDMI-CEC sur Raspberry Pi.

MoodFlix ne fournit aucun contenu ni indexeur. Configurez uniquement des sources et utilisez uniquement des fichiers que vous êtes autorisé à télécharger et à consulter.

## Essai sur PC

Prérequis : Node.js 20 ou plus récent et FFmpeg/ffprobe.

```bash
npm install
npm run dev
```

Ouvrez `http://localhost:5173`. La base SQLite est créée dans `data/`. Les cartes de démonstration permettent de tester tout le parcours sans fichier média.

## Installation Raspberry Pi

Raspberry Pi 4 (4 Go minimum) ou Pi 5 recommandé, avec Raspberry Pi OS 64 bits et environnement de bureau :

```bash
git clone <adresse-du-depot> moodflix
cd moodflix
chmod +x scripts/install-raspberry-pi.sh
./scripts/install-raspberry-pi.sh
sudo reboot
```

Au redémarrage, Chromium s’ouvre en plein écran. Le serveur tourne comme service utilisateur. Les touches CEC directionnelles, validation, retour, lecture et pause sont converties en touches clavier par `cec-client`.

## Configuration

Depuis l’écran Paramètres, scannez le QR code puis renseignez :

- `MEDIA_DIRS` : dossiers séparés par des virgules, par exemple `/srv/media,/media,/mnt` ;
- l’adresse et les identifiants de l’interface Web qBittorrent ;
- l’URL Newznab/Torznab et la clé de Prowlarr ou Jackett ;
- éventuellement une clé TMDB pour l’enrichissement ultérieur des métadonnées.

Les périphériques USB montés sous `/media` ou `/mnt` sont inclus au prochain scan. Raspberry Pi OS monte automatiquement les supports amovibles dans une session de bureau.

## Commandes utiles

```bash
npm run check       # TypeScript et tests
npm run build       # version de production
systemctl --user status moodflix
journalctl --user -u moodflix -f
```

## Architecture

- `src/` — interface React responsive et navigation spatiale clavier/CEC ;
- `server/` — API Express, SQLite, scan média, streaming, Torznab et qBittorrent ;
- `scripts/` — installation Pi et lancement du kiosque ;
- `systemd/` — service de démarrage automatique.

Pour une lecture directe maximale, privilégiez H.264/H.265 dans MP4. Les MKV et pistes audio non prises en charge par Chromium nécessiteront, dans une prochaine étape, un moteur libmpv ou un transcodage FFmpeg.
