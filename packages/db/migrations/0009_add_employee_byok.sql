-- Add BYOK (Bring Your Own Key) hosting mode columns to employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS hosting_mode VARCHAR(20) NOT NULL DEFAULT 'managed';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS byok_anthropic_key TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS byok_gemini_key TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS byok_model VARCHAR(100);
