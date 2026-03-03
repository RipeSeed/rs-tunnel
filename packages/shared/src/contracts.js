import { z } from 'zod';
export const DEFAULT_ALLOWED_EMAIL_DOMAIN = '@example.com';
/**
 * @deprecated Use ALLOWED_EMAIL_DOMAIN runtime config in API only.
 */
export const EMAIL_DOMAIN = DEFAULT_ALLOWED_EMAIL_DOMAIN;
export const tunnelSlugRegex = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/;
export const tunnelCreateRequestSchema = z.object({
    port: z.number().int().min(1).max(65535),
    requestedSlug: z.string().optional(),
});
export const tunnelCreateResponseSchema = z.object({
    tunnelId: z.string().uuid(),
    hostname: z.string(),
    cloudflaredToken: z.string(),
    heartbeatIntervalSec: z.literal(20),
});
export const apiErrorSchema = z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
});
export const userProfileSchema = z.object({
    email: z.string().email(),
    slackUserId: z.string(),
    slackTeamId: z.string(),
});
export const authStartRequestSchema = z.object({
    email: z.string().email(),
    codeChallenge: z.string().min(10),
    cliCallbackUrl: z.string().url(),
});
export const authStartResponseSchema = z.object({
    authorizeUrl: z.string().url(),
    state: z.string(),
});
export const authExchangeRequestSchema = z.object({
    loginCode: z.string().min(10),
    codeVerifier: z.string().min(43).max(128),
});
export const tokenPairSchema = z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresInSec: z.number().int().positive(),
    profile: userProfileSchema,
});
export const refreshRequestSchema = z.object({
    refreshToken: z.string().min(10),
});
export const heartbeatResponseSchema = z.object({
    ok: z.literal(true),
    expiresAt: z.string(),
});
//# sourceMappingURL=contracts.js.map
