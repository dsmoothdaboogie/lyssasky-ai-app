# Lyssasky Room Preview — Phase 2 (Refinement Tools) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 2 employee refinement + insight tools on top of the shipped Phase 1 funnel: a styles CRUD manager, a generation test bench, a config editor, an analytics dashboard, and email notifications — all emulator-first and testable offline.

**Architecture:** Extends the existing React (Vite/TS) + Firebase app. Every admin *write* goes through an **admin-guarded callable Cloud Function** (Admin SDK) — the client never writes Firestore directly, so `firestore.rules` keeps `allow write: if false` for all collections. Admins authenticate with the existing email/password + `admin` custom claim. Email is sent by writing documents to a `mail` collection in the exact shape the Firebase "Trigger Email" extension consumes (mock now = docs recorded but unsent; go-live = install the extension). Generation in the test bench reuses the funnel's configured provider (mock by default, real Gemini when keyed).

**Tech Stack:** Same as Phase 1 — Vite, React 18/19, TypeScript, React Router, Firebase JS SDK, Firebase Functions (Node 20, TS), Emulator Suite, Vitest + RTL, `@firebase/rules-unit-testing`, Playwright.

## Global Constraints

- **Builds on shipped Phase 1** (`main` @ current HEAD). Do not regress existing behavior; all existing tests (root, functions, E2E) must stay green.
- **Emulator-first**: everything runs against the Firebase Emulator Suite (project `demo-lyssasky`) with no real cloud project. Run functions integration/rules tests via `firebase emulators:exec --project demo-lyssasky --only auth,firestore,storage 'cd functions && npx vitest run <file>'`. Run `npm run emulator` (builds functions first) + `npm run seed` + `VITE_USE_EMULATORS=true npm run dev` for the app.
- **All admin writes go through admin-guarded callables** using `assertAdmin`. `firestore.rules` `allow write: if false` stays for every collection. Client Storage writes are the only client writes, scoped by rules.
- **`isAdmin`/admin privilege is server-verified** from `req.auth.token.admin === true` — never from client input.
- **Money in integer cents**; existing `priceCents: 500`, `currency: 'CAD'`.
- **Offline-safe**: no external font/image/script URLs in app code (strict-CSP / offline). Style gallery images are data URIs or admin-uploaded Storage objects. Charts are CSS/SVG only — no chart CDN.
- **Voice**: warm/supportive for any customer-facing copy (emails, result page). Admin UI is utilitarian but tidy, reusing the Phase 1 tokens/`.btn` classes.
- **TDD**: failing test first for logic; commit after each task. Functions integration tests are named `*.integration.test.ts`.

## Key Architecture Decisions (locked contract)

These names/types are referenced across tasks. Do not rename without updating consumers.

### Type extensions (`src/domain/types.ts`)

```ts
// AppConfig gains two optional fields (backward compatible; DEFAULT_CONFIG sets them):
export interface AppConfig {
  priceCents: number;
  currency: string;
  calendlyUrl: string;
  paymentMode: 'mock' | 'stripe';
  generationMode: 'mock' | 'gemini';
  questionnaire: QuestionDef[];
  notifyEmail: string;                    // Marjorie's inbox for booking notifications
  featureFlags: Record<string, boolean>;  // simple on/off toggles
}

// Email document shape written to the `mail` collection (Trigger Email extension format):
export interface MailDocument {
  to: string;
  message: { subject: string; html: string };
  createdAt: number;
  kind: 'booking_notification' | 'result_ready';  // our own tag for filtering/tests
  leadId?: string;
}

// Analytics summary returned by adminGetAnalytics:
export interface AnalyticsSummary {
  funnel: Record<'captured' | 'paid' | 'generated' | 'rated' | 'booked' | 'failed', number>;
  totalLeads: number;
  stylePopularity: { slug: string; count: number }[];      // desc by count
  avgRatingByStyle: { slug: string; avg: number; count: number }[];
  budgetDistribution: Record<string, number>;              // answer slug -> count
  timelineDistribution: Record<string, number>;
  revenueCents: number;                                    // paid leads * priceCents
  generations: { total: number; failed: number; avgDurationMs: number; estCostCents: number };
}
```

### `assertAdmin` guard (`functions/src/guards.ts`)

```ts
import type { CallableRequest } from 'firebase-functions/v2/https';
export function assertAdmin(auth: CallableRequest['auth']): void {
  if (!auth || auth.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }
}
```

### New admin callables (client → server contract)

| Function | Auth | Input | Output / effect |
| --- | --- | --- | --- |
| `adminSaveStyle` | admin | `{ style: Style }` | upsert `styles/{slug}` (validated); `{ ok: true }` |
| `adminDeleteStyle` | admin | `{ slug: string }` | delete `styles/{slug}`; `{ ok: true }` |
| `adminUpdateConfig` | admin | `{ patch: Partial<AppConfig> }` | merge into `config/app` (validated); `{ ok: true }` |
| `adminTestBenchGenerate` | admin | `{ inputPhotoPath, styleSlug?, inlineRecipe?, styleName?, answers? }` | runs configured provider; writes `generations` (source `testbench`); `{ generationId, outputPhotoPath }` |
| `adminGetAnalytics` | admin | `{}` | `AnalyticsSummary` computed server-side |
| `getResultByToken` | anon/none | `{ leadId, leadToken }` | token-scoped: `{ status, imageUrls: string[] }` if `leadToken` matches; else `permission-denied` |

`onLeadBooked` — new Firestore trigger (`onDocumentUpdated leads/{id}`, status → `booked`) → writes a `booking_notification` mail doc to `config.notifyEmail`.
Result email — `runGeneration` success (funnel source) additionally writes a `result_ready` mail doc to `lead.email` with a tokenized result link.

### Client api wrappers (`src/firebase/api.ts`)

`apiAdminSaveStyle(style)`, `apiAdminDeleteStyle(slug)`, `apiAdminUpdateConfig(patch)`, `apiAdminTestBenchGenerate(input)`, `apiAdminGetAnalytics()`, `apiGetResultByToken(leadId, token)`, `uploadAdminImage(path, file)` (Storage upload to an admin path), `fetchStyle(slug)`, `fetchAllStyles()` (incl. inactive, admin view).

### Rules changes

- Firestore: no new client-write grants (all writes stay `if false`; admin writes via callables). Add `mail/{id}` — `allow read: if isAdmin(); allow write: if false;`.
- Storage: add admin-writable paths for gallery images + test-bench uploads:
  - `match /styles/{allPaths=**} { allow read: if true; allow write: if isAdmin(); }`
  - `match /testbench/{allPaths=**} { allow read, write: if isAdmin(); }`
  where `isAdmin()` = `request.auth != null && request.auth.token.admin == true`.

### Deviations / decisions

1. **Email = write to `mail` collection** (Trigger Email extension format). No sending happens in the emulator; docs are recorded and admin-readable + assertable in tests. Go-live installs the extension. This is the "mock now, real later" choice.
2. **Cross-device emailed result links** (deferred from Phase 1) are enabled via `getResultByToken` (token-scoped read), since a new device gets a fresh anonymous uid that can't satisfy the ownership rule.
3. **Test bench** reuses a shared `generateImage()` helper extracted from `runGeneration`, and the funnel's `resolveProvider()` — so recipe tuning flows through the exact production generation path.
4. **Analytics** computed server-side in one callable (scales past client-side aggregation; keeps event/lead reads admin-only).

## File Structure

```
functions/src/
├── guards.ts                      # + assertAdmin
├── admin/                         # NEW — admin-only callables
│   ├── styles.ts                  # adminSaveStyle, adminDeleteStyle, validateStyle
│   ├── config.ts                  # adminUpdateConfig, validateConfigPatch
│   ├── testbench.ts               # adminTestBenchGenerate
│   └── analytics.ts               # adminGetAnalytics
├── generation/
│   ├── generateImage.ts           # NEW — shared helper (bytes+prompt+provider -> output), extracted
│   ├── runGeneration.ts           # MODIFY — use generateImage; write result_ready mail on funnel success
│   └── ...
├── email/
│   └── sendEmail.ts               # NEW — sendEmailDoc(); onLeadBooked trigger
├── result.ts                      # NEW — getResultByToken callable
├── config.ts, events.ts, leads.ts, checkout.ts, seed/ ...   # existing
└── index.ts                       # MODIFY — export new functions

src/
├── firebase/api.ts                # MODIFY — new admin wrappers + fetchStyle/fetchAllStyles + uploadAdminImage
├── domain/types.ts                # MODIFY — type extensions
├── config/defaultConfig.ts        # MODIFY — notifyEmail + featureFlags defaults
├── admin/
│   ├── AdminApp.tsx               # MODIFY — nav + new nested routes
│   ├── AdminNav.tsx               # NEW — shared admin nav bar
│   ├── StylesListPage.tsx         # NEW — /admin/styles
│   ├── StyleEditPage.tsx          # NEW — /admin/styles/:slug and /admin/styles/new
│   ├── TestBenchPage.tsx          # NEW — /admin/testbench
│   ├── ConfigPage.tsx             # NEW — /admin/config
│   └── AnalyticsPage.tsx          # NEW — /admin/analytics
└── funnel/ResultStep.tsx          # MODIFY — token mode (emailed link)

firestore.rules, storage.rules      # MODIFY — mail read; storage admin paths
functions/src/*.integration.test.ts # NEW tests
e2e/admin.spec.ts                    # MODIFY — cover new tools
```

Shared domain modules stay Firebase-free. Functions import them via the established `../../src/domain/...` relative paths (tsconfig `rootDir: ".."`).

---

## Milestone 0 — Shared foundation (types, admin guard, rules)

### Task 1: Type extensions + default config

**Files:** Modify `src/domain/types.ts`, `src/config/defaultConfig.ts`; Test `src/config/defaultConfig.test.ts`.

**Interfaces:** Produces the `AppConfig.notifyEmail`/`featureFlags` fields, `MailDocument`, `AnalyticsSummary` types (from the contract above).

- [ ] **Step 1: Extend the failing test** — add to `src/config/defaultConfig.test.ts`:

```ts
it('provides a notify email and a feature flags map', () => {
  expect(typeof DEFAULT_CONFIG.notifyEmail).toBe('string');
  expect(DEFAULT_CONFIG.notifyEmail).toMatch(/@/);
  expect(DEFAULT_CONFIG.featureFlags).toBeTypeOf('object');
});
```

- [ ] **Step 2: Run — fails.** `npm test src/config/defaultConfig.test.ts`
- [ ] **Step 3: Implement.** In `src/domain/types.ts` add `notifyEmail: string;` and `featureFlags: Record<string, boolean>;` to `AppConfig`, and append the `MailDocument` and `AnalyticsSummary` interfaces (verbatim from the contract). In `src/config/defaultConfig.ts` add to `DEFAULT_CONFIG`: `notifyEmail: 'marjorie@lyssasky.com'`, `featureFlags: {}`.
- [ ] **Step 4: Run — green;** `npx tsc -b` clean (existing `AppConfig` consumers still compile because the new fields are required but only constructed in `DEFAULT_CONFIG` and the config callable — confirm no other object literal builds an `AppConfig`; `fetchAppConfig` casts Firestore data, and `loadConfig` falls back to `DEFAULT_CONFIG`).
- [ ] **Step 5: Commit** `feat: config notifyEmail + featureFlags; mail + analytics types`.

### Task 2: `assertAdmin` guard + rules (Firestore mail read, Storage admin paths)

**Files:** Modify `functions/src/guards.ts`, `firestore.rules`, `storage.rules`; Test `functions/src/rules.test.ts` (extend), `functions/src/storageRules.test.ts` (extend), `functions/src/guards.test.ts` (new unit test).

**Interfaces:** Produces `assertAdmin(auth)` (throws `HttpsError('permission-denied')` unless `auth.token.admin === true`).

- [ ] **Step 1: Failing unit test** — `functions/src/guards.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { assertAdmin } from './guards';
describe('assertAdmin', () => {
  it('allows an admin', () => {
    expect(() => assertAdmin({ uid: 'a', token: { admin: true } } as any)).not.toThrow();
  });
  it('rejects a non-admin', () => {
    expect(() => assertAdmin({ uid: 'a', token: {} } as any)).toThrow(/admin/i);
  });
  it('rejects unauthenticated', () => {
    expect(() => assertAdmin(undefined)).toThrow(/admin/i);
  });
});
```

- [ ] **Step 2: Run — fails.** (Run in functions workspace: `firebase emulators:exec ... 'cd functions && npx vitest run src/guards.test.ts'` — or plain `npx vitest run` since this test needs no emulator.)
- [ ] **Step 3: Implement `assertAdmin`** in `functions/src/guards.ts`:

```ts
import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { Lead } from '../../src/domain/types';

export function assertOwner(uid: string | undefined, lead: Lead) {  // existing — keep
  if (!uid || uid !== lead.ownerUid) throw new HttpsError('permission-denied', 'Permission denied: not your lead');
}
export function assertAdmin(auth: CallableRequest['auth']): void {
  if (!auth || auth.token?.admin !== true) throw new HttpsError('permission-denied', 'Admin access required');
}
```

- [ ] **Step 4: Rules.** Add to `firestore.rules` (inside the documents match):

```
match /mail/{id} { allow read: if isAdmin(); allow write: if false; }
```

Add to `storage.rules` (a helper + two matches; `isAdmin()` there = `request.auth != null && request.auth.token.admin == true`):

```
match /styles/{allPaths=**} {
  allow read: if true;
  allow write: if request.auth != null && request.auth.token.admin == true
    && request.resource.size < 10 * 1024 * 1024
    && request.resource.contentType.matches('image/.*');
}
match /testbench/{allPaths=**} {
  allow read: if request.auth != null && request.auth.token.admin == true;
  allow write: if request.auth != null && request.auth.token.admin == true
    && request.resource.size < 15 * 1024 * 1024
    && request.resource.contentType.matches('image/.*');
}
```

- [ ] **Step 5: Rules tests.** In `functions/src/rules.test.ts` add: a non-admin cannot read `mail`; an admin can read `mail`. In `functions/src/storageRules.test.ts` add: an admin can upload an image to `styles/scandi/g.jpg` and `testbench/u/x.jpg`; a non-admin (anon customer) cannot write to `styles/**` or `testbench/**`; anyone can read `styles/**` but only admin reads `testbench/**`. (Seed docs/objects via `withSecurityRulesDisabled` where needed; use `env.authenticatedContext('admin1', { admin: true })`.)
- [ ] **Step 6: Run — green** via emulators:exec (`'cd functions && npx vitest run src/rules.test.ts src/storageRules.test.ts src/guards.test.ts'`). `cd functions && npm run build` clean.
- [ ] **Step 7: Commit** `feat: assertAdmin guard; mail + admin storage rules`.

---

## Milestone 1 — Styles CRUD manager

### Task 3: `adminSaveStyle` + `adminDeleteStyle` + validation

**Files:** Create `functions/src/admin/styles.ts`; Modify `functions/src/index.ts`; Test `functions/src/admin/styles.integration.test.ts`.

**Interfaces:**
- Produces `validateStyle(style: unknown): Style` (throws `HttpsError('invalid-argument')` on bad shape), `adminSaveStyleDoc(style: Style)`, `adminDeleteStyleDoc(slug: string)`, and callables `adminSaveStyle`, `adminDeleteStyle`.
- Consumes `assertAdmin`, `Style`/`StyleRecipe` types.

- [ ] **Step 1: Failing test** — `functions/src/admin/styles.integration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { db } from '../admin';
import { adminSaveStyleDoc, adminDeleteStyleDoc, validateStyle } from './styles';

const style = {
  slug: 'teststyle', name: 'Test Style', description: 'd', galleryImages: ['data:image/svg+xml,x'],
  recipe: { description: 'd', materials: 'm', palette: 'p', furniture: 'f', avoid: 'a' },
  sortOrder: 9, active: true,
};

describe('admin styles', () => {
  it('upserts a valid style', async () => {
    await adminSaveStyleDoc(validateStyle(style));
    const snap = await db.collection('styles').doc('teststyle').get();
    expect(snap.data()!.name).toBe('Test Style');
  });
  it('updates an existing style by slug', async () => {
    await adminSaveStyleDoc(validateStyle({ ...style, name: 'Renamed' }));
    const snap = await db.collection('styles').doc('teststyle').get();
    expect(snap.data()!.name).toBe('Renamed');
  });
  it('deletes a style', async () => {
    await adminDeleteStyleDoc('teststyle');
    const snap = await db.collection('styles').doc('teststyle').get();
    expect(snap.exists).toBe(false);
  });
  it('rejects a style missing a slug', () => {
    expect(() => validateStyle({ ...style, slug: '' })).toThrow(/slug/i);
  });
  it('rejects a style missing recipe fields', () => {
    expect(() => validateStyle({ ...style, recipe: { description: 'd' } })).toThrow(/recipe/i);
  });
});
```

- [ ] **Step 2: Run — fails** (via emulators:exec).
- [ ] **Step 3: Implement** `functions/src/admin/styles.ts`:

```ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../admin';
import { assertAdmin } from '../guards';
import type { Style, StyleRecipe } from '../../../src/domain/types';

const SLUG_RE = /^[a-z0-9_]+$/;
function str(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.trim() === '') throw new HttpsError('invalid-argument', `Missing ${field}`);
  return v;
}
export function validateStyle(input: unknown): Style {
  const s = input as Record<string, unknown>;
  const slug = str(s.slug, 'slug');
  if (!SLUG_RE.test(slug)) throw new HttpsError('invalid-argument', 'slug must be lowercase letters, numbers, underscores');
  const r = (s.recipe ?? {}) as Record<string, unknown>;
  const recipe: StyleRecipe = {
    description: str(r.description, 'recipe.description'),
    materials: str(r.materials, 'recipe.materials'),
    palette: str(r.palette, 'recipe.palette'),
    furniture: str(r.furniture, 'recipe.furniture'),
    avoid: str(r.avoid, 'recipe.avoid'),
  };
  const galleryImages = Array.isArray(s.galleryImages) ? s.galleryImages.filter((x): x is string => typeof x === 'string') : [];
  return {
    slug, name: str(s.name, 'name'), description: str(s.description, 'description'),
    galleryImages, recipe,
    sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : 0,
    active: s.active !== false,
  };
}
export async function adminSaveStyleDoc(style: Style): Promise<void> {
  await db.collection('styles').doc(style.slug).set(style);
}
export async function adminDeleteStyleDoc(slug: string): Promise<void> {
  await db.collection('styles').doc(slug).delete();
}
export const adminSaveStyle = onCall(async (req) => {
  assertAdmin(req.auth);
  await adminSaveStyleDoc(validateStyle(req.data?.style));
  return { ok: true };
});
export const adminDeleteStyle = onCall(async (req) => {
  assertAdmin(req.auth);
  const slug = req.data?.slug;
  if (typeof slug !== 'string' || !slug) throw new HttpsError('invalid-argument', 'slug required');
  await adminDeleteStyleDoc(slug);
  return { ok: true };
});
```

Export both from `functions/src/index.ts`.

- [ ] **Step 4: Run — green** (via emulators:exec). Build clean.
- [ ] **Step 5: Commit** `feat: admin style CRUD callables + validation`.

### Task 4: Client api wrappers for styles + admin image upload

**Files:** Modify `src/firebase/api.ts`; Test `src/firebase/api.test.ts` (extend the exports smoke test).

**Interfaces:** Produces `apiAdminSaveStyle(style: Style): Promise<Ok>`, `apiAdminDeleteStyle(slug): Promise<Ok>`, `fetchStyle(slug): Promise<Style | undefined>`, `fetchAllStyles(): Promise<Style[]>` (all styles incl. inactive, ordered by sortOrder), `uploadAdminImage(path: string, file: File): Promise<string>` (Storage upload, returns path).

- [ ] **Step 1: Extend the exports smoke test** in `src/firebase/api.test.ts` to assert these five are functions.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** in `src/firebase/api.ts`:

```ts
export async function apiAdminSaveStyle(style: Style): Promise<Ok> {
  const fn = httpsCallable<{ style: Style }, Ok>(functions, 'adminSaveStyle');
  return (await fn({ style })).data;
}
export async function apiAdminDeleteStyle(slug: string): Promise<Ok> {
  const fn = httpsCallable<{ slug: string }, Ok>(functions, 'adminDeleteStyle');
  return (await fn({ slug })).data;
}
export async function fetchStyle(slug: string): Promise<Style | undefined> {
  const snap = await getDoc(doc(db, 'styles', slug));
  return snap.exists() ? (snap.data() as Style) : undefined;
}
export async function fetchAllStyles(): Promise<Style[]> {
  const snap = await getDocs(query(collection(db, 'styles'), orderBy('sortOrder')));
  return snap.docs.map((d) => d.data() as Style);
}
export async function uploadAdminImage(path: string, file: File): Promise<string> {
  await uploadBytes(ref(storage, path), file);
  return path;
}
```

- [ ] **Step 4: Run — green;** `npm run build` clean.
- [ ] **Step 5: Commit** `feat: client wrappers for admin style CRUD + image upload`.

### Task 5: Admin nav + Styles list page

**Files:** Create `src/admin/AdminNav.tsx`, `src/admin/StylesListPage.tsx`; Modify `src/admin/AdminApp.tsx`; Test `src/admin/StylesListPage.test.tsx`.

**Interfaces:** `AdminNav` renders links to Leads / Styles / Test bench / Config / Analytics + sign out. `StylesListPage` lists all styles (via `fetchAllStyles`) with active/inactive badge, sortOrder, an Edit link to `/admin/styles/:slug`, a New Style button to `/admin/styles/new`, and a Delete action (calls `apiAdminDeleteStyle`, refetches).

- [ ] **Step 1: Failing test** — mock `fetchAllStyles` → 2 styles; assert rows render (names), New button links to `/admin/styles/new`, and clicking Delete calls `apiAdminDeleteStyle` with the slug.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** `AdminNav` (reuse `.btn`/tokens, current route highlighted), `StylesListPage`, and wire routes in `AdminApp.tsx`:

```tsx
// AdminApp nested <Routes>: add
<Route path="styles" element={<StylesListPage />} />
<Route path="styles/new" element={<StyleEditPage />} />
<Route path="styles/:slug" element={<StyleEditPage />} />
```

Render `<AdminNav />` above the `<Routes>` in the admin shell. (Import `StyleEditPage` — created in Task 6; to keep the build green if Task 6 runs later, create a minimal stub `StyleEditPage` now OR sequence Task 6 immediately after. This plan sequences Task 6 next; if implementing out of order, add a placeholder.)

- [ ] **Step 4: Run — green;** build clean.
- [ ] **Step 5: Commit** `feat: admin nav + styles list page`.

### Task 6: Style edit/create page (recipe form + gallery image upload)

**Files:** Create `src/admin/StyleEditPage.tsx`; Test `src/admin/StyleEditPage.test.tsx`.

**Interfaces:** Route `/admin/styles/:slug` (edit) and `/admin/styles/new` (create). Loads via `fetchStyle(slug)` when editing. Form fields: slug (locked when editing), name, description, active toggle, sortOrder, the five recipe fields (materials/palette/furniture/avoid/description), and a gallery-images editor (list of URLs/data-URIs + an upload control using `uploadAdminImage('styles/{slug}/{filename}', file)` then `getImageUrl` to preview). Save → `apiAdminSaveStyle(style)` → navigate `/admin/styles`.

- [ ] **Step 1: Failing test** — for `/admin/styles/new`: fill slug/name/description/recipe fields, submit → `apiAdminSaveStyle` called with a style whose slug/name/recipe match. For edit: mock `fetchStyle` → a style; assert fields prefilled. Mock `src/firebase/api.ts`.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** `StyleEditPage.tsx` (controlled form; validate slug non-empty client-side; the gallery editor may keep images as an editable string list — upload appends the returned path/URL). Warn on unsaved changes optional.
- [ ] **Step 4: Run — green;** build clean.
- [ ] **Step 5: Commit** `feat: admin style edit/create page`.

---

## Milestone 2 — Test bench

### Task 7: Extract shared `generateImage` helper; refactor `runGeneration` to use it

**Files:** Create `functions/src/generation/generateImage.ts`; Modify `functions/src/generation/runGeneration.ts`; Test `functions/src/generation/generateImage.integration.test.ts`.

**Interfaces:**
- Produces `generateImage(input: { inputPhotoPath: string; prompt: string; provider?: GenerationProvider }): Promise<{ outputPhotoPath: string; mimeType: string; durationMs: number; costEstimate: number }>` — downloads the input from Storage, calls the provider (default `resolveProvider()`) with 1 retry, saves the output under a **caller-provided or default** path. To keep `runGeneration`'s existing output layout (`leads/{ownerUid}/generated/{ts}.png`), `generateImage` accepts an optional `outputPathPrefix` and returns where it wrote. Signature:
  `generateImage({ inputPhotoPath, prompt, provider?, outputDir }): Promise<{ outputPhotoPath, mimeType, durationMs, costEstimate }>` where `outputDir` defaults to `testbench/results`.
- `runGeneration` keeps its exact current behavior (retry, failure routing to `failed` without throwing, recipe/prompt snapshots, status flip after image save) but delegates the download→provider→save core to `generateImage`.

- [ ] **Step 1: Failing test** — seed a `testbench/in.jpg` object; call `generateImage({ inputPhotoPath: 'testbench/in.jpg', prompt: 'restyle', provider: createMockGenerationProvider(), outputDir: 'testbench/results' })`; assert it returns an `outputPhotoPath` under `testbench/results/` and the object exists in Storage; `durationMs >= 0`, `costEstimate === 0`.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** `generateImage.ts` (extract the download + retry loop + save from `runGeneration`), then refactor `runGeneration.ts` to call it for the core (preserving all lead bookkeeping around it). **Run the existing `runGeneration.integration.test.ts` to confirm no regression** (retry, failure, success ordering).
- [ ] **Step 4: Run — green** (new test + existing runGeneration tests) via emulators:exec; build clean.
- [ ] **Step 5: Commit** `refactor: extract generateImage; runGeneration reuses it`.

### Task 8: `adminTestBenchGenerate` callable

**Files:** Create `functions/src/admin/testbench.ts`; Modify `functions/src/index.ts`; Test `functions/src/admin/testbench.integration.test.ts`.

**Interfaces:** Produces `adminTestBenchGenerateDoc(input): Promise<{ generationId, outputPhotoPath }>` and callable `adminTestBenchGenerate`. Input `{ inputPhotoPath, styleSlug?, inlineRecipe?, styleName?, answers? }`. Resolves the recipe: if `styleSlug` given, load `styles/{slug}` for name+recipe; else use `inlineRecipe`+`styleName` (both required if no slug). Builds the prompt via `buildGenerationPrompt({ name, recipe }, answers ?? DEFAULT test answers)`, calls `generateImage({ inputPhotoPath, prompt, outputDir: 'testbench/results' })`, writes a `generations` doc `{ source: 'testbench', styleSlug: slug ?? 'inline', recipeSnapshot, promptSnapshot, inputPhotoPath, outputPhotoPath, durationMs, costEstimate, status: 'success', createdAt }`, returns `{ generationId, outputPhotoPath }`.

- [ ] **Step 1: Failing test** — seed a style + a `testbench/in.jpg` object; call `adminTestBenchGenerateDoc({ inputPhotoPath: 'testbench/in.jpg', styleSlug: 'scandi' })`; assert a `generations` doc with `source: 'testbench'`, `promptSnapshot` matching the style name, and an `outputPhotoPath`. Second case: inline recipe (no slug) works. Third: no slug and no inlineRecipe → throws invalid-argument.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** `testbench.ts` (+ a small `DEFAULT_TESTBENCH_ANSWERS` constant with a room type/color mood so the prompt builder has inputs). Guard with `assertAdmin`. Export the callable.
- [ ] **Step 4: Run — green** via emulators:exec; build clean.
- [ ] **Step 5: Commit** `feat: adminTestBenchGenerate callable`.

### Task 9: Test bench page

**Files:** Create `src/admin/TestBenchPage.tsx`; Modify `src/firebase/api.ts` (add `apiAdminTestBenchGenerate`, and `uploadAdminImage` already exists), `src/admin/AdminApp.tsx` (route `/admin/testbench`); Test `src/admin/TestBenchPage.test.tsx`.

**Interfaces:** `apiAdminTestBenchGenerate(input): Promise<{ generationId, outputPhotoPath }>`. Page: upload a test photo (→ `uploadAdminImage('testbench/{adminUid}/{ts}.jpg', file)`), pick an existing style (from `fetchAllStyles`) OR switch to "inline recipe" mode and edit the five recipe fields, click Generate → `apiAdminTestBenchGenerate` → resolve `getImageUrl(outputPhotoPath)` and append the result (with the input thumbnail + the style/recipe used) to an on-page **results strip** so multiple runs sit **side by side** for comparison. Show a generating state.

- [ ] **Step 1: Failing test** — mock api: `uploadAdminImage` → a path, `fetchAllStyles` → styles, `apiAdminTestBenchGenerate` → `{ generationId:'g1', outputPhotoPath:'p' }`, `getImageUrl` → url. Upload a file, pick a style, click Generate → assert `apiAdminTestBenchGenerate` called with the input path + styleSlug, and a result image appears.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** `TestBenchPage.tsx` + `apiAdminTestBenchGenerate` wrapper + route + nav entry.
- [ ] **Step 4: Run — green;** build clean.
- [ ] **Step 5: Commit** `feat: test bench page`.

---

## Milestone 3 — Config editor

### Task 10: `adminUpdateConfig` callable + validation

**Files:** Create `functions/src/admin/config.ts`; Modify `functions/src/index.ts`; Test `functions/src/admin/config.integration.test.ts`.

**Interfaces:** Produces `validateConfigPatch(patch: unknown): Partial<AppConfig>` (whitelists editable fields: priceCents [int ≥ 0], currency, calendlyUrl, paymentMode ∈ {mock,stripe}, generationMode ∈ {mock,gemini}, notifyEmail, featureFlags, questionnaire [array of valid QuestionDef]) and `adminUpdateConfigDoc(patch)` (merges into `config/app`, creating it from `DEFAULT_CONFIG` if absent) and callable `adminUpdateConfig`.

- [ ] **Step 1: Failing test** — seed `config/app` (or rely on create-from-default); call `adminUpdateConfigDoc({ priceCents: 700, generationMode: 'gemini' })`; assert `config/app` now has priceCents 700, generationMode 'gemini', and untouched fields preserved. Reject `paymentMode: 'paypal'` (invalid-argument). Reject `priceCents: -1`.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** `config.ts`. Merge semantics: read existing `config/app` (fallback `DEFAULT_CONFIG`), apply the validated patch shallowly, write back the full doc. Guard `assertAdmin`. Export callable.
- [ ] **Step 4: Run — green** via emulators:exec; build clean.
- [ ] **Step 5: Commit** `feat: adminUpdateConfig callable + validation`.

### Task 11: Config editor page

**Files:** Create `src/admin/ConfigPage.tsx`; Modify `src/firebase/api.ts` (`apiAdminUpdateConfig`), `src/admin/AdminApp.tsx` (route `/admin/config`); Test `src/admin/ConfigPage.test.tsx`.

**Interfaces:** `apiAdminUpdateConfig(patch: Partial<AppConfig>): Promise<Ok>`. Page loads via `fetchAppConfig()`, renders a form:
- Scalars: price (dollars input → cents), currency, calendlyUrl, notifyEmail.
- Selects: paymentMode (mock/stripe), generationMode (mock/gemini).
- Feature flags: add/remove key→boolean rows.
- Questionnaire editor: list each question (prompt, type, required toggle); for `single`/`gallery` questions, edit options as value/label rows (add/remove). Keep it structured but simple; reordering questions optional.
Save → `apiAdminUpdateConfig(patch)` with the changed fields.

- [ ] **Step 1: Failing test** — mock `fetchAppConfig` → DEFAULT_CONFIG; change the price field and generationMode; submit → `apiAdminUpdateConfig` called with `priceCents` (converted) and `generationMode`. Assert questionnaire prompts render.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** `ConfigPage.tsx` + wrapper + route + nav entry.
- [ ] **Step 4: Run — green;** build clean.
- [ ] **Step 5: Commit** `feat: config editor page`.

---

## Milestone 4 — Analytics dashboard

### Task 12: `adminGetAnalytics` callable (server-side aggregation)

**Files:** Create `functions/src/admin/analytics.ts`; Modify `functions/src/index.ts`; Test `functions/src/admin/analytics.integration.test.ts`.

**Interfaces:** Produces `computeAnalytics(): Promise<AnalyticsSummary>` and callable `adminGetAnalytics` (admin-guarded). Reads `leads` (all), `generations` (all). Computes: `funnel` counts by lead.status; `totalLeads`; `stylePopularity` from lead.answers.styleSlug (desc); `avgRatingByStyle` from rated leads grouped by styleSlug; `budgetDistribution`/`timelineDistribution` from answers; `revenueCents` = count(status ∈ {paid,generated,rated,booked}) × config.priceCents (a paid lead progressed past payment); `generations` = { total, failed, avgDurationMs, estCostCents = round(sum(costEstimate)×100) }.

- [ ] **Step 1: Failing test** — seed a handful of leads across statuses (with answers/ratings) + a couple `generations`; call `computeAnalytics()`; assert `funnel.booked`, `totalLeads`, `stylePopularity[0]`, an `avgRatingByStyle` entry, and `revenueCents` match hand-computed values.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** `analytics.ts` (load config for priceCents; iterate docs; build the summary). Export callable.
- [ ] **Step 4: Run — green** via emulators:exec; build clean.
- [ ] **Step 5: Commit** `feat: adminGetAnalytics aggregation callable`.

### Task 13: Analytics dashboard page

**Files:** Create `src/admin/AnalyticsPage.tsx`; Modify `src/firebase/api.ts` (`apiAdminGetAnalytics`), `src/admin/AdminApp.tsx` (route `/admin/analytics`); Test `src/admin/AnalyticsPage.test.tsx`.

> Before building charts, load the **dataviz** skill for palette/labeling. Charts must be CSS/SVG only (offline-safe) — simple horizontal bars + stat tiles; no chart library from a CDN.

**Interfaces:** `apiAdminGetAnalytics(): Promise<AnalyticsSummary>`. Page loads it and renders: a funnel row (captured→paid→generated→rated→booked as stat tiles + a simple bar), revenue tile, style popularity bars, avg-rating-per-style bars (flag low averages as "recipe needs test-bench work"), budget/timeline distributions, and generation stats (total/failed/avg duration/est cost).

- [ ] **Step 1: Failing test** — mock `apiAdminGetAnalytics` → a fixed `AnalyticsSummary`; assert the funnel numbers, revenue (formatted from cents), a style popularity bar, and a low-rating flag render.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** `AnalyticsPage.tsx` (CSS bars via width %; format cents→`$X.XX`) + wrapper + route + nav entry.
- [ ] **Step 4: Run — green;** build clean.
- [ ] **Step 5: Commit** `feat: analytics dashboard page`.

---

## Milestone 5 — Email notifications + tokenized result links

### Task 14: `sendEmailDoc` + `onLeadBooked` trigger (booking → Marjorie)

**Files:** Create `functions/src/email/sendEmail.ts`; Modify `functions/src/index.ts`; Test `functions/src/email/sendEmail.integration.test.ts`.

**Interfaces:** Produces `sendEmailDoc(input: { to: string; subject: string; html: string; kind: MailDocument['kind']; leadId?: string }): Promise<void>` (writes to `mail` collection in Trigger-Email shape `{ to, message: { subject, html }, createdAt, kind, leadId }`) and the Firestore trigger `onLeadBooked` (`onDocumentUpdated leads/{leadId}`, when status transitions into `booked`) → loads config for `notifyEmail`, composes a briefing (customer email, answers, rating/feedback, booking name/phone/note, a link to `/admin/leads/{id}`), calls `sendEmailDoc(..., kind: 'booking_notification')`.

- [ ] **Step 1: Failing test** — call `sendEmailDoc({ to:'m@x.com', subject:'s', html:'<p>h</p>', kind:'booking_notification', leadId:'l1' })`; assert a `mail` doc exists with `to`, `message.subject`, `message.html`, `kind`. (Trigger itself: optionally exercise `handleLeadBooked` — extract the trigger body into a testable `handleLeadBooked(leadId)` like `handleLeadPaid` — seed a booked lead + config, call it, assert a booking_notification mail doc to `config.notifyEmail`.)
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** `sendEmail.ts` (extract `handleLeadBooked(leadId)` + wrap in `onLeadBooked` trigger). Export `onLeadBooked`.
- [ ] **Step 4: Run — green** via emulators:exec; build clean.
- [ ] **Step 5: Commit** `feat: sendEmailDoc + onLeadBooked notification`.

### Task 15: Result-ready email + `getResultByToken` + tokenized result page

**Files:** Create `functions/src/result.ts`; Modify `functions/src/generation/runGeneration.ts` (send result email on funnel success), `functions/src/index.ts`, `src/firebase/api.ts` (`apiGetResultByToken`), `src/funnel/ResultStep.tsx` (token mode); Test `functions/src/result.integration.test.ts`, and extend `functions/src/generation/runGeneration.integration.test.ts`.

**Interfaces:**
- `getResultByTokenDoc(leadId, leadToken): Promise<{ status: LeadStatus; imageUrls: string[] }>` — loads the lead; if `lead.leadToken !== leadToken` throw `permission-denied`; else return status + `getDownloadURL` for each `generatedImagePaths` entry (via Admin SDK signed/emulator URL). Callable `getResultByToken` (no auth required — the token is the credential).
- In `runGeneration` funnel-source success, after the lead flips to `generated`, if `lead.email` is set, `sendEmailDoc({ to: lead.email, subject: 'Your room preview is ready', html: <link to APP_BASE_URL/result?lead={id}&token={leadToken}>, kind: 'result_ready', leadId })`.
- `ResultStep.tsx`: when the URL has `?token=`, load via `apiGetResultByToken(leadId, token)` instead of `fetchLead` (the emailed cross-device path where the anonymous uid won't own the lead). Existing in-session path (no token) unchanged.

- [ ] **Step 1: Failing tests** — (a) `getResultByTokenDoc` returns image URLs for a matching token and throws for a wrong token; (b) extend runGeneration success test: a funnel lead with an `email` produces a `result_ready` mail doc to that email containing the leadId+token link.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** `result.ts` + the runGeneration email hook (guard: only funnel source, only when `email` present, best-effort/try-catch so email failure never breaks generation) + `apiGetResultByToken` + ResultStep token mode.
- [ ] **Step 4: Run — green** via emulators:exec (functions) and `npm test` (ResultStep unit test for token mode); build clean.
- [ ] **Step 5: Commit** `feat: result-ready email + tokenized result access`.

---

## Milestone 6 — Integration, E2E, docs

### Task 16: Extend admin E2E for the new tools

**Files:** Modify `e2e/admin.spec.ts` (or add `e2e/admin-tools.spec.ts`).

**Interfaces:** Signed in as the seeded admin, drive (robust role/text selectors, generous timeouts): create a new style via `/admin/styles/new` and see it in the list; open the test bench, upload the fixture (`e2e/fixtures/room.jpg`), pick a style, Generate, and see a result image; open config, change the price, save, and confirm it persists (reload); open analytics and see the funnel/revenue render. Optionally assert (via the emulator Firestore REST) that completing a funnel booking wrote a `mail` doc.

- [ ] **Step 1:** Write the spec additions using the existing `admin.spec.ts` sign-in helper pattern.
- [ ] **Step 2:** Run `npm run e2e` — all specs pass (the `e2e.sh` harness already builds functions + seeds).
- [ ] **Step 3:** Commit `test: e2e for styles/testbench/config/analytics`.

### Task 17: README + seed + final verification

**Files:** Modify `README.md`; optionally extend `functions/src/seed/seed.ts` (seed `config/app` already includes the new fields via DEFAULT_CONFIG — confirm).

- [ ] **Step 1:** README: add a "Phase 2 — admin tools" section documenting `/admin/styles`, `/admin/testbench`, `/admin/config`, `/admin/analytics`; how email works (mail collection now, Trigger Email extension at go-live) and how to view sent mail (Emulator UI Firestore `mail`, or admin); the tokenized result link. Update the Phase 2/3 scope note (Phase 2 now done).
- [ ] **Step 2:** Confirm `seed.ts` writes the new config fields (it writes `DEFAULT_CONFIG`, which now has them). Re-seed and spot check in the Emulator UI.
- [ ] **Step 3: Final verification sweep** (record results): `npm test` (root), `npm run build` + `cd functions && npm run build`, functions tests via emulators:exec, `npm run e2e`. All green.
- [ ] **Step 4:** Commit `docs: README phase 2; phase 2 complete`.

---

## Self-Review — spec coverage (§5, §10, §12)

- §5 Styles — full CRUD → Milestone 1 (Tasks 3–6). ✓
- §5 Test bench — upload, pick/edit recipe, generate w/o payment, compare side-by-side → Milestone 2 (Tasks 7–9). ✓
- §5 Config — questionnaire, price, Calendly, payment mode, toggles → Milestone 3 (Tasks 10–11) + `generationMode`, `notifyEmail`. ✓
- §5 Analytics — funnel, style popularity, avg rating/style, budget/timeline, revenue → Milestone 4 (Tasks 12–13). ✓
- §10 Email notifications (booking→Marjorie, result link→customer, via email extension) → Milestone 5 (Tasks 14–15) using the `mail`-collection Trigger-Email pattern. ✓
- §12 "AI gets smarter" — test bench refines recipes; every generation (incl. test bench) recorded with recipe snapshot → Tasks 8, 12 (analytics correlates rating↔style). ✓
- Cross-device emailed result link (Phase-1 deferral) → Task 15 (`getResultByToken`). ✓

**Still deferred (Phase 3 / parked):** real Stripe, custom DNS, portfolio images at scale, installing the real Trigger Email + SMTP extension, automated abandoned-lead emails, auto-suggested recipe improvements, multiple variations per purchase, French, gift codes.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-04-lyssasky-phase2-admin-tools.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — batch execution with checkpoints in this session.

Which approach?
