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

    // Migration 0008: Add phone_number to employees
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20)`;
    results.push("0008: employee phone_number column — OK");

    // Migration 0009: Ensure chat_messages table exists
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
    await sql`CREATE INDEX IF NOT EXISTS idx_chat_messages_employee_id ON chat_messages(employee_id, created_at DESC)`;
    results.push("0009: chat_messages table — OK");

    // Migration 0010: Create spreadsheet_tables, spreadsheet_columns, spreadsheet_rows
    await sql`
      CREATE TABLE IF NOT EXISTS spreadsheet_tables (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS spreadsheet_columns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        table_id UUID NOT NULL REFERENCES spreadsheet_tables(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(30) NOT NULL DEFAULT 'text',
        options JSONB NOT NULL DEFAULT '{}',
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS spreadsheet_rows (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        table_id UUID NOT NULL REFERENCES spreadsheet_tables(id) ON DELETE CASCADE,
        cells JSONB NOT NULL DEFAULT '{}',
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_spreadsheet_columns_table_id ON spreadsheet_columns(table_id, position)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_spreadsheet_rows_table_id ON spreadsheet_rows(table_id, position)`;
    results.push("0010: spreadsheet tables (tables, columns, rows) — OK");

    // Migration 0011: Create spreadsheet_bases table and add base_id to spreadsheet_tables
    await sql`
      CREATE TABLE IF NOT EXISTS spreadsheet_bases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        color VARCHAR(20) DEFAULT '#3b82f6',
        icon VARCHAR(10) DEFAULT '📊',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`ALTER TABLE spreadsheet_tables ADD COLUMN IF NOT EXISTS base_id UUID REFERENCES spreadsheet_bases(id) ON DELETE CASCADE`;
    // Auto-assign orphaned tables (base_id IS NULL) to a default "Uncategorized" base per company
    const orphanedCompanies = await sql`
      SELECT DISTINCT company_id FROM spreadsheet_tables WHERE base_id IS NULL
    `;
    for (const row of orphanedCompanies) {
      // Create or find an "Uncategorized" base for this company
      const [existing] = await sql`
        SELECT id FROM spreadsheet_bases
        WHERE company_id = ${row.company_id} AND name = 'Uncategorized'
        LIMIT 1
      `;
      let baseId: string;
      if (existing) {
        baseId = existing.id;
      } else {
        const [created] = await sql`
          INSERT INTO spreadsheet_bases (company_id, name, description, color, icon)
          VALUES (${row.company_id}, 'Uncategorized', 'Tables created before bases were introduced', '#6b7280', '📁')
          RETURNING id
        `;
        baseId = created.id;
      }
      await sql`
        UPDATE spreadsheet_tables SET base_id = ${baseId}
        WHERE company_id = ${row.company_id} AND base_id IS NULL
      `;
    }
    results.push("0011: spreadsheet_bases table + base_id column + orphan migration — OK");

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
              body: JSON.stringify({ messages: [{ role: "user", content: msgParts.join("\n") }] }),
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

    // Admin action: regenerate-configs — regenerate SOUL.md, openclaw.json, skills on a droplet
    // Uses already-deployed code (no git pull or rebuild needed)
    if (action === "regenerate-configs") {
      const empId = request.nextUrl.searchParams.get("employeeId");
      // If no employeeId, regenerate for ALL active employees on all droplets
      const empQuery = empId
        ? sql`SELECT id, name, droplet_ip, interservice_secret FROM employees WHERE id = ${empId}`
        : sql`SELECT id, name, droplet_ip, interservice_secret FROM employees WHERE status = 'active' AND droplet_ip IS NOT NULL`;
      const emps = await empQuery;

      // Group by droplet IP (one call per droplet regenerates all employees on it)
      const seen = new Set<string>();
      for (const emp of emps) {
        if (!emp.droplet_ip || !emp.interservice_secret || seen.has(emp.droplet_ip)) continue;
        seen.add(emp.droplet_ip);
        try {
          const res = await fetch(`http://${emp.droplet_ip}:3001/internal/regenerate-configs`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-interservice-secret": emp.interservice_secret,
            },
            body: JSON.stringify({}),
            signal: AbortSignal.timeout(60000),
          });
          const data = await res.text().catch(() => "no body");
          results.push(`regenerate ${emp.droplet_ip}: ${res.status} — ${data.substring(0, 300)}`);
        } catch (err: any) {
          results.push(`regenerate ${emp.droplet_ip}: FAILED — ${err.message}`);
        }
      }
    }

    // Admin action: diagnostics — get container diagnostics via droplet's API
    if (action === "diagnostics") {
      const empId = request.nextUrl.searchParams.get("employeeId");
      if (!empId) {
        return NextResponse.json({ error: "employeeId required" }, { status: 400 });
      }
      const [emp] = await sql`SELECT id, name, container_name, container_id, droplet_ip, interservice_secret, status, error_message FROM employees WHERE id = ${empId}`;
      if (!emp || !emp.droplet_ip || !emp.interservice_secret) {
        results.push(`diagnostics: employee not found or no droplet`);
      } else {
        const diag: Record<string, unknown> = {
          name: emp.name,
          status: emp.status,
          errorMessage: emp.error_message,
          containerName: emp.container_name,
          containerId: emp.container_id,
        };
        // Try the diagnostics endpoint (if droplet has new code)
        try {
          const res = await fetch(`http://${emp.droplet_ip}:3001/internal/employees/${empId}/diagnostics`, {
            headers: { "X-INTERSERVICE-SECRET": emp.interservice_secret },
            signal: AbortSignal.timeout(10000),
          });
          if (res.ok) {
            diag.container = await res.json();
          } else {
            diag.diagnosticsEndpoint = `HTTP ${res.status}`;
          }
        } catch (err: any) {
          diag.diagnosticsEndpoint = `FAILED: ${err.message}`;
        }
        // Also try the status endpoint for more info
        try {
          const res = await fetch(`http://${emp.droplet_ip}:3001/internal/employees/${empId}/status`, {
            headers: { "X-INTERSERVICE-SECRET": emp.interservice_secret },
            signal: AbortSignal.timeout(10000),
          });
          if (res.ok) {
            const statusData = await res.json();
            diag.dropletStatus = statusData.employee?.status;
            diag.dropletError = statusData.employee?.errorMessage;
          }
        } catch {}
        return NextResponse.json({ diagnostics: diag });
      }
    }

    // Admin action: fix-container-conflict — fix 409 Docker name conflicts
    // Sets the stale container ID in DB so the teardown worker can find and remove it,
    // then triggers teardown + reprovision sequence with proper delays.
    if (action === "fix-container-conflict") {
      const empId = request.nextUrl.searchParams.get("employeeId");
      const containerId = request.nextUrl.searchParams.get("containerId");
      if (!empId) {
        return NextResponse.json({ error: "employeeId required" }, { status: 400 });
      }
      const [emp] = await sql`SELECT id, name, container_name, droplet_ip, interservice_secret FROM employees WHERE id = ${empId}`;
      if (!emp || !emp.droplet_ip || !emp.interservice_secret) {
        results.push(`fix-conflict: employee not found or no droplet`);
      } else {
        // Step 1: Set the stale container ID in the DB so teardown worker can find it
        if (containerId) {
          await sql`UPDATE employees SET container_id = ${containerId}, status = 'active' WHERE id = ${empId}`;
          results.push(`fix-conflict: set container_id to ${containerId.substring(0, 12)}`);
        }

        // Step 2: Trigger teardown
        try {
          const tearRes = await fetch(`http://${emp.droplet_ip}:3001/internal/employees/${empId}/teardown`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-INTERSERVICE-SECRET": emp.interservice_secret },
            body: JSON.stringify({}),
            signal: AbortSignal.timeout(15000),
          });
          const tearData = await tearRes.json().catch(() => ({}));
          results.push(`fix-conflict: teardown ${tearRes.status} ${JSON.stringify(tearData)}`);
        } catch (err: any) {
          results.push(`fix-conflict: teardown FAILED — ${err.message}`);
        }

        // Step 3: Wait for BullMQ worker to process the teardown
        await new Promise((r) => setTimeout(r, 10000));

        // Step 4: Clear container fields and set to provisioning
        await sql`UPDATE employees SET status = 'provisioning', container_id = NULL, container_host = NULL, error_message = NULL WHERE id = ${empId}`;
        results.push(`fix-conflict: cleared container fields, status = provisioning`);

        // Step 5: Trigger reprovision
        try {
          const provRes = await fetch(`http://${emp.droplet_ip}:3001/internal/employees/${empId}/reprovision`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-INTERSERVICE-SECRET": emp.interservice_secret },
            body: JSON.stringify({}),
            signal: AbortSignal.timeout(15000),
          });
          const provData = await provRes.json().catch(() => ({}));
          results.push(`fix-conflict: reprovision ${provRes.status} ${JSON.stringify(provData)}`);
        } catch (err: any) {
          results.push(`fix-conflict: reprovision FAILED — ${err.message}`);
        }
      }
    }

    // Admin action: restore-droplets — restore wiped droplet connection info
    if (action === "restore-droplets") {
      const restoreData = [
        { id: "ceb04f93-2fd1-4c5f-8745-ecdb5b52193b", name: "Sarah", dropletId: "554425049", dropletIp: "143.198.31.127", secret: "6bd3b95c7ff3f3643795ec1b771e5df87dcdcdbdb1a74c840c0dc574839f4f91" },
        { id: "86830514-2a37-4ea1-89e5-7c650a6bdca3", name: "Erick", dropletId: "554259221", dropletIp: "167.99.118.228", secret: "918b19f37a40421c71fc53385e1ba0ad9a8fd215d63ac558cd53e340fed52aff" },
        { id: "c96fc2da-e10b-4f2d-94b2-b126f3dc5aa7", name: "Jerry", dropletId: "554250026", dropletIp: "159.65.38.6", secret: "0256a23e403e7f121aeade69a5340a3d50800a41feb152354ff2004041670450" },
        { id: "75b237df-39d1-4c7e-8d5c-de3ae0fcdff8", name: "Adele", dropletId: "554519107", dropletIp: "104.236.126.188", secret: "2f12e8b681bfda43706497bd5719f3b33dc44a2a8ec2e76e30adc64d84de4dc3" },
      ];
      for (const r of restoreData) {
        await sql`
          UPDATE employees
          SET droplet_id = ${r.dropletId},
              droplet_ip = ${r.dropletIp},
              droplet_status = 'active',
              interservice_secret = ${r.secret},
              status = 'provisioning',
              container_port = 18789
          WHERE id = ${r.id}
        `;
        results.push(`restore: ${r.name} — droplet_ip=${r.dropletIp}, droplet_id=${r.dropletId}`);
      }
    }

    // Admin action: fix-container-ips — reset invalid container_host values to default bridge IP
    if (action === "fix-container-ips") {
      const fixed = await sql`
        UPDATE employees
        SET container_host = '172.18.0.2', updated_at = NOW()
        WHERE container_host IS NOT NULL
          AND container_host !~ '^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$'
        RETURNING id, name, container_host
      `;
      results.push(`fix-container-ips: fixed ${fixed.length} employees with invalid container_host`);
      for (const r of fixed) {
        results.push(`  ${r.name}: reset to 172.18.0.2`);
      }
    }

    // Admin action: fix-droplet-state — restore droplet status when cron incorrectly marks it destroyed
    if (action === "fix-droplet-state") {
      const empId = request.nextUrl.searchParams.get("employeeId");
      if (!empId) {
        return NextResponse.json({ error: "employeeId required" }, { status: 400 });
      }
      const [emp] = await sql`SELECT id, name, droplet_ip, status, droplet_status FROM employees WHERE id = ${empId}`;
      if (!emp) {
        results.push(`fix-droplet-state: employee not found`);
      } else {
        await sql`
          UPDATE employees
          SET status = 'active', droplet_status = 'active', error_message = NULL, updated_at = NOW()
          WHERE id = ${empId}
        `;
        results.push(`fix-droplet-state: ${emp.name} restored to active (was ${emp.status}/${emp.droplet_status})`);
      }
    }

    // Admin action: reboot-droplet — power-cycle a droplet via DigitalOcean API
    if (action === "reboot-droplet") {
      const empId = request.nextUrl.searchParams.get("employeeId");
      if (!empId) {
        return NextResponse.json({ error: "employeeId required" }, { status: 400 });
      }
      const [emp] = await sql`SELECT id, name, droplet_id FROM employees WHERE id = ${empId}`;
      if (!emp || !emp.droplet_id) {
        results.push(`reboot-droplet: employee not found or no droplet`);
      } else {
        try {
          const { powerCycleEmployeeDroplet } = await import("@/lib/digitalocean");
          const success = await powerCycleEmployeeDroplet(empId);
          if (success) {
            await sql`UPDATE employees SET droplet_status = 'unhealthy', error_message = NULL WHERE id = ${empId}`;
            results.push(`reboot-droplet: power-cycled ${emp.name}'s droplet (${emp.droplet_id})`);
          } else {
            results.push(`reboot-droplet: FAILED to power-cycle ${emp.name}`);
          }
        } catch (err: any) {
          results.push(`reboot-droplet: FAILED — ${err.message}`);
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
    const chatCols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'chat_messages'
      ORDER BY ordinal_position
    `;

    // Chat messages diagnostics
    const chatStats = await sql`
      SELECT employee_id, role, count(*)::int as count
      FROM chat_messages
      GROUP BY employee_id, role
      ORDER BY employee_id
    `;

    return NextResponse.json({
      success: true,
      migrations: results,
      employees: empRows,
      taskStats,
      chatStats,
      employeeColumns: empCols.map((c: any) => c.column_name),
      taskColumns: taskCols.map((c: any) => c.column_name),
      chatMessageColumns: chatCols.map((c: any) => c.column_name),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message, migrations: results },
      { status: 500 },
    );
  }
}
