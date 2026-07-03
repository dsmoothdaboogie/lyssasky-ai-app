#!/usr/bin/env bash
# Seeds config/app + 8 styles, then the admin user, against an *already
# running* Firebase Emulator Suite (e.g. `npm run emulator` in another
# terminal). The seed scripts talk to the emulator via the Admin SDK, which
# needs the emulator host env vars explicitly set — `firebase emulators:start`
# does not export these to other terminals, so this script sets them to match
# firebase.json's configured ports.
set -euo pipefail

cd "$(dirname "$0")/.."

export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
export GCLOUD_PROJECT=demo-lyssasky

echo "==> Building functions"
npm --prefix functions run build

echo "==> Seeding config + styles"
npm --prefix functions run seed

echo "==> Seeding admin user"
npm --prefix functions run seed:admin
