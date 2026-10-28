# Open ATS — Design system « Dossier »

Recruiting is reading CVs, annotating, comparing and deciding. The interface borrows from the
annotated case file — paper on a stone desk, a pen, a highlighter — in a modern, quiet form.
This document is the reference for every screen. When a screen and this document disagree,
the screen is wrong.

---

## 1. Principles

1. **Paper for content, stone for the tool.** Content people read (a CV, a job description,
   a note, a form) sits on white paper. The application chrome around it is stone. Nothing
   else creates hierarchy: no gradients, no tinted cards, no decorative backgrounds.
2. **One highlighter.** Yellow is reserved for what needs attention *now*: a new candidate,
   a mention of you, a term found by search. If more than three things on a screen are
   yellow, something is wrong.
3. **Lines, not shadows.** Separation is a 1 px line. Only things that float above the page
   (menus, popovers, dialogs, a card being dragged, toasts) cast a shadow.
4. **Dense and calm.** The back office is a working tool: 14 px text, 36–40 px rows,
   left-aligned, nothing centred except empty states. Density comes from alignment, not from
   shrinking text.
5. **Words before icons.** Every action has a visible label, or a tooltip and an accessible
   name when space forbids a label. Icons are 16 px, 1.5 px stroke, ink or muted ink.
6. **Motion answers an action.** Things move because someone moved them: a card dropped,
   a panel opened, a toast confirming. Nothing animates on load or on hover.
7. **One name per action.** An action keeps its verb from the button to the confirmation:
   « Publier l'offre » → « Offre publiée ». « Refuser le candidat » → « Candidat refusé ».

---

## 2. Tokens

Tokens live in `src/app/globals.css` (`@theme`) and are the only colours, sizes and radii
used in the code. Tailwind's default palette is disabled.

### 2.1 Colour

| Token | Hex | Use |
|---|---|---|
| `ink` | `#18233A` | Text, headings, icons, primary borders of dark elements |
| `ink-muted` | `#586174` | Secondary text, labels, meta (6.2:1 on paper, 5.4:1 on stone) |
| `ink-subtle` | `#6B7383` | Placeholders, disabled text (4.8:1 on paper) |
| `paper` | `#FFFFFF` | Content surfaces: panels, forms, lists, CV sheet |
| `stone` | `#EEF0EC` | App background, secondary zones, sidebar |
| `stone-strong` | `#E3E6E0` | Hover on stone, pressed rows, kanban column background |
| `line` | `#D5D9D2` | Borders and separators |
| `line-strong` | `#868E83` | Form control borders (3.4:1, WCAG 1.4.11) |
| `cobalt` | `#2447D6` | Primary actions, links, focus ring, selection |
| `cobalt-hover` | `#1C39B0` | Hover on primary |
| `cobalt-press` | `#172E8F` | Pressed primary |
| `cobalt-tint` | `#E9EDFC` | Selected row, active navigation item |
| `highlighter` | `#FFE45C` | **Signature.** New candidates, mentions of you, search hits |
| `success` | `#1E7A4C` | Hired |
| `success-tint` | `#E6F2EC` | Hired badge background |
| `danger` | `#B3261E` | Rejected, destructive actions, errors |
| `danger-tint` | `#FBEAE9` | Error banner and rejected badge background |
| `warning` | `#A15C00` | Waiting, pending invitation, retention due soon |
| `warning-tint` | `#FBF0E0` | Warning badge background |

All text pairs meet WCAG AA (checked with a script in `scripts/contrast.mjs`). Ink on
highlighter is 12.3:1.

**Career site brand colour.** Each organisation picks one colour. It replaces `cobalt` on the
career site only. The text colour on brand buttons is computed (white or ink, whichever has
the higher contrast); links use the colour darkened until it reaches 4.5:1 on paper.

### 2.2 Typography

- **Instrument Sans** (variable, 400–700) for the whole interface.
- **Instrument Serif** for large headings of the career site only (company name, job title).
  Organisations can switch these headings to Instrument Sans.
- Both fonts are OFL, self-hosted from `src/fonts/` and loaded with `next/font/local`.
- **Tabular figures** (`font-variant-numeric: tabular-nums`) for every number shown as data:
  counts, dates, salaries, ratings. Never a monospace font for data.

Strict scale — no other size is allowed:

| Token | Size / line height | Use |
|---|---|---|
| `text-12` | 12 / 16 | Meta, counts in badges, keyboard hints |
| `text-13` | 13 / 18 | Secondary text, table meta, sidebar items, labels |
| `text-14` | 14 / 20 | Default back-office text, inputs, buttons |
| `text-16` | 16 / 24 | Career site body, panel names, long reading (notes, CV text) |
| `text-20` | 20 / 28 | Section titles, dialog titles |
| `text-24` | 24 / 32 | Page titles in the back office |
| `text-32` | 32 / 40 | Career site job title, mobile company heading |
| `text-48` | 48 / 56 | Career site company heading on desktop |

Weights: 400 for text, 500 for labels and buttons, 600 for titles. No italics in the interface
except quotes in rich text. Sentence case everywhere. No uppercase labels.

### 2.3 Space

A 4 px grid. Allowed steps: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 (Tailwind `1`…`16`).
Back-office page padding: 24 px (16 px under 768 px). Career site gutter: 16 px on mobile,
32 px on desktop, content width 1120 px, reading width 680 px.

### 2.4 Radii

| Token | Value | Use |
|---|---|---|
| `rounded-sm` | 4 px | Inputs, buttons, badges, tags, kanban cards |
| `rounded-md` | 8 px | Panels, menus, popovers, kanban columns, CV sheet |
| `rounded-lg` | 12 px | Dialogs |
| `rounded-full` | — | Avatars and the rating dots only |

### 2.5 Elevation

Only floating elements have a shadow:

- `shadow-float` — menus, popovers, tooltips, toasts:
  `0 1px 2px rgb(24 35 58 / 0.08), 0 8px 24px -6px rgb(24 35 58 / 0.18)`
- `shadow-lift` — dialog, card being dragged:
  `0 2px 4px rgb(24 35 58 / 0.10), 0 16px 40px -8px rgb(24 35 58 / 0.28)`

### 2.6 Motion

| Token | Value | Use |
|---|---|---|
| `duration-fast` | 120 ms | Colour changes on press |
| `duration-base` | 180 ms | Panel slide, dialog fade, toast, card settling after drop |
| `ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | All of the above |

With `prefers-reduced-motion: reduce`, transforms are removed and durations drop to 0;
state changes stay instant and visible.

### 2.7 Focus

Every interactive element shows `outline: 2px solid cobalt; outline-offset: 2px` on
`:focus-visible`. Inside dense lists the outline is inset (`outline-offset: -2px`). Focus is
never removed without a replacement. Form controls are the one variation: their border turns
cobalt and a 1 px cobalt outline with no offset doubles it, so the focused field reads as a
2 px cobalt frame (danger when the field is invalid).

---

## 3. Layout

### Back office
- **Sidebar**, 216 px, stone, collapses to a 56 px icon rail between 768 and 1279 px.
  Contents: organisation, navigation (Offres, Vivier, Mentions, Paramètres), search hint
  (⌘K), account menu. The active item uses `cobalt-tint` with ink text.
- **Main area** on stone, page title (24 px) left-aligned with its primary action on the
  right of the same line. Lists are white panels with 1 px lines between rows.
- **Pipeline**: columns 272 px wide on `stone-strong`, 8 px radius, cards are paper with a
  1 px line. The page scrolls horizontally inside the board only.
- **Candidate panel** opens on the right of the kanban and pushes it, so the column stays
  visible. At ≥ 1280 px it is 2 columns: CV sheet (left) and details (right). Under 1280 px
  it is full width with a « CV / Détails » switch.
- Usable on a tablet (768 px and up): touch targets ≥ 40 px, drag and drop with touch sensor.

### Career site
- Brand bar (logo, company name, link to the company website), then immediately the jobs.
- On mobile the first job row is visible without scrolling at 390 × 844.
- Desktop: jobs list in the main column, company presentation and photo in a side column.
- Job page: reading column of 680 px, details as a definition list, application form at the
  end of the page; a sticky « Postuler » bar on mobile until the form is in view.

---

## 4. Components

Each component is shown in every state on `/design`.

| Component | Notes |
|---|---|
| **Button** | `primary` (cobalt fill), `secondary` (paper, `line-strong` border), `ghost` (no border), `danger` (danger fill). Sizes 28 / 32 / 40 px. States: rest, hover, focus, pressed, disabled, loading (label kept, small inline indicator). Never an arrow glyph. |
| **Icon button** | Square 28 / 32 px, always with `aria-label` and tooltip. |
| **Input / Textarea / Select** | 32 px high (40 px on the career site), `line-strong` border, 4 px radius, paper fill. Error: danger border + message below that says what to fix. Disabled: stone fill. |
| **Checkbox / Radio** | 16 px, ink border, cobalt when checked. Label clickable. |
| **Field** | Label (13 px, 500) above, optional hint below, error replaces hint. Required fields are marked « (obligatoire) » on the career site; optional ones « (facultatif) » in the back office. |
| **Badge** | Status of a job or an application: text + tint background, 12 px. Draft = stone, Published = success tint, Archived = stone with muted text, Hired = success, Rejected = danger, Pending = warning. |
| **Tag** | Free labels on candidates: paper, `line` border, 12 px, removable with a 16 px button. |
| **Mark** | The highlighter: `highlighter` background behind text, 2 px horizontal padding, no radius beyond 2 px. Used for search hits, mentions of you and the « Nouveau » count. |
| **Avatar** | Initials on stone, 24 / 32 px, ink text. No generated colours. |
| **Tabs** | Text tabs with a 2 px ink underline on the active tab. |
| **Dialog** | 12 px radius, paper, `shadow-lift`, title 20 px, actions bottom right, primary on the right. Esc closes. Focus trapped. |
| **Side panel** | Paper, 1 px left line, slides 16 px + fades in 180 ms. |
| **Dropdown / Popover** | Paper, 8 px radius, `shadow-float`, 32 px items, keyboard navigable. |
| **Tooltip** | Ink background, paper text, 12 px, 4 px radius, appears after 400 ms. |
| **Toast** | Bottom left, ink background, paper text, one action button (« Annuler »), 6 s. |
| **Skeleton** | Stone-strong blocks with the exact shape of the content. No shimmer. |
| **Empty state** | One sentence of what is missing, one sentence of why it matters, one primary action. No illustration. |
| **Kbd** | Paper, `line` border, 12 px, used for shortcut hints. |
| **Rating** | Five 24 px numbered circles (the digits teach the 1–5 shortcuts); filled ink up to the rating. Averages show as « 3,8 sur 5 » in tabular figures. |
| **Dropzone** | Dashed `line-strong` border, paper, explains accepted types and size; drag-over turns the border cobalt. Selected file shows name, size, « Remplacer » and « Retirer ». |
| **Rich text** | TipTap with bold, italic, headings (2 levels), lists, links. Rendered with a reading style: 16 px, 24 px line height, 680 px max. |
| **List row** | 40 px min height, 1 px line between rows, hover `stone` background, selected `cobalt-tint`. |
| **Kanban card** | Paper, 1 px line, 4 px radius. Name (14, 500), applied date, rating, tags. A new card has a highlighter bar on its left edge and a « Nouveau » mark. While dragged: `shadow-lift`, rotate 0. |
| **Command palette** | Dialog at top third, input 16 px, grouped results, ↑ ↓ Enter, Esc. |

---

## 5. Writing

- French by default, English available. Vouvoiement, short sentences, sentence case, active
  verbs, no exclamation marks, no emoji.
- Buttons say what happens: « Publier l'offre », « Envoyer l'email », « Refuser le candidat ».
- Confirmations repeat the verb: « Offre publiée », « Email envoyé », « Candidat refusé ».
- Errors say what to fix: « Le CV doit être un fichier PDF ou DOCX de 10 Mo maximum. »
- Empty states propose the next action: « Aucune offre publiée. Publiez une offre pour la
  faire apparaître sur votre site carrière. » + « Créer une offre ».
- Dates: relative under 7 days (« il y a 3 jours »), otherwise « 12 mars 2026 ».
- Metadata is laid out in separate elements or a definition list, never chained with « · ».

---

## 6. Forbidden

Checked against every screen before it is committed.

- Decorative gradients, gradient text, frosted glass, 3D blobs, generic illustrations.
- Emojis in the interface.
- Content cut into identical rounded cards with the same grey shadow.
- Small uppercase letter-spaced labels above titles; a single coloured or italic word in a title.
- « → » added to buttons, information chained with « · », 01 / 02 / 03 numbering on content
  that is not a sequence.
- Monospace font for small data.
- Entrance animation on every section, hover effect on every card.
- Cream background with terracotta accent; black background with acid green accent.
- Hollow marketing copy, lorem ipsum.

---

## 7. Screen review checklist

Run on the 1440 px and 390 px screenshots of every screen before it is committed:

1. Is the most important thing on the screen the most visible one?
2. Is yellow used only for new, mentioned or found items — three times at most?
3. Any shadow on something that does not float? Any card grid of identical boxes?
4. Any text size, colour or radius outside the tokens?
5. Does every empty state propose the next action, every error say what to fix?
6. Keyboard: can the screen be used without a mouse, is focus visible everywhere?
7. Anything from §6?
8. Remove one decorative element before validating.

Findings and corrections are logged in `DECISIONS.md` under « Design reviews ».

## 8. Self-review of this document

Reviewed against §6 before the first screen:
- Kanban cards had a hover lift in the first draft. Removed: hover only darkens the border;
  the grab cursor already says the card can be moved.
- Badges were drafted in uppercase 11 px. Replaced by 12 px sentence case, which is also on
  the type scale.
- The career site footer was drafted as « Propulsé par Open ATS · Confidentialité ». Replaced
  by two separate links.
