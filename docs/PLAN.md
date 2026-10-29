# Open ATS — Build plan (v1)

This plan is executed top to bottom. Each step ends with a commit (Conventional Commits),
screenshots at 1440 px and 390 px for every screen it touches, and a review against
[`DESIGN.md`](./DESIGN.md). Choices made along the way are logged in
[`DECISIONS.md`](./DECISIONS.md).

## 0. Groundwork

- Verify current stable versions and docs of every library (Next.js 16, Better Auth 1.7,
  Drizzle 0.45, Tailwind 4, next-intl 4, dnd-kit, TipTap 3, Zod 4, Vitest 5, Playwright).
- Write `docs/PLAN.md`, `docs/DESIGN.md`, `docs/DECISIONS.md`.

## 1. Foundations and Docker

- Next.js App Router, TypeScript strict, `output: "standalone"`, ESLint flat config, Prettier.
- PostgreSQL 16 + Drizzle schema for the whole v1 (auth, organisation, jobs, pipeline,
  candidates, notes, evaluations, emails, activity, notifications) and generated SQL migrations.
- Migrations applied at server start (`instrumentation.ts`, guarded by an advisory lock).
- Better Auth: email + password, magic link, Drizzle adapter, Next.js cookies.
- Organisation, memberships, invitations, roles (`admin`, `recruiter`, `member`), first-run setup.
- Request context (`requireContext`) that every server action and route handler goes through;
  every service function takes the context and filters by `organizationId`.
- next-intl without URL routing: back office follows the user's language, career site follows
  the organisation's language. French by default, English available.
- `/api/health`, multi-stage Dockerfile (non-root), `docker-compose.yml` (app + Postgres 16,
  volumes), `.env.example`, GitHub Actions (lint, typecheck, tests on PR; GHCR image on tag).

## 2. Design system and `/design`

- Tokens in Tailwind v4 `@theme`, self-hosted Instrument Sans / Instrument Serif (OFL).
- Primitives on Radix (dialog, dropdown, popover, tooltip, tabs) restyled from scratch.
- Components: button, icon button, input, textarea, select, checkbox, radio, field, badge,
  tag, avatar, tabs, dialog, side panel, dropdown, tooltip, toast, skeleton, empty state,
  kbd, mark, rating, dropzone, rich text editor, list rows.
- `/design` shows every component in rest, hover, focus, disabled, error, loading and empty states.

## 3. Jobs

- Job list (published / drafts / archived) with candidate counts and new-candidate highlight.
- Job editor: title, rich description (TipTap), department, location, remote policy,
  contract type, optional salary range, custom application questions, hiring team.
- Statuses draft → published → archived, with consistent action names.
- Default pipeline stages created with each job, editable per job.

## 4. Career site and application

- `/careers/[org]`: brand header, jobs list first (visible without scrolling on mobile),
  filters (department, location, contract, remote), company presentation and photo.
- `/careers/[org]/jobs/[slug]`: job page with inline application form, sticky apply action.
- Application: inline validation, CV drag and drop (PDF/DOCX ≤ 10 MB), custom questions,
  GDPR consent stored with timestamp and text, honeypot and rate limit, confirmation page,
  confirmation email.
- SEO: metadata, Open Graph, canonical URLs, `sitemap.xml`, `robots.txt`, `JobPosting` JSON-LD.

## 5. Pipeline

- Kanban per job, columns = stages, cards = applications.
- dnd-kit drag and drop with keyboard sensor, plus an explicit "Déplacer vers" menu.
- Optimistic moves with undo from the toast.
- Multi-select and bulk actions (move, reject, tag, email).
- Stage editor (rename, add, reorder, delete with reassignment).

## 6. Candidate panel

- Opens on the right of the kanban, URL kept in sync (`?a=<applicationId>`).
- CV preview (PDF rendered with pdf.js, DOCX converted to HTML) next to the details.
- Answers, notes with @mentions (notification + email), tags, evaluations (1–5 + opinion,
  hidden from you until you submit yours), activity history.
- Reject with reason and email.
- Shortcuts: J/K, 1–5, E, R, `?`, Esc.

## 7. Emails

- Templates with variables (`{{prénom}}`, `{{offre}}`, `{{entreprise}}` and aliases),
  live preview, defaults seeded per organisation.
- SMTP through nodemailer; without SMTP every email is logged (console + email journal).

## 8. Talent pool

- All candidates of the organisation, full-text search on name, email, notes and CV text
  (Postgres `tsvector`, accent-insensitive), matched terms highlighted.
- Deduplication by email at application time.

## 9. GDPR

- Consent timestamp and text version on every application.
- Retention period per organisation (24 months by default), daily in-process job that
  anonymises inactive candidates, manual run from settings.
- Candidate export (ZIP: JSON + CV files) and permanent deletion.

## 10. Polish

- Command palette (⌘K / Ctrl+K), keyboard help, mentions inbox.
- Demo data (`SEED_DEMO=true`): fictional company, 6 jobs, 40 candidates with generated CVs.
- Playwright end-to-end test of the full flow; Vitest suites green.
- Final pass on every screen against `DESIGN.md`, Lighthouse on the career site.
- README with real screenshots and a 3-command install, `docs/DEPLOY.md`.

## Out of scope for v1

Automations, interview scheduling, analytics, public API, block-based site editor, dark mode,
AI features.
