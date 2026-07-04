import { onCall } from 'firebase-functions/v2/https';

export const helloWorld = onCall(() => ({ ok: true }));

export { createLead, updateLeadAnswers, attachPhoto, submitFeedback, submitBooking, regenerate } from './leads';
export { logEvent } from './events';
export { startCheckout, confirmPaymentMock } from './checkout';
export { onLeadPaid } from './generation/runGeneration';
export { adminSaveStyle, adminDeleteStyle } from './admin/styles';
