import { describe, it, expect } from 'vitest';
import { assertAdmin, assertOwnerOrToken } from './guards';
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

describe('assertOwnerOrToken', () => {
  const lead = { ownerUid: 'owner', leadToken: 'tok-123' } as any;
  it('passes for the owner without a token', () => {
    expect(() => assertOwnerOrToken('owner', lead)).not.toThrow();
  });
  it('passes for another uid with the right token', () => {
    expect(() => assertOwnerOrToken('other', lead, 'tok-123')).not.toThrow();
  });
  it('passes for an unauthenticated caller with the right token', () => {
    expect(() => assertOwnerOrToken(undefined, lead, 'tok-123')).not.toThrow();
  });
  it('rejects a wrong token of equal length', () => {
    expect(() => assertOwnerOrToken('other', lead, 'tok-124')).toThrow(/not your lead/);
  });
  it('rejects a wrong-length token', () => {
    expect(() => assertOwnerOrToken('other', lead, 'tok')).toThrow(/not your lead/);
  });
  it('rejects no token, empty or non-string tokens', () => {
    expect(() => assertOwnerOrToken('other', lead)).toThrow(/not your lead/);
    expect(() => assertOwnerOrToken('other', lead, '')).toThrow(/not your lead/);
    expect(() => assertOwnerOrToken('other', lead, 123)).toThrow(/not your lead/);
  });
  it('rejects when the lead has no token, even for an empty token', () => {
    expect(() => assertOwnerOrToken('other', { ownerUid: 'owner' } as any, '')).toThrow(/not your lead/);
  });
});
