# Decisions

Decisions taken while building v1, newest at the bottom of each section. Each entry says
what was chosen and why, so it can be revisited.

## Stack and versions (checked on 2026-10-28)

| Library                | Version                | Note                                                                                 |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| Next.js                | 16.4                   | App Router, Turbopack builds, `proxy.ts` instead of middleware, async request APIs.  |
| React                  | 19.3                   |                                                                                      |
| TypeScript             | 6.0                    | TypeScript 7 (native compiler) is out, but `typescript-eslint` supports `<6.1` only. |
| Better Auth            | 1.7                    | Email + password, `magicLink` plugin, Drizzle adapter, `nextCookies`.                |
| Drizzle ORM / Kit      | 0.45 / 0.31            | 1.0 is still a release candidate; the stable line is used.                           |
| postgres (postgres.js) | 3.4                    | Driver used by Drizzle and by the migrator.                                          |
| Tailwind CSS           | 4.3                    | CSS-first `@theme`; default palette disabled.                                        |
| next-intl              | 4.14                   | Used without i18n routing.                                                           |
| dnd-kit                | core 6.3 / sortable 10 | `@dnd-kit/react` is still 0.x; the stable packages have a keyboard sensor.           |
| TipTap                 | 3.32                   | `immediatelyRender: false` for SSR.                                                  |
| Zod                    | 4.6                    | Shared schemas between client and server.                                            |
| Vitest                 | 5.0                    | Unit and database integration tests.                                                 |
| Playwright             | 1.63                   | Pinned to the version of the browsers installed in the build environment.            |
| Radix UI               | 1.x (`radix-ui`)       | Behaviour primitives only, styled from scratch.                                      |

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

## v2: distribution, replies, interviews, rules

Plan: [`PLAN-v2.md`](./PLAN-v2.md). Names of features are ours (« Diffusion », « Échanges »,
« Proposer des créneaux », « Règles automatiques »), not borrowed from another ATS.

- **No OAuth anywhere.** Registering a Google or Microsoft application is the step that makes
  self-hosted tools give up on calendar and mail features. Calendars are read from the secret
  ICS address that Google Calendar and Outlook give each user, and written to by sending
  standard iCalendar invitations, which every calendar client understands. Mail is read over
  IMAP, which every provider offers. The cost: busy times are read-only and refreshed at most
  every 10 minutes, and an interviewer's answer to an invitation is not read back.
- **ICS addresses are secrets** (they give read access to a calendar): stored encrypted with
  AES-256-GCM, key derived from the auth secret with HKDF. Changing `AUTH_SECRET` makes them
  unreadable; users enter them again.
- **Server-side fetches of addresses typed by users** (ICS) accept `https` only (`webcal` is
  rewritten), refuse loopback, private, link-local and unique-local addresses at connection
  time (not only at DNS lookup, against rebinding), stop at 5 MB and 10 s.
- **IMAP reading leaves the mailbox untouched**: no flags, no moves. The last UID read is
  stored with the mailbox's UIDVALIDITY; the first connection reads the last 14 days. One
  reader at a time through a Postgres advisory lock.
- **Reply matching**: Message-ID we generated (`In-Reply-To`, `References`) first, then the
  sender's address. With several organisations on one instance, the sender goes to the one
  that last emailed them. Messages from unknown senders and automatic replies are ignored.
- **Attribution by URL parameter**, carried from the job list to the form. No cookie, so no
  consent banner on the career site.
- **Feed format**: the Indeed-style XML that most job aggregators read. One feed URL per
  channel so that applications coming from each aggregator are attributed.
- **Not built**: paid posting to job boards and « apply with LinkedIn » need partner contracts.
- **Rules have one trigger**, arrival in a stage, plus a delay; delayed actions run only if the
  application is still in that stage (same stay). « At once » is one minute later so that the
  undo in the move toast cancels it. Rules apply to arrivals after their creation, never to
  applications already in the stage. Conditions are limited to yes/no and choice answers:
  free text cannot be tested reliably.
- **Rule execution**: runs are rows (`automation_runs`, unique per rule, application and stay),
  claimed with `FOR UPDATE SKIP LOCKED` by an in-process worker every 30 s, retried three
  times with backoff, shown in the candidate history as done by « Règle automatique ».
- **Rule chains stop**: a rule that moves a candidate starts the rules of the next stage one
  level deeper; past three levels nothing more is planned, so two rules moving back and forth
  cannot loop. Undoing a move restores the previous stay (its date included), so the reminders
  planned for it still happen and the ones of the stage left by mistake are skipped.
- **Rules act as their author** (sender name and reply address of their emails), or as an
  admin once the author has left, but the history records no person: « Une règle automatique ».
  Pausing a rule cancels what it had planned; turning it back on does not catch up.
- **Templates a rule cannot fill are refused**: an « email » or « reject » rule cannot use a
  template with the slots link or an interview date, and « offer slots » requires the slots
  link. A rule that fails (template deleted, no free slot) is marked on the rules page and in
  the candidate's history instead of retrying for ever.
- **Libraries**: `imapflow` and `mailparser` (MIT) for mail; `ical.js` (MPL-2.0, used
  unmodified; file-level copyleft compatible with AGPL) for recurring events and time zones.

## Later decisions

- **Selection checkbox on kanban cards** appears on hover, on keyboard focus, or as soon as one
  card is selected. A permanent checkbox on 40 cards was the noisiest element of the board.
- **Highlighter rule**: one kind of thing per screen. On the board, new applications get a 3 px
  yellow edge and the column header says « N nouveaux » once; the yellow is not repeated on
  badges or counters of the same screen.
- **Rejected column** is collapsed by default and opens on demand: rejected applications stay
  reachable without taking a full column of the board.
- **Members' permissions**: read, comment and evaluate on assigned jobs only; no move, reject,
  email, export or delete. Enforced in services, not only hidden in the interface.
- **Demo deletion**: an admin can delete the demo organisation, its candidates and the demo
  accounts from the company settings. The seed recreates the demo at the next start while
  `SEED_DEMO=true`, and the settings page says so; turning the variable off is the user's call.
- **Screenshots for reviews are taken from a production build** (`next build && next start`).
  The dev server compiles routes on first visit and added noise (layout shifts, slow fonts).
- **Lighthouse (mobile, production build)**: career home 100 / 100 / 100 / 100, job page
  98 / 100 / 100 / 100 (performance / accessibility / best practices / SEO) for an indexable
  organisation. The demo organisation is `noindex` on purpose, so its SEO score is lower.
- **`npm audit`** reports a moderate advisory in `esbuild`, pulled by `drizzle-kit` (development
  only, used to generate migrations). It is not shipped in the Docker image; left as is until
  `drizzle-kit` updates it.
- **Prettier** formats the whole code base and `npm run format:check` runs in CI.

## Design reviews

Each screen was captured at 1440 px and 390 px and read against `DESIGN.md` §7. Findings that
changed the design document itself are marked « DESIGN.md ».

### During the build

- **Design system (`/design`)**: focused fields turn the border cobalt with a 1 px outline, a
  2 px frame that stays visible next to the 1 px borders around it (DESIGN.md). The rating
  input is a row of 24 px numbered circles, readable at a glance and matching the 1–5 keys
  (DESIGN.md).
- **Forms**: most fields are required, so optional ones are marked « (facultatif) » and long
  forms start with one sentence saying the rest is required (DESIGN.md).
- **Pipeline**: the highlighter is reserved for one kind of thing per screen (rule above) so it
  keeps its meaning (DESIGN.md). The card checkbox shows on hover, focus or while a selection
  exists (DESIGN.md).
- **Career site**: the consent sentence produced « que Atelier … » with some company names;
  rewritten as « J'accepte que mes données soient utilisées par {company} … ».
- **Candidate panel**: the CV is drawn with pdf.js on a paper sheet rather than embedded, so
  every page shows the same way in every browser, including iPad Safari.

### Final pass

| Screen              | Finding                                                                                                               | Change                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Job list            | Conforms. Dense rows, counts in tabular figures, « N nouveaux » once per row.                                         | None                                                                                                     |
| Job editor          | Conforms. Optional fields marked, actions in a sticky footer.                                                         | None                                                                                                     |
| Pipeline            | Conforms at 1440. At 390 the header actions wrap on two lines; acceptable since the board targets tablet and desktop. | None                                                                                                     |
| Candidate panel     | Conforms.                                                                                                             | None                                                                                                     |
| Candidate page      | The shortcuts button sat alone on an empty first row above the name.                                                  | Moved into the action row; hidden on phones, where there is no keyboard.                                 |
| Candidate page, 390 | The tab list overflowed the card.                                                                                     | Tabs scroll horizontally; the underline is now an inset line so nothing is clipped.                      |
| Team settings       | The three role descriptions ran into each other. At 390 the « … » menu fell on its own line.                          | Wider column gap; role select and menu share one row.                                                    |
| Profile settings    | Page title and first section were both « Profil ».                                                                    | Section renamed « Vos informations ».                                                                    |
| Career site, 390    | « 5 postes ouverts » and « 5 offres » said the same thing one line apart.                                             | The result count appears only once a filter is active.                                                   |
| Privacy page        | No way back to the offers except the logo.                                                                            | « Toutes les offres » link, as on the job page.                                                          |
| 404                 | « Erreur 404 » small label above the title: an eyebrow label, close to what §6 forbids.                               | Removed (the decorative element removed before validation).                                              |
| `/design`           | Kanban cards were not shown.                                                                                          | New section with every card state: rest, new, rated, selection mode, selected, open, rejected, dragging. |
