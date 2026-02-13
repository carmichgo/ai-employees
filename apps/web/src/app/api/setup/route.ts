import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { signToken } from "@/lib/auth";

// GET /api/setup?secret=xxx — get admin token for first user of a company
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.SETUP_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const slug = request.nextUrl.searchParams.get("slug");
  const sql = neon(process.env.DATABASE_URL!);

  try {
    // Find company and first user
    const rows = await sql`
      SELECT u.id as user_id, u.email, u.role, c.id as company_id, c.slug, c.droplet_id, c.droplet_status
      FROM users u JOIN companies c ON u.company_id = c.id
      WHERE (${ slug || '' } = '' OR c.slug = ${ slug || '' })
      ORDER BY u.created_at ASC LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "No users found" }, { status: 404 });
    }

    const row = rows[0];
    const token = await signToken({
      userId: row.user_id as string,
      companyId: row.company_id as string,
      role: row.role as string,
    });

    return NextResponse.json({
      token,
      user: { id: row.user_id, email: row.email, role: row.role },
      company: { id: row.company_id, slug: row.slug, dropletId: row.droplet_id, dropletStatus: row.droplet_status },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// One-time setup endpoint to create tables
// Hit this once after deploying to initialize the database
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-setup-secret");
  if (secret !== process.env.SETUP_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  try {
    // Create tables
    await sql`
      CREATE TABLE IF NOT EXISTS companies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        plan VARCHAR(50) NOT NULL DEFAULT 'starter',
        max_employees INTEGER NOT NULL DEFAULT 5,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        settings JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'member',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS employees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        name VARCHAR(255) NOT NULL,
        job_title VARCHAR(255) NOT NULL,
        template_id VARCHAR(100),
        avatar VARCHAR(500),
        emoji VARCHAR(10) DEFAULT '🤖',
        status VARCHAR(20) NOT NULL DEFAULT 'provisioning',
        container_id VARCHAR(100),
        container_name VARCHAR(255),
        container_host VARCHAR(255),
        container_port INTEGER DEFAULT 18789,
        gateway_token VARCHAR(500),
        model_config JSONB NOT NULL DEFAULT '{"primary": "anthropic/claude-opus-4-6"}',
        persona TEXT,
        goals TEXT,
        tools_config JSONB NOT NULL DEFAULT '{}',
        sandbox_config JSONB NOT NULL DEFAULT '{}',
        email_address VARCHAR(255),
        provisioned_accounts JSONB NOT NULL DEFAULT '{}',
        credentials JSONB NOT NULL DEFAULT '[]',
        config_hash VARCHAR(64),
        last_health_at TIMESTAMPTZ,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS employee_skills (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        skill_slug VARCHAR(255) NOT NULL,
        source VARCHAR(50) NOT NULL DEFAULT 'clawhub',
        enabled BOOLEAN NOT NULL DEFAULT true,
        config JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(employee_id, skill_slug)
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS channel_connections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        channel_type VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        credentials JSONB NOT NULL DEFAULT '{}',
        config JSONB NOT NULL DEFAULT '{}',
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        mode VARCHAR(20),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_employee_id ON chat_messages(employee_id, created_at DESC)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        user_id UUID REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        resource_type VARCHAR(50) NOT NULL,
        resource_id UUID NOT NULL,
        details JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS usage_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        employee_id UUID REFERENCES employees(id),
        metric VARCHAR(50) NOT NULL,
        value BIGINT NOT NULL,
        period_start TIMESTAMPTZ NOT NULL,
        period_end TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS triggers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        company_id UUID NOT NULL REFERENCES companies(id),
        type VARCHAR(20) NOT NULL,
        name VARCHAR(255) NOT NULL,
        config JSONB NOT NULL DEFAULT '{}',
        enabled BOOLEAN NOT NULL DEFAULT true,
        webhook_token VARCHAR(100),
        last_run_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_triggers_employee_id ON triggers(employee_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_triggers_webhook_token ON triggers(webhook_token) WHERE webhook_token IS NOT NULL
    `;

    // Migrations for existing databases — add columns that may be missing
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS credentials JSONB NOT NULL DEFAULT '[]'`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS droplet_id VARCHAR(50)`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS droplet_ip VARCHAR(45)`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS droplet_region VARCHAR(20) DEFAULT 'nyc3'`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS droplet_size VARCHAR(50) DEFAULT 's-2vcpu-4gb'`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS droplet_status VARCHAR(20) DEFAULT 'none'`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS interservice_secret VARCHAR(255)`;

    // v2 migrations: personality config + tasks table
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS personality_config JSONB NOT NULL DEFAULT '{"autonomy": "high", "proactivity": "proactive", "communication": "concise"}'`;

    await sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        company_id UUID NOT NULL REFERENCES companies(id),
        title VARCHAR(500) NOT NULL,
        description TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        priority VARCHAR(20) NOT NULL DEFAULT 'medium',
        source VARCHAR(20) NOT NULL DEFAULT 'manager',
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    return NextResponse.json({ success: true, message: "All tables created" });
  } catch (error: any) {
    console.error("Setup error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
