/**
 * GET    /api/employees/[id]/skills           — list installed skills
 * POST   /api/employees/[id]/skills           — install a skill (from slug or uploaded SKILL.md content)
 * DELETE  /api/employees/[id]/skills?slug=x    — uninstall a skill
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, employeeSkills } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { getEmployeeBackend, createBackendClient } from "@/lib/backend";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

// GET — list all installed skills for this employee
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [employee] = await db
    .select({ id: employees.id, companyId: employees.companyId })
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const skills = await db
    .select()
    .from(employeeSkills)
    .where(eq(employeeSkills.employeeId, id));

  return NextResponse.json({
    skills: skills.map((s) => ({
      id: s.id,
      skillSlug: s.skillSlug,
      source: s.source,
      enabled: s.enabled,
      config: s.config,
      createdAt: s.createdAt,
    })),
  });
}

// POST — install a skill
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { slug, source, content } = body as {
    slug: string;
    source?: string;
    content?: string; // raw SKILL.md content for custom/uploaded skills
  };

  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  // Validate slug format: kebab-case, 2-100 chars
  if (!/^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$/.test(slug) && !/^[a-z0-9]{1,2}$/.test(slug)) {
    return NextResponse.json(
      { error: "Invalid slug — use lowercase letters, numbers, and hyphens (e.g. my-skill)" },
      { status: 400 },
    );
  }

  const [employee] = await db
    .select({
      id: employees.id,
      companyId: employees.companyId,
      containerName: employees.containerName,
      status: employees.status,
    })
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  // Check if skill is already installed
  const existing = await db
    .select()
    .from(employeeSkills)
    .where(and(eq(employeeSkills.employeeId, id), eq(employeeSkills.skillSlug, slug)))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: `Skill "${slug}" is already installed` },
      { status: 409 },
    );
  }

  // Insert skill record
  const skillSource = source || (content ? "custom" : "clawhub");
  const [skill] = await db
    .insert(employeeSkills)
    .values({
      employeeId: id,
      skillSlug: slug,
      source: skillSource,
      enabled: true,
      config: content ? { content } : {},
    })
    .returning();

  // If custom content was provided, write SKILL.md to the container via the backend
  if (content) {
    const backendConfig = await getEmployeeBackend(id);
    if (backendConfig) {
      try {
        const backend = createBackendClient(backendConfig);
        await backend.installSkill(id, slug, content);
      } catch (err: any) {
        console.error(`Failed to write skill to container: ${err.message}`);
        // Skill is saved in DB — will be written on next config regeneration
      }
    }
  }

  return NextResponse.json(
    {
      message: `Skill "${slug}" installed`,
      skill: {
        id: skill.id,
        skillSlug: skill.skillSlug,
        source: skill.source,
        enabled: skill.enabled,
        config: skill.config,
        createdAt: skill.createdAt,
      },
    },
    { status: 201 },
  );
}

// PATCH — toggle skill enabled/disabled
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const slug = request.nextUrl.searchParams.get("slug");
  const body = await request.json();

  if (!slug) {
    return NextResponse.json({ error: "slug query parameter is required" }, { status: 400 });
  }

  const [employee] = await db
    .select({ id: employees.id, companyId: employees.companyId })
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const [existing] = await db
    .select()
    .from(employeeSkills)
    .where(and(eq(employeeSkills.employeeId, id), eq(employeeSkills.skillSlug, slug)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") updates.enabled = body.enabled;

  const [updated] = await db
    .update(employeeSkills)
    .set(updates)
    .where(eq(employeeSkills.id, existing.id))
    .returning();

  return NextResponse.json({
    message: `Skill "${slug}" ${updated.enabled ? "enabled" : "disabled"}`,
    skill: {
      id: updated.id,
      skillSlug: updated.skillSlug,
      source: updated.source,
      enabled: updated.enabled,
      config: updated.config,
      createdAt: updated.createdAt,
    },
  });
}

// DELETE — uninstall a skill
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const slug = request.nextUrl.searchParams.get("slug");

  if (!slug) {
    return NextResponse.json({ error: "slug query parameter is required" }, { status: 400 });
  }

  const [employee] = await db
    .select({ id: employees.id, companyId: employees.companyId })
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const [existing] = await db
    .select()
    .from(employeeSkills)
    .where(and(eq(employeeSkills.employeeId, id), eq(employeeSkills.skillSlug, slug)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  await db
    .delete(employeeSkills)
    .where(eq(employeeSkills.id, existing.id));

  // Remove skill from container
  const backendConfig = await getEmployeeBackend(id);
  if (backendConfig) {
    try {
      const backend = createBackendClient(backendConfig);
      await backend.uninstallSkill(id, slug);
    } catch (err: any) {
      console.error(`Failed to remove skill from container: ${err.message}`);
    }
  }

  return NextResponse.json({ message: `Skill "${slug}" uninstalled` });
}
