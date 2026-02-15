import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";

/**
 * POST /api/companies/droplet/callback
 * Called by the cloud-init script on the droplet to report progress.
 * Auth: uses the interservice secret as a bearer token.
 * Matches by employee's interservice secret (one droplet per employee).
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!auth) {
    return NextResponse.json({ error: "No auth" }, { status: 401 });
  }

  let body: { step: string; status: string; error?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Find employee by interservice secret
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.interserviceSecret, auth))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 403 });
  }

  console.log(
    `[droplet-callback] employee=${employee.name} step=${body.step} status=${body.status}${body.error ? ` error=${body.error}` : ""}`,
  );

  // Phase 1 "ready" = droplet health server is up, but container is NOT ready yet.
  // Only mark the droplet as active — employee status stays as-is (provisioning).
  if (body.step === "ready" && body.status === "ok") {
    await db
      .update(employees)
      .set({
        dropletStatus: "active",
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employee.id));
  }

  // Phase 2 "ready" = full application stack is up, container can be provisioned.
  // Move employee to "onboarding" — health poll will promote to "active" once
  // the container gateway is actually responding.
  if (body.step === "phase2-ready" && body.status === "ok") {
    await db
      .update(employees)
      .set({
        status: employee.status === "provisioning" ? "onboarding" : employee.status,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employee.id));
  }

  // Only set error status if the droplet isn't already active
  if (body.status === "error" && employee.dropletStatus !== "active") {
    await db
      .update(employees)
      .set({
        dropletStatus: "error",
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employee.id));
  }

  return NextResponse.json({ ok: true });
}
