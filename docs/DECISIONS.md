# Decisions

Decisions taken while building v1, newest at the bottom of each section. Each entry says
what was chosen and why, so it can be revisited.

## Stack and versions (checked on 2026-10-28)

| Library | Version | Note |
|---|---|---|
| Next.js | 16.4 | App Router, Turbopack builds, `proxy.ts` instead of middleware, async request APIs. |
| React | 19.3 | |
| TypeScript | 6.0 | TypeScript 7 (native compiler) is out, but `typescript-eslint` supports `<6.1` only. |
| Better Auth | 1.7 | Email + password, `magicLink` plugin, Drizzle adapter, `nextCookies`. |
| Drizzle ORM / Kit | 0.45 / 0.31 | 1.0 is still a release candidate; the stable line is used. |
| postgres (postgres.js) | 3.4 | Driver used by Drizzle and by the migrator. |
| Tailwind CSS | 4.3 | CSS-first `@theme`; default palette disabled. |
| next-intl | 4.14 | Used without i18n routing. |
| dnd-kit | core 6.3 / sortable 10 | `@dnd-kit/react` is still 0.x; the stable packages have a keyboard sensor. |
| TipTap | 3.32 | `immediatelyRender: false` for SSR. |
| Zod | 4.6 | Shared schemas between client and server. |
| Vitest | 5.0 | Unit and database integration tests. |
| Playwright | 1.63 | Pinned to the version of the browsers installed in the build environment. |
| Radix UI | 1.x (`radix-ui`) | Behaviour primitives only, styled from scratch. |

## Architecture

- **One Next.js application** serves the back office, the career site and the API routes.
  Simpler to self-host than separate services, and the target (1–5 recruiters) does not need more.
- **Two root layouts** through route groups: `(app)` for the back office, auth and `/design`,
  `(careers)` for the public site. They have different `lang`, fonts usage and brand colours.
- **Own organisation tables instead of the Better Auth organization plugin.** Better Auth
  handles users, sessions, accounts and verification tokens. Organisations, memberships,
  roles and invitations are ours: we need a `recruiter` role, job assignments for members and
  invitation links that admins can copy when SMTP is not configured.
- **Tenant isolation in the service layer.** Every service function takes a `Ctx`
  (`orgId`, `userId`, `role`) as first argument and filters by `organizationId`. Server
  actions and route handlers obtain it only from `requireContext()`. An integration test
  calls each service with another organisation's IDs and expects nothing back, and a
  structural test checks that every business table has an `organization_id` column.
- **Members** (hiring managers) see only the jobs they are assigned to and the candidates of
  those jobs. They can read, comment and evaluate; moving, rejecting and emailing are for
  admins and recruiters.
- **Sign-up is gated** in a Better Auth database hook: a user can be created only for the
  very first account (instance setup), for an email with a pending invitation, or when
  `ALLOW_SIGNUP=true` (hosting several organisations on one instance).
- **Migrations run at server start** from `instrumentation.ts`, under a Postgres advisory lock,
  so `docker compose up` needs no extra step and several replicas cannot race.
- **Demo seed and the retention job** also start from `instrumentation.ts`. The retention job
  runs in process every 6 hours; it is idempotent, so restarts or several replicas are harmless.
- **Reads for interactive client views** (candidate panel, command palette) go through route
  handlers returning JSON; **mutations** go through server actions validated with Zod.
- **Public application endpoint** is a route handler (`multipart/form-data`) rather than a
  server action, to control the 10 MB limit, the honeypot and rate limiting precisely.

## URLs

- Back office: `/jobs`, `/jobs/[id]` (pipeline), `/jobs/[id]/edit`, `/candidates`,
  `/candidates/[id]`, `/inbox`, `/settings/*`. The candidate panel uses `?a=<applicationId>`.
- Career site: `/careers/[org]`, `/careers/[org]/jobs/[slug]`, `.../confirmation`,
  `/careers/[org]/privacy`. `/` redirects signed-in users to `/jobs`, visitors to the career
  site when the instance has a single organisation, and to `/setup` on a fresh instance.

## Languages

- Back office language = user preference (cookie, then `Accept-Language`, then French).
- Career site language = the organisation's setting, because job content is written in one
  language; mixing an English interface with a French job ad would be worse.

## Search

- Each candidate has a `search_text` column (name, email, phone, tags, notes, CV text),
  normalised in the application (lower case, accents removed), and a generated
  `tsvector` column (`simple` configuration) with a GIN index. Queries use prefix matching.
  `unaccent` was not used because it is not immutable and cannot feed a generated column.
- Snippets with highlighted terms are computed in the application from the original text,
  so accents and case are preserved in what the user sees.

## Files

- Stored on disk (`UPLOADS_DIR`, a Docker volume) behind a small storage interface; S3 is
  selected with `STORAGE_DRIVER=s3`.
- CV text is extracted at upload (`unpdf` for PDF, `mammoth` for DOCX) for search.
- CV preview: PDF pages rendered with pdf.js on a paper sheet (same result in every browser,
  including iPad Safari where embedded PDFs show only one page); DOCX converted to sanitised HTML.

## Emails

- nodemailer over SMTP when `SMTP_URL` or `SMTP_HOST` is set. Otherwise every email is
  written to the server log and to the email journal with status « Journalisé ».
- Magic links are never stored in the journal (an admin could otherwise sign in as anyone);
  without SMTP they only appear in the server log.
- Templates accept French and English variable names (`{{prénom}}` / `{{first_name}}`, …).

## Design reviews

(Filled in screen by screen.)
