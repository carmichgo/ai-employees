import { NextRequest, NextResponse } from "next/server";
import { eq, and, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";

export const maxDuration = 60;
import { verifyToken } from "@/lib/auth";
import { provisionAndReturn } from "@/lib/hire";
import { createEmployeeSchema } from "@ai-employees/shared";

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

    // By default, hide terminated employees. Pass ?include=terminated to include them.
    const includeTerminated = request.nextUrl.searchParams.get("include") === "terminated";

    const result = await db
      .select()
      .from(employees)
      .where(
        includeTerminated
          ? eq(employees.companyId, session.companyId)
          : and(eq(employees.companyId, session.companyId), ne(employees.status, "terminated")),
      )
      .orderBy(employees.createdAt);

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
