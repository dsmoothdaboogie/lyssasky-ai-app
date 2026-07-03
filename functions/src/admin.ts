import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

initializeApp({ storageBucket: process.env.STORAGE_BUCKET ?? 'demo-lyssasky.appspot.com' });
export const db = getFirestore();
// Optional lead fields (leadId, meta, email, booking, ...) are often absent.
// Without this, writing an object that carries an explicit `undefined` value
// (e.g. logEvent's {type, leadId, meta} for a bare page_view) throws
// "Cannot use undefined as a Firestore value". Drop undefined fields instead.
db.settings({ ignoreUndefinedProperties: true });
export const storage = getStorage();
