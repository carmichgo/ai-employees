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

    // Admin actions
    const action = request.nextUrl.searchParams.get("action");

    // Provision a specific employee's droplet
    if (action === "provision-employee") {
      const empId = request.nextUrl.searchParams.get("employeeId");
      if (!empId) {
        return NextResponse.json({ error: "employeeId required" }, { status: 400 });
      }
      try {
        const { createEmployeeDroplet } = await import("@/lib/digitalocean");
        const result = await createEmployeeDroplet(empId);
        results.push(`provision: started droplet ${result.dropletId} for employee ${empId}`);
      } catch (err: any) {
        results.push(`provision: FAILED — ${err.message}`);
      }
    }

    // Reset stuck employees
    if (action === "reset-stuck-employees") {
      const stuck = await sql`
        UPDATE employees
        SET droplet_id = NULL, droplet_ip = NULL, droplet_status = 'none',
            status = 'provisioning', interservice_secret = NULL,
            container_id = NULL, container_host = NULL, container_port = NULL,
            error_message = NULL
        WHERE (droplet_status = 'active' OR droplet_status = 'error')
          AND status != 'terminated'
          AND droplet_id IS NOT NULL
        RETURNING id, name
      `;
      results.push(`reset-stuck: ${stuck.length} employees reset: ${stuck.map((r: any) => r.name).join(", ")}`);
    }

    // Admin action: trigger container provision on existing droplet
    if (action === "trigger-provision") {
      const empId = request.nextUrl.searchParams.get("employeeId");
      if (!empId) {
        return NextResponse.json({ error: "employeeId required" }, { status: 400 });
      }
      const [emp] = await sql`SELECT id, name, droplet_ip, interservice_secret, status FROM employees WHERE id = ${empId}`;
      if (!emp || !emp.droplet_ip || !emp.interservice_secret) {
        results.push(`trigger-provision: employee not found or no droplet`);
      } else {
        // First set status to provisioning so the reprovision endpoint accepts it
        await sql`UPDATE employees SET status = 'provisioning' WHERE id = ${empId} AND status = 'active'`;
        try {
          const provRes = await fetch(`http://${emp.droplet_ip}:3001/internal/employees/${empId}/reprovision`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-INTERSERVICE-SECRET": emp.interservice_secret,
            },
            body: JSON.stringify({}),
            signal: AbortSignal.timeout(15000),
          });
          const provData = await provRes.json().catch(() => ({}));
          results.push(`trigger-provision: ${provRes.status} ${JSON.stringify(provData)}`);
        } catch (err: any) {
          results.push(`trigger-provision: FAILED — ${err.message}`);
        }
      }
    }

    // Admin action: tear down existing container and reprovision (for config changes)
    if (action === "rebuild-container") {
      const empId = request.nextUrl.searchParams.get("employeeId");
      if (!empId) {
        return NextResponse.json({ error: "employeeId required" }, { status: 400 });
      }
      const [emp] = await sql`SELECT id, name, droplet_ip, interservice_secret, status FROM employees WHERE id = ${empId}`;
      if (!emp || !emp.droplet_ip || !emp.interservice_secret) {
        results.push(`rebuild-container: employee not found or no droplet`);
      } else {
        try {
          // Step 1: Tear down existing container via the worker
          const tearRes = await fetch(`http://${emp.droplet_ip}:3001/internal/employees/${empId}/teardown`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-INTERSERVICE-SECRET": emp.interservice_secret,
            },
            body: JSON.stringify({}),
            signal: AbortSignal.timeout(30000),
          });
          const tearData = await tearRes.json().catch(() => ({}));
          results.push(`rebuild-container: teardown ${tearRes.status} ${JSON.stringify(tearData)}`);

          // Step 2: Clear container fields and set status to provisioning
          await sql`UPDATE employees SET status = 'provisioning', container_id = NULL, container_host = NULL WHERE id = ${empId}`;

          // Step 3: Trigger reprovision
          const provRes = await fetch(`http://${emp.droplet_ip}:3001/internal/employees/${empId}/reprovision`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-INTERSERVICE-SECRET": emp.interservice_secret,
            },
            body: JSON.stringify({}),
            signal: AbortSignal.timeout(15000),
          });
          const provData = await provRes.json().catch(() => ({}));
          results.push(`rebuild-container: reprovision ${provRes.status} ${JSON.stringify(provData)}`);
        } catch (err: any) {
          results.push(`rebuild-container: FAILED — ${err.message}`);
        }
      }
    }

    // Admin action: reset a specific employee's container fields and trigger reprovision
    if (action === "reset-employee") {
      const empId = request.nextUrl.searchParams.get("employeeId");
      if (!empId) {
        return NextResponse.json({ error: "employeeId required" }, { status: 400 });
      }
      // Clear ALL stale container fields and reset status
      const [emp] = await sql`
        UPDATE employees
        SET status = 'provisioning',
            container_id = NULL,
            container_host = NULL,
            container_port = NULL,
            error_message = NULL
        WHERE id = ${empId}
        RETURNING id, name, droplet_ip, interservice_secret
      `;
      if (!emp) {
        results.push(`reset-employee: employee ${empId} not found`);
      } else {
        results.push(`reset-employee: cleared container fields for ${emp.name}`);

        // Trigger reprovision on the droplet
        if (emp.droplet_ip && emp.interservice_secret) {
          try {
            const provRes = await fetch(`http://${emp.droplet_ip}:3001/internal/employees/${empId}/reprovision`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-INTERSERVICE-SECRET": emp.interservice_secret,
              },
              body: JSON.stringify({}),
              signal: AbortSignal.timeout(15000),
            });
            const provData = await provRes.json().catch(() => ({}));
            results.push(`reset-employee: reprovision ${provRes.status} ${JSON.stringify(provData)}`);
          } catch (err: any) {
            results.push(`reset-employee: reprovision FAILED — ${err.message}`);
          }
        } else {
          results.push(`reset-employee: no droplet IP or secret — cannot trigger reprovision`);
        }
      }
    }

    // Always include employee diagnostics
    const empRows = await sql`
      SELECT id, name, status, droplet_id, droplet_ip, droplet_status, interservice_secret IS NOT NULL as has_secret, created_at, updated_at
      FROM employees
      WHERE status != 'terminated'
      ORDER BY created_at DESC
      LIMIT 10
    `;

    // Check current employees columns
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'employees'
      ORDER BY ordinal_position
    `;

    return NextResponse.json({
      success: true,
      migrations: results,
      employees: empRows,
      employeeColumns: cols.map((c: any) => c.column_name),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message, migrations: results },
      { status: 500 },
    );
  }
}
