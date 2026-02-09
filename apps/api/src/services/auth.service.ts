import { randomBytes } from 'node:crypto';

import { type UserProfile } from '@ripeseed/shared';

import type { Env } from '../config/env.js';
import { AppError } from '../lib/app-error.js';
import { logger } from '../lib/logger.js';
import { Repository } from '../db/repository.js';
import { assertRipeseedEmail, normalizeEmail } from '../utils/email.js';
import { createCodeChallenge } from '../utils/pkce.js';
import { addDays } from '../utils/time.js';
import type { AuthService as AuthServiceContract, TokenPair } from '../types.js';
import { TokenService } from './token.service.js';

type SlackTokenResponse = {
  ok: boolean;
  access_token?: string;
  error?: string;
};

type SlackUserInfoResponse = {
  ok?: boolean;
  email?: string;
  'https://slack.com/user_id'?: string;
  'https://slack.com/team_id'?: string;
};

const OAUTH_SESSION_TTL_MS = 10 * 60 * 1000;

export class AuthService implements AuthServiceContract {
  constructor(
    private readonly env: Env,
    private readonly repository: Repository,
    private readonly tokenService: TokenService,
  ) {}

  async startSlackAuth(input: {
    email: string;
    codeChallenge: string;
    cliCallbackUrl: string;
  }): Promise<{ authorizeUrl: string; state: string }> {
    const email = assertRipeseedEmail(input.email);

    const state = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + OAUTH_SESSION_TTL_MS);

    await this.repository.createOauthSession({
      email,
      state,
      codeChallenge: input.codeChallenge,
      cliCallbackUrl: input.cliCallbackUrl,
      expiresAt,
    });

    const query = new URLSearchParams({
      response_type: 'code',
      client_id: this.env.SLACK_CLIENT_ID,
      scope: 'openid profile email',
      state,
      redirect_uri: this.env.SLACK_REDIRECT_URI,
    });

    return {
      authorizeUrl: `https://slack.com/openid/connect/authorize?${query.toString()}`,
      state,
    };
  }

  async handleSlackCallback(input: { state: string; code: string }): Promise<{ redirectUrl: string }> {
    const session = await this.repository.getOauthSessionByState(input.state);
    if (!session) {
      throw new AppError(400, 'INVALID_STATE', 'OAuth state is invalid.');
    }

    if (session.status !== 'pending') {
      throw new AppError(400, 'OAUTH_ALREADY_USED', 'OAuth session has already been used.');
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw new AppError(400, 'OAUTH_EXPIRED', 'OAuth session expired.');
    }

    const slackToken = await this.exchangeSlackCode(input.code);
    const slackProfile = await this.fetchSlackProfile(slackToken.access_token ?? '');

    const email = assertRipeseedEmail(slackProfile.email ?? '');
    if (normalizeEmail(session.email) !== email) {
      throw new AppError(403, 'EMAIL_MISMATCH', 'Authenticated Slack user email does not match requested email.');
    }

    const slackTeamId = slackProfile['https://slack.com/team_id'];
    const slackUserId = slackProfile['https://slack.com/user_id'];

    if (!slackTeamId || !slackUserId) {
      throw new AppError(403, 'SLACK_PROFILE_INCOMPLETE', 'Unable to read Slack team/user claims.');
    }

    if (slackTeamId !== this.env.RIPSEED_SLACK_TEAM_ID) {
      throw new AppError(403, 'WORKSPACE_NOT_ALLOWED', 'Slack workspace is not allowed.');
    }

    const user = await this.repository.upsertUserBySlack({
      email,
      slackUserId,
      slackTeamId,
    });

    const loginCode = randomBytes(32).toString('base64url');
    await this.repository.authorizeOauthSession({
      sessionId: session.id,
      userId: user.id,
      loginCode,
      authorizedAt: new Date(),
    });

    await this.repository.createAuditLog({
      userId: user.id,
      action: 'auth.oauth.authorized',
      metadata: { email },
    });

    const redirect = new URL(session.cliCallbackUrl);
    redirect.searchParams.set('code', loginCode);
    redirect.searchParams.set('state', input.state);

    return {
      redirectUrl: redirect.toString(),
    };
  }

  async exchangeLoginCode(input: { loginCode: string; codeVerifier: string }): Promise<TokenPair> {
    const session = await this.repository.getOauthSessionByLoginCode(input.loginCode);

    if (!session) {
      throw new AppError(400, 'INVALID_LOGIN_CODE', 'Login code is invalid.');
    }

    if (session.status !== 'authorized') {
      throw new AppError(400, 'LOGIN_CODE_USED', 'Login code is no longer valid.');
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw new AppError(400, 'LOGIN_CODE_EXPIRED', 'Login code expired.');
    }

    const challenge = createCodeChallenge(input.codeVerifier);
    if (challenge !== session.codeChallenge) {
      throw new AppError(400, 'INVALID_CODE_VERIFIER', 'PKCE code verifier mismatch.');
    }

    if (!session.userId) {
      throw new AppError(400, 'INVALID_LOGIN_CODE', 'Login code is missing user context.');
    }

    const user = await this.repository.getUserById(session.userId);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User record not found for login code.');
    }

    await this.repository.consumeOauthSession(session.id, new Date());

    return this.issueTokenPair({
      id: user.id,
      email: user.email,
      slackUserId: user.slackUserId,
      slackTeamId: user.slackTeamId,
    });
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    const tokenHash = this.tokenService.hashToken(refreshToken);
    const record = await this.repository.getActiveRefreshTokenWithUser(tokenHash);

    if (!record) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired.');
    }

    await this.repository.revokeRefreshToken(tokenHash);

    return this.issueTokenPair({
      id: record.user.id,
      email: record.user.email,
      slackUserId: record.user.slackUserId,
      slackTeamId: record.user.slackTeamId,
    });
  }

  async logout(input: { userId?: string; refreshToken?: string }): Promise<void> {
    if (input.refreshToken) {
      const tokenHash = this.tokenService.hashToken(input.refreshToken);
      await this.repository.revokeRefreshToken(tokenHash);
      return;
    }

    if (input.userId) {
      await this.repository.revokeAllUserRefreshTokens(input.userId);
    }
  }

  private async exchangeSlackCode(code: string): Promise<SlackTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: this.env.SLACK_CLIENT_ID,
      client_secret: this.env.SLACK_CLIENT_SECRET,
      redirect_uri: this.env.SLACK_REDIRECT_URI,
    });

    const response = await fetch('https://slack.com/api/openid.connect.token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const payload = (await response.json()) as SlackTokenResponse;
    if (!response.ok || !payload.ok || !payload.access_token) {
      logger.error('Slack token exchange failed', payload);
      throw new AppError(502, 'SLACK_OAUTH_FAILED', 'Unable to exchange Slack OAuth code.');
    }

    return payload;
  }

  private async fetchSlackProfile(accessToken: string): Promise<SlackUserInfoResponse> {
    const response = await fetch('https://slack.com/api/openid.connect.userInfo', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const payload = (await response.json()) as SlackUserInfoResponse;

    if (!response.ok) {
      logger.error('Slack profile fetch failed', payload);
      throw new AppError(502, 'SLACK_PROFILE_FAILED', 'Unable to retrieve Slack profile data.');
    }

    return payload;
  }

  private async issueTokenPair(user: {
    id: string;
    email: string;
    slackUserId: string;
    slackTeamId: string;
  }): Promise<TokenPair> {
    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      slackUserId: user.slackUserId,
      slackTeamId: user.slackTeamId,
    });

    const refreshToken = this.tokenService.generateRefreshToken();
    const tokenHash = this.tokenService.hashToken(refreshToken);
    const expiresAt = addDays(new Date(), this.env.REFRESH_TTL_DAYS);

    await this.repository.storeRefreshToken({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const profile: UserProfile = {
      email: user.email,
      slackUserId: user.slackUserId,
      slackTeamId: user.slackTeamId,
    };

    return {
      accessToken,
      refreshToken,
      expiresInSec: this.env.JWT_ACCESS_TTL_MINUTES * 60,
      profile,
    };
  }
}
