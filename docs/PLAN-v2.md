# Open ATS — Build plan (v2)

v2 adds four capabilities that small teams expect once the basics work: publishing a job
beyond the career site, reading candidates' replies inside Open ATS, scheduling interviews,
and automatic rules on pipeline stages. Everything stays self-hostable without third-party
accounts: no OAuth application to register, no paid partner API. Each feature works with
environment variables only, or not at all, and the rest of the product keeps working.

The v1 rules still apply: [`DESIGN.md`](./DESIGN.md) for every screen, functional
reimplementation only (no names, texts or visuals from an existing ATS), no AI, one commit
per feature, decisions logged in [`DECISIONS.md`](./DECISIONS.md), screenshots at 1440 px
and 390 px reviewed before moving on.

## 1. Distribution of job ads

What a recruiter does today: copy the career site link into LinkedIn, Indeed or a school's
job board, and lose track of where candidates come from.

- **Channels** per organisation (LinkedIn, Indeed, Welcome to the Jungle, France Travail,
  HelloWork, social networks, referral by default; editable in Settings › Diffusion).
- **Tracked links**: each channel gets its own link to the job (`?src=<channel>`). The
  career site carries the parameter from the list to the job page and the application form;
  the application records the channel. No cookie, nothing stored on the visitor's device.
- **Job page « Diffusion »**: tracked links with a copy button and the number of
  applications per channel, the ad as plain text ready to paste into a job board, a share
  link for LinkedIn and email.
- **XML feed** per organisation (`/careers/[org]/jobs.xml`, Indeed-style format most job
  aggregators read), one URL per channel so that each aggregator's traffic is attributed.
  A job can be excluded from feeds. `JobPosting` structured data (v1) already covers Google.
- The candidate panel shows the channel next to the origin.

Not possible without partner contracts, so not built: paid posting to job boards, « apply
with LinkedIn ». Noted in DECISIONS.md.

## 2. Candidate replies in the profile

What happens today: emails leave Open ATS with the recruiter's address as Reply-To, and
replies land in personal inboxes, out of the team's sight.

- **A shared mailbox** read over IMAP (`IMAP_*` variables). When it is configured, candidate
  emails go out with that mailbox as Reply-To and a Message-ID of ours.
- **Polling** every minute in the server process, under a database lock (one reader across
  replicas). Only new messages are read (UID tracking); the mailbox is not modified.
- **Matching**: by `In-Reply-To` / `References` against the Message-IDs we sent, then by the
  sender's address. Unknown senders are left alone. Automatic replies are ignored.
- **Conversation tab** in the candidate panel: emails sent and received in order, quoted
  text folded, attachments (CV and documents) downloadable; « Répondre » keeps the thread
  in the candidate's mail client.
- **Notifications**: the person who sent the email (or the job's team) is notified in the
  app and by email; the kanban card shows unread replies. The « Mentions » page becomes
  « Notifications » and lists mentions, replies, booked interviews and rule reminders.
- **Settings › Emails** shows the mailbox status: address, last check, last error.
- GDPR: messages and attachments are part of the export, removed by anonymisation and
  deletion, and count as candidate activity for retention.

## 3. Interview scheduling

Without OAuth: calendars are read from the secret ICS address that Google Calendar and
Outlook provide, and events are written by sending standard iCalendar invitations, which
every calendar accepts.

- **My calendar** (Settings › Profil): ICS address (stored encrypted), working days and hours,
  default meeting link. Busy times are read for the next weeks, recurring events included.
- **Plan an interview** from the candidate panel (button and `P` shortcut):
  - _Offer time slots_: choose interviewers, duration, place (video, on site, phone) and a
    period; Open ATS lists the slots where every interviewer is free, the recruiter keeps the
    ones to offer and sends the email (template with `{{lien_creneaux}}`).
  - _Set a date_: date, time, interviewers, place; invitations go out at once.
- **Public slot page** on the career site, branded, mobile-first: the candidate picks a slot,
  receives a confirmation with the invitation, can change slot until 24 hours before.
  Booking re-checks availability inside a transaction, so two candidates cannot take the
  same slot.
- **Invitations** (`METHOD:REQUEST`, updates with the same UID and a higher sequence,
  `METHOD:CANCEL` on cancellation) to the candidate and each interviewer.
- **Video link**: the interviewer's own room, a pasted link, or a generated Jitsi link
  (`VIDEO_MEETING_BASE_URL`, can be turned off).
- **Interviews page** in the sidebar: upcoming interviews by day, proposals waiting for an
  answer, past interviews still waiting for my evaluation.
- The panel shows the next interview and pending proposals; the kanban card shows the date.

## 4. Automatic rules on stages

- A rule belongs to a stage of a job: **when an application arrives in the stage**, after a
  delay (at once, hours, days), **if it is still in the stage** and an optional condition on
  a yes/no or choice answer holds, **do one action**:
  send an email template, reject with a reason (and optionally an email), notify people,
  add a tag, move to another stage, offer interview slots.
- « At once » means one minute later, so that undoing a move from the toast cancels it.
- Runs are stored (`automation_runs`) and executed by an in-process worker with
  `FOR UPDATE SKIP LOCKED`, retried three times, visible in the candidate's history as
  done by « Règle automatique ».
- **Job page « Règles automatiques »**: stages in order with their rules written as
  sentences, toggle, edit, delete, number of pending actions. Rules only apply to
  applications that arrive after they are created.
- Column headers show how many rules a stage has; the move toast says when rules apply.
- Duplicating a job copies its rules.

## Order and commits

1. Plan, decisions, design additions (this document).
2. Distribution: schema, feed, tracked links, job page tab, settings, tests.
3. Replies: schema, IMAP reader, matching, conversation tab, notifications page, tests with a
   real IMAP server (GreenMail) locally and in CI.
4. Interviews: schema, ICS reading and writing, slot engine, panel dialog, public page,
   interviews page, tests.
5. Rules: schema, worker, rules page, hooks in moves and applications, tests.
6. Demo data for all four, end-to-end test of the new flows, README, DEPLOY.md,
   `.env.example`, final review of every new screen.

## Out of scope for v2

Two-way calendar sync with OAuth, SMS and messaging apps, paid job boards, analytics,
public API. Still no AI.
