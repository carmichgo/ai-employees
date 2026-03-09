-- Migration: Add token_usage_logs table for per-request LLM cost tracking
-- Run this on the production database, or hit GET /api/setup which includes this migration.

CREATE TABLE IF NOT EXISTS token_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  source VARCHAR(30) NOT NULL,
  model VARCHAR(100) NOT NULL,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_usage_employee_created ON token_usage_logs(employee_id, created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_company_created ON token_usage_logs(company_id, created_at);
