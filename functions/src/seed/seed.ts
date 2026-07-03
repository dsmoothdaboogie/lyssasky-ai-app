/**
 * Seeds `config/app` (DEFAULT_CONFIG) and the 8 curated `styles/*` docs.
 *
 * Safety: this only ever runs against the Firestore emulator. It refuses to
 * run unless FIRESTORE_EMULATOR_HOST is set, so there's no risk of
 * accidentally overwriting config/styles on a real Firebase project.
 *
 * Usage:
 *   npm run seed
 *   firebase emulators:exec --only firestore,auth,storage 'npm run seed'
 */
import { db } from '../admin';
import { DEFAULT_CONFIG } from '../../../src/config/defaultConfig';
import { STYLES } from './styles.data';

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST is not set — refusing to run against a real ' +
        'Firebase project. Run this via `firebase emulators:exec` (or with the ' +
        'Firestore emulator running and FIRESTORE_EMULATOR_HOST exported).',
    );
  }

  await db.collection('config').doc('app').set(DEFAULT_CONFIG);
  console.log('Wrote config/app.');

  for (const style of STYLES) {
    await db.collection('styles').doc(style.slug).set(style);
    console.log(`Wrote styles/${style.slug} (sortOrder=${style.sortOrder}, name="${style.name}").`);
  }

  console.log(`Seed complete: config/app + ${STYLES.length} styles.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('seed failed:', err);
    process.exit(1);
  });
