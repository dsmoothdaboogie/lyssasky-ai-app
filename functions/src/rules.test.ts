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
