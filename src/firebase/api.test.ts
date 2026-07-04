import { describe, expect, test } from 'vitest';
import * as api from './api';

describe('firebase api wrappers', () => {
  test('exposes all callable wrappers as functions', () => {
    expect(typeof api.apiCreateLead).toBe('function');
    expect(typeof api.apiUpdateLeadAnswers).toBe('function');
    expect(typeof api.apiStartCheckout).toBe('function');
    expect(typeof api.apiConfirmPaymentMock).toBe('function');
    expect(typeof api.apiSubmitFeedback).toBe('function');
    expect(typeof api.apiSubmitBooking).toBe('function');
    expect(typeof api.apiRegenerate).toBe('function');
    expect(typeof api.apiLogEvent).toBe('function');
    expect(typeof api.watchLead).toBe('function');
    expect(typeof api.uploadOriginalPhoto).toBe('function');
    expect(typeof api.apiAdminSaveStyle).toBe('function');
    expect(typeof api.apiAdminDeleteStyle).toBe('function');
    expect(typeof api.fetchStyle).toBe('function');
    expect(typeof api.fetchAllStyles).toBe('function');
    expect(typeof api.uploadAdminImage).toBe('function');
  });
});
