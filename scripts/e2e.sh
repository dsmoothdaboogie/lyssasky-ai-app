#!/usr/bin/env bash
# Runs the full Playwright E2E suite (funnel + admin) against the Firebase
# Emulator Suite: builds the functions bundle, boots auth/firestore/storage/
# functions emulators (via `emulators:exec`, which injects the emulator env
# vars and tears everything down afterward), seeds config/styles + the admin
# user, then runs Playwright. Playwright's own `webServer` boots the Vite
# dev server, which picks up VITE_USE_EMULATORS=true from .env.local.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Building functions"
npm --prefix functions run build

echo "==> Starting emulators and running E2E suite"
firebase emulators:exec --project demo-lyssasky --only auth,firestore,storage,functions \
  'npm --prefix functions run seed && npm --prefix functions run seed:admin && npx playwright test'
