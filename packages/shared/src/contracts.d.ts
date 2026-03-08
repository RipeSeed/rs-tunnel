import { z } from 'zod';
export declare const DEFAULT_ALLOWED_EMAIL_DOMAIN = "@example.com";
/**
 * @deprecated Use ALLOWED_EMAIL_DOMAIN runtime config in API only.
 */
export declare const EMAIL_DOMAIN = "@example.com";
export declare const tunnelSlugRegex: RegExp;
export declare const tunnelCreateRequestSchema: z.ZodObject<{
    port: z.ZodNumber;
    requestedSlug: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    port: number;
    requestedSlug?: string | undefined;
}, {
    port: number;
    requestedSlug?: string | undefined;
}>;
export type TunnelCreateRequest = z.infer<typeof tunnelCreateRequestSchema>;
export declare const tunnelCreateResponseSchema: z.ZodObject<{
    tunnelId: z.ZodString;
    hostname: z.ZodString;
    cloudflaredToken: z.ZodString;
    tunnelRunToken: z.ZodString;
    heartbeatIntervalSec: z.ZodNumber;
    leaseTimeoutSec: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    tunnelId: string;
    hostname: string;
    cloudflaredToken: string;
    tunnelRunToken: string;
    heartbeatIntervalSec: number;
    leaseTimeoutSec: number;
}, {
    tunnelId: string;
    hostname: string;
    cloudflaredToken: string;
    tunnelRunToken: string;
    heartbeatIntervalSec: number;
    leaseTimeoutSec: number;
}>;
export type TunnelCreateResponse = z.infer<typeof tunnelCreateResponseSchema>;
export declare const apiErrorSchema: z.ZodObject<{
    code: z.ZodString;
    message: z.ZodString;
    details: z.ZodOptional<z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    code: string;
    message: string;
    details?: unknown;
}, {
    code: string;
    message: string;
    details?: unknown;
}>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export declare const userProfileSchema: z.ZodObject<{
    email: z.ZodString;
    slackUserId: z.ZodString;
    slackTeamId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    slackUserId: string;
    slackTeamId: string;
}, {
    email: string;
    slackUserId: string;
    slackTeamId: string;
}>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export declare const authStartRequestSchema: z.ZodObject<{
    email: z.ZodString;
    codeChallenge: z.ZodString;
    cliCallbackUrl: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    codeChallenge: string;
    cliCallbackUrl: string;
}, {
    email: string;
    codeChallenge: string;
    cliCallbackUrl: string;
}>;
export declare const authStartResponseSchema: z.ZodObject<{
    authorizeUrl: z.ZodString;
    state: z.ZodString;
}, "strip", z.ZodTypeAny, {
    authorizeUrl: string;
    state: string;
}, {
    authorizeUrl: string;
    state: string;
}>;
export declare const authExchangeRequestSchema: z.ZodObject<{
    loginCode: z.ZodString;
    codeVerifier: z.ZodString;
}, "strip", z.ZodTypeAny, {
    loginCode: string;
    codeVerifier: string;
}, {
    loginCode: string;
    codeVerifier: string;
}>;
export declare const tokenPairSchema: z.ZodObject<{
    accessToken: z.ZodString;
    refreshToken: z.ZodString;
    expiresInSec: z.ZodNumber;
    profile: z.ZodObject<{
        email: z.ZodString;
        slackUserId: z.ZodString;
        slackTeamId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        email: string;
        slackUserId: string;
        slackTeamId: string;
    }, {
        email: string;
        slackUserId: string;
        slackTeamId: string;
    }>;
}, "strip", z.ZodTypeAny, {
    accessToken: string;
    refreshToken: string;
    expiresInSec: number;
    profile: {
        email: string;
        slackUserId: string;
        slackTeamId: string;
    };
}, {
    accessToken: string;
    refreshToken: string;
    expiresInSec: number;
    profile: {
        email: string;
        slackUserId: string;
        slackTeamId: string;
    };
}>;
export declare const refreshRequestSchema: z.ZodObject<{
    refreshToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    refreshToken: string;
}, {
    refreshToken: string;
}>;
export declare const heartbeatResponseSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    expiresAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    ok: true;
    expiresAt: string;
}, {
    ok: true;
    expiresAt: string;
}>;
