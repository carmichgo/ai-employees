-- Add spreadsheet_bases table (project/base container for tables)
CREATE TABLE IF NOT EXISTS spreadsheet_bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(20) DEFAULT '#3b82f6',
  icon VARCHAR(10) DEFAULT '📊',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add base_id column to spreadsheet_tables (nullable for backward compat)
ALTER TABLE spreadsheet_tables
  ADD COLUMN IF NOT EXISTS base_id UUID REFERENCES spreadsheet_bases(id) ON DELETE CASCADE;
