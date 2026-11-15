# Noxis

**Your cameras. Your recordings.** · [Français](README.md)

Local web application for NVRs compatible with the NetSDK/KP2P interfaces implemented here: live mosaic, camera names, archive search and playback, H.264/H.265 MP4 downloads with audio, API, and a read-only virtual FTP server.

## Docker quick start

```sh
cp .env.example .env
# Set NVR_HOST, NVR_USERNAME, NVR_PASSWORD and FTP_PASSWORD in .env.
docker compose up -d
```

Open **http://localhost:8787**. Compose provides the NVR address and credentials, so the login screen is hidden when credentials are configured. No real device address, password or private recording is embedded in the image. Never commit `.env`.

Public image: `shinji38fr/noxis:latest` / `shinji38fr/noxis:1.0.0`.

The supplied Compose file publishes ports on loopback only. For another LAN client, adjust published addresses, `ALLOWED_HOSTS` and `FTP_PASV_ADDRESS` to the Docker host's LAN address. The container must reach the NVR's HTTP and video ports; the browser does not connect to the NVR directly.

## Features

- Live identification mosaic: up to four H.264/H.265 cameras, server-side decoding, JPEG display at 5 fps. Live view has no audio; archive audio is preserved through AAC conversion.
- Archive filters, pagination, daily listing, CSV and camera names.
- MP4 downloads copy H.264/H.265 video without re-encoding; mono 8 kHz G711A/G711U audio is converted to AAC. Browser playback converts H.265 to H.264 for compatibility.
- Export jobs, progress and cancellation. Two concurrent preparations; up to one hour or 1 GB of video per export. Retrieval may take approximately the recording's duration. Cached files expire after 30 idle minutes and do not survive container replacement.
- Read-only NVR information. No root access or destructive device operations.
- French and English UI; language and camera names remain in browser storage.

Display times use the browser timezone. `TZ` controls the service/FTP timezone. Vendor firmware time conventions may vary; compare a known recording with the original client before collecting a large archive.

## Virtual FTP

`ARCHIVE_DAYS=30` creates exactly 30 virtual date folders, including today, **without scanning the NVR**. Each day contains recordings from all cameras, named `Cam02_19-00-00_19-10-25_<stable-id>.mp4`. Entering a day queries its listing; downloading a file prepares its MP4 on demand. No camera subdirectories and no initial disk copy.

Recordings longer than one hour appear as consecutive files with explicit time ranges; their tails are not silently truncated.

Use passive FTP on port **2121** and passive ports **50000–50009**, with the separate `FTP_USERNAME` / `FTP_PASSWORD`. Allow a sufficiently long client timeout while recordings are prepared. Plain FTP is intended for a trusted LAN; explicit FTPS can use mounted `FTP_TLS_CERT` and `FTP_TLS_KEY`.

Virtual file sizes are zero before preparation. `SIZE`, writes, deletion, renaming and partial resume are disabled. To collect missing files with lftp:

```text
open -u noxis ftp://localhost:2121
# Enter the password at the prompt.
set net:timeout 2h
set net:max-retries 1
mirror --only-missing --parallel=1 --no-perms /2026-01-31 ./archives/2026-01-31
```

Keep existing local files. Do not use deletion, resume or segmented downloads against virtual files. This is file-level incremental retrieval, not rsync block comparison. [lftp manual](https://lftp.yar.ru/lftp-man.html).

## Configuration

`NVR_HOST`, `NVR_HTTP_PORT` (80), `NVR_VIDEO_PORT` (10000), `NVR_USERNAME`, `NVR_PASSWORD`, `ARCHIVE_DAYS` (30), optional `NVR_CHANNELS` (4), `FTP_ENABLED`, `FTP_USERNAME`, `FTP_PASSWORD`, `FTP_PASV_ADDRESS`, `FTP_PASV_MIN` / `FTP_PASV_MAX`, `ALLOWED_HOSTS`, `NOXIS_API_TOKEN`, and `TZ` are set in Compose/environment.

`NVR_PASSWORD_FILE` and `FTP_PASSWORD_FILE` can read mounted Docker secrets instead of plain environment variables. They take precedence over the corresponding password variable. Remove the plain password entry in Compose when using a secret. Secret files remain outside the repository.

`NVR_CHANNELS` controls selected channels and live tiles; it does not determine virtual FTP folders. The server defaults to four channels. Configure it when using another NVR channel count.

## API and development

See [API.md](API.md). Browser calls use an HTTP-only cookie and origin checks. External API clients use `Authorization: Bearer <NOXIS_API_TOKEN>` and server-configured NVR credentials.

Node.js 22+, FFmpeg and npm:

```sh
npm ci
npm test
npm start
```

`FFMPEG_PATH` can point to an installed FFmpeg executable. Device credentials are kept in process memory, not returned to the UI. Temporary files contain prepared media only. The local server binds to loopback; the Docker container binds internally to all interfaces.

Compatibility depends on the NVR firmware. No vendor JavaScript files are needed at runtime. Noxis code is MIT licensed; FFmpeg and dependencies retain their own licenses. [FFmpeg](https://ffmpeg.org/) · [ftp-srv](https://github.com/QuorumDMS/ftp-srv).
