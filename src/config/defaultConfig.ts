import type { AppConfig } from '../domain/types';

export const DEFAULT_CONFIG: AppConfig = {
  priceCents: 500,
  currency: 'CAD',
  calendlyUrl: 'https://calendly.com/lyssasky/consult',
  paymentMode: 'mock',
  generationMode: 'mock',
  notifyEmail: 'marjorie@lyssasky.com',
  featureFlags: {},
  questionnaire: [
    {
      id: 'roomType', prompt: 'Which room are we restyling?', type: 'single', required: true,
      options: [
        { value: 'living_room', label: 'Living room' },
        { value: 'bedroom', label: 'Bedroom' },
        { value: 'kitchen', label: 'Kitchen' },
        { value: 'dining', label: 'Dining room' },
        { value: 'office', label: 'Office' },
        { value: 'other', label: 'Something else' },
      ],
    },
    {
      id: 'styleSlug', prompt: 'Pick a style that speaks to you', type: 'gallery', required: true,
      // options are populated at runtime from the styles collection; empty here.
      options: [],
    },
    {
      id: 'colorMood', prompt: "What's the mood?", type: 'single', required: true,
      options: [
        { value: 'warm_cozy', label: 'Warm & cozy' },
        { value: 'light_airy', label: 'Light & airy' },
        { value: 'bold_dramatic', label: 'Bold & dramatic' },
        { value: 'neutral_calm', label: 'Neutral & calm' },
      ],
    },
    {
      id: 'keep', prompt: 'Anything you want to keep? (optional)', type: 'text', required: false,
    },
    {
      id: 'budget', prompt: "What's your rough budget for this room?", type: 'single', required: true,
      options: [
        { value: 'under_1k', label: 'Under $1,000' },
        { value: '1k_5k', label: '$1,000 – $5,000' },
        { value: '5k_15k', label: '$5,000 – $15,000' },
        { value: 'over_15k', label: '$15,000+' },
      ],
    },
    {
      id: 'timeline', prompt: 'When are you hoping to start?', type: 'single', required: true,
      options: [
        { value: 'just_dreaming', label: 'Just dreaming' },
        { value: 'within_3_months', label: 'Within 3 months' },
        { value: 'asap', label: 'As soon as possible' },
      ],
    },
  ],
};
