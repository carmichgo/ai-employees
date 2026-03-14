import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, companies } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const token =
      request.cookies.get("token")?.value ||
      request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const session = await verifyToken(token);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, session.companyId))
      .limit(1);

    const allEmployees = await db
      .select()
      .from(employees)
      .where(eq(employees.companyId, session.companyId));

    const statusCounts = {
      active: 0,
      paused: 0,
      provisioning: 0,
      onboarding: 0,
      error: 0,
      terminated: 0,
    };

    for (const emp of allEmployees) {
      const status = emp.status as keyof typeof statusCounts;
      if (status in statusCounts) {
        statusCounts[status]++;
      }
    }

    return NextResponse.json({
      company: company
        ? { name: company.name }
        : null,
      employees: { total: allEmployees.length, ...statusCounts },
    });
  } catch (err: any) {
    console.error("GET /api/dashboard/overview error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
