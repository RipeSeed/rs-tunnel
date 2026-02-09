import { createHash, randomBytes } from 'node:crypto';

import jwt from 'jsonwebtoken';

import type { Env } from '../config/env.js';
import { AppError } from '../lib/app-error.js';
import type { AccessTokenPayload, TokenService as TokenServiceContract } from '../types.js';

export class TokenService implements TokenServiceContract {
  constructor(private readonly env: Env) {}

  signAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, this.env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: `${this.env.JWT_ACCESS_TTL_MINUTES}m`,
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const decoded = jwt.verify(token, this.env.JWT_SECRET, {
        algorithms: ['HS256'],
      });

      if (typeof decoded !== 'object' || !decoded.sub || !decoded.email) {
        throw new AppError(401, 'INVALID_TOKEN', 'Invalid access token payload.');
      }

      return decoded as AccessTokenPayload;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(401, 'INVALID_TOKEN', 'Invalid access token.');
    }
  }

  generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
