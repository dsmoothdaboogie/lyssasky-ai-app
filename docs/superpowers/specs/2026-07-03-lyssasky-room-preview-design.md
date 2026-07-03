# Lyssasky Room Preview — Design

**Date:** 2026-07-03
**Status:** Approved pending final review
**Note:** This is a new product, to be built as a fresh project (new repo) at `~/Desktop/lyssasky-ai-app`, not an extension of the excel-upload app. The spec lives here because brainstorming happened in this workspace; it will be copied into the new repo when implementation begins.

## 1. Purpose

A paid lead-capture funnel for Lyssasky Interior Styling (lyssasky.com, Squarespace-hosted, GTA-based, services from $250/room virtual and $650/room local). Customers pay $5 CAD to see an AI-restyled version of their own room. The generated image is intentionally a *preview* — the gap between it and their true vision is the sales hook for booking a consultation with Marjorie.

Goals, in balance:
1. A working end-to-end funnel (pay → upload → generate → book)
2. Generation quality good enough to sell — the customer's *actual room* restyled, not a hallucinated lookalike
3. Data capture from day one: what customers asked for, what the AI produced, what they'd change — feeding both analytics and a human-in-the-loop improvement cycle, and giving Marjorie a complete pre-consult briefing per lead

## 2. Architecture

- **Frontend:** React (Vite), mobile-first (customers photograph rooms with phones). Hosted on Firebase Hosting at `design.lyssasky.com` (DNS CNAME added in Squarespace; main site untouched, linked via a button).
- **Backend:** Firebase — Firestore (data), Cloud Storage (room photos + generated images), Auth (admin only; customers never create accounts), Cloud Functions (payment, generation — the only place API keys live).
- **Image AI:** Gemini image editing (room-structure-preserving restyle). Chosen for best-in-class architecture preservation; user has prior success with Gemini. Cost ~$0.04–0.15/image (~1–3% of the $5 sale).
- **Payments:** Stripe Checkout, $5 CAD — behind a provider interface with a **mock mode** (default until the Stripe account exists). Mock checkout has "simulate success/cancel" buttons that fire the same server-side path as the real webhook.
- **Booking:** lead form + Calendly embed (Calendly URL configurable).
- **Voice & branding:** matches Lyssasky — warm, supportive, "no pressure, no judgment."

## 3. Customer Funnel

```
Landing page (examples, $5 offer, Lyssasky voice)
  → Upload room photo
  → Questionnaire
  → Email capture                ← lead saved HERE, before payment
  → Stripe Checkout ($5 CAD)
  → Generation (~15–30s, pleasant wait screen, Firestore realtime listener)
  → Result + rating + "What would you change?" free text
  → Booking pitch: lead form + Calendly embed
```

**Pay-late rationale:** abandoners at the payment step are still captured (email + photo + preferences) at zero AI cost — generation only ever runs after payment confirms.

**Questionnaire (v1, config-driven — editable without redeploy):**
1. Room type — living room / bedroom / kitchen / dining / office / other
2. Design style — visual gallery pick from the style library (~8 styles at launch)
3. Color mood — warm & cozy / light & airy / bold & dramatic / neutral & calm
4. What to keep — optional free text ("keep my sofa")
5. Budget range — under $1K / $1–5K / $5–15K / $15K+ (lead qualification)
6. Timeline — just dreaming / within 3 months / ASAP (lead qualification)

**Post-generation feedback:** 1–5 rating ("How close is this to your vision?") + free-text "What would you change?" — the core input for both Marjorie's consult prep and recipe refinement.

## 4. Style Library

Each style record: name, slug, customer-facing description, 2–4 gallery images, **prompt recipe** (the Gemini instructions: materials, palettes, furniture shapes, what to avoid), sort order, active flag.

Seeding strategy: launch with ~8 curated styles (Claude-written recipes + royalty-free interior photos), progressively replaced with Lyssasky portfolio images and tuned recipes via the admin tools. Employee-editable — no developer needed to add or adjust styles.

## 5. Admin Area (`/admin`, Firebase Auth)

- **Leads** — list with status/filters + per-lead card: original photo, questionnaire answers, generated image(s), rating, "what would you change," payment status, booking status. One screen = Marjorie's pre-consult briefing.
- **Styles** — full CRUD on the style library.
- **Test bench** — upload any photo, pick a style/recipe (or edit inline), generate without payment, compare results side-by-side. This is the refinement loop for employees.
- **Config** — questionnaire definition, price, Calendly URL, payment mode (mock/stripe), feature toggles.
- **Analytics** — funnel (visits → uploads → paid → generated → rated → booked), style popularity, average rating per style (low rating = recipe needs test-bench work), budget/timeline distribution, revenue.

## 6. Data Model (Firestore)

- **`leads`** — email, room photo ref, answers, status (`captured → paid → generated → rated → booked`), Stripe payment id, generated image ref(s), rating, feedback text, booking form data, per-step timestamps. Repeat emails create new lead docs; admin groups history by email.
- **`styles`** — as in §4.
- **`config`** — questionnaire, price, Calendly URL, toggles, payment mode.
- **`generations`** — every Gemini call (funnel or test bench): input photo, style + **recipe snapshot** (recipes evolve; we record what was actually used), output, duration, cost estimate, source, linked lead. The learning-loop dataset.
- **`events`** — analytics stream (`page_view`, `photo_uploaded`, `checkout_started`, `payment_completed`, …).

## 7. Payment → Generation Flow (critical path)

1. Client uploads photo to Storage; lead saved → `captured`
2. Function creates Stripe Checkout session tied to lead id; browser redirects to Stripe
3. **Stripe webhook** (server-side, never the browser) confirms payment → lead `paid` → triggers generation
4. Generation Function: photo + recipe snapshot + answers → Gemini request ("restyle in X; preserve architecture, windows, layout; keep: [keep-list]") → output to Storage → lead `generated`
5. Client's wait screen live-listens to the lead doc and reveals the image when ready

Webhook-driven generation means a closed browser after payment still produces the image; customer gets an emailed result link. Mock mode fires the identical downstream path.

## 8. Edge Cases & Error Handling

- **Bad photos:** client-side validation (min resolution, type, ~10MB cap, HEIC→JPEG conversion) with friendly guidance.
- **Generation failure:** 1 automatic retry; then lead flagged in admin, customer sees warm apology + "we'll email your design shortly"; admin can re-run from the lead card.
- **Unsatisfying result:** paying customers get 1 free re-generate button.
- **Paid, browser closed:** webhook generates anyway; email with result link.
- **Abandoned pre-payment:** lead visible at `captured` in admin for manual follow-up (automated recovery email = later phase).
- **Refunds:** via Stripe dashboard; no in-app flow.

## 9. Security

- Customers: no accounts. A random lead token held in the browser session scopes access to their own lead/images only.
- Admin routes, all Firestore/Storage writes: Firebase Auth + security rules.
- Stripe + Gemini keys exist only in Cloud Functions config.

## 10. Build Phasing

- **Phase 1 — working funnel:** full customer journey with mock payment, real Gemini generation, seeded styles, basic admin (login, leads list, lead card). Deployed.
- **Phase 2 — refinement tools:** style manager, test bench, config editor, analytics dashboard, email notifications (booking → Marjorie; result link → customer, via a Firebase email extension).
- **Phase 3 — go live:** real Stripe (test cards → live), DNS `design.lyssasky.com`, Squarespace link, portfolio images.
- **Parked:** automated abandoned-lead emails, auto-suggested recipe improvements from ratings, multiple variations per purchase, French, gift codes.

## 11. Testing

- **Unit/component tests — Vitest + React Testing Library:** prompt builder (recipe + answers → Gemini request), lead status transitions, config-driven questionnaire rendering, upload validation.
- **E2E tests — Playwright:** the full funnel against the Firebase Emulator Suite (upload → questionnaire → mock payment → generation → feedback → booking), plus admin login and lead-card flows. Mobile viewport included (funnel is mobile-first).
- **Firebase Emulator Suite:** mock-payment event → generation → lead update, without real charges or API calls; also backs the Playwright runs.
- **Security rules tests:** customers cannot read other leads; writes are admin-only.
- Manual mobile walkthrough on a real phone pre-launch.

## 12. "AI Gets Smarter" — v1 Definition

Human-in-the-loop: ratings + "what would you change" feedback, correlated per style in analytics, guide employees refining prompt recipes in the test bench. Every generation is recorded with its recipe snapshot, building the dataset that could later support automated recipe suggestions. No model training in v1.
