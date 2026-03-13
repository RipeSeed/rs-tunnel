ALTER TABLE users
  ADD COLUMN IF NOT EXISTS admin_role varchar(32) NOT NULL DEFAULT 'member';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role_granted_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS users_single_owner_idx
  ON users(admin_role)
  WHERE admin_role = 'owner';

ALTER TABLE oauth_sessions
  ADD COLUMN IF NOT EXISTS flow varchar(16) NOT NULL DEFAULT 'cli';
