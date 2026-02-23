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

    // Migration 0006: Add trigger_id to tasks table (links tasks to cron triggers)
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS trigger_id UUID REFERENCES triggers(id) ON DELETE SET NULL`;
    results.push("0006: task trigger_id column — OK");

    // Migration 0007: Add activity tracking columns to employees
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_request_sent_at TIMESTAMPTZ`;
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_response_at TIMESTAMPTZ`;
    results.push("0007: employee activity tracking columns — OK");

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

    // Admin action: nudge-employee — send a task board check message directly to an employee's container
    if (action === "nudge-employee") {
      const empId = request.nextUrl.searchParams.get("employeeId");
      if (!empId) {
        return NextResponse.json({ error: "employeeId required" }, { status: 400 });
      }
      const [emp] = await sql`
        SELECT id, name, container_host, container_port, gateway_token, model_config,
               droplet_ip, interservice_secret
        FROM employees WHERE id = ${empId} AND status = 'active'
      `;
      if (!emp || !emp.droplet_ip || !emp.interservice_secret) {
        results.push(`nudge: employee not found or no droplet`);
      } else {
        const empTasks = await sql`
          SELECT id, title, status, priority, source, updated_at
          FROM tasks WHERE employee_id = ${empId} AND status IN ('pending', 'in_progress')
          ORDER BY status, updated_at DESC
        `;
        if (empTasks.length === 0) {
          results.push(`nudge: ${emp.name} has no pending/in_progress tasks`);
        } else {
          const pendingLines = empTasks.filter((t: any) => t.status === "pending").map((t: any) =>
            `- **${t.title}** (ID: ${t.id}, ${t.priority}) [pending]`
          );
          const staleLines = empTasks.filter((t: any) => t.status === "in_progress").map((t: any) => {
            const mins = Math.floor((Date.now() - new Date(t.updated_at).getTime()) / 60_000);
            return `- **${t.title}** (ID: ${t.id}) — in_progress, last updated ${mins} min ago`;
          });
          const msgParts = ["[Task Board Check]", ""];
          if (pendingLines.length > 0) msgParts.push(`**${pendingLines.length} pending tasks:**`, "", ...pendingLines, "");
          if (staleLines.length > 0) msgParts.push(`**${staleLines.length} in-progress tasks that need attention:**`, "", ...staleLines, "");
          msgParts.push("For each task above:", "- If pending: start working on it (update to in_progress)", "- If in_progress but finished: mark it completed", "- If in_progress but stuck: mark it blocked", "- If in_progress and you lost context: review and continue", "", "Do NOT create new tasks. Update the existing ones:", 'curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/<TASK_ID>" -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" -H "Content-Type: application/json" -d \'{"status": "completed", "comment": "Summary."}\'');
          try {
            await sql`UPDATE employees SET last_request_sent_at = NOW() WHERE id = ${empId}`;
            // Route through the droplet's API proxy (Vercel can't reach Docker internal IPs)
            const chatRes = await fetch(`http://${emp.droplet_ip}:3001/internal/employees/${empId}/chat`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-INTERSERVICE-SECRET": emp.interservice_secret,
              },
              body: JSON.stringify({ message: msgParts.join("\n") }),
              signal: AbortSignal.timeout(120_000),
            });
            await sql`UPDATE employees SET last_response_at = NOW() WHERE id = ${empId}`;
            if (chatRes.ok) {
              results.push(`nudge: Sent task board check to ${emp.name} — ${empTasks.length} tasks (HTTP ${chatRes.status})`);
            } else {
              const errText = await chatRes.text().catch(() => "no body");
              results.push(`nudge: Failed — HTTP ${chatRes.status}: ${errText.substring(0, 200)}`);
            }
          } catch (err: any) {
            results.push(`nudge: FAILED — ${err.message}`);
          }
        }
      }
    }

    // Admin action: hot-update — pull latest code and restart worker/containers on a droplet
    if (action === "hot-update") {
      const empId = request.nextUrl.searchParams.get("employeeId");
      if (!empId) {
        return NextResponse.json({ error: "employeeId required" }, { status: 400 });
      }
      const [emp] = await sql`SELECT id, name, droplet_ip, interservice_secret FROM employees WHERE id = ${empId}`;
      if (!emp || !emp.droplet_ip || !emp.interservice_secret) {
        results.push(`hot-update: employee not found or no droplet`);
      } else {
        try {
          const branch = process.env.REPO_BRANCH || "main";
          const hotRes = await fetch(`http://${emp.droplet_ip}:3001/internal/hot-update`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-INTERSERVICE-SECRET": emp.interservice_secret,
            },
            body: JSON.stringify({ branch }),
            signal: AbortSignal.timeout(120000),
          });
          const hotData = await hotRes.text().catch(() => "no body");
          results.push(`hot-update: ${hotRes.status} — ${hotData.substring(0, 500)}`);
        } catch (err: any) {
          results.push(`hot-update: FAILED — ${err.message}`);
        }
      }
    }

    // Always include employee diagnostics
    const empRows = await sql`
      SELECT id, name, status, droplet_id, droplet_ip, droplet_status,
             container_host, container_port,
             last_health_at, last_request_sent_at, last_response_at,
             interservice_secret IS NOT NULL as has_secret,
             created_at, updated_at
      FROM employees
      WHERE status != 'terminated'
      ORDER BY created_at DESC
      LIMIT 10
    `;

    // Pending/in_progress tasks per employee
    const taskStats = await sql`
      SELECT employee_id, status, source, count(*)::int as count
      FROM tasks
      WHERE status IN ('pending', 'in_progress')
      GROUP BY employee_id, status, source
      ORDER BY employee_id
    `;

    // Check current table columns
    const empCols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'employees'
      ORDER BY ordinal_position
    `;
    const taskCols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'tasks'
      ORDER BY ordinal_position
    `;

    return NextResponse.json({
      success: true,
      migrations: results,
      employees: empRows,
      taskStats,
      employeeColumns: empCols.map((c: any) => c.column_name),
      taskColumns: taskCols.map((c: any) => c.column_name),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message, migrations: results },
      { status: 500 },
    );
  }
}
