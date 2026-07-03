/**
 * Seeds a local admin user with the `admin: true` custom claim.
 *
 * Idempotent: if `admin@lyssasky.test` already exists it's reused (only
 * the claim is (re-)applied), so this is safe to re-run.
 *
 * Safety: this only ever runs against the Auth emulator. It refuses to
 * run unless FIREBASE_AUTH_EMULATOR_HOST is set, so there's no risk of
 * accidentally creating a real user / granting admin on a live project.
 *
 * Usage:
 *   npm run seed:admin
 *   firebase emulators:exec --only auth,firestore,storage 'npm run seed:admin'
 */
import { getAuth } from 'firebase-admin/auth';
import '../admin';

const ADMIN_EMAIL = 'admin@lyssasky.test';
const ADMIN_PASSWORD = 'password';

async function main() {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error(
      'FIREBASE_AUTH_EMULATOR_HOST is not set — refusing to run against a real ' +
        'Firebase project. Run this via `firebase emulators:exec` (or with the ' +
        'Auth emulator running and FIREBASE_AUTH_EMULATOR_HOST exported).',
    );
  }

  const auth = getAuth();

  let uid: string;
  try {
    const existing = await auth.getUserByEmail(ADMIN_EMAIL);
    uid = existing.uid;
    console.log(`Admin user already exists (${ADMIN_EMAIL}, uid=${uid}).`);
  } catch (err) {
    if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
    const created = await auth.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      emailVerified: true,
    });
    uid = created.uid;
    console.log(`Created admin user (${ADMIN_EMAIL}, uid=${uid}).`);
  }

  await auth.setCustomUserClaims(uid, { admin: true });
  console.log(`Set { admin: true } claim on uid=${uid}. Seed complete.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('seedAdmin failed:', err);
    process.exit(1);
  });
