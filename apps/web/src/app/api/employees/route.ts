import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, companies } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import {
  createEmployeeSchema,
  getJobTemplate,
  PLAN_LIMITS,
  type PlanTier,
} from "@ai-employees/shared";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

function sanitize(emp: Record<string, unknown>) {
  const { gatewayToken, ...safe } = emp as { gatewayToken?: string } & Record<
    string,
    unknown
  >;
  return safe;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// GET /api/employees — list
export async function GET(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await db
    .select()
    .from(employees)
    .where(eq(employees.companyId, session.companyId))
    .orderBy(employees.createdAt);

  return NextResponse.json({ employees: result.map(sanitize) });
}

// POST /api/employees — hire
export async function POST(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const input = createEmployeeSchema.parse(body);

  // Check limits
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, session.companyId))
    .limit(1);
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const planLimits = PLAN_LIMITS[company.plan as PlanTier] || PLAN_LIMITS.starter;
  const current = await db
    .select()
    .from(employees)
    .where(eq(employees.companyId, session.companyId));
  const activeCount = current.filter((e) => e.status !== "terminated").length;

  if (activeCount >= planLimits.maxEmployees) {
    return NextResponse.json(
      { error: `Employee limit reached (${planLimits.maxEmployees} for ${company.plan} plan)` },
      { status: 403 },
    );
  }

  // Merge template
  let persona = input.persona;
  let goals = input.goals;
  let emoji = "🤖";

  if (input.templateId) {
    const template = getJobTemplate(input.templateId);
    if (template) {
      persona = persona || template.persona;
      goals = goals || template.goals;
      emoji = template.emoji;
    }
  }

  const gatewayToken = crypto.randomBytes(32).toString("hex");

  const [employee] = await db
    .insert(employees)
    .values({
      companyId: session.companyId,
      name: input.name,
      jobTitle: input.jobTitle,
      templateId: input.templateId,
      emoji,
      persona,
      goals,
      modelConfig: input.modelConfig || { primary: "anthropic/claude-sonnet-4-20250514" },
      gatewayToken,
      status: "active", // In Vercel demo, mark as active immediately
      containerName: `ai-emp-${company.slug}-${slugify(input.name)}-${crypto.randomBytes(3).toString("hex")}`,
    })
    .returning();

  return NextResponse.json(
    {
      employee: sanitize(employee),
      message: `${input.name} is being onboarded! They'll be ready in a few moments.`,
    },
    { status: 201 },
  );
}
