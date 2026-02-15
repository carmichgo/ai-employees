-- Shared infrastructure table: single shared droplet for all non-dedicated companies
CREATE TABLE IF NOT EXISTS shared_infrastructure (
  key VARCHAR(50) PRIMARY KEY DEFAULT 'default',
  droplet_id VARCHAR(50),
  droplet_ip VARCHAR(45),
  droplet_region VARCHAR(20) DEFAULT 'nyc3',
  droplet_size VARCHAR(50) DEFAULT 's-4vcpu-8gb',
  droplet_status VARCHAR(20) DEFAULT 'none',
  interservice_secret VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the default row
INSERT INTO shared_infrastructure (key) VALUES ('default') ON CONFLICT DO NOTHING;
