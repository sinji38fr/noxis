# Noxis API / API Noxis

Base URL: `http://localhost:8787`. JSON uses stable English field names.

With `BASE_PATH=/noxis`, the base URL is `http://localhost:8787/noxis`; every route below is relative to it. / Avec un préfixe configuré, ajouter celui-ci à toutes les routes.

For external clients, configure `NOXIS_API_TOKEN` and send `Authorization: Bearer YOUR_TOKEN`. NVR credentials stay in Docker. Browser requests instead use an HTTP-only session cookie; state-changing requests must send the exact `Origin` and `X-Noxis-Client: 1` headers. No CORS access is enabled.

Pour un client externe, configurer `NOXIS_API_TOKEN` puis transmettre ce jeton dans l’en-tête Bearer. Les identifiants du NVR ne figurent ni dans les URL ni dans les réponses.

| Method | Path | Result / Résultat |
|---|---|---|
| GET | `/healthz` | Application health; no NVR connection / santé du service |
| GET | `/api/config` | Public runtime settings, no secrets / configuration sans secrets |
| POST | `/api/session` | Browser session. `{}` with Docker credentials; otherwise `{username,password}` |
| GET | `/api/session` | Current authenticated session / session courante |
| POST | `/api/logout` | Close browser session and live views |
| GET | `/api/days` | Computed dates, no NVR scan / dates calculées sans scan |
| GET | `/api/recordings?date=YYYY-MM-DD` | All camera recordings for a day, queried lazily |
| POST | `/api/search` | Filtered/paginated archive search |
| POST | `/api/exports` | Start or reuse an export; responds 202 with job state |
| GET | `/api/exports` | List exports belonging to the authenticated client |
| POST | `/api/exports/batch` | Enqueue only explicit `recordIds`; separate MP4 files, no ZIP |
| GET | `/api/exports/:id` | Progress, codec, audio, size and state |
| POST | `/api/exports/:id/cancel` | Cancel preparation |
| GET | `/api/exports/:id/file` | Download ready MP4; supports HTTP byte ranges |
| GET | `/api/exports/:id/file?inline=1` | Inline MP4 for browser playback |
| POST | `/api/live` | Stream of concatenated JPEG images; `{channel:1,stream:1}`; connection close stops live view |
| GET | `/api/info` | Read-only device information / informations du NVR |

## Search / Recherche

```json
{
  "Channel": ["True", "True", "True", "True"],
  "Type": ["True", "True", "True", "True"],
  "Date": "2026-01-31",
  "BeginTime": "00:00:00",
  "EndTime": "23:59:59",
  "PageSize": 25,
  "CurrentPage": 1
}
```

`Type` order: continuous, motion, alarm, manual. `Channel` and `Type` contain strings as required by the NVR protocol. Camera numbers in responses are **1-based**. Dates must be inside `ARCHIVE_DAYS`. Page sizes: 12, 25, 50, 100.

Ordre des types : continu, mouvement, alarme, manuel. Les numéros de caméra renvoyés commencent à **1**. Les dates de début/fin des lignes sont des secondes Unix telles que renvoyées par l’appareil.

Response shape:

```json
{"rows":[{"id":"stable-record-id","channel":2,"type":1,"start":1760000000,"end":1760000625,"sourceSize":0}],"total":1,"page":1,"pageSize":25}
```

## Export

First query a day or run a search so its record IDs are available to your authenticated client. Then:

```json
{"recordId":"stable-record-id","offset":0,"duration":625,"browser":false}
```

`offset` / `duration` are seconds. Maximum duration is 3600 seconds. `browser:false` copies original H.264/H.265 video; `browser:true` converts H.265 to H.264 for browser compatibility. Audio is AAC in either case. Poll the returned job ID every two seconds; download only after `state` becomes `ready`.

États : `queued`, `capturing`, `assembling`, `ready`, `error`, `cancelled`. Les identifiants des tâches sont limités au client authentifié. Les fichiers disparaissent après expiration du cache : recréer une tâche si nécessaire. La liste des dates ne génère aucun export ; seuls les téléchargements créent des médias temporaires.

Batch request / Requête groupée : `{"recordIds":["first-selected-id","second-selected-id"]}`. Only these records are enqueued; there is no automatic selection of a page, day or search result. `EXPORT_CONCURRENCY` controls parallel preparations (default: 1), with a bounded queue of 5000 entries. Recordings longer than one hour are split into consecutive export jobs. / Seuls les identifiants explicitement fournis sont traités, jamais les vidéos non cochées.

Errors use `{ "error": "message", "code": "ERROR_CODE" }` with an appropriate HTTP status. Codes include `LOGIN_REQUIRED`, `NVR_AUTH`, `NVR_UNREACHABLE`, `DATE_RANGE`, `EXPORT_BUSY`, `EXPORT_RANGE` and `NOT_FOUND`.


## Integration 1.2 / Intégration 1.2

`GET /openapi.json` serves the OpenAPI contract without secrets, with the deployment prefix included.

| Method | Path | Result |
|---|---|---|
| GET | `/api/cameras` | Shared camera names, 1-based channels and capabilities |
| POST | `/api/cameras/:channel` | `{name}` updates the shared camera name |
| POST | `/api/cameras/:channel/snapshot` | `{}` captures one JPEG; `X-Captured-At` identifies capture time |
| GET | `/api/status` | Last observed NVR contact, export queue, configured concurrency and storage errors; no active probe |

`NOXIS_MONITOR_TOKEN` is a separate optional bearer token restricted to `GET /api/status` and `GET /api/cameras`. It cannot start captures, search recordings or download media. Never give the full service token to a browser or an LLM. ARCADIA applies end-user permissions before calling Noxis.

A snapshot has a 15-second deadline and at most two simultaneous captures. Its connection and decoder close after the first complete JPEG. It does not wait behind archive exports.

Avec `NOXIS_DATA_DIR=/data` et un volume conservé, les noms des caméras et les métadonnées des tâches sont persistants. Après redémarrage, les préparations interrompues sont relancées depuis leur début avec le même identifiant ; les fichiers prêts restent disponibles dans la limite du cache de 30 minutes d’inactivité. La reprise attend une reconnexion au NVR et est retentée périodiquement. Aucun identifiant NVR n’est écrit dans ces métadonnées. Sans répertoire de données, le fonctionnement reste en mémoire. Le cache ne remplace pas une sauvegarde durable des archives.
