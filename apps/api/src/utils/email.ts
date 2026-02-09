import { EMAIL_DOMAIN } from '@ripeseed/shared';

import { AppError } from '../lib/app-error.js';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function assertRipeseedEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!normalized.endsWith(EMAIL_DOMAIN)) {
    throw new AppError(403, 'EMAIL_NOT_ALLOWED', 'Only @ripeseed.io emails can access this service.');
  }

  return normalized;
}
