import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, chatMessages } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { checkDropletHealth, pollEmployeeDropletStatus } from "@/lib/digitalocean";

export const maxDuration = 60;

/**
 * POST /api/employees/[id]/restart
 * Restart an employee's OpenClaw container to clear stuck state.
 *
 * Strategy (in order):
 * 1. Try the dedicated /restart endpoint on the droplet API
 * 2. If that fails, try /reprovision (recreates the container from scratch)
 * 3. If that fails, try teardown + reprovision
 * 4. Never leave the employee stuck in "provisioning" — always restore status on failure
 *
 * Optionally clears chat history too (body: { clearChat: true }).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await verifyToken(token);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [employee] = await db
    .select({
      id: employees.id,
      name: employees.name,
      status: employees.status,
      dropletIp: employees.dropletIp,
      dropletStatus: employees.dropletStatus,
      interserviceSecret: employees.interserviceSecret,
      companyId: employees.companyId,
    })
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  if (!employee.dropletIp || !employee.interserviceSecret) {
    return NextResponse.json({ error: "Employee has no active droplet" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const clearChat = (body as any).clearChat === true;

  const results: string[] = [];
  let currentIp = employee.dropletIp!;

  // First check if the droplet API is even reachable
  let dropletHealthy = await checkDropletHealth(currentIp);
  if (!dropletHealthy.ok) {
    // IP might have changed (e.g. after a reboot) — try refreshing from DO
    const pollResult = await pollEmployeeDropletStatus(id);
    if (pollResult.status === "active" && pollResult.ip) {
      currentIp = pollResult.ip;
      dropletHealthy = await checkDropletHealth(currentIp);
    }
  }

  if (!dropletHealthy.ok) {
    // Droplet API is genuinely down — can't restart via API, need a reboot
    await db
      .update(employees)
      .set({
        status: "error",
        errorMessage: "Droplet API unreachable — use Reboot instead of Restart",
        updatedAt: new Date(),
      } as any)
      .where(eq(employees.id, id));
    return NextResponse.json({
      success: false,
      results: ["Droplet API is unreachable — use the Reboot button to power-cycle the server"],
    });
  }

  const headers = {
    "Content-Type": "application/json",
    "x-interservice-secret": employee.interserviceSecret,
  };
  const baseUrl = `http://${currentIp}:3001`;

  let restarted = false;

  // 1. Try dedicated restart endpoint (docker restart on the container)
  try {
    const res = await fetch(`${baseUrl}/internal/employees/${id}/restart`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(45000),
    });

    if (res.ok) {
      const data = await res.json();
      results.push(data.message || "Container restarted");
      restarted = true;
    } else if (res.status === 404) {
      results.push("Restart endpoint not available, trying reprovision");
    } else {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      results.push(`Restart failed: ${err.error}`);
    }
  } catch {
    results.push("Restart endpoint unreachable, trying reprovision");
  }

  // 2. Try reprovision directly (no teardown needed — it handles existing containers)
  if (!restarted) {
    try {
      const res = await fetch(`${baseUrl}/internal/employees/${id}/reprovision`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        results.push("Container reprovisioned");
        restarted = true;
      } else {
        const err = await res.json().catch(() => ({ error: "reprovision failed" }));
        results.push(`Reprovision failed: ${err.error || err.message}`);
      }
    } catch (err: any) {
      results.push(`Reprovision error: ${err.message}`);
    }
  }

  // 3. Last resort: teardown then reprovision
  if (!restarted) {
    try {
      // Teardown existing container
      const tearRes = await fetch(`${baseUrl}/internal/employees/${id}/teardown`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(30000),
      });
      if (tearRes.ok) {
        results.push("Container torn down");
      }

      // Reprovision after teardown
      const provRes = await fetch(`${baseUrl}/internal/employees/${id}/reprovision`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(30000),
      });
      if (provRes.ok) {
        results.push("Container reprovisioned after teardown");
        restarted = true;
      } else {
        const err = await provRes.json().catch(() => ({ error: "reprovision failed" }));
        results.push(`Reprovision after teardown failed: ${err.error || err.message}`);
      }
    } catch (err: any) {
      results.push(`Teardown+reprovision error: ${err.message}`);
    }
  }

  // 4. Optionally clear chat history
  if (clearChat) {
    try {
      await db
        .delete(chatMessages)
        .where(and(eq(chatMessages.employeeId, id), eq(chatMessages.userId, session.userId)));
      results.push("Chat history cleared");
    } catch (err: any) {
      results.push(`Failed to clear chat: ${err.message}`);
    }
  }

  // Update status based on outcome — NEVER leave as "provisioning"
  if (restarted) {
    await db
      .update(employees)
      .set({ status: "active", dropletStatus: "active", errorMessage: null, updatedAt: new Date() } as any)
      .where(eq(employees.id, id));
  } else {
    await db
      .update(employees)
      .set({
        status: "error",
        errorMessage: `All restart attempts failed: ${results.join("; ")}`,
        updatedAt: new Date(),
      } as any)
      .where(eq(employees.id, id));
  }

  return NextResponse.json({ success: restarted, results });
}
