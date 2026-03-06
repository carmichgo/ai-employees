import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { getCompanyBackend, createBackendClient } from "@/lib/backend";

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

  // Verify ownership
  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  if (employee.status !== "error") {
    return NextResponse.json({ error: "Employee is not in error state" }, { status: 400 });
  }

  // If company has an active droplet, delegate to it
  const backendConfig = await getCompanyBackend(session.companyId);
  if (backendConfig) {
    try {
      const backend = createBackendClient(backendConfig);
      const result = await backend.retryEmployee(id);
      return NextResponse.json(result);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  // Demo mode fallback — just reset to provisioning
  const [updated] = await db
    .update(employees)
    .set({ status: "provisioning", errorMessage: null, updatedAt: new Date() })
    .where(eq(employees.id, id))
    .returning();

  const { gatewayToken, ...safe } = updated;
  return NextResponse.json({ employee: safe });
}
