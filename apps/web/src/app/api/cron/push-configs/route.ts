import { NextRequest, NextResponse } from "next/server";
import { and, isNotNull, inArray, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, companies, users } from "@/lib/schema";
import {
  generateIdentityMd,
  generateSoulMd,
  generateUserMd,
  generateToolsMd,
  generateAgentsMd,
  generateOpenClawConfig,
  generateHeartbeatMd,
  generateTaskManagementSkill,
  generateRestartGatewaySkill,
  generateTeamCommunicationSkill,
  generateCaptchaSolvingSkill,
  generateAccountCreationSkill,
  generateTaskLoggingSkill,
  generateMediaGenerationSkill,
  generateCredentialManagerScript,
  generateImageScript,
  generateVideoScript,
  generateDocxSkill,
  generateSkillBuildingSkill,
} from "@ai-employees/openclaw-config";

export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Push a file to a droplet via the existing /internal/employees/:id/files endpoint.
 */
async function pushFile(
  dropletUrl: string,
  secret: string,
  employeeId: string,
  folder: string,
  name: string,
  content: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${dropletUrl}/internal/employees/${employeeId}/files`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-interservice-secret": secret,
        },
        body: JSON.stringify({
          name,
          content: Buffer.from(content).toString("base64"),
          folder,
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Restart an employee's container via the droplet API.
 */
async function restartContainer(
  dropletUrl: string,
  secret: string,
  employeeId: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${dropletUrl}/internal/employees/${employeeId}/restart`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-interservice-secret": secret,
        },
        signal: AbortSignal.timeout(60000),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * POST /api/cron/push-configs
 *
 * Generate employee configs using the latest Vercel-deployed code and push
 * them directly to each droplet via the file upload API. This bypasses the
 * hot-update mechanism (which requires code on the droplet to be updated first).
 *
 * Use this when the GitHub repo is private and hot-update can't download code.
 */
export async function POST(request: NextRequest) {
  if (CRON_SECRET) {
    const auth = request.headers.get("authorization");
    const querySecret = new URL(request.url).searchParams.get("secret");
    const isAuthorized =
      auth === `Bearer ${CRON_SECRET}` || querySecret === CRON_SECRET;
    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const targetEmployees = await db
    .select({
      id: employees.id,
      name: employees.name,
      emoji: employees.emoji,
      jobTitle: employees.jobTitle,
      tier: employees.tier,
      persona: employees.persona,
      goals: employees.goals,
      personalityConfig: employees.personalityConfig,
      authorityConfig: employees.authorityConfig,
      modelConfig: employees.modelConfig,
      toolsConfig: employees.toolsConfig,
      sandboxConfig: employees.sandboxConfig,
      gatewayToken: employees.gatewayToken,
      companyId: employees.companyId,
      containerName: employees.containerName,
      dropletIp: employees.dropletIp,
      interserviceSecret: employees.interserviceSecret,
      status: employees.status,
    })
    .from(employees)
    .where(
      and(
        inArray(employees.status, ["active", "error"]),
        inArray(employees.dropletStatus, ["active", "unhealthy"]),
        isNotNull(employees.dropletIp),
        isNotNull(employees.interserviceSecret),
      ),
    );

  const results: Array<{
    id: string;
    name: string;
    status: string;
    filesWritten?: number;
    error?: string;
  }> = [];

  for (const emp of targetEmployees) {
    if (!emp.dropletIp || !emp.interserviceSecret || !emp.gatewayToken) {
      results.push({ id: emp.id, name: emp.name, status: "skipped", error: "missing config" });
      continue;
    }

    try {
      // Look up company and owner for config generation
      const [company] = await db
        .select({ id: companies.id, name: companies.name, slug: companies.slug })
        .from(companies)
        .where(eq(companies.id, emp.companyId))
        .limit(1);

      const [owner] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.companyId, emp.companyId))
        .limit(1);

      const employeeInput = {
        id: emp.id,
        name: emp.name,
        jobTitle: emp.jobTitle,
        emoji: emp.emoji || undefined,
        tier: (emp.tier || "junior") as string,
        persona: emp.persona,
        goals: emp.goals,
        personalityConfig: emp.personalityConfig as {
          autonomy?: string;
          proactivity?: string;
          communication?: string;
          bossTechnicalLevel?: string;
        } | null,
        authorityConfig: emp.authorityConfig as {
          defaultRole?: "manager" | "colleague";
          members?: Array<{
            slackUserId: string;
            name: string;
            role: "manager" | "colleague";
          }>;
        } | null,
        companySlug: company?.slug || "unknown",
        companyName: company?.name || "Unknown",
        ownerName: owner?.name,
        modelConfig: emp.modelConfig as { primary: string; fallbacks?: string[] },
        toolsConfig: (emp.toolsConfig || {}) as Record<string, unknown>,
        sandboxConfig: (emp.sandboxConfig || {}) as Record<string, unknown>,
        channels: [],
      };

      // Generate all config files using the LATEST code (from this Vercel deployment)
      const identityMd = generateIdentityMd(employeeInput);
      const soulMd = generateSoulMd(employeeInput);
      const userMd = generateUserMd(employeeInput);
      const toolsMd = generateToolsMd(employeeInput);
      const agentsMd = generateAgentsMd(employeeInput);
      const heartbeatMd = generateHeartbeatMd(employeeInput);
      const config = generateOpenClawConfig(employeeInput, emp.gatewayToken, soulMd);

      // Generate skills
      const skillFiles: Record<string, string> = {
        "task-management": generateTaskManagementSkill(),
        "restart-gateway": generateRestartGatewaySkill(),
        "team-communication": generateTeamCommunicationSkill(),
        "captcha-solving": generateCaptchaSolvingSkill(),
        "account-creation": generateAccountCreationSkill(),
        "task-logging": generateTaskLoggingSkill(),
        "media-generation": generateMediaGenerationSkill(),
        docx: generateDocxSkill(),
        "skill-building": generateSkillBuildingSkill(),
      };

      // Generate scripts
      const credScript = generateCredentialManagerScript();
      const imageScript = generateImageScript();
      const videoScript = generateVideoScript();

      const dropletUrl = `http://${emp.dropletIp}:3001`;
      const secret = emp.interserviceSecret;
      let filesWritten = 0;

      // Push workspace files (written to root, workspace/, and workspace-main/)
      const workspaceFiles: Record<string, string> = {
        "IDENTITY.md": identityMd,
        "SOUL.md": soulMd,
        "USER.md": userMd,
        "TOOLS.md": toolsMd,
        "AGENTS.md": agentsMd,
        "HEARTBEAT.md": heartbeatMd,
      };

      for (const [name, content] of Object.entries(workspaceFiles)) {
        // Write to all three locations (root, workspace/, workspace-main/)
        const ok1 = await pushFile(dropletUrl, secret, emp.id, ".", name, content);
        const ok2 = await pushFile(dropletUrl, secret, emp.id, "workspace", name, content);
        const ok3 = await pushFile(dropletUrl, secret, emp.id, "workspace-main", name, content);
        if (ok1 && ok2 && ok3) filesWritten += 3;
      }

      // Push openclaw.json
      const ok = await pushFile(dropletUrl, secret, emp.id, ".", "openclaw.json", JSON.stringify(config, null, 2));
      if (ok) filesWritten++;

      // Push skills
      for (const [skillName, content] of Object.entries(skillFiles)) {
        const ok1 = await pushFile(dropletUrl, secret, emp.id, `skills/${skillName}`, "SKILL.md", content);
        const ok2 = await pushFile(dropletUrl, secret, emp.id, `workspace-main/skills/${skillName}`, "SKILL.md", content);
        if (ok1) filesWritten++;
        if (ok2) filesWritten++;
      }

      // Push scripts
      await pushFile(dropletUrl, secret, emp.id, ".", "cred.js", credScript);
      await pushFile(dropletUrl, secret, emp.id, ".", "generate-image.sh", imageScript);
      await pushFile(dropletUrl, secret, emp.id, ".", "generate-video.sh", videoScript);
      filesWritten += 3;

      // Restart the container to pick up new configs
      const restarted = await restartContainer(dropletUrl, secret, emp.id);

      results.push({
        id: emp.id,
        name: emp.name,
        status: restarted ? "ok" : "partial",
        filesWritten,
        error: restarted ? undefined : "config files pushed but container restart failed",
      });
    } catch (err: any) {
      results.push({
        id: emp.id,
        name: emp.name,
        status: "error",
        error: err.message?.slice(0, 200),
      });
    }
  }

  return NextResponse.json({
    results,
    timestamp: new Date().toISOString(),
  });
}
