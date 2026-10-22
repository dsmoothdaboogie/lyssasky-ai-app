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

export interface LeadPass {
  restylesTotal: number;  // snapshotted from config.passRestyles at payment
  restylesUsed: number;   // first preview does NOT count
  expiresAt: number;      // ms; paidAt + passDays
  inFlight?: number;      // ms; set while a restyle generates (concurrency guard)
}

export interface LeadPerk {
  code: string;           // e.g. "ROOM-7KX2"
  discountPct: number;    // snapshotted from config.perkDiscountPct
  validUntil: number;     // ms; paidAt + perkDays
  redeemedAt?: number;    // set by admin when Marjorie applies it
}

export interface Look {
  imagePath: string;
  styleSlug: string;
  colorMood: string;
  createdAt: number;
}

export type BookingInterest = 'chat' | 'virtual_styling' | 'room_refresh';

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
  notifyEmail: string;
  featureFlags: Record<string, boolean>;
  passRestyles: number;    // 5
  passDays: number;        // 7
  perkDiscountPct: number; // 10
  perkDays: number;        // 30
}

export interface QuestionOption { value: string; label: string; imageUrl?: string; description?: string; }
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
  booking?: { name: string; phone?: string; note?: string; interest?: BookingInterest };
  costEstimateTotal: number;         // sum of generation cost estimates
  timestamps: Partial<Record<LeadStatus, number>>; // ms since epoch per status
  generationClaimedAt?: number;      // set atomically when onLeadPaid claims a 'paid' lead, guards against duplicate/redelivered triggers
  bookingNotifiedAt?: number;        // set atomically when onLeadBooked claims a 'booked' lead, guards against duplicate/redelivered triggers
  pass?: LeadPass;                   // Room Pass, issued at payment
  perk?: LeadPerk;                   // booking perk code, issued at payment
  looks?: Look[];                    // labeled gallery, oldest first (parallel to generatedImagePaths for paid leads)
  remindedAt?: number;               // pass-expiring email claimed (idempotency)
  createdAt: number;
  updatedAt: number;
}

export interface TokenLook { url: string; styleSlug: string; colorMood: string }
export interface TokenResult {
  status: LeadStatus;
  imageUrls: string[];          // kept for backward compat
  looks: TokenLook[];           // empty for legacy leads
  pass: LeadPass | null;        // inFlight stripped
  perk: LeadPerk | null;
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
  watermarkFailed?: boolean;
  createdAt: number;
}

export interface MailDocument {
  to: string;
  message: { subject: string; html: string };
  createdAt: number;
  kind: 'booking_notification' | 'result_ready' | 'pass_expiring';
  leadId?: string;
}

export interface AnalyticsSummary {
  funnel: Record<'captured' | 'paid' | 'generated' | 'rated' | 'booked' | 'failed', number>;
  totalLeads: number;
  stylePopularity: { slug: string; count: number }[];
  avgRatingByStyle: { slug: string; avg: number; count: number }[];
  budgetDistribution: Record<string, number>;
  timelineDistribution: Record<string, number>;
  revenueCents: number;
  generations: { total: number; failed: number; avgDurationMs: number; estCostCents: number };
}
