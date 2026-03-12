CREATE TABLE IF NOT EXISTS "employee_apps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "emoji" varchar(10) DEFAULT '🔧',
  "type" varchar(50) NOT NULL DEFAULT 'tool',
  "workspace_path" varchar(500),
  "url" varchar(1000),
  "instructions" text,
  "shared" boolean NOT NULL DEFAULT true,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
