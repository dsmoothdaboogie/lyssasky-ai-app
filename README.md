# Lyssasky Room Preview

A mobile-first paid lead funnel for interior stylist Marjorie. A visitor
uploads a photo of their room, answers a short style questionnaire, pays a
small deposit ($5), and gets back an AI-restyled preview of their room in
their chosen style. They rate the preview and are invited to book a full
consultation with Marjorie. Every step along the way creates and enriches a
"lead" record that shows up in an internal admin dashboard as a sales-ready
briefing card.

The whole app runs offline against the Firebase Emulator Suite — no live
Firebase project, Stripe account, or Gemini key is required for local
development or the test suite. Payment and image generation are implemented
behind provider interfaces with mock defaults, so the funnel is fully
exercisable end-to-end without any external services, and can be flipped to
real Gemini generation later behind a single config flag (see
[Go live with real Gemini](#go-live-with-real-gemini) below).

## Funnel flow

1. **Landing** → customer starts the flow (anonymous auth session created).
2. **Upload** → customer uploads a room photo (stored in Firebase Storage,
   a `leads` document is created via a callable at this point).
3. **Questionnaire** → room type, style pick (from a seeded style library),
   color mood, budget, timeline, optional "keep" notes.
4. **Email** → customer's email is captured on the lead *before* payment, so
   an abandoned/closed-browser session is still a reachable lead.
5. **Checkout** → payment ($5, mocked by default). On confirmation the lead
   transitions to `paid`, which triggers generation server-side.
6. **Wait / Result** → the client watches the lead document for the
   generated preview image and shows it with a before/after comparison, the
   pass status ("N restyles left · ends …") and the perk code. The customer
   can restyle the same photo with a new style + mood until the pass runs out;
   a looks strip keeps every look.
7. **Rate** → customer rates the result (1–5).
8. **Book** → customer is invited to book a free 15-minute chat with Marjorie
   (Calendly link), choosing what they're interested in; the booking step
   shows the perk code.

Every step is backed by a `leads` document whose `status` moves through a
strict state machine (`captured → paid → generated → rated → booked`, plus
`failed`/retry paths — see `src/domain/leadStatus.ts`), and an `events`
subcollection records a timeline for the admin briefing card.

## Room Pass

The $5 purchase is a **Room Pass** (one room, `passDays` = 7 days): the first
preview plus up to `passRestyles` = 5 restyles. A restyle picks a new style +
color mood on the same photo (`restyle` callable, `functions/src/restyle.ts`);
failed restyles are refunded. Previews get a corner watermark
(`functions/src/generation/watermark.ts`; asset regenerated with
`npx tsx functions/scripts/makeWatermark.ts`). Each pass carries a perk code
(`ROOM-XXXX`, 10% off Virtual Styling / Room Refresh for `perkDays` = 30 days)
shown on the result page, the booking step and every email; Marjorie marks it
redeemed on `/admin/leads/:id`. An hourly scheduled function
(`passReminderSchedule`) queues a "pass ends tomorrow" email — scheduled
functions don't fire in the emulator; the handler is integration-tested.
All four numbers are editable at `/admin/config` and are snapshotted onto each
lead at payment. `npm run seed` also writes sample leads in every pass state
(`sample-*`).

## Tech stack

- **Frontend**: React 19 + Vite + TypeScript, React Router, plain CSS
  (mobile-first, no CSS framework).
- **Backend**: Firebase — Firestore (leads, styles, config, generations,
  events), Cloud Storage (photos + generated images), Cloud Functions
  (callables + Firestore triggers), Anonymous Auth (customers) and
  email/password Auth with a custom `admin` claim (internal admin area).
- **AI generation**: Google Gemini image editing (`@google/genai`), behind a
  `GenerationProvider` interface with a mock provider as the default.
- **Payments**: behind a `PaymentProvider` interface; Phase 1 ships a mock
  provider only (no real Stripe integration yet — see
  [Phase 1 scope](#phase-1-scope--deviations)).
- **Testing**: Vitest (unit/component, jsdom), Firebase Rules Unit Testing +
  Vitest against the emulator (functions/integration/security-rules), and
  Playwright (mobile-viewport end-to-end).

## Key design decisions

- **Customers use Anonymous Auth, not accounts.** There's no sign-up/login
  for the funnel — an anonymous Firebase Auth session is created on landing
  and is the customer's identity for the rest of the flow.
- **All customer Firestore writes go through callable Cloud Functions**
  (Admin SDK, server-side). The client never writes `leads`/`generations`/
  `events` documents directly — it only *reads* documents it owns (enforced
  by Firestore rules keyed on the anonymous `uid`) and uploads its own photo
  to a per-lead Storage path. This keeps the lead pipeline and status
  machine tamper-proof from the client.
- **Payment and generation are behind provider interfaces with mock
  defaults.** `PaymentProvider` and `GenerationProvider` are small
  interfaces; Phase 1 wires up mock implementations by default (config-
  driven via `config/app.paymentMode` / `config/app.generationMode`), with a
  real Gemini-backed `GenerationProvider` implementation already written and
  ready to flip on (see below). This keeps local dev and the full test suite
  runnable completely offline.

## Prerequisites

- **Node.js 20+**
- **A JDK** (Java 11+) — required by the Firebase Emulator Suite. Any recent
  OpenJDK works (`brew install openjdk` on macOS).
- **`firebase-tools`** — install globally: `npm install -g firebase-tools`

## Setup

```bash
# from the repo root
npm install
npm install --prefix functions

# environment files (both are git-ignored; safe local defaults are provided)
cp .env.example .env.local
cp functions/.env.example functions/.env.local
```

`.env.local` (root) configures the Vite client to talk to the emulator suite
using the demo project `demo-lyssasky`. `functions/.env.local` is only
needed if you plan to use the real Gemini provider (see below) — it's empty
by default and the mock provider doesn't read it.

## Run the app locally

This is a two-terminal flow: one terminal runs the emulator suite, the
other seeds it and then runs the Vite dev server.

**Terminal 1 — start the emulators:**

```bash
npm run emulator
```

Leave this running. The Emulator UI is at **http://localhost:4000** —
useful for browsing Firestore/Storage/Auth data and function logs while
developing.

**Terminal 2 — seed the demo project, then run the app:**

```bash
npm run seed
VITE_USE_EMULATORS=true npm run dev
```

`npm run seed` builds `functions/`, writes `config/app` + the 8 seeded
styles to Firestore, and creates the admin user — all against the emulator
started in Terminal 1 (you only need to re-run it after clearing emulator
data; the emulators keep their in-memory state for as long as the
`emulator` process stays up).

Open the printed local URL (Vite defaults to http://localhost:5173). The
admin area is at `/admin` — sign in with the seeded admin account
(`admin@lyssasky.test` / `password`).

## Testing

**Unit / component tests** (Vitest, jsdom, no emulator needed):

```bash
npm test
```

**Functions integration + Firestore/Storage security-rules tests** (need the
emulator; `emulators:exec` starts it, runs the command, and tears it down
automatically):

```bash
firebase emulators:exec --project demo-lyssasky --only auth,firestore,storage \
  'cd functions && npx vitest run'
```

**End-to-end tests** (Playwright, mobile viewport, full emulator stack
including Cloud Functions — builds the functions bundle, boots the
emulators, seeds config/styles/admin, then runs the funnel + admin specs):

```bash
npm run e2e
```

## Go live with real Gemini

By default, generation is mocked (`config/app.generationMode = 'mock'`) so
dev and tests never call an external API. A real Gemini-backed
`GenerationProvider` is already implemented (`functions/src/generation/
geminiProvider.ts`); to try it against a live key:

1. Get an API key from Google AI Studio: https://aistudio.google.com/apikey
2. Put it in `functions/.env.local`: `GEMINI_API_KEY=<your key>`.
3. Flip the seeded config document `config/app`'s `generationMode` field
   from `'mock'` to `'gemini'` (edit it directly in the Emulator UI at
   http://localhost:4000, under Firestore — this is a one-off doc edit, not
   a code change; the default in `src/config/defaultConfig.ts` stays
   `'mock'`).
4. Run one generation end-to-end through the funnel (or trigger it directly)
   with a real room photo, and confirm a restyled image lands in Storage and
   the corresponding `generations` document has `status: 'success'`.
5. Revert `config/app.generationMode` back to `'mock'` afterward so default
   dev/test runs stay fully offline. Double-check the model id in
   `geminiProvider.ts` is still current before any production rollout (the
   file has a fallback note if the current model id 404s).

No live Gemini call has been made as part of building this app — the
provider is verified against current Google documentation only, and the
live smoke test above is a manual step for whoever holds a real API key.

## Phase 2 — admin refinement tools

Phase 2 adds four admin areas on top of the Phase 1 funnel + leads dashboard,
plus a real (mocked-transport) email notification path and a cross-device
result link. Everything still runs offline against the emulator suite — no
new external services are required.

**Admin areas** (all under `/admin`, behind the existing admin-claim auth
gate):

- **Styles CRUD** — `/admin/styles` (list), `/admin/styles/new` (create),
  `/admin/styles/:slug` (edit). Full create/edit/reorder/retire of the style
  library that used to be seed-script-only in Phase 1.
- **Test bench** — `/admin/testbench`. Lets Marjorie try a recipe (prompt
  variant) against an uploaded photo and generate a preview *without* going
  through payment, so recipes can be iterated on directly. Every test-bench
  generation is recorded with its recipe snapshot alongside real customer
  generations, so analytics can correlate rating with recipe/style over time.
- **Config editor** — `/admin/config`. Edits the singleton `config/app`
  document (pricing, questionnaire, Calendly URL, payment/generation mode,
  `notifyEmail`, feature flags) in-app instead of hand-editing Firestore in
  the Emulator UI.
- **Analytics** — `/admin/analytics`. Funnel drop-off, style popularity,
  average rating per style, budget/timeline distribution, and revenue,
  aggregated from `leads`/`generations`.

**Email notifications** — implemented by writing documents to a `mail`
Firestore collection in the shape the Firebase **"Trigger Email"** extension
expects (`{ to, message: { subject, html }, ... }`, see
`functions/src/email/sendEmail.ts`). In the emulator, nothing is actually
sent — the extension isn't installed — so a "sent" email is just a `mail`
doc:

- **Booking notification → Marjorie**: fired when a lead's status flips to
  `booked` (`functions/src/email/sendEmail.ts`'s `onLeadBooked` trigger),
  summarizing the customer's answers, rating/feedback, and booking details.
- **Result-ready → customer**: fired when a funnel-sourced generation
  succeeds and the lead has an email on file (`functions/src/generation/
  runGeneration.ts`'s `sendResultReadyEmail`), containing the tokenized
  result link (see below).

To view "sent" mail locally: open the Emulator UI at
http://localhost:4000, go to Firestore, and browse the `mail` collection —
each document has the exact subject/HTML that would go out. Mail docs are
also admin-readable (Firestore rules), so they could be surfaced in-app if
needed.

At go-live, install the Firebase **"Trigger Email"** extension plus an SMTP
provider (e.g. SendGrid) against the real project — the extension watches
the same `mail` collection shape already being written, so no application
code changes are needed, only the extension install + SMTP config.

**Tokenized cross-device result link** — a lead has an opaque `leadToken`
(`src/domain/types.ts`). The result-ready email links to
`/result?lead=<leadId>&token=<leadToken>`. Opening that link on a new
device gets a fresh anonymous-auth uid that doesn't own the lead, so the
client instead calls the `getResultByToken` callable
(`functions/src/result.ts`), which trusts the token as the credential and
returns the generated image path(s) read-only (no rating/feedback/
regenerate — those stay owner-only). The same-device flow (`?lead=` only,
no token) still uses the normal owner-scoped `fetchLead` read.

## Phase 1 scope & deviations

Phase 1 intentionally ships a working, fully-testable funnel with two
pieces mocked by default:

- **Mock payment** — no real Stripe integration; `PaymentProvider` is mocked
  and confirms "payment" immediately. Swapping in real Stripe is a Phase
  2/3 item.
- **Mock generation** — real Gemini image generation is implemented but
  off by default (see above); it's config-gated rather than always-on so
  the test suite and local dev don't require external API access.
- **Anonymous-auth customer identity** — no customer accounts/passwords;
  a lead is tied to an anonymous Firebase Auth `uid`.
- **All customer writes go through callables** — the client has no direct
  write access to `leads`/`generations`/`events`; only the Admin SDK
  (server-side, in Cloud Functions) writes those collections. Firestore/
  Storage security rules enforce owner-only reads.

**Explicitly out of scope for Phase 1** (status as of Phase 2):

- ~~Styles CRUD UI~~ — **done in Phase 2** (`/admin/styles`).
- ~~Admin "test bench" for trying prompts/recipes~~ — **done in Phase 2**
  (`/admin/testbench`).
- ~~Admin config editor UI~~ — **done in Phase 2** (`/admin/config`).
- ~~Analytics/correlation dashboard~~ — **done in Phase 2**
  (`/admin/analytics`).
- ~~Email notifications~~ — **done in Phase 2** (mail-collection based; see
  above). Abandoned-cart recovery emails are still not implemented — see
  Phase 3 below.
- Real Stripe payment integration — still deferred (Phase 3).
- Custom DNS / production hosting setup — still deferred (Phase 3).
- Portfolio images and other marketing-site content beyond the funnel —
  still deferred (Phase 3).

## Phase 2 status & what's left for Phase 3

**Phase 2 is done.** All four admin areas (styles, test bench, config,
analytics), the mail-collection email notifications, and the tokenized
cross-device result link are implemented and covered by tests (unit,
functions/integration, security-rules, and e2e).

**Deferred to Phase 3** (not started):

- Real Stripe payment integration (Phase 1/2 ship `PaymentProvider` mocked
  only).
- Custom DNS / production hosting setup.
- Installing the real Firebase "Trigger Email" extension + an SMTP provider
  so `mail` collection docs actually send (the doc shape is already
  extension-compatible — see above).
- Portfolio images and other marketing-site content at scale.
- Parked/nice-to-have items: automated abandoned-lead emails, auto-suggested
  recipe improvements (beyond manual test-bench iteration), multiple
  generated variations per purchase, French localization, gift codes.

## Project structure

```
src/                  React app (customer funnel + admin area)
  funnel/             Funnel step screens (upload, questionnaire, email, ...)
  admin/              Admin login, leads list, lead briefing card
  domain/             Shared domain logic (lead status machine, prompt builder, types)
  firebase/           Firebase client init + callable/query wrappers
  config/             Default app config (questionnaire, pricing, modes)
functions/            Cloud Functions (Admin SDK) — callables, triggers, seed scripts
  src/generation/     Mock + Gemini GenerationProvider implementations
  src/payment/        Mock PaymentProvider implementation
  src/seed/           Emulator seed scripts (config + styles, admin user)
e2e/                  Playwright end-to-end specs + fixtures
docs/                 Design spec + implementation plan
```
