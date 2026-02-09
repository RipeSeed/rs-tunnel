import { tunnelSlugRegex } from '@ripeseed/shared';

import { AppError } from '../lib/app-error.js';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function validateRequestedSlug(slug: string): string {
  const trimmed = slug.trim();

  if (trimmed !== trimmed.toLowerCase()) {
    throw new AppError(400, 'INVALID_SLUG', 'Uppercase characters are not allowed in slug.');
  }

  const normalized = trimmed;

  if (normalized.includes('.')) {
    throw new AppError(400, 'INVALID_SLUG', 'Nested domains are not supported.');
  }

  if (!tunnelSlugRegex.test(normalized)) {
    throw new AppError(
      400,
      'INVALID_SLUG',
      'Slug must match ^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$.',
    );
  }

  return normalized;
}

export function generateRandomSlug(length = 8): string {
  let slug = '';
  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * ALPHABET.length);
    slug += ALPHABET[randomIndex];
  }
  return slug;
}
