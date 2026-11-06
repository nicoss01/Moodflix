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
- vérification des nouveaux commits GitHub et mise à jour confirmée depuis les paramètres ;
- lancement automatique en mode kiosque et pont HDMI-CEC sur Raspberry Pi.

MoodFlix ne fournit aucun contenu ni indexeur. Configurez uniquement des sources et utilisez uniquement des fichiers que vous êtes autorisé à télécharger et à consulter.

## Essai sur PC

Prérequis : Node.js 20 ou plus récent et FFmpeg/ffprobe.

```bash
npm install
npm run dev
```

Ouvrez `http://localhost:5173`. La base SQLite est créée dans `data/`. Les cartes de démonstration permettent de tester tout le parcours sans fichier média.

## Installation Raspberry Pi sans bureau

Raspberry Pi 4 (4 Go minimum) ou Pi 5 recommandé, avec **Raspberry Pi OS Lite 64 bits**. Aucun Ubuntu Desktop, Raspberry Pi Desktop, GNOME, KDE ou XFCE n'est nécessaire. L'installation ajoute seulement Cage, un compositeur Wayland kiosque, et Chromium pour afficher MoodFlix en plein écran.

```bash
curl -fsSL https://raw.githubusercontent.com/nicoss01/Moodflix/main/install.sh | bash
sudo reboot
```

La commande doit être lancée avec l'utilisateur normal créé par Raspberry Pi Imager, sans `sudo`. Le script demande lui-même les droits administrateur lorsque nécessaire, installe le dépôt dans `/opt/moodflix`, puis configure tous les services. Relancer la même commande met MoodFlix à jour par avance rapide Git avant de rejouer l'installation.

L'assistant affiche le logo MoodFlix en ASCII coloré, une barre de progression animée et le détail des étapes GitHub, système, compilation et services. Les sorties techniques sont écrites dans un journal temporaire ; en cas d'échec, son chemin et ses dernières lignes sont affichés automatiquement pour faciliter le diagnostic.

Pour inspecter le script avant de l'exécuter :

```bash
curl -fsSL https://raw.githubusercontent.com/nicoss01/Moodflix/main/install.sh -o install-moodflix.sh
less install-moodflix.sh
bash install-moodflix.sh
```

Au redémarrage, trois services système démarrent automatiquement : l'API MoodFlix, qBittorrent en arrière-plan, puis Cage qui remplace la console `tty1` par Chromium en plein écran. Le pont `cec-client` tourne dans l'API et transmet directement les touches HDMI-CEC au navigateur, sans dépendre d'une session graphique de bureau.

Le script prend également en charge Debian 13 sans bureau. Wayland détecte automatiquement le contrôleur HDMI des Raspberry Pi 4 et 5, sans dépendre de l'ordre des cartes DRM utilisé par Xorg. Si un écran texte ou noir reste visible après une ancienne installation, relancez simplement la commande `curl` d'installation puis redémarrez.

## Configuration

Depuis l’écran Paramètres, scannez le QR code puis renseignez :

- `MEDIA_DIRS` : dossiers séparés par des virgules, par exemple `/srv/media,/media,/mnt` ;
- l’adresse et les identifiants de l’interface Web qBittorrent ;
- l’URL API Newznab/Torznab complète et la clé de votre indexeur (l’URL doit renvoyer du XML, pas la page d’accueil du site) ;
- une clé OMDb pour récupérer automatiquement le titre, le résumé, les genres, la classification et l’affiche lors de l’analyse de la bibliothèque ;
- éventuellement une clé TMDB pour un enrichissement complémentaire ultérieur.

Les boutons **Tester** des réglages contrôlent les connexions Torznab et OMDb avant l’enregistrement. Sur l’écran Torrent, la recherche peut être saisie avec le clavier virtuel ou depuis un téléphone en scannant le QR code ; la requête est alors transmise immédiatement à la télévision.

Sur Raspberry Pi OS Lite, UDisks et udiskie assurent l'automontage léger des périphériques USB sous `/media`. MoodFlix rescane automatiquement les dossiers configurés toutes les 30 secondes.

## Commandes utiles

```bash
npm run check       # TypeScript et tests
npm run build       # version de production
sudo systemctl status moodflix moodflix-kiosk moodflix-qbittorrent
sudo journalctl -u moodflix -u moodflix-kiosk -u moodflix-qbittorrent -f
```

## Mises à jour

Dans **Paramètres → Mises à jour**, utilisez **Vérifier**. MoodFlix récupère les références de `origin/main`, compare le commit installé au dernier commit GitHub et affiche la liste des changements. Aucune installation ne démarre sans une seconde confirmation explicite.

La mise à jour automatique exige un historique en avance rapide et un dépôt local sans modification. Après confirmation, MoodFlix exécute la mise à jour Git, réinstalle les dépendances, reconstruit l'interface puis redémarre son service. Une mise à jour divergente ou une erreur de compilation laisse un message d'erreur dans les paramètres au lieu de forcer le redémarrage.

## Architecture

- `src/` — interface React responsive et navigation spatiale clavier/CEC ;
- `server/` — API Express, SQLite, scan média, streaming, Torznab et qBittorrent ;
- `scripts/` — installation Lite et lancement du kiosque minimal ;
- `systemd/` — services de l'API et de l'affichage TV sans bureau.

Pour une lecture directe maximale, privilégiez H.264/H.265 dans MP4. Les MKV et pistes audio non prises en charge par Chromium nécessiteront, dans une prochaine étape, un moteur libmpv ou un transcodage FFmpeg.
