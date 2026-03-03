import { AppError } from '../lib/app-error.js';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function assertAllowedEmail(email: string, allowedEmailDomain: string): string {
  const normalized = normalizeEmail(email);
  if (!normalized.endsWith(allowedEmailDomain)) {
    throw new AppError(403, 'EMAIL_NOT_ALLOWED', `Only emails ending in ${allowedEmailDomain} can access this service.`);
  }

  return normalized;
}
