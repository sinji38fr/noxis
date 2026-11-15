# Noxis

**Vos caméras. Vos archives.** · [English](README.en.md)

Application locale pour les NVR compatibles avec les interfaces NetSDK/KP2P implémentées ici. Mosaïque en direct, noms de caméras personnalisables, recherche des archives, lecture dans le navigateur, export MP4 H.264/H.265 avec audio, API et FTP virtuel en lecture seule.

## Démarrage Docker

```sh
cp .env.example .env
# Renseigner NVR_HOST, NVR_USERNAME, NVR_PASSWORD et FTP_PASSWORD dans .env.
docker compose up -d
```

Ouvrir **http://localhost:8787**. L’adresse du NVR et ses identifiants sont fournis par Compose : aucun écran de connexion n’est affiché quand ils sont configurés. L’image ne contient ni adresse réelle ni identifiant de NVR. Ne pas committer `.env`.

Image publique : `shinji38fr/noxis:latest` et `shinji38fr/noxis:1.0.0`.

Le Compose fourni publie les ports uniquement sur la machine locale. Pour utiliser un autre PC du LAN, adapter les adresses de publication, `ALLOWED_HOSTS` et `FTP_PASV_ADDRESS` à l’adresse LAN du serveur Docker. Le navigateur n’a pas besoin de joindre directement le NVR : c’est le conteneur qui doit pouvoir atteindre son port HTTP et son port vidéo.

## Fonctionnalités

- **Direct** : jusqu’à quatre caméras simultanées pour identifier les canaux, H.264 ou H.265 décodé côté serveur, affichage JPEG à 5 images/s. Ce mode d’identification est sans audio. Les flux sont fermés en quittant la vue ou en masquant la page.
- **Archives** : date, horaires, canal, type d’événement, pagination et export CSV. « Tout ce jour » rassemble les résultats d’une journée.
- **MP4** : les images H.264/H.265 sont copiées sans réencodage pour le téléchargement. L’audio G711A/G711U 8 kHz mono est converti en AAC. La lecture navigateur propose un extrait ; H.265 est alors converti en H.264 pour la compatibilité.
- **Téléchargements** : tâches avec progression, annulation et cache temporaire. Deux préparations simultanées, au plus une heure ou 1 Go de vidéo par extrait. Un export peut prendre approximativement la durée de lecture demandée ; sa progression reste visible. Le cache est supprimé après 30 minutes d’inactivité ou à l’arrêt du conteneur.
- **Informations** : consultation du NVR, sans modification de configuration.
- **Français/anglais** : sélecteur de langue ; langue et noms des caméras mémorisés uniquement dans le navigateur.

Les horaires sont affichés dans le fuseau du navigateur ; `TZ` règle le fuseau du service et les noms FTP. Le protocole du constructeur et le firmware peuvent avoir des conventions d’horaires différentes : comparer une plage connue avec l’interface d’origine avant une collecte importante.

## FTP virtuel : 30 jours, zéro scan initial

`ARCHIVE_DAYS=30` génère **30 dates virtuelles**, aujourd’hui compris, sans contacter le NVR. Chaque date est un seul dossier contenant les fichiers de **toutes les caméras** :

```text
/2026-01-31/
  Cam01_19-00-00_19-10-25_a1b2c3d4.mp4
  Cam02_19-03-12_19-08-40_b2c3d4e5.mp4
```

La liste des vidéos est demandée au NVR seulement quand un client ouvre un jour. Le MP4 est préparé lors du téléchargement, sans recopier tout le disque. Les identifiants FTP sont distincts de ceux du NVR. Aucun accès root, SSH, suppression, renommage ou téléversement sur le NVR.

Une plage de plus d’une heure est présentée en plusieurs fichiers consécutifs dont les noms indiquent leurs horaires réels ; aucune fin d’enregistrement n’est silencieusement supprimée.

Connexion FileZilla : protocole FTP, hôte du serveur Docker, port **2121**, mode passif, `FTP_USERNAME` et `FTP_PASSWORD`. Régler le délai d’inactivité suffisamment haut pour la préparation de longues archives. Les ports passifs **50000–50009** doivent être publiés. FTP est destiné au réseau local de confiance ; FTPS explicite est disponible avec `FTP_TLS_CERT` et `FTP_TLS_KEY` montés dans le conteneur.

Les fichiers virtuels annoncent une taille nulle avant leur génération : la taille finale dépend du MP4 et le serveur n’effectue aucun export pour répondre à un listing. La commande `SIZE` et la reprise partielle sont désactivées. Pour copier seulement les fichiers absents avec lftp :

```text
open -u noxis ftp://localhost:2121
# Saisir le mot de passe à l’invite, pas dans l’URL.
set net:timeout 2h
set net:max-retries 1
mirror --only-missing --parallel=1 --no-perms /2026-01-31 ./archives/2026-01-31
```

`--only-missing` conserve les fichiers déjà présents. N’utiliser ni `--delete`, ni `--continue`, ni les transferts segmentés sur les fichiers virtuels. Le comportement est incrémental par fichier, sans comparaison de blocs de type rsync. [Manuel lftp](https://lftp.yar.ru/lftp-man.html).

## Configuration

| Variable | Rôle |
|---|---|
| `NVR_HOST` | IP ou nom du NVR, fourni dans Compose |
| `NVR_HTTP_PORT` / `NVR_VIDEO_PORT` | Ports HTTP et WebSocket, défaut 80 / 10000 |
| `NVR_USERNAME` / `NVR_PASSWORD` | Identifiants injectés au conteneur, jamais renvoyés au navigateur |
| `NVR_PASSWORD_FILE` | Alternative : chemin vers un secret Docker ; prioritaire sur `NVR_PASSWORD` |
| `ARCHIVE_DAYS` | Nombre de dates virtuelles, de 1 à 3660 ; défaut 30 |
| `NVR_CHANNELS` | Nombre de canaux interrogés/affichés ; défaut 4, optionnel pour une installation à 4 caméras |
| `FTP_ENABLED` | Active le FTP si `true` |
| `FTP_USERNAME` / `FTP_PASSWORD` | Compte FTP local séparé |
| `FTP_PASSWORD_FILE` | Alternative par secret Docker |
| `FTP_PASV_ADDRESS` | Adresse du serveur Docker annoncée au client FTP |
| `FTP_PASV_MIN` / `FTP_PASV_MAX` | Plage passive, défaut 50000–50009 ; adapter aussi les ports Compose |
| `NOXIS_API_TOKEN` | Jeton facultatif pour les clients API externes |
| `ALLOWED_HOSTS` | Noms/IP autorisés dans les requêtes HTTP à Noxis, séparés par des virgules |
| `TZ` | Fuseau du service, exemple Europe/Paris |

Pour un secret Docker, remplacer la ligne `NVR_PASSWORD` de Compose par `NVR_PASSWORD_FILE: /run/secrets/nvr_password`, déclarer le secret et le monter au service. Le fichier du secret doit rester hors du dépôt. Les credentials sont traités en mémoire ; les fichiers temporaires ne contiennent que les médias préparés.

## API et développement

Voir [API.md](API.md). Les appels du navigateur utilisent une session HTTP-only et une vérification d’origine. Les clients externes utilisent `Authorization: Bearer <NOXIS_API_TOKEN>` avec les identifiants NVR configurés côté service.

Avec Node.js 22+, FFmpeg et npm :

```sh
npm ci
npm test
npm start
```

Le serveur local écoute sur 127.0.0.1 ; Docker utilise 0.0.0.0 à l’intérieur du conteneur. `FFMPEG_PATH` peut désigner un exécutable FFmpeg installé. Aucun fichier du client propriétaire n’est requis au fonctionnement.

Noxis a une couche de protocole dédiée. La compatibilité n’est pas garantie avec tous les NVR, et aucune découverte ou commande de configuration destructive n’est implémentée. Les images privées, identifiants et captures de validation ne font pas partie du dépôt ni de l’image publique.

## Licence

Code Noxis : MIT. FFmpeg et les dépendances conservent leurs licences respectives ; FFmpeg est invoqué comme processus séparé. Sources : [FFmpeg](https://ffmpeg.org/), [ftp-srv](https://github.com/QuorumDMS/ftp-srv).
