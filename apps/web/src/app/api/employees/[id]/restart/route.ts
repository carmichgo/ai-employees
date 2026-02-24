import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, chatMessages } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

export const maxDuration = 60;

/**
 * POST /api/employees/[id]/restart
 * Restart an employee's container to clear stuck state.
 * Tries the dedicated /restart endpoint first; if the droplet is running
 * old code (404), falls back to teardown + reprovision.
 * Optionally clears chat history too.
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

  if (!employee.dropletIp || !employee.interserviceSecret || employee.dropletStatus !== "active") {
    return NextResponse.json({ error: "Employee has no active droplet" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const clearChat = (body as any).clearChat === true;

  const results: string[] = [];
  const headers = {
    "Content-Type": "application/json",
    "x-interservice-secret": employee.interserviceSecret,
  };
  const baseUrl = `http://${employee.dropletIp}:3001`;

  // 1. Try dedicated restart endpoint first
  let restarted = false;
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
      // Endpoint doesn't exist — droplet running old code, fall back
    } else {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      results.push(`Restart endpoint failed: ${err.error}`);
    }
  } catch {
    // Network error or timeout — try fallback
  }

  // 2. Fallback: teardown + reprovision (works with old droplet code)
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
      } else {
        const err = await tearRes.json().catch(() => ({ error: "teardown failed" }));
        results.push(`Teardown: ${err.error || err.message}`);
      }

      // Clear container fields so reprovision creates a fresh one
      await db
        .update(employees)
        .set({ status: "provisioning" } as any)
        .where(eq(employees.id, id));

      // Trigger reprovision
      const provRes = await fetch(`${baseUrl}/internal/employees/${id}/reprovision`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(30000),
      });
      if (provRes.ok) {
        results.push("Reprovision triggered — container will be back in ~30 seconds");
        restarted = true;
      } else {
        const err = await provRes.json().catch(() => ({ error: "reprovision failed" }));
        results.push(`Reprovision: ${err.error || err.message}`);
      }
    } catch (err: any) {
      results.push(`Fallback restart error: ${err.message}`);
    }
  }

  // 3. Optionally clear chat history
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

  return NextResponse.json({ success: restarted, results });
}
