import { onCall } from 'firebase-functions/v2/https';

export const helloWorld = onCall(() => ({ ok: true }));

export { createLead } from './leads';
