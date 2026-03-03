CREATE TABLE IF NOT EXISTS tunnel_live_metrics (
  tunnel_id uuid PRIMARY KEY REFERENCES tunnels(id) ON DELETE CASCADE,
  received_at timestamptz NOT NULL DEFAULT now(),
  region varchar(16),
  ttl integer NOT NULL,
  opn integer NOT NULL,
  rt1_ms integer,
  rt5_ms integer,
  p50_ms integer,
  p90_ms integer,
  requests integer NOT NULL,
  errors integer NOT NULL,
  bytes bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS tunnel_live_metrics_received_at_idx ON tunnel_live_metrics(received_at);

CREATE TABLE IF NOT EXISTS tunnel_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tunnel_id uuid NOT NULL REFERENCES tunnels(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  ttl integer NOT NULL,
  opn integer NOT NULL,
  rt1_ms integer,
  rt5_ms integer,
  p50_ms integer,
  p90_ms integer,
  requests integer NOT NULL,
  errors integer NOT NULL,
  bytes bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS tunnel_metrics_tunnel_captured_at_idx ON tunnel_metrics(tunnel_id, captured_at);

CREATE TABLE IF NOT EXISTS tunnel_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tunnel_id uuid NOT NULL REFERENCES tunnels(id) ON DELETE CASCADE,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL,
  method varchar(16) NOT NULL,
  path text NOT NULL,
  status_code integer NOT NULL,
  duration_ms integer NOT NULL,
  response_bytes integer,
  protocol varchar(4) NOT NULL,
  error boolean NOT NULL
);

CREATE INDEX IF NOT EXISTS tunnel_requests_tunnel_ingested_at_idx ON tunnel_requests(tunnel_id, ingested_at);
CREATE INDEX IF NOT EXISTS tunnel_requests_tunnel_status_code_idx ON tunnel_requests(tunnel_id, status_code);

