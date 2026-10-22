# Room Pass — Design

**Date:** 2026-10-21
**Status:** Approved in brainstorming, pending written-spec review
**Sub-project:** 1 of 3 in the "shopping & curation" initiative (2 = Product library + Shop the Look, 3 = Public curated lists — each gets its own spec)

## 1. Purpose

Turn the $5 one-shot preview into a **$5 Room Pass**: one room, 7 days, the first preview plus up to 5 restyles, with a booking perk from Marjorie. Goals, in priority order:

1. **More consult bookings** — every pass state funnels toward Marjorie; running out of restyles is a booking moment, not a dead end.
2. **More reason to pay $5** — the $5 stays the side-revenue entry point (no subscription; a recurring membership is reconsidered only if repeat pass purchases show demand).
3. **Measurable** — perk-code redemption tells us whether $5 previews turn into paid services.

Decided against (brainstorm record): a $5/week unlimited subscription à la House Dressed — cannibalizes bookings, ~9% Stripe fixed-fee drag per weekly charge, requires accounts/recurring billing/dunning, and is unproven.

## 2. The offer

- **$5 Room Pass** (price from `config/app.priceCents`), one-time, not recurring.
- **First preview + up to 5 restyles** (6 images max) within **7 days** of payment.
- A restyle = **new `styleSlug` + `colorMood` on the same photo**. All other answers (room type, keep, budget, timeline) carry over. No free text, no new photo.
- Previews carry a **small corner watermark** ("Preview by Lyssasky"), full resolution.
- **Perks** (both, not either/or):
  - **Free 15-min chat** with Marjorie, framed as "Marjorie will have your looks ready" (she sees the lead briefing card).
  - **10% off Virtual Styling (from $250/room) or Room Refresh (from $650/room)** via a per-lead code, valid **30 days** from payment.

## 3. Data model

### Lead (new fields, set atomically when payment is confirmed)

```ts
pass?: {
  restylesTotal: number;   // from config.passRestyles at payment time (5)
  restylesUsed: number;    // 0 at start; first preview does NOT count
  expiresAt: number;       // paidAt + config.passDays days
  inFlight?: number;       // ms timestamp; set while a restyle is generating (concurrency guard)
};
perk?: {
  code: string;            // e.g. "ROOM-7KX2"
  discountPct: number;     // from config.perkDiscountPct (10)
  validUntil: number;      // paidAt + config.perkDays days
  redeemedAt?: number;     // set by admin
};
looks: { imagePath: string; styleSlug: string; colorMood: string; createdAt: number }[];
remindedAt?: number;       // expiry-reminder email claimed (idempotency)
booking.interest?: 'chat' | 'virtual_styling' | 'room_refresh';
```

`looks` is the labeled list for the gallery; `generatedImagePaths` is kept and still appended (admin and existing code depend on it). `regenerateCount` is removed along with the old one-free-regenerate rule.

### AppConfig (new, editable in `/admin/config`)

`passRestyles` (5), `passDays` (7), `perkDiscountPct` (10), `perkDays` (30). `loadConfig` already field-merges `DEFAULT_CONFIG`, so existing config docs pick up defaults.

Values are **snapshotted onto the lead at payment**; later config or price changes never alter an existing pass.

### Domain logic — `src/domain/pass.ts` (pure, shared shape with functions)

`restylesLeft(lead)`, `isPassExpired(lead, now)`, `canRestyle(lead, now)`, `isPerkValid(lead, now)`, `generatePerkCode(rand)` — 4 chars from an unambiguous alphabet (no O/0/I/1), prefixed `ROOM-`; collision checked against existing leads and regenerated.

## 4. Server behaviour

### Payment confirmed (`handlePaymentConfirmed`)
In the same write that moves the lead to `paid`: set `pass`, `perk`, `looks: []`.

### First preview (`onLeadPaid` → `runGeneration`)
Unchanged except: append to `looks` (with the questionnaire's style/colorMood) and watermark the output.

### `restyle` callable (replaces customer use of `regenerate`)
Input: `{ leadId, styleSlug, colorMood }`.
1. Auth + ownership (admin bypasses ownership).
2. Validate `styleSlug` is an active style and `colorMood` is a configured option.
3. **Transaction:** reject if no `pass`, expired (`failed-precondition`, "Your Room Pass has ended"), `restylesUsed >= restylesTotal` (`resource-exhausted`), or `inFlight` set and < 3 min old (`aborted`, "A look is already being generated"). Otherwise `restylesUsed += 1`, `inFlight = now`.
4. Run generation with the overridden style/colorMood. On success append to `looks` + `generatedImagePaths`, clear `inFlight`. **Status is not changed** when the lead is `rated` or `booked` (restyles allowed until expiry regardless of status); a `generated` lead stays `generated`.
5. On failure: transaction refunds (`restylesUsed -= 1`), clears `inFlight`, records the failed `GenerationRecord`; lead status does **not** move to `failed` (only a failed *first* preview does, as today).

The admin "Re-run generation" keeps working and does not consume restyles.

### Watermark
Applied server-side with `sharp` after generation, before the image is written to Storage; asset `functions/assets/watermark.png`. If watermarking throws, save the unwatermarked image, log, and flag the `GenerationRecord` (`watermarkFailed: true`) — never cost the customer a restyle.

### Expiry reminder — scheduled function (new)
Runs hourly. Finds paid leads where `pass.expiresAt` is within the next 24h, no `booking`, no `remindedAt`, has an email. Claims `remindedAt` transactionally, then writes a `mail` doc of new kind `pass_expiring`. In the emulator nothing sends (same as all mail today).

### Emails
- `result_ready` (first preview only, unchanged trigger): add pass summary (restyles left, end date), perk code + validity, existing cross-device link.
- `pass_expiring` (new, above): their looks, chat CTA, perk.
- `booking_notification`: add perk code + validity, `booking.interest`, thumbnails/links for every look.

### Admin
- `adminMarkPerkRedeemed({ leadId })` — `assertAdmin`; sets `perk.redeemedAt`.
- Lead detail: pass usage, looks with style labels, perk code + validity + redeem button.
- Analytics: average restyles used per paid pass; perk redemption rate (redeemed ÷ paid).

### Rules
No change: lead writes remain callable-only (`allow write: if false`); owners already read their own lead.

## 5. Customer UI

### Landing + checkout copy
"$5 Room Pass — see your room in up to 6 looks over 7 days, plus a free chat with Marjorie and 10% off her services." Checkout lists inclusions.

### Result page (`src/funnel/ResultStep.tsx`), top to bottom
1. Current look — existing before/after slider, labeled "<Style> · <Color mood>".
2. **Your looks** — thumbnail strip of `looks`; tapping one makes it current.
3. **Pass status** — "4 restyles left · ends Oct 28".
4. **Try another look** — inline picker: style gallery cards (reuse the questionnaire gallery component; tried styles marked "tried", still selectable) → color mood chips → **Restyle**; reuses `WaitScreen` while generating; errors shown inline with Try again.
5. **Marjorie card** — "Book your free 15-min chat — Marjorie will have your looks ready" (→ BookingStep) and "10% off Virtual Styling (from $250) or Room Refresh (from $650) — code ROOM-7KX2, valid until <date>".
6. Rating — unchanged; asked once after the first preview.

**Exhausted or expired:** picker replaced by "You've explored N looks — next step: talk them through with Marjorie" (primary: chat; secondary link: "Start a new Room Pass" → landing). All looks remain viewable forever, including via the emailed token link (`getResultByToken` returns `looks`, `pass`, `perk`).

### Booking step (`src/funnel/BookingStep.tsx`)
Shows the perk code; adds an "I'm interested in" select: free chat / Virtual Styling / Room Refresh → `booking.interest`.

## 6. Legacy data
Nothing is live (emulator only). Leads without `pass` render with no restyle UI and no perk. Seed script adds sample leads in each pass state: fresh, partly used, exhausted, expired, booked-with-perk-redeemed.

## 7. Testing (test-first, as in Phases 1–2)
- **Unit:** `src/domain/pass.ts` (all helpers, boundaries at exactly-expired / exactly-exhausted, code alphabet); ResultStep component per pass state; BookingStep interest select.
- **Functions integration (emulator):** payment confirmation sets pass/perk/looks from config; `restyle` — cap, expiry, ownership, invalid style/colorMood, refund on failure, concurrent calls (one wins), status unchanged for rated/booked; watermark-failure path; reminder scheduler — sends once, skips booked/emailless/already-reminded; booking notification contains perk + interest + looks; `adminMarkPerkRedeemed` admin-only; analytics metrics.
- **Playwright E2E:** pay → first preview → restyle twice → thumbnail strip shows 3 looks → book with perk code visible; exhausted pass shows the Marjorie screen.

## 8. Out of scope
Real Stripe (Phase 3); Product library + Shop the Look (sub-project 2); public curated lists (sub-project 3); starting a new pass on the same photo; gifting passes; subscriptions.

## 9. Decisions carried to sub-project 2 (for its own spec)
Curation = "paste-a-link + AI tagging + Marjorie approves on phone": browser "Save to Lyssasky" bookmarklet/share target reads product JSON-LD in the curator's own browser (avoids server-side blocking); screenshot → Gemini field extraction as fallback; display images only from affiliate-licensed sources; Amazon link-only until Product Advertising API eligibility (verify current Amazon API at build time); affiliate links via Sovrn Commerce or Skimlinks; prices shown as "~$X at <retailer>, checked <date>" with a weekly re-check job; start with ~12–15 products per style.
