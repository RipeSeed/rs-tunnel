import type { UserProfile } from '@ripeseed/shared';

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  expiresAtEpochSec: number;
  profile: UserProfile;
};

export type CliConfig = {
  apiBaseUrl: string;
};
