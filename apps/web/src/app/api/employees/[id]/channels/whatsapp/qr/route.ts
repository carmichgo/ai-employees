/**
 * GET /api/employees/[id]/channels/whatsapp/qr
 *
 * Returns a WhatsApp QR code string for device pairing.
 * The frontend renders the QR code using a client-side library.
 *
 * Response:
 *   { status: "pending", qr: "<qr-string>" }      — scan to link
 *   { status: "linked", qr: null, message: "..." } — already linked
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { getCompanyBackend, createBackendClient } from "@/lib/backend";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

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

  const backendConfig = await getCompanyBackend(session.companyId);
  if (!backendConfig) {
    return NextResponse.json(
      { error: "No backend available. Ensure infrastructure is provisioned." },
      { status: 503 },
    );
  }

  try {
    const backend = createBackendClient(backendConfig);
    const result = await backend.getWhatsAppQR(id);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to get WhatsApp QR code" },
      { status: 502 },
    );
  }
}
