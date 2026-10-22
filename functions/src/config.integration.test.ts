import { describe, it, expect, afterAll } from 'vitest';
import { db } from './admin';
import { DEFAULT_CONFIG } from '../../src/config/defaultConfig';
import { loadConfig } from './config';

describe('loadConfig', () => {
  afterAll(async () => {
    // Functions tests share one emulator (fileParallelism:false) and other
    // files read config/app — restore it to defaults so we don't leak the
    // stale doc written below into their runs.
    await db.collection('config').doc('app').set(DEFAULT_CONFIG);
  });

  it('field-merges a stored config/app doc over DEFAULT_CONFIG so newer fields are never missing', async () => {
    // Simulate a config/app doc written before `notifyEmail` existed (a real
    // pre-Phase-2 doc), but with its own priceCents that must still win.
    const stale: Record<string, unknown> = { ...DEFAULT_CONFIG, priceCents: 900 };
    delete stale.notifyEmail;
    await db.collection('config').doc('app').set(stale);

    const config = await loadConfig();

    // Missing field is filled from defaults (so booking mail always has a recipient)...
    expect(config.notifyEmail).toBe(DEFAULT_CONFIG.notifyEmail);
    // ...while values present in the stored doc still override the defaults.
    expect(config.priceCents).toBe(900);
  });
});
