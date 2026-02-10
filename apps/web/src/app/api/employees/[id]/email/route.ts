/**
 * PUT  /api/employees/[id]/email — save email credentials
 * GET  /api/employees/[id]/email — get email config (without password)
 * DELETE /api/employees/[id]/email — remove email credentials
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

// GET — return email config (mask password)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const accounts = (employee.provisionedAccounts as Record<string, unknown>) || {};
  const email = accounts.email as Record<string, unknown> | undefined;

  if (!email) {
    return NextResponse.json({ email: null });
  }

  // Mask the password
  return NextResponse.json({
    email: {
      address: email.address,
      imapHost: email.imapHost,
      imapPort: email.imapPort,
      smtpHost: email.smtpHost,
      smtpPort: email.smtpPort,
      username: email.username,
      hasPassword: !!email.password,
    },
  });
}

// PUT — save email credentials
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  // Validate required fields
  if (!body.address || !body.smtpHost || !body.username || !body.password) {
    return NextResponse.json(
      { error: "Required: address, smtpHost, username, password" },
      { status: 400 },
    );
  }

  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const accounts = (employee.provisionedAccounts as Record<string, unknown>) || {};

  const emailConfig = {
    address: body.address,
    imapHost: body.imapHost || body.smtpHost, // Default IMAP to same as SMTP
    imapPort: body.imapPort || 993,
    smtpHost: body.smtpHost,
    smtpPort: body.smtpPort || 587,
    username: body.username,
    password: body.password,
  };

  const updatedAccounts = {
    ...accounts,
    email: emailConfig,
  };

  // Also update the emailAddress field on the employee record
  await db
    .update(employees)
    .set({
      provisionedAccounts: updatedAccounts,
      emailAddress: body.address,
      updatedAt: new Date(),
    })
    .where(eq(employees.id, id));

  return NextResponse.json({
    message: "Email credentials saved",
    email: {
      address: emailConfig.address,
      imapHost: emailConfig.imapHost,
      imapPort: emailConfig.imapPort,
      smtpHost: emailConfig.smtpHost,
      smtpPort: emailConfig.smtpPort,
      username: emailConfig.username,
      hasPassword: true,
    },
  });
}

// DELETE — remove email credentials
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const accounts = (employee.provisionedAccounts as Record<string, unknown>) || {};
  const { email: _, ...rest } = accounts;

  await db
    .update(employees)
    .set({
      provisionedAccounts: rest,
      updatedAt: new Date(),
    })
    .where(eq(employees.id, id));

  return NextResponse.json({ message: "Email credentials removed" });
}
