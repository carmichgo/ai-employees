import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

export const maxDuration = 60;

import {
  pollDropletStatus,
  destroyCompanyDroplet,
  createCompanyDroplet,
  isDropletProvisioningEnabled,
} from "@/lib/digitalocean";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

// GET /api/companies/droplet — get droplet status
export async function GET(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, session.companyId))
    .limit(1);

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  // Poll for updates (including phase info even when active or errored)
  if (company.dropletStatus === "provisioning" || company.dropletStatus === "booting" || company.dropletStatus === "active" || company.dropletStatus === "error") {
    const result = await pollDropletStatus(session.companyId);
    return NextResponse.json({
      droplet: {
        id: company.dropletId,
        ip: result.ip || company.dropletIp,
        region: company.dropletRegion,
        size: company.dropletSize,
        status: result.status,
        phase: result.phase,
      },
    });
  }

  return NextResponse.json({
    droplet: {
      id: company.dropletId,
      ip: company.dropletIp,
      region: company.dropletRegion,
      size: company.dropletSize,
      status: company.dropletStatus || "none",
      phase: null,
    },
  });
}

// POST /api/companies/droplet — manually provision a droplet
export async function POST(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isDropletProvisioningEnabled()) {
    return NextResponse.json(
      { error: "Droplet provisioning is not enabled (DO_API_TOKEN not set)" },
      { status: 400 },
    );
  }

  try {
    const result = await createCompanyDroplet(session.companyId);
    return NextResponse.json({
      message: "Droplet is being provisioned. This usually takes 2-3 minutes.",
      dropletId: result.dropletId,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/companies/droplet — destroy the droplet
export async function DELETE(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only admins can destroy droplets
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, session.companyId))
    .limit(1);

  if (!company || !company.dropletId) {
    return NextResponse.json({ error: "No droplet to destroy" }, { status: 404 });
  }

  try {
    await destroyCompanyDroplet(session.companyId);
    return NextResponse.json({ message: "Droplet destroyed successfully" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
