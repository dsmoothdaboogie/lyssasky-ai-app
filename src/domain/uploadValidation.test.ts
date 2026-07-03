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
  it('rejects a file exactly at the size cap (storage rule requires size < cap)', () => {
    const r = validatePhotoMeta(f({ size: DEFAULT_PHOTO_OPTIONS.maxBytes }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/too large|10 ?mb/i);
  });
  it('accepts a file one byte under the size cap', () => {
    const r = validatePhotoMeta(f({ size: DEFAULT_PHOTO_OPTIONS.maxBytes - 1 }));
    expect(r.ok).toBe(true);
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
