import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

/**
 * POST /api/migrate?secret=xxx
 * Runs pending database migrations. Protected by SETUP_SECRET.
 */
export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.SETUP_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const results: string[] = [];

  try {
    // Migration 0001: Add company droplet fields
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS droplet_id VARCHAR(50)`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS droplet_ip VARCHAR(45)`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS droplet_region VARCHAR(20) DEFAULT 'nyc3'`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS droplet_size VARCHAR(50) DEFAULT 's-2vcpu-4gb'`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS droplet_status VARCHAR(20) DEFAULT 'none'`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS interservice_secret VARCHAR(255)`;
    results.push("0001: company droplet fields — OK");

    // Migration 0002: Add employee tier column
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS tier VARCHAR(20) NOT NULL DEFAULT 'junior'`;
    results.push("0002: employee tier column — OK");

    // Migration 0003: Add employee authority_config column
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS authority_config JSONB NOT NULL DEFAULT '{"defaultRole":"manager","members":[]}'`;
    results.push("0003: employee authority_config column — OK");

    // Migration 0004: Add pending_hires table
    await sql`
      CREATE TABLE IF NOT EXISTS pending_hires (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        payload JSONB NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    results.push("0004: pending_hires table — OK");

    // Migration 0005: Add per-employee droplet fields
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS droplet_id VARCHAR(50)`;
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS droplet_ip VARCHAR(45)`;
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS droplet_region VARCHAR(20)`;
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS droplet_size VARCHAR(50)`;
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS droplet_status VARCHAR(20) DEFAULT 'none'`;
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS interservice_secret VARCHAR(255)`;
    results.push("0005: employee droplet fields — OK");

    // Check current employees columns
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'employees'
      ORDER BY ordinal_position
    `;

    return NextResponse.json({
      success: true,
      migrations: results,
      employeeColumns: cols.map((c: any) => c.column_name),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message, migrations: results },
      { status: 500 },
    );
  }
}
