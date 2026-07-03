export interface PhotoValidationOptions {
  maxBytes: number; minWidth: number; minHeight: number; allowedTypes: string[];
}
export interface PhotoValidationResult { ok: boolean; error?: string; needsConversion?: boolean; }

export const DEFAULT_PHOTO_OPTIONS: PhotoValidationOptions = {
  maxBytes: 10 * 1024 * 1024,
  minWidth: 512,
  minHeight: 512,
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
};

const HEIC = ['image/heic', 'image/heif'];

export function validatePhotoMeta(
  file: { type: string; size: number; name: string },
  opts: PhotoValidationOptions = DEFAULT_PHOTO_OPTIONS,
): PhotoValidationResult {
  const type = file.type || guessTypeFromName(file.name);
  if (!opts.allowedTypes.includes(type)) {
    return { ok: false, error: 'Please upload a photo (JPEG, PNG, WebP, or HEIC).' };
  }
  if (file.size >= opts.maxBytes) {
    return { ok: false, error: 'That photo is too large — please keep it under 10MB.' };
  }
  return { ok: true, needsConversion: HEIC.includes(type) || undefined };
}

export function validateDimensions(
  width: number, height: number,
  opts: PhotoValidationOptions = DEFAULT_PHOTO_OPTIONS,
): PhotoValidationResult {
  if (width < opts.minWidth || height < opts.minHeight) {
    return { ok: false, error: 'This photo is a little small — a larger, clearer shot works best.' };
  }
  return { ok: true };
}

function guessTypeFromName(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  };
  return map[ext] ?? '';
}
