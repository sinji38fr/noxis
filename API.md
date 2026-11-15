# Noxis API / API Noxis

Base URL: `http://localhost:8787`. JSON uses stable English field names.

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

États : `capturing`, `assembling`, `ready`, `error`, `cancelled`. Les identifiants des tâches sont limités au client authentifié. Les fichiers disparaissent après expiration du cache : recréer une tâche si nécessaire. La liste des dates ne génère aucun export ; seuls les téléchargements créent des médias temporaires.

Errors use `{ "error": "message", "code": "ERROR_CODE" }` with an appropriate HTTP status. Codes include `LOGIN_REQUIRED`, `NVR_AUTH`, `NVR_UNREACHABLE`, `DATE_RANGE`, `EXPORT_BUSY`, `EXPORT_RANGE` and `NOT_FOUND`.
