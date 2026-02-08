-- Add per-company DigitalOcean droplet fields to companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS droplet_id VARCHAR(50);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS droplet_ip VARCHAR(45);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS droplet_region VARCHAR(20) DEFAULT 'nyc3';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS droplet_size VARCHAR(50) DEFAULT 's-2vcpu-4gb';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS droplet_status VARCHAR(20) DEFAULT 'none';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS interservice_secret VARCHAR(255);
