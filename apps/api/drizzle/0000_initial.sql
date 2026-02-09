CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL UNIQUE,
  slack_user_id varchar(255) NOT NULL,
  slack_team_id varchar(255) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL,
  state varchar(255) NOT NULL UNIQUE,
  code_challenge varchar(255) NOT NULL,
  cli_callback_url text NOT NULL,
  login_code varchar(255),
  user_id uuid REFERENCES users(id),
  status varchar(32) NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  authorized_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS oauth_sessions_login_code_idx ON oauth_sessions(login_code);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(255) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tunnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug varchar(32) NOT NULL,
  hostname varchar(255) NOT NULL,
  requested_port integer NOT NULL,
  cf_tunnel_id varchar(255),
  cf_dns_record_id varchar(255),
  status varchar(32) NOT NULL DEFAULT 'creating',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz,
  UNIQUE(hostname)
);

CREATE INDEX IF NOT EXISTS tunnels_user_status_idx ON tunnels(user_id, status);
CREATE INDEX IF NOT EXISTS tunnels_slug_status_idx ON tunnels(slug, status);

CREATE TABLE IF NOT EXISTS tunnel_leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tunnel_id uuid NOT NULL UNIQUE REFERENCES tunnels(id) ON DELETE CASCADE,
  last_heartbeat_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS tunnel_leases_expires_at_idx ON tunnel_leases(expires_at);

CREATE TABLE IF NOT EXISTS cleanup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tunnel_id uuid NOT NULL REFERENCES tunnels(id) ON DELETE CASCADE,
  reason varchar(64) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'queued',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cleanup_jobs_status_next_attempt_idx ON cleanup_jobs(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action varchar(64) NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
