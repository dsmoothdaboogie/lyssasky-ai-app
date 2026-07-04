import { describe, it, beforeAll, afterAll } from 'vitest';
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

  it("lets an admin read another user's lead", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('leads').doc('l2').set({ ownerUid: 'u1', status: 'captured' });
    });
    const admin = env.authenticatedContext('admin1', { admin: true }).firestore();
    await assertSucceeds(admin.collection('leads').doc('l2').get());
  });

  it('lets an admin read a generations doc and an events doc', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.collection('generations').doc('g1').set({ leadId: 'l1' });
      await db.collection('events').doc('e1').set({ type: 'lead_captured' });
    });
    const admin = env.authenticatedContext('admin1', { admin: true }).firestore();
    await assertSucceeds(admin.collection('generations').doc('g1').get());
    await assertSucceeds(admin.collection('events').doc('e1').get());
  });

  it('forbids a non-admin authenticated user from reading a generations doc', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('generations').doc('g2').set({ leadId: 'l1' });
    });
    const u1 = env.authenticatedContext('u1').firestore();
    await assertFails(u1.collection('generations').doc('g2').get());
  });

  it('lets an admin read a mail doc', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('mail').doc('m1').set({ to: 'a@b.com' });
    });
    const admin = env.authenticatedContext('admin1', { admin: true }).firestore();
    await assertSucceeds(admin.collection('mail').doc('m1').get());
  });

  it('forbids a non-admin from reading a mail doc', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('mail').doc('m2').set({ to: 'a@b.com' });
    });
    const u1 = env.authenticatedContext('u1').firestore();
    await assertFails(u1.collection('mail').doc('m2').get());
  });
});
