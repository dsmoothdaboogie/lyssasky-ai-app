import { describe, it, expect } from 'vitest';
import { renderResultReadyHtml, renderPassExpiringHtml, renderBookingHtml, formatDate, resultUrlFor } from './templates';
import type { Lead } from '../../../src/domain/types';

const labels = { styleName: (s: string) => ({ scandi: 'Scandinavian', japandi: 'Japandi' }[s] ?? s), moodLabel: (v: string) => ({ warm_cozy: 'Warm & cozy' }[v] ?? v) };
const T = Date.UTC(2026, 9, 28, 16); // Oct 28 2026, noon Toronto

const lead: Lead = {
  id: 'l1', ownerUid: 'u', leadToken: 'tok', email: 'jane@example.com', status: 'booked',
  answers: { roomType: 'living_room', styleSlug: 'scandi', colorMood: 'warm_cozy', budget: '1k_5k', timeline: 'asap' },
  generatedImagePaths: ['a.png', 'b.png'],
  looks: [
    { imagePath: 'a.png', styleSlug: 'scandi', colorMood: 'warm_cozy', createdAt: 1 },
    { imagePath: 'b.png', styleSlug: 'japandi', colorMood: 'warm_cozy', createdAt: 2 },
  ],
  pass: { restylesTotal: 5, restylesUsed: 1, expiresAt: T },
  perk: { code: 'ROOM-7KX2', discountPct: 10, validUntil: T },
  booking: { name: '<b>Jane</b>', interest: 'virtual_styling' },
  costEstimateTotal: 0, timestamps: {}, createdAt: 0, updatedAt: 0,
};

describe('templates', () => {
  it('formats dates in Toronto time', () => expect(formatDate(T)).toBe('Oct 28, 2026'));

  it('builds the token result URL', () =>
    expect(resultUrlFor('l1', lead, 'https://x.test')).toBe('https://x.test/result?lead=l1&token=tok'));

  it('result-ready mentions restyles left, end date and the perk', () => {
    const html = renderResultReadyHtml(lead, 'https://x.test/r');
    expect(html).toContain('4 restyles');
    expect(html).toContain('Oct 28, 2026');
    expect(html).toContain('ROOM-7KX2');
    expect(html).toContain('10% off');
    expect(html).toContain('https://x.test/r');
  });

  it('result-ready pluralizes restyles left', () => {
    const one = renderResultReadyHtml({ ...lead, pass: { ...lead.pass!, restylesUsed: 4 } }, 'u');
    expect(one).toContain('<strong>1 restyle</strong>');
    expect(one).not.toContain('1 restyles');
    const none = renderResultReadyHtml({ ...lead, pass: { ...lead.pass!, restylesUsed: 5 } }, 'u');
    expect(none).toContain('<strong>no restyles</strong>');
  });

  it('booking email shows n/a for an unknown stored interest', () => {
    const html = renderBookingHtml('l1', { ...lead, booking: { name: 'J', interest: 'bogus' as never } }, 'https://x.test', labels);
    expect(html).toContain('<strong>Interested in:</strong> n/a');
  });

  it('result-ready for a legacy lead (no pass) omits pass copy', () => {
    const html = renderResultReadyHtml({ ...lead, pass: undefined, perk: undefined }, 'u');
    expect(html).not.toContain('restyles');
    expect(html).not.toContain('ROOM-');
  });

  it('pass-expiring lists looks by name and the chat + perk', () => {
    const html = renderPassExpiringHtml(lead, 'https://x.test/r', labels);
    expect(html).toContain('Scandinavian · Warm &amp; cozy');
    expect(html).toContain('Japandi · Warm &amp; cozy');
    expect(html).toContain('free 15-min chat');
    expect(html).toContain('ROOM-7KX2');
  });

  it('booking email includes perk, validity, interest and looks — escaped', () => {
    const html = renderBookingHtml('l1', lead, 'https://x.test', labels);
    expect(html).toContain('ROOM-7KX2');
    expect(html).toContain('valid until Oct 28, 2026');
    expect(html).toContain('Virtual Styling (from $250/room)');
    expect(html).toContain('Japandi · Warm &amp; cozy');
    expect(html).toContain('&lt;b&gt;Jane&lt;/b&gt;');
    expect(html).not.toContain('<b>Jane</b>');
    expect(html).toContain('https://x.test/admin/leads/l1');
  });
});
