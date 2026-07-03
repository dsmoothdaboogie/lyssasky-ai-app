import { describe, it, expect } from 'vitest';
import { buildGenerationPrompt } from './prompt';
import type { StyleRecipe, QuestionnaireAnswers } from './types';

const recipe: StyleRecipe = {
  description: 'Calm Scandinavian warmth',
  materials: 'oak, linen, matte black metal',
  palette: 'warm neutrals with terracotta accents',
  furniture: 'low-profile sofas, tapered wooden legs',
  avoid: 'no ornate carving, no cool blue tones',
};
const answers: QuestionnaireAnswers = {
  roomType: 'living_room', styleSlug: 'scandi', colorMood: 'warm_cozy',
  keep: 'my grey sofa', budget: '1k_5k', timeline: 'within_3_months',
};

describe('buildGenerationPrompt', () => {
  it('names the style and enforces architecture preservation', () => {
    const p = buildGenerationPrompt({ name: 'Scandinavian', recipe }, answers);
    expect(p).toMatch(/Scandinavian/);
    expect(p).toMatch(/preserve the room'?s architecture, windows, walls, and layout/i);
  });
  it('includes recipe materials, palette, furniture and avoid clauses', () => {
    const p = buildGenerationPrompt({ name: 'Scandinavian', recipe }, answers);
    expect(p).toContain('oak, linen, matte black metal');
    expect(p).toContain('warm neutrals with terracotta accents');
    expect(p).toContain('no ornate carving');
  });
  it('carries the keep-list when provided', () => {
    const p = buildGenerationPrompt({ name: 'Scandinavian', recipe }, answers);
    expect(p).toMatch(/keep.*my grey sofa/i);
  });
  it('omits the keep clause when keep is empty', () => {
    const p = buildGenerationPrompt({ name: 'Scandinavian', recipe }, { ...answers, keep: '' });
    expect(p).not.toMatch(/keep the following/i);
  });
  it('maps the color mood to descriptive guidance', () => {
    const p = buildGenerationPrompt({ name: 'Scandinavian', recipe }, { ...answers, colorMood: 'bold_dramatic' });
    expect(p).toMatch(/bold, dramatic/i);
  });
});
