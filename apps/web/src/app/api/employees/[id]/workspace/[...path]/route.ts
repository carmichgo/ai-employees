/**
 * Workspace file proxy — serves files from an employee's workspace.
 * Used for displaying screenshots, generated images, and other files in the chat.
 *
 * GET /api/employees/[id]/workspace/[...path]
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; path: string[] }> },
) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await verifyToken(token);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, path: pathSegments } = await params;
  const filePath = pathSegments.join("/");

  // Verify employee belongs to user's company
  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  if (!employee.dropletIp || employee.dropletStatus !== "active") {
    return NextResponse.json({ error: "Infrastructure not available" }, { status: 503 });
  }

  // Proxy to the employee's dedicated droplet
  try {
    const res = await fetch(
      `http://${employee.dropletIp}:3001/internal/employees/${id}/workspace/${filePath}`,
      {
        headers: {
          "x-interservice-secret": employee.interserviceSecret || "",
        },
      },
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "File not found" },
        { status: res.status },
      );
    }

    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to fetch file: ${err.message}` },
      { status: 502 },
    );
  }
}
