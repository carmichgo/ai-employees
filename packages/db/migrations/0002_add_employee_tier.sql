-- Add employee tier column (junior | senior | expert)
-- Determines the AI model, container resources, pricing, and task credits
ALTER TABLE employees ADD COLUMN IF NOT EXISTS tier VARCHAR(20) NOT NULL DEFAULT 'junior';
