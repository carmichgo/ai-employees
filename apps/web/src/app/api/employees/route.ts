import { NextRequest, NextResponse } from "next/server";
import { eq, and, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";

export const maxDuration = 60;
import { verifyToken } from "@/lib/auth";
import { provisionAndReturn } from "@/lib/hire";
import { createEmployeeSchema } from "@ai-employees/shared";
import { checkDropletHealth } from "@/lib/digitalocean";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

function sanitize(emp: Record<string, unknown>) {
  const { gatewayToken, interserviceSecret, ...safe } = emp as {
    gatewayToken?: string;
    interserviceSecret?: string;
  } & Record<string, unknown>;
  return safe;
}

// GET /api/employees — list
export async function GET(request: NextRequest) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const result = await db
      .select()
      .from(employees)
      .where(eq(employees.companyId, session.companyId))
      .orderBy(employees.createdAt);

    // Auto-recover employees stuck in "provisioning" whose droplet is actually healthy
    for (const emp of result) {
      if (emp.status === "provisioning" && emp.dropletIp) {
        try {
          const health = await checkDropletHealth(emp.dropletIp);
          if (health.ok) {
            await db
              .update(employees)
              .set({ status: "active", dropletStatus: "active", errorMessage: null, updatedAt: new Date() } as any)
              .where(eq(employees.id, emp.id));
            emp.status = "active";
            emp.dropletStatus = "active";
            emp.errorMessage = null;
          }
        } catch { /* non-fatal */ }
      }
    }

    return NextResponse.json({ employees: result.map(sanitize) });
  } catch (err: any) {
    console.error("GET /api/employees error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}

// POST /api/employees — hire (creates employee + dedicated droplet)
export async function POST(request: NextRequest) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const input = createEmployeeSchema.parse(body);

    const result = await provisionAndReturn(session.companyId, input);

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/employees error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to hire employee" },
      { status: 500 },
    );
  }
}
