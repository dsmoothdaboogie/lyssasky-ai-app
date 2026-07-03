import { describe, it, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-lyssasky',
    storage: { rules: readFileSync('../storage.rules', 'utf8') },
  });
});
afterAll(() => env.cleanup());

describe('storage rules', () => {
  it('lets a user upload a small image to their own path', async () => {
    const s = env.authenticatedContext('u1').storage();
    await assertSucceeds(
      uploadBytes(ref(s, 'leads/u1/photo.jpg'), new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg' })
    );
  });

  it("forbids a user uploading to another uid's path", async () => {
    const s = env.authenticatedContext('u1').storage();
    await assertFails(
      uploadBytes(ref(s, 'leads/u2/photo.jpg'), new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg' })
    );
  });

  it('forbids an oversized upload to own path', async () => {
    const s = env.authenticatedContext('u1').storage();
    await assertFails(
      uploadBytes(ref(s, 'leads/u1/big.jpg'), new Uint8Array(11 * 1024 * 1024), { contentType: 'image/jpeg' })
    );
  });

  it('forbids a non-image content-type upload to own path', async () => {
    const s = env.authenticatedContext('u1').storage();
    await assertFails(
      uploadBytes(ref(s, 'leads/u1/doc.pdf'), new Uint8Array([1, 2, 3]), { contentType: 'application/pdf' })
    );
  });

  it("forbids reading another uid's object but allows reading own", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), 'leads/u1/photo.jpg'), new Uint8Array([1, 2, 3]), {
        contentType: 'image/jpeg',
      });
    });
    const u1 = env.authenticatedContext('u1').storage();
    const u2 = env.authenticatedContext('u2').storage();
    await assertFails(getBytes(ref(u2, 'leads/u1/photo.jpg')));
    await assertSucceeds(getBytes(ref(u1, 'leads/u1/photo.jpg')));
  });

  it("lets an admin read another uid's object", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), 'leads/u1/photo.jpg'), new Uint8Array([1, 2, 3]), {
        contentType: 'image/jpeg',
      });
    });
    const admin = env.authenticatedContext('admin1', { admin: true }).storage();
    await assertSucceeds(getBytes(ref(admin, 'leads/u1/photo.jpg')));
  });
});
