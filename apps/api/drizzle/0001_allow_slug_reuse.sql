-- Drop the existing unique constraint on hostname
DROP INDEX IF EXISTS tunnels_hostname_idx;
ALTER TABLE tunnels DROP CONSTRAINT IF EXISTS tunnels_hostname_key;

-- Create a partial unique index that only applies to non-stopped tunnels
CREATE UNIQUE INDEX tunnels_hostname_idx ON tunnels(hostname) WHERE status != 'stopped';
