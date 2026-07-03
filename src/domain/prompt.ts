import type { StyleRecipe, QuestionnaireAnswers } from './types';

const COLOR_MOOD_TEXT: Record<string, string> = {
  warm_cozy: 'warm, cozy tones and soft lighting',
  light_airy: 'light, airy tones with plenty of brightness',
  bold_dramatic: 'bold, dramatic contrast and rich saturation',
  neutral_calm: 'neutral, calm tones with a restful feel',
};

export function buildGenerationPrompt(
  style: { name: string; recipe: StyleRecipe },
  answers: QuestionnaireAnswers,
): string {
  const { recipe } = style;
  const mood = COLOR_MOOD_TEXT[answers.colorMood] ?? 'balanced, harmonious tones';
  const keep = answers.keep?.trim();
  const lines = [
    `Restyle this real photograph of a room in a ${style.name} interior design style.`,
    `This is a preview edit of the customer's own room: preserve the room's architecture, windows, walls, and layout exactly. Do not invent a different room.`,
    `Feature these materials and textures: ${recipe.materials}.`,
    `Use this palette: ${recipe.palette}.`,
    `Furniture should be: ${recipe.furniture}.`,
    `Overall color mood: ${mood}.`,
    `Avoid: ${recipe.avoid}.`,
  ];
  if (keep) {
    lines.push(`Keep the following elements from the original room unchanged: ${keep}.`);
  }
  lines.push('Produce a photorealistic result at the same camera angle and framing as the input.');
  return lines.join('\n');
}
