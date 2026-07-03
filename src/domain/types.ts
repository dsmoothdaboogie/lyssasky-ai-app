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
  booking?: { name: string; phone?: string; note?: string };
  costEstimateTotal: number;         // sum of generation cost estimates
  timestamps: Partial<Record<LeadStatus, number>>; // ms since epoch per status
  regenerateCount?: number;          // owner-initiated regenerates from a completed lead (cap: 1)
  generationClaimedAt?: number;      // set atomically when onLeadPaid claims a 'paid' lead, guards against duplicate/redelivered triggers
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
