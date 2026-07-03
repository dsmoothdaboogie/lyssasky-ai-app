# Lyssasky Room Preview — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the working Lyssasky Room Preview funnel end-to-end (landing → upload → questionnaire → email → mock payment → AI generation → rating/feedback → booking) plus a basic admin (login, leads list, lead card), all runnable and tested against the Firebase Emulator Suite.

**Architecture:** A Vite + React + TypeScript mobile-first SPA talks to Firebase (Firestore, Storage, Anonymous Auth for customers, Cloud Functions). All customer-triggered writes go through callable Cloud Functions using the Admin SDK; the client only reads its own data and uploads its own photo. Payment and image generation each sit behind a provider interface with a **mock** implementation (default) and a real implementation swapped in later. Everything is developed and tested locally against the Emulator Suite — no cloud project, Stripe account, or paid API calls in Phase 1.

**Tech Stack:** Vite, React 18, TypeScript, React Router, Firebase JS SDK (v10+, modular), Firebase Functions (Node 20, TypeScript), Firebase Emulator Suite, Vitest + React Testing Library, `@firebase/rules-unit-testing`, Playwright.

## Global Constraints

- **New repo** at `~/Desktop/lyssasky-ai-app`. Do not depend on any other project.
- **Mobile-first**: every customer-facing screen designed for a 375px-wide viewport first.
- **Emulator-first**: all code paths must run against the Firebase Emulator Suite with no real cloud project, no Stripe account, and no paid Gemini calls. Default `paymentMode: 'mock'` and `generationMode: 'mock'`.
- **No customer accounts**: customers authenticate via Firebase **Anonymous Auth** only. They never enter a password. Admins use email/password Auth.
- **All customer writes are server-side**: the web client never writes Firestore directly. It calls callable Cloud Functions. Client Firestore writes are denied by security rules. The only client-side write is a Storage upload of the customer's own photo to their own `uid`-scoped path.
- **API keys live only in Cloud Functions config/env** — never in the client bundle.
- **Voice & copy**: warm, supportive, "no pressure, no judgment." Marjorie is the stylist. Price is **$5 CAD**. Service framed as a *preview*, not the final vision.
- **Money is stored in cents** (integer). Price constant: `priceCents: 500`, `currency: 'CAD'`.
- **TDD**: write the failing test first for every task that carries logic. Commit after each task.

## Key Architecture Decisions (locked contract)

These names/types are referenced across tasks. Do not rename without updating every consumer.

### Shared domain types (`src/domain/types.ts`)

```ts
export type LeadStatus =
  | 'captured'   // photo + (maybe) answers/email saved, not paid
  | 'paid'       // payment confirmed, generation pending/running
  | 'generated'  // at least one output image produced
  | 'rated'      // customer submitted rating + feedback
  | 'booked'     // customer submitted booking form
  | 'failed';    // generation failed after retry; needs admin attention

export interface QuestionnaireAnswers {
  roomType: string;   // slug, e.g. "living_room"
  styleSlug: string;  // references a Style.slug
  colorMood: string;  // slug, e.g. "warm_cozy"
  keep?: string;      // free text, e.g. "keep my sofa"
  budget: string;     // slug, e.g. "1k_5k"
  timeline: string;   // slug, e.g. "within_3_months"
}

export interface StyleRecipe {
  description: string; // customer-facing; not sent verbatim to the model
  materials: string;   // "oak, linen, matte black metal"
  palette: string;     // "warm neutrals with terracotta accents"
  furniture: string;   // "low-profile sofas, tapered wooden legs"
  avoid: string;       // "no ornate carving, no cool blue tones"
}

export interface Style {
  slug: string;
  name: string;
  description: string;
  galleryImages: string[]; // URLs
  recipe: StyleRecipe;
  sortOrder: number;
  active: boolean;
}

export interface AppConfig {
  priceCents: number;      // 500
  currency: string;        // 'CAD'
  calendlyUrl: string;
  paymentMode: 'mock' | 'stripe';
  generationMode: 'mock' | 'gemini';
  questionnaire: QuestionDef[];
}

export interface QuestionOption { value: string; label: string; imageUrl?: string; }
export interface QuestionDef {
  id: keyof QuestionnaireAnswers; // 'roomType' | 'styleSlug' | ...
  prompt: string;
  type: 'single' | 'gallery' | 'text';
  required: boolean;
  options?: QuestionOption[]; // absent for 'text'
}

export interface Lead {
  id: string;
  ownerUid: string;          // anonymous auth uid
  leadToken: string;         // opaque, for future email links (Phase 2)
  email?: string;
  status: LeadStatus;
  answers?: QuestionnaireAnswers;
  originalPhotoPath?: string;        // Storage path
  generatedImagePaths: string[];     // Storage paths, newest last
  paymentId?: string;
  rating?: number;                   // 1..5
  feedback?: string;                 // "what would you change"
  booking?: { name: string; phone?: string; note?: string };
  costEstimateTotal: number;         // sum of generation cost estimates
  timestamps: Partial<Record<LeadStatus, number>>; // ms since epoch per status
  createdAt: number;
  updatedAt: number;
}

export type AnalyticsEventType =
  | 'page_view' | 'photo_uploaded' | 'questionnaire_completed'
  | 'email_captured' | 'checkout_started' | 'payment_completed'
  | 'generation_started' | 'generation_completed' | 'result_rated'
  | 'booking_submitted';

export interface AnalyticsEvent {
  type: AnalyticsEventType;
  leadId?: string;
  meta?: Record<string, string | number | boolean>;
  createdAt: number;
}

export interface GenerationRecord {
  id: string;
  leadId: string;
  source: 'funnel' | 'testbench';
  styleSlug: string;
  recipeSnapshot: StyleRecipe;   // what was actually used
  promptSnapshot: string;
  inputPhotoPath: string;
  outputPhotoPath?: string;
  durationMs: number;
  costEstimate: number;
  status: 'success' | 'failed';
  error?: string;
  createdAt: number;
}
```

### Provider interfaces

```ts
// functions/src/payment/provider.ts
export interface CheckoutSession { checkoutUrl: string; sessionId: string; }
export interface PaymentProvider {
  createCheckoutSession(input: {
    leadId: string; amountCents: number; currency: string;
  }): Promise<CheckoutSession>;
}

// functions/src/generation/provider.ts
export interface GenerationInput { photoBytes: Buffer; mimeType: string; prompt: string; }
export interface GenerationOutput { imageBytes: Buffer; mimeType: string; costEstimate: number; }
export interface GenerationProvider { generate(input: GenerationInput): Promise<GenerationOutput>; }
```

### Callable Cloud Functions (client → server contract)

| Function | Auth | Input | Output / effect |
| --- | --- | --- | --- |
| `createLead` | anon | `{}` | `{ leadId, leadToken }`; writes lead `captured`, `ownerUid = auth.uid` |
| `updateLeadAnswers` | anon (owner) | `{ leadId, answers, email }` | attaches answers + email; logs events |
| `startCheckout` | anon (owner) | `{ leadId }` | `{ checkoutUrl }`; logs `checkout_started` |
| `confirmPaymentMock` | anon (owner) | `{ leadId, sessionId }` | mock-mode only; runs shared `handlePaymentConfirmed` |
| `submitFeedback` | anon (owner) | `{ leadId, rating, feedback }` | lead → `rated` |
| `submitBooking` | anon (owner) | `{ leadId, booking }` | lead → `booked` |
| `regenerate` | anon (owner) | `{ leadId }` | re-runs generation once for a paid lead |
| `logEvent` | anon | `{ type, leadId?, meta? }` | appends `events` doc |
| `onLeadPaid` | (Firestore trigger) | lead update → `paid` | runs `runGeneration(leadId)` |

"owner" guard = `context.auth.uid === lead.ownerUid`.

### Deviations from spec (with rationale)

1. **Anonymous Auth instead of a bare token** — see Global Constraints. Rule-enforceable ownership; still no customer account. `leadToken` field retained for Phase 2 cross-device email links.
2. **Lead created at upload time** (not at email capture). §3 says "lead saved at email capture"; §7 step 1 says "lead saved at upload." We reconcile by creating the lead `captured` at upload and attaching email later — abandoners at payment still have email because the email step precedes payment. Generation still only runs after `paid`, preserving the pay-late cost guarantee.
3. **Generation triggered by a Firestore `onLeadPaid` trigger**, not inline in the payment handler — so a closed browser (webhook path in Phase 3) still generates. `runGeneration` is exported and tested directly against the emulator.
4. **Emailed result links deferred to Phase 2** (email notifications are Phase 2 in §10). Phase 1 result reveal uses the live anonymous session only.

## File Structure

```
lyssasky-ai-app/
├── firebase.json                 # emulators, hosting, functions, rules wiring
├── .firebaserc                   # demo project id for emulator
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
├── package.json                  # web app (Vite)
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── index.html
├── src/
│   ├── main.tsx                  # app entry + router
│   ├── App.tsx                   # routes
│   ├── firebase/
│   │   ├── client.ts             # SDK init, emulator wiring, anon sign-in
│   │   └── api.ts                # thin callable wrappers + listeners
│   ├── domain/
│   │   ├── types.ts              # shared types (above)
│   │   ├── prompt.ts             # buildGenerationPrompt
│   │   ├── leadStatus.ts         # transition machine
│   │   └── uploadValidation.ts   # client-side photo checks
│   ├── config/
│   │   └── defaultConfig.ts      # default AppConfig (questionnaire, price...)
│   ├── styles/
│   │   ├── tokens.css            # brand tokens
│   │   └── global.css
│   ├── components/               # shared UI (Button, ProgressBar, ...)
│   ├── funnel/
│   │   ├── FunnelLayout.tsx
│   │   ├── LandingPage.tsx
│   │   ├── UploadStep.tsx
│   │   ├── QuestionnaireStep.tsx
│   │   ├── EmailStep.tsx
│   │   ├── MockCheckoutPage.tsx
│   │   ├── WaitScreen.tsx
│   │   ├── ResultStep.tsx
│   │   ├── BookingStep.tsx
│   │   └── useFunnelState.ts     # in-memory funnel state (leadId, uid)
│   └── admin/
│       ├── AdminApp.tsx
│       ├── LoginPage.tsx
│       ├── LeadsListPage.tsx
│       └── LeadCardPage.tsx
├── functions/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              # exports all functions
│       ├── admin.ts              # Admin SDK singletons
│       ├── config.ts            # loadConfig()
│       ├── leads.ts              # createLead, updateLeadAnswers, feedback, booking
│       ├── checkout.ts           # startCheckout, confirmPaymentMock
│       ├── payment/
│       │   ├── provider.ts
│       │   ├── mockProvider.ts
│       │   └── handlePaymentConfirmed.ts
│       ├── generation/
│       │   ├── provider.ts
│       │   ├── mockProvider.ts
│       │   ├── geminiProvider.ts # real impl (needs key)
│       │   └── runGeneration.ts  # onLeadPaid trigger body
│       ├── events.ts             # logEvent
│       └── seed/
│           └── seed.ts           # writes default config + 8 styles to emulator
├── e2e/
│   ├── funnel.spec.ts
│   └── admin.spec.ts
└── docs/superpowers/...
```

Shared domain modules (`prompt.ts`, `leadStatus.ts`, `types.ts`) are imported by **both** the web app and Functions. To avoid a monorepo package, Functions imports them via a relative path (`../../src/domain/...`) using a small `tsconfig` `paths`/copy step defined in Task 2. Keep these modules dependency-free (no Firebase imports) so both sides can consume them.

---

## Milestone 0 — Project foundation

### Task 1: Scaffold the Vite React TypeScript app + test tooling

**Files:**
- Create: `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/setupTests.ts`, `.gitignore`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: a running dev server and a green `npm test`.

- [ ] **Step 1: Scaffold with Vite**

```bash
cd ~/Desktop/lyssasky-ai-app
npm create vite@latest . -- --template react-ts
# when prompted about the non-empty directory, choose "Ignore files and continue"
npm install
```

- [ ] **Step 2: Add test + tooling deps**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom react-router-dom
npm install react-router-dom
```

- [ ] **Step 3: Configure Vitest** — create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    css: false,
  },
});
```

Create `src/setupTests.ts`:

```ts
import '@testing-library/jest-dom';
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 4: Write the failing test** — `src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

test('renders the Lyssasky landing headline', () => {
  render(<MemoryRouter><App /></MemoryRouter>);
  expect(screen.getByText(/see your room, restyled/i)).toBeInTheDocument();
});
```

- [ ] **Step 5: Run it and confirm it fails**

Run: `npm test`
Expected: FAIL — headline text not found.

- [ ] **Step 6: Minimal `App.tsx`**

```tsx
export default function App() {
  return <h1>See your room, restyled</h1>;
}
```

Update `src/main.tsx` to wrap `<App/>` in `<BrowserRouter>`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter><App /></BrowserRouter>
  </React.StrictMode>
);
```

Create empty `src/styles/global.css` and `src/styles/tokens.css` (filled in Task 15).

- [ ] **Step 7: Run tests — green**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite React TS app with Vitest"
```

### Task 2: Firebase project + Emulator Suite wiring (functions in TS)

**Files:**
- Create: `.firebaserc`, `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `functions/package.json`, `functions/tsconfig.json`, `functions/src/index.ts`, `functions/src/admin.ts`
- Modify: root `.gitignore`

**Interfaces:**
- Produces: `firebase emulators:start` boots Auth, Firestore, Storage, Functions with a demo project; `helloWorld` callable reachable.

- [ ] **Step 1: Reinstall the Firebase CLI (current global install is broken)**

```bash
npm uninstall -g firebase-tools 2>/dev/null; npm install -g firebase-tools
firebase --version    # expect a version string, no ENOENT
```

If global install remains flaky, use `npx firebase-tools@latest` in every command below.

- [ ] **Step 2: Use a demo project (no cloud project needed)** — create `.firebaserc`:

```json
{ "projects": { "default": "demo-lyssasky" } }
```

The `demo-` prefix makes the emulator run fully offline.

- [ ] **Step 3: `firebase.json`**

```json
{
  "functions": { "source": "functions", "runtime": "nodejs20" },
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "storage": { "rules": "storage.rules" },
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  },
  "emulators": {
    "auth": { "port": 9099 },
    "functions": { "port": 5001 },
    "firestore": { "port": 8080 },
    "storage": { "port": 9199 },
    "hosting": { "port": 5000 },
    "ui": { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

- [ ] **Step 4: Rules + indexes placeholders** (tightened in Task 14).

`firestore.rules`:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}
```
`storage.rules`:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} { allow read, write: if false; }
  }
}
```
`firestore.indexes.json`: `{ "indexes": [], "fieldOverrides": [] }`

- [ ] **Step 5: Functions workspace** — `functions/package.json`:

```json
{
  "name": "functions",
  "engines": { "node": "20" },
  "main": "lib/index.js",
  "scripts": {
    "build": "tsc",
    "serve": "npm run build && firebase emulators:start --only functions",
    "test": "vitest run"
  },
  "dependencies": {
    "firebase-admin": "^12.6.0",
    "firebase-functions": "^5.1.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@firebase/rules-unit-testing": "^3.0.0"
  }
}
```

`functions/tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "commonjs", "target": "es2021", "outDir": "lib",
    "rootDir": ".", "strict": true, "esModuleInterop": true,
    "skipLibCheck": true, "resolveJsonModule": true
  },
  "include": ["src", "../src/domain"]
}
```
This lets Functions import the shared `../src/domain/*` modules directly.

Run `cd functions && npm install`.

- [ ] **Step 6: Admin SDK singleton** — `functions/src/admin.ts`:

```ts
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

initializeApp();
export const db = getFirestore();
export const storage = getStorage();
```

- [ ] **Step 7: `helloWorld` callable + index** — `functions/src/index.ts`:

```ts
import { onCall } from 'firebase-functions/v2/https';

export const helloWorld = onCall(() => ({ ok: true }));
```

- [ ] **Step 8: Boot the emulator**

Run: `firebase emulators:start`
Expected: Auth, Firestore, Storage, Functions all start; UI at `http://localhost:4000`. Stop with Ctrl-C.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "chore: wire Firebase Emulator Suite with TS functions"
```

---

## Milestone 1 — Core domain logic (pure, TDD)

These modules are Firebase-free and shared by client + Functions.

### Task 3: Shared domain types

**Files:**
- Create: `src/domain/types.ts`

**Interfaces:**
- Produces: all types in "Key Architecture Decisions → Shared domain types" above.

- [ ] **Step 1:** Create `src/domain/types.ts` with the exact contents from the locked contract section above (copy verbatim).
- [ ] **Step 2:** Typecheck: `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 3:** Commit: `git commit -am "feat: shared domain types"`.

### Task 4: Generation prompt builder

**Files:**
- Create: `src/domain/prompt.ts`
- Test: `src/domain/prompt.test.ts`

**Interfaces:**
- Produces: `buildGenerationPrompt(style: { name: string; recipe: StyleRecipe }, answers: QuestionnaireAnswers): string`
- Consumes: `StyleRecipe`, `QuestionnaireAnswers` from Task 3.

- [ ] **Step 1: Failing test** — `src/domain/prompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildGenerationPrompt } from './prompt';
import type { StyleRecipe, QuestionnaireAnswers } from './types';

const recipe: StyleRecipe = {
  description: 'Calm Scandinavian warmth',
  materials: 'oak, linen, matte black metal',
  palette: 'warm neutrals with terracotta accents',
  furniture: 'low-profile sofas, tapered wooden legs',
  avoid: 'no ornate carving, no cool blue tones',
};
const answers: QuestionnaireAnswers = {
  roomType: 'living_room', styleSlug: 'scandi', colorMood: 'warm_cozy',
  keep: 'my grey sofa', budget: '1k_5k', timeline: 'within_3_months',
};

describe('buildGenerationPrompt', () => {
  it('names the style and enforces architecture preservation', () => {
    const p = buildGenerationPrompt({ name: 'Scandinavian', recipe }, answers);
    expect(p).toMatch(/Scandinavian/);
    expect(p).toMatch(/preserve the room'?s architecture, windows, walls, and layout/i);
  });
  it('includes recipe materials, palette, furniture and avoid clauses', () => {
    const p = buildGenerationPrompt({ name: 'Scandinavian', recipe }, answers);
    expect(p).toContain('oak, linen, matte black metal');
    expect(p).toContain('warm neutrals with terracotta accents');
    expect(p).toContain('no ornate carving');
  });
  it('carries the keep-list when provided', () => {
    const p = buildGenerationPrompt({ name: 'Scandinavian', recipe }, answers);
    expect(p).toMatch(/keep.*my grey sofa/i);
  });
  it('omits the keep clause when keep is empty', () => {
    const p = buildGenerationPrompt({ name: 'Scandinavian', recipe }, { ...answers, keep: '' });
    expect(p).not.toMatch(/keep the following/i);
  });
  it('maps the color mood to descriptive guidance', () => {
    const p = buildGenerationPrompt({ name: 'Scandinavian', recipe }, { ...answers, colorMood: 'bold_dramatic' });
    expect(p).toMatch(/bold, dramatic/i);
  });
});
```

- [ ] **Step 2: Run — fails** (`buildGenerationPrompt` not defined).

Run: `npm test src/domain/prompt.test.ts`

- [ ] **Step 3: Implement** — `src/domain/prompt.ts`:

```ts
import type { StyleRecipe, QuestionnaireAnswers } from './types';

const COLOR_MOOD_TEXT: Record<string, string> = {
  warm_cozy: 'warm, cozy tones and soft lighting',
  light_airy: 'light, airy tones with plenty of brightness',
  bold_dramatic: 'bold, dramatic contrast and rich saturation',
  neutral_calm: 'neutral, calm tones with a restful feel',
};

export function buildGenerationPrompt(
  style: { name: string; recipe: StyleRecipe },
  answers: QuestionnaireAnswers,
): string {
  const { recipe } = style;
  const mood = COLOR_MOOD_TEXT[answers.colorMood] ?? 'balanced, harmonious tones';
  const keep = answers.keep?.trim();
  const lines = [
    `Restyle this real photograph of a room in a ${style.name} interior design style.`,
    `This is a preview edit of the customer's own room: preserve the room's architecture, windows, walls, and layout exactly. Do not invent a different room.`,
    `Feature these materials and textures: ${recipe.materials}.`,
    `Use this palette: ${recipe.palette}.`,
    `Furniture should be: ${recipe.furniture}.`,
    `Overall color mood: ${mood}.`,
    `Avoid: ${recipe.avoid}.`,
  ];
  if (keep) {
    lines.push(`Keep the following elements from the original room unchanged: ${keep}.`);
  }
  lines.push('Produce a photorealistic result at the same camera angle and framing as the input.');
  return lines.join('\n');
}
```

- [ ] **Step 4: Run — green.** Run: `npm test src/domain/prompt.test.ts`
- [ ] **Step 5: Commit:** `git commit -am "feat: generation prompt builder"`.

### Task 5: Lead status transition machine

**Files:**
- Create: `src/domain/leadStatus.ts`
- Test: `src/domain/leadStatus.test.ts`

**Interfaces:**
- Produces:
  - `LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]>`
  - `canTransition(from: LeadStatus, to: LeadStatus): boolean`
  - `assertTransition(from: LeadStatus, to: LeadStatus): void` (throws `Error` on illegal transition)

- [ ] **Step 1: Failing test** — `src/domain/leadStatus.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { canTransition, assertTransition } from './leadStatus';

describe('lead status machine', () => {
  it('allows the happy path', () => {
    expect(canTransition('captured', 'paid')).toBe(true);
    expect(canTransition('paid', 'generated')).toBe(true);
    expect(canTransition('generated', 'rated')).toBe(true);
    expect(canTransition('rated', 'booked')).toBe(true);
  });
  it('allows re-generation and failure/retry paths', () => {
    expect(canTransition('generated', 'generated')).toBe(true); // free re-generate
    expect(canTransition('paid', 'failed')).toBe(true);
    expect(canTransition('failed', 'generated')).toBe(true);    // admin re-run
  });
  it('rejects skipping payment', () => {
    expect(canTransition('captured', 'generated')).toBe(false);
  });
  it('assertTransition throws on illegal moves', () => {
    expect(() => assertTransition('booked', 'captured')).toThrow(/illegal lead transition/i);
  });
});
```

- [ ] **Step 2: Run — fails.** Run: `npm test src/domain/leadStatus.test.ts`
- [ ] **Step 3: Implement** — `src/domain/leadStatus.ts`:

```ts
import type { LeadStatus } from './types';

export const LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  captured: ['paid'],
  paid: ['generated', 'failed'],
  generated: ['generated', 'rated', 'failed'],
  rated: ['booked', 'generated'],
  booked: [],
  failed: ['paid', 'generated'],
};

export function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  return LEAD_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: LeadStatus, to: LeadStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal lead transition: ${from} -> ${to}`);
  }
}
```

- [ ] **Step 4: Run — green.**
- [ ] **Step 5: Commit:** `git commit -am "feat: lead status transition machine"`.

### Task 6: Client-side photo upload validation

**Files:**
- Create: `src/domain/uploadValidation.ts`
- Test: `src/domain/uploadValidation.test.ts`

**Interfaces:**
- Produces:
  - `DEFAULT_PHOTO_OPTIONS: PhotoValidationOptions`
  - `validatePhotoMeta(file: { type: string; size: number; name: string }, opts?: PhotoValidationOptions): PhotoValidationResult`
  - `validateDimensions(width: number, height: number, opts?: PhotoValidationOptions): PhotoValidationResult`
  - Types: `PhotoValidationOptions { maxBytes; minWidth; minHeight; allowedTypes: string[] }`, `PhotoValidationResult { ok: boolean; error?: string; needsConversion?: boolean }`

- [ ] **Step 1: Failing test** — `src/domain/uploadValidation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validatePhotoMeta, validateDimensions, DEFAULT_PHOTO_OPTIONS } from './uploadValidation';

const f = (over: Partial<{ type: string; size: number; name: string }>) =>
  ({ type: 'image/jpeg', size: 2_000_000, name: 'room.jpg', ...over });

describe('validatePhotoMeta', () => {
  it('accepts a normal JPEG', () => {
    expect(validatePhotoMeta(f({}))).toEqual({ ok: true });
  });
  it('flags HEIC as needing conversion but still ok', () => {
    const r = validatePhotoMeta(f({ type: 'image/heic', name: 'room.heic' }));
    expect(r.ok).toBe(true);
    expect(r.needsConversion).toBe(true);
  });
  it('rejects an unsupported type', () => {
    const r = validatePhotoMeta(f({ type: 'application/pdf', name: 'x.pdf' }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/photo/i);
  });
  it('rejects files over the size cap', () => {
    const r = validatePhotoMeta(f({ size: DEFAULT_PHOTO_OPTIONS.maxBytes + 1 }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/too large|10 ?mb/i);
  });
});

describe('validateDimensions', () => {
  it('rejects tiny images', () => {
    expect(validateDimensions(100, 100).ok).toBe(false);
  });
  it('accepts large-enough images', () => {
    expect(validateDimensions(1024, 768).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** — `src/domain/uploadValidation.ts`:

```ts
export interface PhotoValidationOptions {
  maxBytes: number; minWidth: number; minHeight: number; allowedTypes: string[];
}
export interface PhotoValidationResult { ok: boolean; error?: string; needsConversion?: boolean; }

export const DEFAULT_PHOTO_OPTIONS: PhotoValidationOptions = {
  maxBytes: 10 * 1024 * 1024,
  minWidth: 512,
  minHeight: 512,
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
};

const HEIC = ['image/heic', 'image/heif'];

export function validatePhotoMeta(
  file: { type: string; size: number; name: string },
  opts: PhotoValidationOptions = DEFAULT_PHOTO_OPTIONS,
): PhotoValidationResult {
  const type = file.type || guessTypeFromName(file.name);
  if (!opts.allowedTypes.includes(type)) {
    return { ok: false, error: 'Please upload a photo (JPEG, PNG, WebP, or HEIC).' };
  }
  if (file.size > opts.maxBytes) {
    return { ok: false, error: 'That photo is too large — please keep it under 10MB.' };
  }
  return { ok: true, needsConversion: HEIC.includes(type) || undefined };
}

export function validateDimensions(
  width: number, height: number,
  opts: PhotoValidationOptions = DEFAULT_PHOTO_OPTIONS,
): PhotoValidationResult {
  if (width < opts.minWidth || height < opts.minHeight) {
    return { ok: false, error: 'This photo is a little small — a larger, clearer shot works best.' };
  }
  return { ok: true };
}

function guessTypeFromName(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  };
  return map[ext] ?? '';
}
```

- [ ] **Step 4: Run — green.**
- [ ] **Step 5: Commit:** `git commit -am "feat: client-side photo validation"`.

### Task 7: Default config + questionnaire definition

**Files:**
- Create: `src/config/defaultConfig.ts`
- Test: `src/config/defaultConfig.test.ts`

**Interfaces:**
- Produces: `DEFAULT_CONFIG: AppConfig` — includes the full v1 questionnaire (§3), `priceCents: 500`, `currency: 'CAD'`, `paymentMode: 'mock'`, `generationMode: 'mock'`, `calendlyUrl` placeholder.
- Consumes: `AppConfig`, `QuestionDef` from Task 3.

- [ ] **Step 1: Failing test** — `src/config/defaultConfig.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from './defaultConfig';

describe('DEFAULT_CONFIG', () => {
  it('prices the preview at $5 CAD in mock modes', () => {
    expect(DEFAULT_CONFIG.priceCents).toBe(500);
    expect(DEFAULT_CONFIG.currency).toBe('CAD');
    expect(DEFAULT_CONFIG.paymentMode).toBe('mock');
    expect(DEFAULT_CONFIG.generationMode).toBe('mock');
  });
  it('defines all six v1 questions in order', () => {
    const ids = DEFAULT_CONFIG.questionnaire.map(q => q.id);
    expect(ids).toEqual(['roomType', 'styleSlug', 'colorMood', 'keep', 'budget', 'timeline']);
  });
  it('marks the keep question as optional free text', () => {
    const keep = DEFAULT_CONFIG.questionnaire.find(q => q.id === 'keep')!;
    expect(keep.type).toBe('text');
    expect(keep.required).toBe(false);
  });
  it('renders style choices as a gallery', () => {
    const style = DEFAULT_CONFIG.questionnaire.find(q => q.id === 'styleSlug')!;
    expect(style.type).toBe('gallery');
  });
});
```

- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** — `src/config/defaultConfig.ts`:

```ts
import type { AppConfig } from '../domain/types';

export const DEFAULT_CONFIG: AppConfig = {
  priceCents: 500,
  currency: 'CAD',
  calendlyUrl: 'https://calendly.com/lyssasky/consult',
  paymentMode: 'mock',
  generationMode: 'mock',
  questionnaire: [
    {
      id: 'roomType', prompt: 'Which room are we restyling?', type: 'single', required: true,
      options: [
        { value: 'living_room', label: 'Living room' },
        { value: 'bedroom', label: 'Bedroom' },
        { value: 'kitchen', label: 'Kitchen' },
        { value: 'dining', label: 'Dining room' },
        { value: 'office', label: 'Office' },
        { value: 'other', label: 'Something else' },
      ],
    },
    {
      id: 'styleSlug', prompt: 'Pick a style that speaks to you', type: 'gallery', required: true,
      // options are populated at runtime from the styles collection; empty here.
      options: [],
    },
    {
      id: 'colorMood', prompt: "What's the mood?", type: 'single', required: true,
      options: [
        { value: 'warm_cozy', label: 'Warm & cozy' },
        { value: 'light_airy', label: 'Light & airy' },
        { value: 'bold_dramatic', label: 'Bold & dramatic' },
        { value: 'neutral_calm', label: 'Neutral & calm' },
      ],
    },
    {
      id: 'keep', prompt: 'Anything you want to keep? (optional)', type: 'text', required: false,
    },
    {
      id: 'budget', prompt: "What's your rough budget for this room?", type: 'single', required: true,
      options: [
        { value: 'under_1k', label: 'Under $1,000' },
        { value: '1k_5k', label: '$1,000 – $5,000' },
        { value: '5k_15k', label: '$5,000 – $15,000' },
        { value: 'over_15k', label: '$15,000+' },
      ],
    },
    {
      id: 'timeline', prompt: 'When are you hoping to start?', type: 'single', required: true,
      options: [
        { value: 'just_dreaming', label: 'Just dreaming' },
        { value: 'within_3_months', label: 'Within 3 months' },
        { value: 'asap', label: 'As soon as possible' },
      ],
    },
  ],
};
```

- [ ] **Step 4: Run — green.**
- [ ] **Step 5: Commit:** `git commit -am "feat: default app config + v1 questionnaire"`.

---

## Milestone 2 — Providers (interfaces + mock impls, TDD)

### Task 8: Payment provider interface + mock

**Files:**
- Create: `functions/src/payment/provider.ts`, `functions/src/payment/mockProvider.ts`
- Test: `functions/src/payment/mockProvider.test.ts`

**Interfaces:**
- Produces: `PaymentProvider`, `CheckoutSession` (from locked contract); `createMockPaymentProvider(appBaseUrl: string): PaymentProvider`.
- Mock `createCheckoutSession({leadId})` returns `{ sessionId: 'mock_' + leadId, checkoutUrl: '{appBaseUrl}/mock-checkout?lead={leadId}&session=mock_{leadId}' }`.

- [ ] **Step 1: Failing test** — `functions/src/payment/mockProvider.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createMockPaymentProvider } from './mockProvider';

describe('mock payment provider', () => {
  it('returns a mock-checkout URL scoped to the lead', async () => {
    const p = createMockPaymentProvider('http://localhost:5173');
    const s = await p.createCheckoutSession({ leadId: 'lead123', amountCents: 500, currency: 'CAD' });
    expect(s.sessionId).toBe('mock_lead123');
    expect(s.checkoutUrl).toContain('/mock-checkout');
    expect(s.checkoutUrl).toContain('lead=lead123');
    expect(s.checkoutUrl).toContain('session=mock_lead123');
  });
});
```

- [ ] **Step 2: Run — fails.** Run from `functions/`: `npm test src/payment/mockProvider.test.ts` (add a `functions/vitest.config.ts` with `{ test: { environment: 'node' } }`).
- [ ] **Step 3: Implement** `provider.ts` (contract types) and `mockProvider.ts`:

```ts
// functions/src/payment/provider.ts
export interface CheckoutSession { checkoutUrl: string; sessionId: string; }
export interface PaymentProvider {
  createCheckoutSession(input: { leadId: string; amountCents: number; currency: string }): Promise<CheckoutSession>;
}
```
```ts
// functions/src/payment/mockProvider.ts
import type { PaymentProvider } from './provider';
export function createMockPaymentProvider(appBaseUrl: string): PaymentProvider {
  return {
    async createCheckoutSession({ leadId }) {
      const sessionId = `mock_${leadId}`;
      const url = new URL('/mock-checkout', appBaseUrl);
      url.searchParams.set('lead', leadId);
      url.searchParams.set('session', sessionId);
      return { sessionId, checkoutUrl: url.toString() };
    },
  };
}
```

- [ ] **Step 4: Run — green.**
- [ ] **Step 5: Commit:** `git commit -am "feat: mock payment provider"`.

### Task 9: Generation provider interface + mock + Gemini stub

**Files:**
- Create: `functions/src/generation/provider.ts`, `functions/src/generation/mockProvider.ts`, `functions/src/generation/geminiProvider.ts`, `functions/src/generation/placeholder.ts`
- Test: `functions/src/generation/mockProvider.test.ts`

**Interfaces:**
- Produces: `GenerationProvider`, `GenerationInput`, `GenerationOutput` (contract); `createMockGenerationProvider(): GenerationProvider`; `createGeminiGenerationProvider(apiKey: string): GenerationProvider`.
- Mock returns a small bundled placeholder PNG with `costEstimate: 0`.

- [ ] **Step 1: Failing test** — `functions/src/generation/mockProvider.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createMockGenerationProvider } from './mockProvider';

describe('mock generation provider', () => {
  it('returns non-empty PNG bytes at zero cost', async () => {
    const p = createMockGenerationProvider();
    const out = await p.generate({ photoBytes: Buffer.from('x'), mimeType: 'image/jpeg', prompt: 'restyle' });
    expect(out.mimeType).toBe('image/png');
    expect(out.imageBytes.length).toBeGreaterThan(0);
    expect(out.costEstimate).toBe(0);
  });
});
```

- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement.**

`provider.ts`:
```ts
export interface GenerationInput { photoBytes: Buffer; mimeType: string; prompt: string; }
export interface GenerationOutput { imageBytes: Buffer; mimeType: string; costEstimate: number; }
export interface GenerationProvider { generate(input: GenerationInput): Promise<GenerationOutput>; }
```
`placeholder.ts` — a tiny 1×1 PNG so tests need no assets:
```ts
// 1x1 transparent PNG, base64
export const PLACEHOLDER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
```
`mockProvider.ts`:
```ts
import type { GenerationProvider } from './provider';
import { PLACEHOLDER_PNG_BASE64 } from './placeholder';
export function createMockGenerationProvider(): GenerationProvider {
  return {
    async generate() {
      return {
        imageBytes: Buffer.from(PLACEHOLDER_PNG_BASE64, 'base64'),
        mimeType: 'image/png',
        costEstimate: 0,
      };
    },
  };
}
```
`geminiProvider.ts` — real impl behind the same interface (wired for real use in the Gemini setup task; not exercised in emulator tests):
```ts
import type { GenerationProvider } from './provider';
// Uses @google/genai image editing. Installed + configured in the Gemini setup task.
export function createGeminiGenerationProvider(apiKey: string): GenerationProvider {
  return {
    async generate({ photoBytes, mimeType, prompt }) {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [
          { inlineData: { data: photoBytes.toString('base64'), mimeType } },
          { text: prompt },
        ],
      });
      const part = res.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
      if (!part?.inlineData) throw new Error('Gemini returned no image');
      return {
        imageBytes: Buffer.from(part.inlineData.data, 'base64'),
        mimeType: part.inlineData.mimeType ?? 'image/png',
        costEstimate: 0.1,
      };
    },
  };
}
```
> Note: the exact Gemini image model id and SDK call shape must be confirmed against current docs during the Gemini setup task (see Milestone 7). Keep the interface stable regardless.

- [ ] **Step 4: Run — green.**
- [ ] **Step 5: Commit:** `git commit -am "feat: generation provider interface, mock + gemini impl"`.

---

## Milestone 3 — Backend functions (emulator integration, TDD)

All tasks in this milestone run against the emulator. Add `functions/src/testHelpers.ts` with an emulator Firestore/Storage handle and a helper to run functions. Integration tests use `firebase-functions-test` in offline mode **or** call the exported plain helpers directly against the emulator (preferred — simpler). Set `FIRESTORE_EMULATOR_HOST=localhost:8080` and `FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199` in the test env; start the emulator (`firebase emulators:start --only firestore,storage,auth`) before running these tests.

### Task 10: `createLead` + config loader

**Files:**
- Create: `functions/src/config.ts`, `functions/src/leads.ts`
- Modify: `functions/src/index.ts`
- Test: `functions/src/leads.integration.test.ts`

**Interfaces:**
- Produces:
  - `loadConfig(): Promise<AppConfig>` — reads `config/app`; falls back to `DEFAULT_CONFIG`.
  - Exported helper `createLeadDoc(ownerUid: string): Promise<{ leadId: string; leadToken: string }>` (tested directly).
  - Callable `createLead` wrapping it (`ownerUid = context.auth.uid`, requires auth).

- [ ] **Step 1: Failing test** — `functions/src/leads.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { db } from './admin';
import { createLeadDoc } from './leads';

describe('createLeadDoc', () => {
  it('creates a captured lead owned by the uid', async () => {
    const { leadId, leadToken } = await createLeadDoc('uid_abc');
    const snap = await db.collection('leads').doc(leadId).get();
    const lead = snap.data()!;
    expect(lead.status).toBe('captured');
    expect(lead.ownerUid).toBe('uid_abc');
    expect(lead.leadToken).toBe(leadToken);
    expect(lead.generatedImagePaths).toEqual([]);
  });
});
```

- [ ] **Step 2: Run against emulator — fails.**

```bash
cd functions
FIRESTORE_EMULATOR_HOST=localhost:8080 npm test src/leads.integration.test.ts
```

- [ ] **Step 3: Implement `config.ts`:**

```ts
import { db } from './admin';
import { DEFAULT_CONFIG } from '../../src/config/defaultConfig';
import type { AppConfig } from '../../src/domain/types';

export async function loadConfig(): Promise<AppConfig> {
  const snap = await db.collection('config').doc('app').get();
  return snap.exists ? (snap.data() as AppConfig) : DEFAULT_CONFIG;
}
```

`leads.ts` (createLead portion):
```ts
import { randomUUID } from 'crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './admin';
import type { Lead } from '../../src/domain/types';

export async function createLeadDoc(ownerUid: string) {
  const ref = db.collection('leads').doc();
  const now = Date.now();
  const leadToken = randomUUID();
  const lead: Lead = {
    id: ref.id, ownerUid, leadToken, status: 'captured',
    generatedImagePaths: [], costEstimateTotal: 0,
    timestamps: { captured: now }, createdAt: now, updatedAt: now,
  };
  await ref.set(lead);
  return { leadId: ref.id, leadToken };
}

export const createLead = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign-in required');
  return createLeadDoc(req.auth.uid);
});
```

Export `createLead` from `index.ts`.

- [ ] **Step 4: Run — green.**
- [ ] **Step 5: Commit:** `git commit -am "feat: createLead + config loader"`.

### Task 11: `updateLeadAnswers` + owner guard + events

**Files:**
- Modify: `functions/src/leads.ts`, `functions/src/index.ts`
- Create: `functions/src/events.ts`, `functions/src/guards.ts`
- Test: `functions/src/updateLeadAnswers.integration.test.ts`

**Interfaces:**
- Produces:
  - `assertOwner(uid: string | undefined, lead: Lead): void` (throws `HttpsError('permission-denied')`).
  - `updateLeadAnswersDoc(leadId, uid, answers, email): Promise<void>` and callable `updateLeadAnswers`.
  - `logEventDoc(event): Promise<void>` and callable `logEvent`.

- [ ] **Step 1: Failing test** — creates a lead, calls `updateLeadAnswersDoc`, asserts answers+email saved and `email_captured` event written; asserts a wrong-uid call throws.

```ts
import { describe, it, expect } from 'vitest';
import { db } from './admin';
import { createLeadDoc } from './leads';
import { updateLeadAnswersDoc } from './leads';

const answers = { roomType: 'living_room', styleSlug: 'scandi', colorMood: 'warm_cozy', budget: '1k_5k', timeline: 'asap' };

describe('updateLeadAnswersDoc', () => {
  it('saves answers + email for the owner', async () => {
    const { leadId } = await createLeadDoc('owner1');
    await updateLeadAnswersDoc(leadId, 'owner1', answers, 'a@b.com');
    const lead = (await db.collection('leads').doc(leadId).get()).data()!;
    expect(lead.email).toBe('a@b.com');
    expect(lead.answers.styleSlug).toBe('scandi');
  });
  it('rejects a non-owner', async () => {
    const { leadId } = await createLeadDoc('owner1');
    await expect(updateLeadAnswersDoc(leadId, 'intruder', answers, 'x@y.com'))
      .rejects.toThrow(/permission/i);
  });
});
```

- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** `guards.ts`, `events.ts`, and the `updateLeadAnswersDoc`/`updateLeadAnswers`/`logEvent` functions.

```ts
// functions/src/guards.ts
import { HttpsError } from 'firebase-functions/v2/https';
import type { Lead } from '../../src/domain/types';
export function assertOwner(uid: string | undefined, lead: Lead) {
  if (!uid || uid !== lead.ownerUid) {
    throw new HttpsError('permission-denied', 'Not your lead');
  }
}
```
```ts
// functions/src/events.ts
import { onCall } from 'firebase-functions/v2/https';
import { db } from './admin';
import type { AnalyticsEvent } from '../../src/domain/types';
export async function logEventDoc(e: Omit<AnalyticsEvent, 'createdAt'>) {
  await db.collection('events').add({ ...e, createdAt: Date.now() });
}
export const logEvent = onCall(async (req) => {
  await logEventDoc({ type: req.data.type, leadId: req.data.leadId, meta: req.data.meta });
  return { ok: true };
});
```
```ts
// in leads.ts
export async function updateLeadAnswersDoc(leadId: string, uid: string, answers: any, email: string) {
  const ref = db.collection('leads').doc(leadId);
  const lead = (await ref.get()).data() as Lead | undefined;
  if (!lead) throw new HttpsError('not-found', 'Lead not found');
  assertOwner(uid, lead);
  await ref.update({ answers, email, updatedAt: Date.now() });
  await logEventDoc({ type: 'email_captured', leadId });
  await logEventDoc({ type: 'questionnaire_completed', leadId, meta: { style: answers.styleSlug } });
}
export const updateLeadAnswers = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign-in required');
  await updateLeadAnswersDoc(req.data.leadId, req.auth.uid, req.data.answers, req.data.email);
  return { ok: true };
});
```
Export `updateLeadAnswers`, `logEvent` from `index.ts`.

- [ ] **Step 4: Run — green.**
- [ ] **Step 5: Commit:** `git commit -am "feat: updateLeadAnswers, owner guard, event logging"`.

### Task 12: `startCheckout` + `confirmPaymentMock` + `handlePaymentConfirmed`

**Files:**
- Create: `functions/src/checkout.ts`, `functions/src/payment/handlePaymentConfirmed.ts`
- Modify: `functions/src/index.ts`
- Test: `functions/src/payment/handlePaymentConfirmed.integration.test.ts`

**Interfaces:**
- Produces:
  - `handlePaymentConfirmed(leadId: string, paymentId: string): Promise<void>` — asserts `captured→paid`, sets `paymentId`, timestamps, logs `payment_completed`.
  - Callable `startCheckout({leadId})` → `{ checkoutUrl }` (uses config `paymentMode` to pick provider; mock in Phase 1).
  - Callable `confirmPaymentMock({leadId, sessionId})` — only when `config.paymentMode === 'mock'`; owner-guarded; calls `handlePaymentConfirmed`.

- [ ] **Step 1: Failing test** — create a captured lead, call `handlePaymentConfirmed`, assert status `paid`, `paymentId` set, `timestamps.paid` present.

```ts
import { describe, it, expect } from 'vitest';
import { db } from '../admin';
import { createLeadDoc } from '../leads';
import { handlePaymentConfirmed } from './handlePaymentConfirmed';

describe('handlePaymentConfirmed', () => {
  it('advances a captured lead to paid', async () => {
    const { leadId } = await createLeadDoc('owner1');
    await handlePaymentConfirmed(leadId, 'pay_1');
    const lead = (await db.collection('leads').doc(leadId).get()).data()!;
    expect(lead.status).toBe('paid');
    expect(lead.paymentId).toBe('pay_1');
    expect(lead.timestamps.paid).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement.**

```ts
// functions/src/payment/handlePaymentConfirmed.ts
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../admin';
import { assertTransition } from '../../../src/domain/leadStatus';
import { logEventDoc } from '../events';
import type { Lead } from '../../../src/domain/types';

export async function handlePaymentConfirmed(leadId: string, paymentId: string) {
  const ref = db.collection('leads').doc(leadId);
  const lead = (await ref.get()).data() as Lead | undefined;
  if (!lead) throw new HttpsError('not-found', 'Lead not found');
  assertTransition(lead.status, 'paid');
  const now = Date.now();
  await ref.update({
    status: 'paid', paymentId,
    'timestamps.paid': now, updatedAt: now,
  });
  await logEventDoc({ type: 'payment_completed', leadId });
}
```
```ts
// functions/src/checkout.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './admin';
import { loadConfig } from './config';
import { assertOwner } from './guards';
import { createMockPaymentProvider } from './payment/mockProvider';
import { handlePaymentConfirmed } from './payment/handlePaymentConfirmed';
import { logEventDoc } from './events';
import type { Lead } from '../../src/domain/types';

const APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:5173';

export const startCheckout = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign-in required');
  const cfg = await loadConfig();
  const ref = db.collection('leads').doc(req.data.leadId);
  const lead = (await ref.get()).data() as Lead | undefined;
  if (!lead) throw new HttpsError('not-found', 'Lead not found');
  assertOwner(req.auth.uid, lead);
  const provider = createMockPaymentProvider(APP_BASE_URL); // Phase 3: switch on cfg.paymentMode
  const session = await provider.createCheckoutSession({
    leadId: lead.id, amountCents: cfg.priceCents, currency: cfg.currency,
  });
  await logEventDoc({ type: 'checkout_started', leadId: lead.id });
  return { checkoutUrl: session.checkoutUrl };
});

export const confirmPaymentMock = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign-in required');
  const cfg = await loadConfig();
  if (cfg.paymentMode !== 'mock') throw new HttpsError('failed-precondition', 'Not in mock mode');
  const ref = db.collection('leads').doc(req.data.leadId);
  const lead = (await ref.get()).data() as Lead | undefined;
  if (!lead) throw new HttpsError('not-found', 'Lead not found');
  assertOwner(req.auth.uid, lead);
  await handlePaymentConfirmed(lead.id, req.data.sessionId ?? `mock_${lead.id}`);
  return { ok: true };
});
```
Export both from `index.ts`.

- [ ] **Step 4: Run — green.**
- [ ] **Step 5: Commit:** `git commit -am "feat: checkout + mock payment confirmation path"`.

### Task 13: `runGeneration` + `onLeadPaid` trigger (mock provider) + retry/failure

**Files:**
- Create: `functions/src/generation/runGeneration.ts`
- Modify: `functions/src/index.ts`
- Test: `functions/src/generation/runGeneration.integration.test.ts`

**Interfaces:**
- Produces:
  - `runGeneration(leadId: string, provider?: GenerationProvider): Promise<void>` — loads lead + style, builds prompt, calls provider (1 retry on throw), writes output to Storage `leads/{ownerUid}/generated/{ts}.png`, appends to `generatedImagePaths`, writes a `generations` record, advances lead `paid→generated` (or `→failed` after retry). Logs `generation_started` / `generation_completed`.
  - Firestore trigger `onLeadPaid` (on `leads/{id}` update) → when status changes to `paid`, calls `runGeneration(id)`.
- Consumes: `buildGenerationPrompt` (Task 4), `assertTransition` (Task 5), mock provider (Task 9), styles seeded (Task 22 seed — for this test, seed a style inline).

- [ ] **Step 1: Failing test** — seed a style doc + a paid lead with answers, call `runGeneration` with the mock provider, assert lead `generated`, one `generatedImagePaths` entry, a `generations` doc with `recipeSnapshot` + `promptSnapshot`.

```ts
import { describe, it, expect } from 'vitest';
import { db } from '../admin';
import { runGeneration } from './runGeneration';
import { createMockGenerationProvider } from './mockProvider';

async function seedStyle() {
  await db.collection('styles').doc('scandi').set({
    slug: 'scandi', name: 'Scandinavian', description: 'Calm', galleryImages: [], sortOrder: 0, active: true,
    recipe: { description: 'd', materials: 'oak', palette: 'warm', furniture: 'low', avoid: 'clutter' },
  });
}

describe('runGeneration', () => {
  it('produces an image and advances the lead to generated', async () => {
    await seedStyle();
    const ref = db.collection('leads').doc();
    await ref.set({
      id: ref.id, ownerUid: 'u1', leadToken: 't', status: 'paid',
      answers: { roomType: 'living_room', styleSlug: 'scandi', colorMood: 'warm_cozy', budget: '1k_5k', timeline: 'asap' },
      originalPhotoPath: 'leads/u1/original.jpg',
      generatedImagePaths: [], costEstimateTotal: 0, timestamps: {}, createdAt: 0, updatedAt: 0,
    });
    // seed an input object in the emulator storage bucket first (helper omitted for brevity)
    await runGeneration(ref.id, createMockGenerationProvider());
    const lead = (await ref.get()).data()!;
    expect(lead.status).toBe('generated');
    expect(lead.generatedImagePaths).toHaveLength(1);
    const gens = await db.collection('generations').where('leadId', '==', ref.id).get();
    expect(gens.size).toBe(1);
    expect(gens.docs[0].data().promptSnapshot).toMatch(/Scandinavian/);
  });
});
```

- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement `runGeneration.ts`:**

```ts
import { randomUUID } from 'crypto';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db, storage } from '../admin';
import { loadConfig } from '../config';
import { buildGenerationPrompt } from '../../../src/domain/prompt';
import { assertTransition } from '../../../src/domain/leadStatus';
import { logEventDoc } from '../events';
import { createMockGenerationProvider } from './mockProvider';
import { createGeminiGenerationProvider } from './geminiProvider';
import type { GenerationProvider } from './provider';
import type { Lead, Style, GenerationRecord } from '../../../src/domain/types';

async function resolveProvider(): Promise<GenerationProvider> {
  const cfg = await loadConfig();
  if (cfg.generationMode === 'gemini' && process.env.GEMINI_API_KEY) {
    return createGeminiGenerationProvider(process.env.GEMINI_API_KEY);
  }
  return createMockGenerationProvider();
}

export async function runGeneration(leadId: string, provider?: GenerationProvider) {
  const gen = provider ?? (await resolveProvider());
  const ref = db.collection('leads').doc(leadId);
  const lead = (await ref.get()).data() as Lead | undefined;
  if (!lead || !lead.answers || !lead.originalPhotoPath) return;
  const style = (await db.collection('styles').doc(lead.answers.styleSlug).get()).data() as Style | undefined;
  if (!style) throw new Error(`Unknown style ${lead.answers.styleSlug}`);
  const prompt = buildGenerationPrompt({ name: style.name, recipe: style.recipe }, lead.answers);
  await logEventDoc({ type: 'generation_started', leadId });

  const bucket = storage.bucket();
  const [photoBytes] = await bucket.file(lead.originalPhotoPath).download();
  const start = Date.now();
  let out; let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { out = await gen.generate({ photoBytes, mimeType: 'image/jpeg', prompt }); break; }
    catch (e) { lastErr = e; }
  }
  const durationMs = Date.now() - start;
  const genId = randomUUID();

  if (!out) {
    await ref.update({ status: 'failed', 'timestamps.failed': Date.now(), updatedAt: Date.now() });
    await db.collection('generations').doc(genId).set(<GenerationRecord>{
      id: genId, leadId, source: 'funnel', styleSlug: style.slug, recipeSnapshot: style.recipe,
      promptSnapshot: prompt, inputPhotoPath: lead.originalPhotoPath, durationMs, costEstimate: 0,
      status: 'failed', error: String(lastErr), createdAt: Date.now(),
    });
    return;
  }

  const outputPath = `leads/${lead.ownerUid}/generated/${Date.now()}.png`;
  await bucket.file(outputPath).save(out.imageBytes, { contentType: out.mimeType });
  await db.collection('generations').doc(genId).set(<GenerationRecord>{
    id: genId, leadId, source: 'funnel', styleSlug: style.slug, recipeSnapshot: style.recipe,
    promptSnapshot: prompt, inputPhotoPath: lead.originalPhotoPath, outputPhotoPath: outputPath,
    durationMs, costEstimate: out.costEstimate, status: 'success', createdAt: Date.now(),
  });
  assertTransition(lead.status, 'generated');
  await ref.update({
    status: 'generated',
    generatedImagePaths: [...lead.generatedImagePaths, outputPath],
    costEstimateTotal: lead.costEstimateTotal + out.costEstimate,
    'timestamps.generated': Date.now(), updatedAt: Date.now(),
  });
  await logEventDoc({ type: 'generation_completed', leadId, meta: { durationMs } });
}

export const onLeadPaid = onDocumentUpdated('leads/{leadId}', async (event) => {
  const before = event.data?.before.data() as Lead | undefined;
  const after = event.data?.after.data() as Lead | undefined;
  if (before?.status !== 'paid' && after?.status === 'paid') {
    await runGeneration(event.params.leadId);
  }
});
```

- [ ] **Step 4: Run — green.** (Test helper must upload a placeholder object to `leads/u1/original.jpg` in emulator Storage before calling; include that in the test setup.)
- [ ] **Step 5: Commit:** `git commit -am "feat: generation runner + onLeadPaid trigger with retry"`.

### Task 14: `submitFeedback`, `submitBooking`, `regenerate`

**Files:**
- Modify: `functions/src/leads.ts`, `functions/src/index.ts`
- Test: `functions/src/feedbackBooking.integration.test.ts`

**Interfaces:**
- Produces callables + tested helpers:
  - `submitFeedbackDoc(leadId, uid, rating, feedback)` → `generated→rated`; logs `result_rated`.
  - `submitBookingDoc(leadId, uid, booking)` → `rated→booked` (also allow `generated→booked` if they skip rating — add to transitions if needed); logs `booking_submitted`.
  - `regenerateDoc(leadId, uid)` → owner-guarded; sets status back through allowed path and calls `runGeneration`.

- [ ] **Step 1: Failing test** covering: rating saved + status `rated`; booking saved + status `booked`; non-owner rejected.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** the three helpers + callables (mirror the `updateLeadAnswersDoc` pattern: load lead, `assertOwner`, `assertTransition`, update, log event). For `submitBookingDoc`, permit `generated→booked` by adding `'booked'` to the `generated` transition list in `leadStatus.ts` (and update Task 5's test to include it).
- [ ] **Step 4: Run — green.**
- [ ] **Step 5: Commit:** `git commit -am "feat: feedback, booking, regenerate functions"`.

### Task 15: Security rules + rules-unit tests

**Files:**
- Modify: `firestore.rules`, `storage.rules`
- Test: `functions/src/rules.test.ts` (uses `@firebase/rules-unit-testing`)

**Interfaces:**
- Enforces: styles/config readable by anyone; leads readable only by owner (`ownerUid == auth.uid`) or admin (`token.admin == true`); all client writes to leads/generations/events/styles/config **denied** (functions use Admin SDK, which bypasses rules); Storage: a customer may create/read only under `leads/{their-uid}/...` with a 10MB + image content-type cap.

- [ ] **Step 1: Failing test** — `functions/src/rules.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-lyssasky',
    firestore: { rules: readFileSync('../firestore.rules', 'utf8'), host: 'localhost', port: 8080 },
  });
});
afterAll(() => env.cleanup());

describe('firestore rules', () => {
  it('lets a user read their own lead', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('leads').doc('l1').set({ ownerUid: 'u1', status: 'captured' });
    });
    const u1 = env.authenticatedContext('u1').firestore();
    await assertSucceeds(u1.collection('leads').doc('l1').get());
  });
  it('forbids reading someone else\'s lead', async () => {
    const u2 = env.authenticatedContext('u2').firestore();
    await assertFails(u2.collection('leads').doc('l1').get());
  });
  it('forbids client writes to leads', async () => {
    const u1 = env.authenticatedContext('u1').firestore();
    await assertFails(u1.collection('leads').doc('l1').update({ status: 'paid' }));
  });
  it('allows anyone to read styles', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertSucceeds(anon.collection('styles').doc('scandi').get());
  });
});
```

- [ ] **Step 2: Run against emulator — fails** (current rules deny everything).
- [ ] **Step 3: Implement `firestore.rules`:**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function isAdmin() { return request.auth != null && request.auth.token.admin == true; }

    match /styles/{id}   { allow read: if true;  allow write: if false; }
    match /config/{id}   { allow read: if true;  allow write: if false; }
    match /generations/{id} { allow read: if isAdmin(); allow write: if false; }
    match /events/{id}   { allow read: if isAdmin(); allow write: if false; }
    match /leads/{id} {
      allow read: if isAdmin() ||
        (request.auth != null && resource.data.ownerUid == request.auth.uid);
      allow write: if false;
    }
  }
}
```
`storage.rules`:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function isAdmin() { return request.auth != null && request.auth.token.admin == true; }
    match /leads/{uid}/{allPaths=**} {
      allow read: if isAdmin() || (request.auth != null && request.auth.uid == uid);
      allow create: if request.auth != null && request.auth.uid == uid
        && request.resource.size < 10 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
      allow update, delete: if false;
    }
  }
}
```

- [ ] **Step 4: Run — green.**
- [ ] **Step 5: Commit:** `git commit -am "feat: firestore + storage security rules with tests"`.

---

## Milestone 4 — Client Firebase layer + brand shell

### Task 16: Firebase client init (emulator-aware) + anonymous sign-in + API wrappers

**Files:**
- Create: `src/firebase/client.ts`, `src/firebase/api.ts`, `.env.local`, `.env.example`
- Install: `firebase`
- Test: `src/firebase/api.test.ts` (mock the SDK — unit test the wrapper shapes, not the network)

**Interfaces:**
- Produces:
  - `client.ts`: exported `app`, `auth`, `db`, `storage`, `functions`; auto-connects to emulators when `import.meta.env.VITE_USE_EMULATORS === 'true'`; `ensureAnonymousAuth(): Promise<string>` (signs in anonymously, resolves uid).
  - `api.ts`: typed wrappers — `apiCreateLead()`, `apiUpdateLeadAnswers(leadId, answers, email)`, `apiStartCheckout(leadId)`, `apiConfirmPaymentMock(leadId, sessionId)`, `apiSubmitFeedback(leadId, rating, feedback)`, `apiSubmitBooking(leadId, booking)`, `apiRegenerate(leadId)`, `apiLogEvent(type, leadId?, meta?)`, `watchLead(leadId, cb)` (Firestore `onSnapshot`), `uploadOriginalPhoto(uid, file): Promise<string>`.

- [ ] **Step 1: Install** `npm install firebase`.
- [ ] **Step 2:** Create `.env.example` + `.env.local`:

```
VITE_USE_EMULATORS=true
VITE_FIREBASE_PROJECT_ID=demo-lyssasky
VITE_FIREBASE_API_KEY=demo-key
VITE_FIREBASE_APP_ID=demo-app
VITE_FIREBASE_STORAGE_BUCKET=demo-lyssasky.appspot.com
```

- [ ] **Step 3:** Write a failing test asserting `api.ts` exposes the wrapper names (import + `typeof === 'function'`), then implement `client.ts` + `api.ts`. Key init:

```ts
// src/firebase/client.ts (excerpt)
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
};
export const app = initializeApp(cfg);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectStorageEmulator(storage, 'localhost', 9199);
  connectFunctionsEmulator(functions, 'localhost', 5001);
}

export async function ensureAnonymousAuth(): Promise<string> {
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}
```

`api.ts` wraps `httpsCallable` + `onSnapshot` + Storage `uploadBytes`/`getDownloadURL`.

- [ ] **Step 4: Run — green.**
- [ ] **Step 5: Commit:** `git commit -am "feat: firebase client + emulator wiring + api wrappers"`.

### Task 17: Brand tokens, global styles, funnel layout + routing

**Files:**
- Modify: `src/styles/tokens.css`, `src/styles/global.css`, `src/App.tsx`
- Create: `src/funnel/FunnelLayout.tsx`, `src/components/Button.tsx`, `src/funnel/useFunnelState.ts`
- Test: `src/funnel/FunnelLayout.test.tsx`

> Before building customer-facing screens, load the **frontend-design** skill for visual quality. Voice: warm, supportive, "no pressure, no judgment."

**Interfaces:**
- Produces: `useFunnelState` hook holding `{ leadId, uid, answers, setLeadId, setAnswers, ... }` (React context, in-memory only); brand CSS variables in `tokens.css` (warm palette, rounded, generous spacing); `FunnelLayout` with a step progress indicator; routes wired in `App.tsx` (`/`, `/upload`, `/questionnaire`, `/email`, `/mock-checkout`, `/wait`, `/result`, `/book`, `/admin/*`).

- [ ] **Step 1:** Failing test: `FunnelLayout` renders its children and a progress indicator for a given step.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement tokens (warm neutrals, e.g. `--color-bg: #faf6f1; --color-ink: #33302c; --color-accent: #c47a5a;` — refine with frontend-design skill), global resets (mobile-first, `max-width: 480px` centered column), `Button`, `useFunnelState` context, `FunnelLayout`, and the route table in `App.tsx`.
- [ ] **Step 4:** Run — green.
- [ ] **Step 5:** Commit: `git commit -am "feat: brand shell, funnel layout, routing"`.

---

## Milestone 5 — Customer funnel screens

Each screen: component + a React Testing Library test (mock `src/firebase/api.ts`). Fire the relevant analytics event via `apiLogEvent`.

### Task 18: Landing page

**Files:** Create `src/funnel/LandingPage.tsx`; Test `src/funnel/LandingPage.test.tsx`.

**Interfaces:** Consumes brand shell. On mount logs `page_view`. CTA "See your room, restyled — $5" navigates to `/upload`. Shows a few example before/after tiles (placeholder images) and the Lyssasky voice ("no pressure, no judgment").

- [ ] **Step 1:** Failing test — headline, price `$5`, CTA navigates to `/upload`, `apiLogEvent('page_view')` called.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement `LandingPage.tsx`.
- [ ] **Step 4:** Run — green.
- [ ] **Step 5:** Commit `git commit -am "feat: landing page"`.

### Task 19: Upload step (validation + HEIC convert + Storage upload)

**Files:** Create `src/funnel/UploadStep.tsx`; Install `heic2any`; Test `src/funnel/UploadStep.test.tsx`.

**Interfaces:** On file pick → `validatePhotoMeta`; if `needsConversion`, convert HEIC→JPEG via `heic2any`; load into an `Image` to `validateDimensions`; `ensureAnonymousAuth()` → `apiCreateLead()` (store `leadId` in funnel state) → `uploadOriginalPhoto(uid, file)` → store returned path via a new callable `attachPhoto` **or** include the path in `updateLeadAnswers`. **Decision:** add `attachPhotoDoc(leadId, uid, path)` callable in Task 10's file (small addition) so the lead has `originalPhotoPath` before payment. Log `photo_uploaded`. Navigate to `/questionnaire`.

- [ ] **Step 1:** Failing test — rejects a PDF with a friendly message; on a valid JPEG calls `apiCreateLead` + `uploadOriginalPhoto` and navigates.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement `UploadStep.tsx` (+ `attachPhoto` callable and `apiAttachPhoto` wrapper; mirror owner-guard pattern).
- [ ] **Step 4:** Run — green.
- [ ] **Step 5:** Commit `git commit -am "feat: upload step with validation, HEIC conversion, storage upload"`.

### Task 20: Questionnaire step (config-driven)

**Files:** Create `src/funnel/QuestionnaireStep.tsx`; Test `src/funnel/QuestionnaireStep.test.tsx`.

**Interfaces:** Reads config (Firestore `config/app`, fallback `DEFAULT_CONFIG`) + styles (`styles` where `active==true`, ordered by `sortOrder`) to populate the `styleSlug` gallery options. Renders each `QuestionDef` by `type` (`single` = choice chips, `gallery` = image grid, `text` = textarea). Enforces `required`. Collects into `QuestionnaireAnswers` in funnel state. Navigates to `/email`.

- [ ] **Step 1:** Failing test — renders all six prompts; blocks Next until required answered; populates style gallery from a mocked styles fetch.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — green.
- [ ] **Step 5:** Commit `git commit -am "feat: config-driven questionnaire step"`.

### Task 21: Email capture step

**Files:** Create `src/funnel/EmailStep.tsx`; Test `src/funnel/EmailStep.test.tsx`.

**Interfaces:** Validates email format; on submit calls `apiUpdateLeadAnswers(leadId, answers, email)` (persists answers+email → lead still `captured`); logs `email_captured`; navigates to checkout by calling `apiStartCheckout(leadId)` then `window.location.assign(checkoutUrl)` (mock URL is in-app `/mock-checkout`).

- [ ] **Step 1:** Failing test — invalid email blocks; valid email calls `apiUpdateLeadAnswers` then `apiStartCheckout`.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — green.
- [ ] **Step 5:** Commit `git commit -am "feat: email capture step"`.

### Task 22: Mock checkout page

**Files:** Create `src/funnel/MockCheckoutPage.tsx`; Test `src/funnel/MockCheckoutPage.test.tsx`.

**Interfaces:** Reads `lead` + `session` from query string. Shows a "$5 CAD — preview of your room" summary with **Simulate success** and **Simulate cancel** buttons. Success → `apiConfirmPaymentMock(leadId, sessionId)` → navigate `/wait`. Cancel → navigate back to `/email` with a gentle message. (This fires the identical server path the real Stripe webhook will in Phase 3.)

- [ ] **Step 1:** Failing test — success button calls `apiConfirmPaymentMock` and navigates to `/wait`.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — green.
- [ ] **Step 5:** Commit `git commit -am "feat: mock checkout page"`.

### Task 23: Wait screen (realtime listener) → reveal

**Files:** Create `src/funnel/WaitScreen.tsx`; Test `src/funnel/WaitScreen.test.tsx`.

**Interfaces:** Subscribes via `watchLead(leadId, cb)`. While `paid`, shows a warm, pleasant waiting animation + reassuring copy ("Marjorie's assistant is styling your room…"). On `generated`, resolves the newest `generatedImagePaths` entry to a download URL and navigates to `/result`. On `failed`, shows a warm apology + "we'll email your design shortly" and a retry affordance.

- [ ] **Step 1:** Failing test — mock `watchLead` to emit `generated`; assert navigation to `/result`. Second test: emit `failed`; assert apology copy shown.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — green.
- [ ] **Step 5:** Commit `git commit -am "feat: wait screen with realtime listener"`.

### Task 24: Result + rating + feedback

**Files:** Create `src/funnel/ResultStep.tsx`; Test `src/funnel/ResultStep.test.tsx`.

**Interfaces:** Shows the generated image (with the original for before/after). Prompts "How close is this to your vision?" (1–5) + free-text "What would you change?". Submit → `apiSubmitFeedback(leadId, rating, feedback)`; logs `result_rated`; navigate `/book`. Also a "Try another version" button → `apiRegenerate(leadId)` → `/wait` (paying customers get 1 free re-generate; disable after one use, tracked in funnel state).

- [ ] **Step 1:** Failing test — selecting a rating + text and submitting calls `apiSubmitFeedback` and navigates to `/book`.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — green.
- [ ] **Step 5:** Commit `git commit -am "feat: result, rating, feedback step"`.

### Task 25: Booking step (lead form + Calendly embed)

**Files:** Create `src/funnel/BookingStep.tsx`; Test `src/funnel/BookingStep.test.tsx`.

**Interfaces:** Warm pitch framing the gap between preview and true vision as the reason to book Marjorie. Lead form (name, optional phone, optional note) → `apiSubmitBooking(leadId, booking)`; logs `booking_submitted`. Embeds Calendly via config `calendlyUrl` in an `<iframe>` (URL from config; safe placeholder in emulator).

- [ ] **Step 1:** Failing test — submitting the form calls `apiSubmitBooking`; Calendly iframe uses the config URL.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — green.
- [ ] **Step 5:** Commit `git commit -am "feat: booking step with calendly embed"`.

---

## Milestone 6 — Admin + seeding

### Task 26: Admin auth + route guard + login

**Files:** Create `src/admin/AdminApp.tsx`, `src/admin/LoginPage.tsx`, `src/admin/useAdminAuth.ts`; Modify `src/App.tsx`; Test `src/admin/LoginPage.test.tsx`.

**Interfaces:** `useAdminAuth()` exposes `{ user, loading, isAdmin, signIn(email,password), signOut() }` using Firebase email/password Auth; `isAdmin` = presence of `admin` custom claim (read via `getIdTokenResult`). `AdminApp` guards `/admin/*` — unauthenticated or non-admin sees the login form. Provide a seed step that creates an admin user + sets the claim in the emulator.

- [ ] **Step 1:** Failing test — unauthenticated `/admin` renders the login form; a successful sign-in (mocked) with admin claim renders the protected outlet.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement. Add `functions/src/seed/seedAdmin.ts` that creates `admin@lyssasky.test` / `password` and sets `{ admin: true }` via `getAuth().setCustomUserClaims` against the Auth emulator.
- [ ] **Step 4:** Run — green.
- [ ] **Step 5:** Commit `git commit -am "feat: admin auth guard + login"`.

### Task 27: Styles + config seed script (~8 styles)

**Files:** Create `functions/src/seed/seed.ts`, `functions/src/seed/styles.data.ts`; add npm script `seed`.

**Interfaces:** `seed.ts` writes `config/app` = `DEFAULT_CONFIG` and 8 `styles/*` docs (Claude-written recipes; royalty-free placeholder gallery image URLs, e.g. Unsplash source URLs) when run against the emulator. Runnable via `npm --prefix functions run seed` (uses `tsx`, `FIRESTORE_EMULATOR_HOST` set).

Styles (slug — name): `scandi` — Scandinavian; `japandi` — Japandi; `mid_century` — Mid-Century Modern; `modern_farmhouse` — Modern Farmhouse; `boho` — Warm Boho; `coastal` — Coastal Calm; `industrial` — Soft Industrial; `traditional` — Updated Traditional. Each with a full `StyleRecipe`.

- [ ] **Step 1:** Create `styles.data.ts` with all 8 `Style` objects (complete recipes; 2–4 placeholder gallery URLs each).
- [ ] **Step 2:** Create `seed.ts` that upserts config + styles; guard it to refuse running unless `FIRESTORE_EMULATOR_HOST` is set (safety).
- [ ] **Step 3:** Run: `firebase emulators:start` (separate terminal), then `npm --prefix functions run seed`. Verify in Emulator UI that `config/app` + 8 styles exist.
- [ ] **Step 4:** Commit `git commit -am "feat: emulator seed for config + 8 styles"`.

### Task 28: Leads list

**Files:** Create `src/admin/LeadsListPage.tsx`; Test `src/admin/LeadsListPage.test.tsx`.

**Interfaces:** Admin-only. Lists `leads` ordered by `createdAt` desc with status chips + a status filter (`all | captured | paid | generated | rated | booked | failed`). Each row links to `/admin/leads/:id`. Uses an admin Firestore query (admin claim passes rules).

- [ ] **Step 1:** Failing test — renders rows from a mocked leads snapshot; filtering by `booked` hides non-booked rows.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — green.
- [ ] **Step 5:** Commit `git commit -am "feat: admin leads list with filters"`.

### Task 29: Lead card (pre-consult briefing)

**Files:** Create `src/admin/LeadCardPage.tsx`; Test `src/admin/LeadCardPage.test.tsx`.

**Interfaces:** One screen = Marjorie's briefing: original photo, all questionnaire answers (human-readable labels), generated image(s), rating, "what would you change," payment status, booking status/details, per-status timestamps. Includes an admin **Re-run generation** button for `failed`/unsatisfying leads → calls `apiRegenerate(leadId)` (admin passes owner check? No — `regenerate` is owner-guarded; add an admin path: allow when caller has `admin` claim OR is owner). Update `regenerateDoc` guard accordingly and note it here.

- [ ] **Step 1:** Failing test — renders answers, rating, feedback, and both image slots from a mocked lead; Re-run button calls `apiRegenerate`.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement (+ extend `regenerateDoc` to accept admin claim; update its integration test).
- [ ] **Step 4:** Run — green.
- [ ] **Step 5:** Commit `git commit -am "feat: admin lead card briefing + re-run"`.

---

## Milestone 7 — Gemini setup + E2E + docs

### Task 30: Wire real Gemini generation (obtain + configure key)

**Files:** Modify `functions/src/generation/geminiProvider.ts`; add `functions/.env.example`; docs note.

**Interfaces:** Confirm the current Gemini image-editing model id + `@google/genai` call shape against live docs (use the context7 docs tool / official docs). Install `@google/genai` in `functions`. Configure `GEMINI_API_KEY` via `functions/.env.local` (git-ignored) for local runs. Flipping `config/app.generationMode` to `'gemini'` (with the key present) makes `runGeneration` use the real provider; mock remains the default and the test path.

- [ ] **Step 1:** `npm --prefix functions install @google/genai`.
- [ ] **Step 2:** Verify model id + request/response shape against current Gemini image docs; adjust `geminiProvider.ts` accordingly.
- [ ] **Step 3:** Add `GEMINI_API_KEY` to `functions/.env.example`; document how to obtain a key (Google AI Studio) in the README.
- [ ] **Step 4:** Manual smoke test: set the key, set `generationMode: 'gemini'` in the seeded config, run one funnel generation against the emulator with a real room photo, confirm a restyled image comes back. Revert `generationMode` to `'mock'` for the default dev/test experience.
- [ ] **Step 5:** Commit `git commit -am "feat: wire real Gemini image generation behind config flag"`.

### Task 31: Playwright E2E — full funnel + admin (emulator, mobile viewport)

**Files:** Create `playwright.config.ts`, `e2e/funnel.spec.ts`, `e2e/admin.spec.ts`; add script `e2e`.

**Interfaces:** `playwright.config.ts` uses a mobile project (`devices['iPhone 13']`) and a `webServer` that runs the Vite dev server; the emulator + seed must be running (documented in README/script). `funnel.spec.ts` drives: landing → upload a fixture image → questionnaire → email → mock checkout (simulate success) → wait → result (rate + feedback) → booking. Asserts the lead reaches `booked`. `admin.spec.ts`: sign in as the seeded admin, open the leads list, open the lead card, verify the briefing renders.

- [ ] **Step 1:** Install `npm install -D @playwright/test && npx playwright install chromium`.
- [ ] **Step 2:** Write `playwright.config.ts` (mobile viewport + `webServer`).
- [ ] **Step 3:** Add a fixture room image at `e2e/fixtures/room.jpg`.
- [ ] **Step 4:** Write `funnel.spec.ts` and `admin.spec.ts` per above.
- [ ] **Step 5:** Add a helper script `scripts/dev-emulator.sh` (start emulator + seed) and document the E2E run order. Run: emulator up + seeded, then `npm run e2e`. Expected: both specs pass.
- [ ] **Step 6:** Commit `git commit -am "test: playwright e2e for funnel + admin against emulator"`.

### Task 32: README + run scripts + final verification

**Files:** Create `README.md`; add root npm scripts (`dev`, `emulator`, `seed`, `test:all`).

- [ ] **Step 1:** README: prerequisites, `npm install` (root + `functions`), how to start the emulator, seed, run the app (`VITE_USE_EMULATORS=true npm run dev`), run unit tests, run E2E, and the "flip to real Gemini" note. Document the deviations (anonymous auth, server-side writes).
- [ ] **Step 2:** Add root scripts. Run the full suite: root `npm test`, `functions` `npm test` (emulator up), `npm run e2e`. Confirm all green.
- [ ] **Step 3:** Commit `git commit -am "docs: README + run scripts; phase 1 complete"`.

---

## Self-Review — spec coverage

- §2 Architecture → Tasks 1,2,16 (Vite/React, Firebase, emulator); keys server-side (Task 12/30). ✓
- §3 Funnel + pay-late + questionnaire → Tasks 7,18–25 (lead created at upload, email before payment, generation only after paid). ✓
- §4 Style library → Tasks 3 (Style type), 27 (8 seeded styles + recipes). ✓
- §5 Admin (leads, lead card) → Tasks 26,28,29. Styles CRUD / test bench / config editor / analytics = **Phase 2** (out of scope, noted). ✓
- §6 Data model (leads, styles, config, generations, events) → Tasks 3,10–14,27. ✓
- §7 Payment→generation critical path → Tasks 12,13 (webhook-analogous mock path + onLeadPaid trigger; closed-browser handled by trigger, emailed link deferred). ✓
- §8 Edge cases → upload validation (6,19), retry+failure flag+admin re-run (13,29), free re-generate (24). Refunds/abandoned-recovery = later/Stripe dashboard. ✓
- §9 Security → Task 15 (rules + tests), anonymous-auth ownership, server-side writes. ✓
- §10 Phasing → this plan is Phase 1; Phase 2/3 items explicitly deferred. ✓
- §11 Testing → Vitest unit (4–9), emulator integration (10–15), rules tests (15), Playwright E2E mobile (31). ✓
- §12 "AI gets smarter" v1 → `generations` records recipe+prompt snapshots (13). Analytics correlation dashboard = Phase 2. ✓

**Deferred to Phase 2/3 (intentional):** styles CRUD UI, test bench, config editor, analytics dashboard, email notifications, real Stripe, custom DNS, portfolio images, automated recovery emails.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-03-lyssasky-room-preview-phase1.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
