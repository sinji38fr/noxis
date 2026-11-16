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

Image publique : `shinji38fr/noxis:latest` et `shinji38fr/noxis:1.1.0`.

## URI configurable et reverse proxy

`PUBLIC_URL` définit l’adresse complète de l’application et `BASE_PATH` son éventuel préfixe. Exemple dans `.env` :

```dotenv
PUBLIC_URL=https://maison.example/noxis/
BASE_PATH=/noxis
```

Le préfixe peut aussi être déduit de `PUBLIC_URL`. Laisser les deux valeurs vides pour un accès direct à la racine. Les ressources, API, cookies, fichiers et flux utilisent tous ce préfixe. Avec un reverse proxy, **conserver le préfixe dans la requête transmise** : Noxis gère lui-même `/noxis/`. Le contrôle de santé Docker s’adapte au préfixe. Exemple Nginx :

```nginx
location /noxis/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_buffering off;
    proxy_read_timeout 2h;
}
```

Ne pas ajouter de `/` après le port de `proxy_pass`, afin de conserver le chemin. L’hôte de `PUBLIC_URL` est automatiquement autorisé ; les éventuels autres accès se configurent avec `ALLOWED_HOSTS`.

Le Compose fourni publie les ports uniquement sur la machine locale. Pour utiliser un autre PC du LAN, adapter les adresses de publication, `ALLOWED_HOSTS` et `FTP_PASV_ADDRESS` à l’adresse LAN du serveur Docker. Le navigateur n’a pas besoin de joindre directement le NVR : c’est le conteneur qui doit pouvoir atteindre son port HTTP et son port vidéo.

## Fonctionnalités

- **Direct** : jusqu’à quatre caméras simultanées pour identifier les canaux, H.264 ou H.265 décodé côté serveur, affichage JPEG à 5 images/s. Ce mode d’identification est sans audio. Les flux sont fermés en quittant la vue ou en masquant la page.
- **Archives** : date, horaires, canal, type d’événement, pagination et export CSV. « Tout ce jour » rassemble les résultats d’une journée.
- **Téléchargement de la sélection** : cocher les vidéos voulues puis « Télécharger la sélection (N) ». La case d’en-tête sélectionne uniquement la page affichée ; la sélection peut couvrir plusieurs pages. Aucun résultat non coché n’est ajouté à la file. Les MP4 sont préparés deux par deux, sans ZIP. Le navigateur propose un dossier lorsque cette fonction est disponible ; sinon, autoriser les téléchargements multiples. Garder la page ouverte pour l’enregistrement automatique des fichiers.
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
| `PUBLIC_URL` / `BASE_PATH` | URI publique complète et préfixe du reverse proxy, facultatifs |
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

Les filtres Archives permettent de cocher plusieurs caméras. Les exports utilisent des noms lisibles comme `Cam02_2026-10-31_19-00-00_19-10-25.mp4` (fuseau `TZ`). Après une sauvegarde automatique dans le dossier choisi, Noxis affiche « Enregistré dans le dossier ». `EXPORT_CONCURRENCY=1` limite par défaut les préparations simultanées à une ; ce réglage est configurable de 1 à 8 dans Compose.


## Intégration Monitoring et ARCADIA (1.2)

Noxis fournit maintenant une photo JPEG unique par canal, un catalogue de caméras avec noms partagés et un contrat OpenAPI sur `/openapi.json`. Le jeton `NOXIS_MONITOR_TOKEN`, distinct de `NOXIS_API_TOKEN`, ne permet que la lecture de l’état et du catalogue. Monitoring peut consulter la file sans ouvrir de flux ni solliciter le NVR. Les derniers contacts du NVR sont horodatés ; `/healthz` reste un test du processus seul.

Compose monte le volume `noxis-data` dans `/data`. Les préparations interrompues sont reprises depuis leur début après redémarrage et les fichiers prêts sont récupérés tant que le cache n’a pas expiré. Garder ce volume et les mêmes paramètres NVR lors des mises à jour. `NOXIS_DATA_VOLUME` permet de nommer un autre volume. Les noms donnés aux caméras sont enregistrés côté serveur et deviennent utilisables par ARCADIA.

ARCADIA est responsable des permissions par utilisateur et par caméra ; son navigateur ne reçoit pas le jeton Noxis. Les archives passent directement de Noxis à ARCADIA, sans relais vidéo dans Monitoring. Le direct Noxis reste une vue JPEG sans audio ; les relais RTSP natifs existants conservent leur rôle. Les routes et paramètres sont décrits dans [API.md](API.md).
