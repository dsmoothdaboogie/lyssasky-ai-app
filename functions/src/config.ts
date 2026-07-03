import { db } from './admin';
import { DEFAULT_CONFIG } from '../../src/config/defaultConfig';
import type { AppConfig } from '../../src/domain/types';

export async function loadConfig(): Promise<AppConfig> {
  const snap = await db.collection('config').doc('app').get();
  return snap.exists ? (snap.data() as AppConfig) : DEFAULT_CONFIG;
}
