# Deploying Open ATS

Open ATS is one container (the Next.js server) plus PostgreSQL 16. Database migrations run
when the server starts, so an upgrade is: pull, rebuild, restart.

- [What you need](#what-you-need)
- [Docker Compose](#docker-compose)
- [Coolify](#coolify)
- [Behind a reverse proxy](#behind-a-reverse-proxy)
- [Configuration](#configuration)
- [Backups](#backups)
- [Upgrades](#upgrades)

## What you need

- A Linux server with Docker Engine 24+ and the Compose plugin. Building the image takes more
  memory than running it; on a small server, use the prebuilt image (see below).
- A domain name pointing at the server, and HTTPS in front of the app (Coolify, Caddy,
  Traefik, nginx…).
- Optionally an SMTP account. Without SMTP, emails are not sent: they are written to the
  server log and to the email journal (Paramètres › Emails).

## Docker Compose

`docker-compose.yml` is the production file. `docker-compose.override.yml` is a local
try-out layer, loaded automatically by `docker compose up`: it publishes port 3000 and turns
the demo data on. On a server, ignore it by naming the production file explicitly.

```sh
git clone https://github.com/pauldelacv/open-ats.git
cd open-ats
cp .env.example .env
```

Edit `.env`. At least:

```sh
APP_URL=https://jobs.example.com      # what the browser shows, no trailing slash
POSTGRES_PASSWORD=<a long random value>
AUTH_SECRET=<output of: openssl rand -base64 32>
SEED_DEMO=false
```

Then start it with the production file only and publish the port your proxy talks to.
The simplest way is a small file next to the others, for example `docker-compose.prod.yml`:

```yaml
services:
  app:
    ports:
      - "127.0.0.1:3000:3000"
```

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f app
```

The app is ready when `/api/health` answers `{"status":"ok","database":"ok"}`. Open
`APP_URL`: on a fresh instance you land on the setup page, where you create the first
account and your company. Everyone else joins through an invitation
(Paramètres › Équipe).

To use the prebuilt image from GitHub Container Registry instead of building on the server,
set `OPEN_ATS_IMAGE=ghcr.io/pauldelacv/open-ats:<version>` in `.env` and run `pull` then
`up -d` without `--build`.

## Coolify

Coolify reads `docker-compose.yml` from the repository as is.

1. **New resource › Public or private repository**, pick this repository and the
   **Docker Compose** build pack. Leave the compose file location as `/docker-compose.yml`.
2. On the `app` service, set the domain, for example `https://jobs.example.com`. Coolify
   exposes it as `SERVICE_URL_APP_3000`, and the compose file uses it for `APP_URL` when
   `APP_URL` is not set. Port 3000 is already declared.
3. In **Environment variables**, set at least `POSTGRES_PASSWORD` and `AUTH_SECRET`.
   `SEED_DEMO` is `false` by default in this file; set it to `true` only for a demo
   instance. Add the SMTP variables if you want emails to be sent.
4. Deploy. Coolify waits for the health check (`/api/health`) before routing traffic.

Coolify passes the compose file explicitly, so `docker-compose.override.yml` is never
loaded there: no port is published on the host and the demo stays off.

The two named volumes (`app-data` for uploaded files and the generated secret, `db-data`
for Postgres) are created by Coolify and survive redeploys. Configure backups for both
(see [Backups](#backups)).

## Behind a reverse proxy

The app listens on port 3000 over plain HTTP and works behind any proxy that forwards the
`Host` header. Two things matter:

- `APP_URL` must be the public address, exactly as the browser sees it. It is used for
  sign-in, links in emails, canonical URLs and the sitemap. A mismatch shows up as sign-in
  requests refused for an untrusted origin.
- The proxy should set `X-Forwarded-For`. The application form is rate limited per client
  address; without the header, every visitor shares one limit.

Uploads are limited to 10 MB per CV, so allow request bodies of at least 12 MB.

Caddy:

```
jobs.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

nginx:

```nginx
server {
  server_name jobs.example.com;
  client_max_body_size 12m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Configuration

Every variable is documented in [`.env.example`](../.env.example). The ones you are most
likely to change:

| Variable                                                                            | Default                                                | Purpose                                                                                                |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `APP_URL`                                                                           | `SERVICE_URL_APP_3000`, then `http://localhost:3000`   | Public address.                                                                                        |
| `AUTH_SECRET`                                                                       | generated at first start, kept in `/data/.auth-secret` | Signs sessions. Set it explicitly in production, so that losing the volume does not sign everyone out. |
| `POSTGRES_PASSWORD`                                                                 | `openats`                                              | Database password. Change it before the first start: Postgres keeps the first one.                     |
| `SEED_DEMO`                                                                         | `false` (`true` in the local override)                 | Creates the fictional company Maison Pivert with 6 jobs and 40 candidates.                             |
| `ALLOW_SIGNUP`                                                                      | `false`                                                | Lets anyone create an account and a new company, to host several companies on one instance.            |
| `SMTP_URL` or `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` | empty                                                  | Email sending. Empty means emails are logged instead.                                                  |
| `MAIL_FROM`                                                                         | `Open ATS <no-reply@localhost>`                        | Sender of every email. Use an address your SMTP account may send from.                                 |
| `STORAGE_DRIVER`                                                                    | `local`                                                | `s3` stores files in any S3-compatible bucket (`S3_*` variables) instead of `/data/uploads`.           |
| `RETENTION_JOB`                                                                     | `true`                                                 | Anonymises candidates past the retention period every 6 hours.                                         |
| `APP_TIMEZONE`                                                                      | `Europe/Paris`                                         | Time zone of dates in emails and on the server.                                                        |

On Vercel, the AWS S3 integration works as is: set `STORAGE_DRIVER=s3` and files go to the
bucket it creates (`S3_BUCKET_NAME`), authenticated with Vercel OIDC (`AWS_ROLE_ARN`) instead of
access keys.

### Candidates' replies, calendars and automatic rules

These features need no account with Google, Microsoft or any other provider.

- **Replies (IMAP)**: create a dedicated mailbox (for example `recrutement@your-company.com`)
  and set `IMAP_HOST`, `IMAP_USER`, `IMAP_PASSWORD` (port 993 with TLS by default). Emails to
  candidates then go out with this address as Reply-To, and Open ATS reads new messages every
  `IMAP_POLL_SECONDS` (60 by default) without moving or flagging them. Settings › Emails shows
  when the mailbox was last read and the last error. Without IMAP, replies go to the
  recruiter's own address, as in v1.
- **Calendars (ICS)**: each person pastes the secret iCalendar address of their calendar in
  their profile (Google Calendar: Settings › your calendar › « Secret address in iCal
  format »; Outlook: Settings › Calendar › Shared calendars › Publish a calendar). The server
  must reach these addresses over HTTPS. They are stored encrypted with a key derived from
  `AUTH_SECRET`: if you change it, people enter their address again.
- **Video links**: `VIDEO_MEETING_BASE_URL` (`https://meet.jit.si` by default) is used for the
  generated video rooms. Point it to your own Jitsi server, or set `off` to hide the button.
- **Automatic rules** run inside the app process every `AUTOMATION_POLL_SECONDS` (30 by
  default). Several replicas can run at once: each planned action is taken by one of them.

## Backups

Two things hold data:

- **PostgreSQL** (`db-data` volume): everything except files.
- **`/data`** (`app-data` volume): uploaded CVs, logos and photos in `uploads/`, and the
  generated `.auth-secret` when `AUTH_SECRET` is not set. With `STORAGE_DRIVER=s3`, files
  live in the bucket instead; back the bucket up with your provider's tools.

Database dump, from the directory holding the compose files:

```sh
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "open-ats-$(date +%F).dump"
```

Files:

```sh
docker run --rm -v open-ats_app-data:/data:ro -v "$PWD":/backup alpine \
  tar czf "/backup/open-ats-files-$(date +%F).tgz" -C /data .
```

The volume name is `<project>_app-data`, where the project is the directory name by default;
`docker volume ls` shows it. Run both commands from a daily cron job and copy the results
off the server.

Restore into a fresh install (stop the app first so nothing writes during the restore):

```sh
docker compose stop app
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
  < open-ats-2026-10-28.dump
docker run --rm -v open-ats_app-data:/data -v "$PWD":/backup alpine \
  tar xzf /backup/open-ats-files-2026-10-28.tgz -C /data
docker compose start app
```

## Upgrades

```sh
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

With the prebuilt image, change the tag in `OPEN_ATS_IMAGE`, then `pull` and `up -d`.
Migrations run at start under a database lock, so several replicas cannot apply them twice.
Take a backup before upgrading across versions.
