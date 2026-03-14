-- Add internal app hosting support to employee_apps
ALTER TABLE employee_apps ADD COLUMN IF NOT EXISTS hosting_mode VARCHAR(20) NOT NULL DEFAULT 'external';
ALTER TABLE employee_apps ADD COLUMN IF NOT EXISTS html_content TEXT;
ALTER TABLE employee_apps ADD COLUMN IF NOT EXISTS deploy_version VARCHAR(50) DEFAULT '0';
ALTER TABLE employee_apps ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE employee_apps ADD COLUMN IF NOT EXISTS server_functions JSONB;
ALTER TABLE employee_apps ADD COLUMN IF NOT EXISTS env_vars JSONB;
