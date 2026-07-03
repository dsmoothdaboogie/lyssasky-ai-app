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
