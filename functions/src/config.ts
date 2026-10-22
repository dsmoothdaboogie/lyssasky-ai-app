import { db } from './admin';
import { DEFAULT_CONFIG } from '../../src/config/defaultConfig';
import type { AppConfig } from '../../src/domain/types';

export async function loadConfig(): Promise<AppConfig> {
  const snap = await db.collection('config').doc('app').get();
  if (!snap.exists) return DEFAULT_CONFIG;
  // Field-merge the stored doc over the defaults so a doc written before a
  // newer field existed (e.g. a pre-Phase-2 config/app missing notifyEmail)
  // never hands an undefined field to downstream readers — most importantly
  // the booking-notification mail, which would otherwise have no recipient.
  return { ...DEFAULT_CONFIG, ...(snap.data() as Partial<AppConfig>) };
}
