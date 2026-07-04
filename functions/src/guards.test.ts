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
