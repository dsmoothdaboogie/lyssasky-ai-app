import { restylesLeft, INTEREST_LABELS } from '../../../src/domain/pass';
import type { Lead } from '../../../src/domain/types';

export interface EmailLabels { styleName(slug: string): string; moodLabel(value: string): string }

/**
 * Escapes HTML-significant characters before interpolation into an email.
 * Most rendered values originate from customer-controlled free text, and at
 * go-live the Trigger Email extension sends this HTML as real mail — so
 * without escaping, a customer could inject markup into the inbox.
 */
export function escapeHtml(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const dateFmt = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Toronto' });
export function formatDate(ms: number): string {
  // en-CA renders "Oct 28, 2026" with this option set.
  return dateFmt.format(new Date(ms)).replace('.', '');
}

export function resultUrlFor(leadId: string, lead: Lead, appBaseUrl: string): string {
  return `${appBaseUrl}/result?lead=${encodeURIComponent(leadId)}&token=${encodeURIComponent(lead.leadToken)}`;
}

function perkBlock(lead: Lead): string {
  if (!lead.perk) return '';
  return `
    <p><strong>Your Room Pass perks:</strong> a free 15-min chat with Marjorie (she'll have your looks ready),
    plus <strong>${escapeHtml(lead.perk.discountPct)}% off</strong> Virtual Styling (from $250) or Room Refresh (from $650)
    with code <strong>${escapeHtml(lead.perk.code)}</strong>, valid until ${escapeHtml(formatDate(lead.perk.validUntil))}.</p>`;
}

const lookLabel = (l: { styleSlug: string; colorMood: string }, labels: EmailLabels) =>
  `${labels.styleName(l.styleSlug)} · ${labels.moodLabel(l.colorMood)}`;

export function renderResultReadyHtml(lead: Lead, resultUrl: string): string {
  const left = lead.pass ? restylesLeft(lead) : 0;
  const leftText = left === 0 ? 'no restyles' : `${left} restyle${left === 1 ? '' : 's'}`;
  const passLine = lead.pass
    ? `<p>You have <strong>${leftText}</strong> left to try other styles and moods, until ${escapeHtml(formatDate(lead.pass.expiresAt))}.</p>`
    : '';
  return `
    <h2>Your room preview is ready! ✨</h2>
    <p>Marjorie's AI stylist has finished reimagining your space. Take a look:</p>
    <p><a href="${escapeHtml(resultUrl)}">${escapeHtml(resultUrl)}</a></p>
    ${passLine}
    ${perkBlock(lead)}
  `.trim();
}

export function renderPassExpiringHtml(lead: Lead, resultUrl: string, labels: EmailLabels): string {
  const looks = (lead.looks ?? []).map((l) => `<li>${escapeHtml(lookLabel(l, labels))}</li>`).join('');
  return `
    <h2>Your Room Pass ends tomorrow</h2>
    <p>Here are the looks you've explored:</p>
    <ul>${looks}</ul>
    <p><a href="${escapeHtml(resultUrl)}">See your looks</a></p>
    <p>Ready to make one real? Book your free 15-min chat with Marjorie — she'll walk through your looks with you.</p>
    ${perkBlock(lead)}
  `.trim();
}

export function renderBookingHtml(leadId: string, lead: Lead, appBaseUrl: string, labels: EmailLabels): string {
  const leadUrl = `${appBaseUrl}/admin/leads/${leadId}`;
  const answersList = lead.answers
    ? Object.entries(lead.answers)
        .map(([key, value]) => `<li><strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}</li>`)
        .join('')
    : '<li>No questionnaire answers on file</li>';
  const booking = lead.booking;
  const interest = booking?.interest ? (INTEREST_LABELS[booking.interest] ?? 'n/a') : 'n/a';
  const perk = lead.perk
    ? `<p><strong>Room Pass holder</strong> — ${escapeHtml(lead.perk.discountPct)}% off with code <strong>${escapeHtml(lead.perk.code)}</strong>, valid until ${escapeHtml(formatDate(lead.perk.validUntil))}${lead.perk.redeemedAt ? ' (already redeemed)' : ''}.</p>`
    : '';
  const looks = (lead.looks ?? []).map((l) => `<li>${escapeHtml(lookLabel(l, labels))}</li>`).join('');

  return `
    <h2>New booking from ${lead.email ? escapeHtml(lead.email) : 'unknown customer'}</h2>
    <p><strong>Customer email:</strong> ${lead.email ? escapeHtml(lead.email) : 'n/a'}</p>
    <p><strong>Interested in:</strong> ${escapeHtml(interest)}</p>
    ${perk}
    <h3>Looks they tried</h3>
    <ul>${looks || '<li>n/a</li>'}</ul>
    <h3>Questionnaire answers</h3>
    <ul>${answersList}</ul>
    <h3>Feedback on the design</h3>
    <p><strong>Rating:</strong> ${lead.rating !== undefined && lead.rating !== null ? escapeHtml(lead.rating) : 'n/a'}</p>
    <p><strong>What would you change:</strong> ${lead.feedback ? escapeHtml(lead.feedback) : 'n/a'}</p>
    <h3>Booking details</h3>
    <p><strong>Name:</strong> ${booking?.name ? escapeHtml(booking.name) : 'n/a'}</p>
    <p><strong>Phone:</strong> ${booking?.phone ? escapeHtml(booking.phone) : 'n/a'}</p>
    <p><strong>Note:</strong> ${booking?.note ? escapeHtml(booking.note) : 'n/a'}</p>
    <p><a href="${leadUrl}">${leadUrl}</a></p>
  `.trim();
}
