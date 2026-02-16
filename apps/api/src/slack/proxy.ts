/**
 * Slack Proxy — one Socket Mode connection per company droplet.
 *
 * Instead of each OpenClaw container connecting to Slack independently
 * (which causes event round-robin and identical bot identities), this proxy:
 *
 *  1. Maintains a single Socket Mode connection to the company's Slack workspace
 *  2. Routes incoming messages to the correct employee's OpenClaw container
 *  3. Posts responses back with per-employee identity (name + emoji) via chat:write.customize
 *  4. Creates dedicated Slack channels for each employee on demand
 *
 * This makes every AI employee appear as a different "user" in Slack.
 *
 * Uses dynamic imports so the API builds and runs even if @slack/bolt
 * isn't installed — the proxy simply won't start.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { eq, and } from "drizzle-orm";
import { db, employees, companies } from "@ai-employees/db";

// Types we reference — kept minimal so we don't need the Slack packages at compile time
type SlackApp = { message: Function; event: Function; start: Function; stop: Function };
type SlackWebClient = {
  conversations: { create: Function; setTopic: Function; setPurpose: Function; list: Function; join: Function; archive: Function; history: Function };
  chat: { postMessage: Function };
  files: { uploadV2: Function };
};

// Emoji → Slack-compatible icon. Slack's `icon_emoji` needs colon-wrapped shortcodes.
function emojiToSlackIcon(emoji: string | null): string | undefined {
  if (!emoji) return undefined;
  if (emoji.startsWith(":") && emoji.endsWith(":")) return emoji;
  return undefined;
}

interface EmployeeMapping {
  id: string;
  name: string;
  emoji: string | null;
  jobTitle: string;
  containerHost: string | null;
  containerPort: number | null;
  gatewayToken: string | null;
  slackChannelId: string | null;
}

export class SlackProxy {
  private app: SlackApp | null = null;
  private webClient: SlackWebClient | null = null;
  private channelToEmployee = new Map<string, EmployeeMapping>();
  private companyId: string | null = null;
  private botUserId: string | null = null;
  private running = false;

  /**
   * Start the Slack proxy if the company on this droplet has Slack connected.
   * Reads credentials from the DB (botToken) and env vars (appToken).
   */
  async start(): Promise<void> {
    const appToken = (process.env.SLACK_APP_TOKEN || "").trim();
    if (!appToken) {
      console.log("[slack-proxy] SLACK_APP_TOKEN not set, Slack proxy disabled");
      return;
    }

    // Dynamic-import Slack packages — gracefully skip if not installed.
    // Use variables for module names so TypeScript doesn't try to resolve them at compile time.
    let BoltApp: any;
    let WebClient: any;
    let LogLevel: any;
    try {
      const boltMod = "@slack/bolt";
      const webApiMod = "@slack/web-api";
      const bolt: any = await import(/* webpackIgnore: true */ boltMod);
      BoltApp = bolt.App;
      LogLevel = bolt.LogLevel;
      const webApi: any = await import(/* webpackIgnore: true */ webApiMod);
      WebClient = webApi.WebClient;
    } catch {
      console.log("[slack-proxy] @slack/bolt or @slack/web-api not installed, Slack proxy disabled");
      return;
    }

    // Find the company with Slack connected — each droplet serves one company
    const allCompanies = await db.query.companies.findMany();
    const company = allCompanies.find((c: any) => {
      const settings = (c.settings as Record<string, unknown>) || {};
      const integrations = (settings.integrations as Record<string, unknown>) || {};
      const slack = integrations.slack as Record<string, unknown> | undefined;
      return slack?.connected && slack?.botToken;
    });

    if (!company) {
      console.log("[slack-proxy] No company with Slack connected, proxy disabled");
      return;
    }

    this.companyId = company.id;
    const settings = (company.settings as Record<string, unknown>) || {};
    const integrations = (settings.integrations as Record<string, unknown>) || {};
    const slack = integrations.slack as Record<string, unknown>;
    const botToken = slack.botToken as string;
    this.botUserId = (slack.botUserId as string) || null;

    const signingSecret = (process.env.SLACK_SIGNING_SECRET || "").trim();

    try {
      this.webClient = new WebClient(botToken) as SlackWebClient;

      this.app = new BoltApp({
        token: botToken,
        appToken,
        socketMode: true,
        signingSecret: signingSecret || undefined,
        logLevel: LogLevel.WARN,
      }) as SlackApp;

      // Register message handler
      this.app.message(async ({ message, client }: any) => {
        await this.handleMessage(message, client);
      });

      // Register app_mention handler (for @mentions in shared channels)
      this.app.event("app_mention", async ({ event, client }: any) => {
        await this.handleMention(event, client);
      });

      // Load employee → channel mappings
      await this.refreshMappings();

      // Start Socket Mode
      await this.app.start();
      this.running = true;
      console.log(`[slack-proxy] Connected to Slack for company ${company.slug} (${company.id})`);
    } catch (err) {
      console.error("[slack-proxy] Failed to start:", err);
    }
  }

  /** Stop the Slack proxy */
  async stop(): Promise<void> {
    if (this.app && this.running) {
      await this.app.stop();
      this.running = false;
      this.app = null;
      this.webClient = null;
      this.channelToEmployee.clear();
      this.companyId = null;
      this.botUserId = null;
      console.log("[slack-proxy] Stopped");
    }
  }

  /** Restart the Slack proxy (re-reads credentials from DB) */
  async restart(): Promise<void> {
    console.log("[slack-proxy] Restarting...");
    await this.stop();
    await this.start();
  }

  /** Reload employee mappings from the DB */
  async refreshMappings(): Promise<void> {
    if (!this.companyId) return;

    const emps = await db.query.employees.findMany({
      where: and(
        eq(employees.companyId, this.companyId),
        eq(employees.status, "active"),
      ),
    });

    this.channelToEmployee.clear();

    for (const emp of emps) {
      const accounts = (emp.provisionedAccounts as Record<string, unknown>) || {};
      const slackInfo = accounts.slack as Record<string, unknown> | undefined;
      const channelId = slackInfo?.channelId as string | undefined;

      const mapping: EmployeeMapping = {
        id: emp.id,
        name: emp.name,
        emoji: emp.emoji,
        jobTitle: emp.jobTitle,
        containerHost: emp.containerHost,
        containerPort: emp.containerPort,
        gatewayToken: emp.gatewayToken,
        slackChannelId: channelId || null,
      };

      if (channelId) {
        this.channelToEmployee.set(channelId, mapping);
      }
    }

    console.log(`[slack-proxy] Loaded ${this.channelToEmployee.size} employee channel mappings`);
  }

  /**
   * Create a dedicated Slack channel for an employee.
   * Channel name: emp-{slugified-employee-name}
   * Returns the channel ID or null if creation failed.
   */
  async createEmployeeChannel(employeeId: string): Promise<string | null> {
    if (!this.webClient) return null;

    const emp = await db.query.employees.findFirst({
      where: eq(employees.id, employeeId),
    });
    if (!emp) return null;

    const channelName = `emp-${slugify(emp.name)}`;

    try {
      const result: any = await this.webClient.conversations.create({
        name: channelName,
        is_private: false,
      });

      const channelId = result.channel?.id;
      if (!channelId) {
        console.error("[slack-proxy] Channel created but no ID returned");
        return null;
      }

      // Set channel topic and purpose
      await this.webClient.conversations.setTopic({
        channel: channelId,
        topic: `Chat with ${emp.name} (${emp.jobTitle}) — AI Employee`,
      });

      await this.webClient.conversations.setPurpose({
        channel: channelId,
        purpose: `Direct line to ${emp.name}, your AI ${emp.jobTitle}. Messages here are handled by ${emp.name}.`,
      });

      // Post a welcome message with the employee's identity
      await this.webClient.chat.postMessage({
        channel: channelId,
        text: `Hey! I'm ${emp.name}, your ${emp.jobTitle}. ${emp.emoji || "\u{1F916}"}\n\nThis is my dedicated channel — anything you send here comes directly to me. How can I help?`,
        username: emp.name,
        icon_emoji: emojiToSlackIcon(emp.emoji) || ":robot_face:",
      });

      // Announce the new employee in #general so everyone knows
      await this.announceNewEmployee(emp, channelId);

      // Store channel ID in employee record
      const currentAccounts = (emp.provisionedAccounts as Record<string, unknown>) || {};
      await db
        .update(employees)
        .set({
          provisionedAccounts: {
            ...currentAccounts,
            slack: { channelId, channelName },
          },
          updatedAt: new Date(),
        })
        .where(eq(employees.id, employeeId));

      // Update local mapping
      this.channelToEmployee.set(channelId, {
        id: emp.id,
        name: emp.name,
        emoji: emp.emoji,
        jobTitle: emp.jobTitle,
        containerHost: emp.containerHost,
        containerPort: emp.containerPort,
        gatewayToken: emp.gatewayToken,
        slackChannelId: channelId,
      });

      console.log(`[slack-proxy] Created channel #${channelName} (${channelId}) for ${emp.name}`);
      return channelId;
    } catch (err: unknown) {
      // If channel name is taken, try to find it
      const errorStr = err instanceof Error ? err.message : String(err);
      if (errorStr.includes("name_taken")) {
        return this.findExistingChannel(channelName, employeeId, emp);
      }
      console.error(`[slack-proxy] Failed to create channel for ${emp.name}:`, err);
      return null;
    }
  }

  /** Find an existing channel by name and associate it with the employee */
  private async findExistingChannel(
    channelName: string,
    employeeId: string,
    emp: { name: string; emoji: string | null; jobTitle: string; containerHost: string | null; containerPort: number | null; gatewayToken: string | null; provisionedAccounts: unknown },
  ): Promise<string | null> {
    if (!this.webClient) return null;

    try {
      const list: any = await this.webClient.conversations.list({ types: "public_channel,private_channel", limit: 1000 });
      const existing = list.channels?.find((c: any) => c.name === channelName);

      if (existing?.id) {
        await this.webClient.conversations.join({ channel: existing.id }).catch(() => {});

        const currentAccounts = (emp.provisionedAccounts as Record<string, unknown>) || {};
        await db
          .update(employees)
          .set({
            provisionedAccounts: {
              ...currentAccounts,
              slack: { channelId: existing.id, channelName },
            },
            updatedAt: new Date(),
          })
          .where(eq(employees.id, employeeId));

        this.channelToEmployee.set(existing.id, {
          id: employeeId,
          name: emp.name,
          emoji: emp.emoji,
          jobTitle: emp.jobTitle,
          containerHost: emp.containerHost,
          containerPort: emp.containerPort,
          gatewayToken: emp.gatewayToken,
          slackChannelId: existing.id,
        });

        console.log(`[slack-proxy] Found existing channel #${channelName} (${existing.id}) for ${emp.name}`);
        return existing.id;
      }
    } catch (err) {
      console.error(`[slack-proxy] Failed to find existing channel ${channelName}:`, err);
    }
    return null;
  }

  /** Archive a Slack channel when an employee is terminated */
  async archiveEmployeeChannel(employeeId: string): Promise<void> {
    if (!this.webClient) return;

    const emp = await db.query.employees.findFirst({
      where: eq(employees.id, employeeId),
    });
    if (!emp) return;

    const accounts = (emp.provisionedAccounts as Record<string, unknown>) || {};
    const slackInfo = accounts.slack as Record<string, unknown> | undefined;
    const channelId = slackInfo?.channelId as string | undefined;

    if (channelId) {
      try {
        await this.webClient.conversations.archive({ channel: channelId });
        this.channelToEmployee.delete(channelId);
        console.log(`[slack-proxy] Archived channel ${channelId} for ${emp.name}`);
      } catch (err) {
        console.error(`[slack-proxy] Failed to archive channel ${channelId}:`, err);
      }
    }
  }

  /**
   * Fetch recent conversation history from a Slack channel and convert
   * to OpenAI-style messages so the AI employee has context of the conversation.
   */
  private async fetchChannelHistory(
    channelId: string,
    beforeTs?: string,
  ): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
    if (!this.webClient) return [];

    try {
      const result: any = await this.webClient.conversations.history({
        channel: channelId,
        limit: 50, // Last 50 messages for context
        ...(beforeTs ? { latest: beforeTs, inclusive: false } : {}),
      });

      const slackMessages: any[] = result.messages || [];

      // Slack returns newest-first — reverse to chronological order
      slackMessages.reverse();

      const history: Array<{ role: "user" | "assistant"; content: string }> = [];

      for (const msg of slackMessages) {
        const content = (msg.text || "").trim();
        if (!content) continue;

        // Skip subtypes we don't care about (channel_join, channel_topic, etc.)
        if (msg.subtype && msg.subtype !== "bot_message" && msg.subtype !== "file_share") continue;

        if (msg.bot_id || msg.subtype === "bot_message") {
          // Messages posted by our bot (the employee's responses)
          history.push({ role: "assistant", content });
        } else {
          // Human messages
          history.push({ role: "user", content });
        }
      }

      return history;
    } catch (err) {
      console.error(`[slack-proxy] Failed to fetch channel history for ${channelId}:`, err);
      return [];
    }
  }

  /** Handle incoming Slack messages */
  private async handleMessage(message: any, client: any): Promise<void> {
    if (message.bot_id || message.subtype === "bot_message") return;
    if (message.subtype && message.subtype !== "file_share") return;

    const channelId = message.channel as string;
    const text = message.text as string;

    if (!channelId || !text) return;

    let employee = this.channelToEmployee.get(channelId);
    if (!employee) return;

    // Re-fetch employee from DB to get latest container info
    const freshEmp = await db.query.employees.findFirst({
      where: eq(employees.id, employee.id),
    });
    if (!freshEmp || freshEmp.status !== "active") return;

    employee = {
      ...employee,
      containerHost: freshEmp.containerHost,
      containerPort: freshEmp.containerPort,
      gatewayToken: freshEmp.gatewayToken,
    };

    if (!employee.containerHost || !employee.containerPort) {
      await this.postAsEmployee(client, channelId, employee, "I'm still starting up — give me a moment!");
      return;
    }

    // Fetch recent conversation history from Slack so the employee has context
    const history = await this.fetchChannelHistory(channelId, message.ts);
    // Build messages array: history + current message
    const messages = [
      ...history,
      { role: "user" as const, content: text },
    ];

    const sendToContainer = (host: string) => {
      return fetch(`http://${host}:${employee.containerPort}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${employee.gatewayToken}`,
        },
        body: JSON.stringify({
          model: "default",
          messages,
        }),
      });
    };

    try {
      let res: Response;
      try {
        res = await sendToContainer(employee.containerHost!);
      } catch {
        // Container unreachable — IP may have changed after docker restart. Resolve fresh IP.
        const containerName = freshEmp.containerName;
        if (containerName) {
          try {
            const newIp = execSync(
              `docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${containerName}`,
              { timeout: 5000 },
            ).toString().trim();
            if (newIp && newIp !== employee.containerHost) {
              console.log(`[slack-proxy] IP changed for ${employee.name}: ${employee.containerHost} -> ${newIp}`);
              await db.update(employees).set({ containerHost: newIp, updatedAt: new Date() }).where(eq(employees.id, employee.id));
              employee.containerHost = newIp;
              res = await sendToContainer(newIp);
            } else {
              throw new Error("IP unchanged or empty");
            }
          } catch {
            throw new Error("Container unreachable after IP refresh");
          }
        } else {
          throw new Error("No container name");
        }
      }

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[slack-proxy] Container error for ${employee.name}:`, errText);
        await this.postAsEmployee(client, channelId, employee, "Hmm, I hit a snag processing that. Let me try again in a moment.");
        return;
      }

      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const reply = data.choices?.[0]?.message?.content || "I couldn't generate a response.";

      const chunks = splitMessage(reply, 3900);
      for (const chunk of chunks) {
        await this.postAsEmployee(client, channelId, employee, chunk);
      }
    } catch (err) {
      console.error(`[slack-proxy] Failed to proxy message to ${employee.name}:`, err);
      await this.postAsEmployee(client, channelId, employee, "I seem to be offline at the moment. My team will get me back up shortly.");
    }
  }

  /** Handle @mentions of the bot in shared channels */
  private async handleMention(event: any, client: any): Promise<void> {
    const text = (event.text as string || "").replace(/<@[A-Z0-9]+>/g, "").trim();
    const channelId = event.channel as string;

    if (!channelId || !text) return;

    const employee = this.channelToEmployee.get(channelId);
    if (employee) {
      await this.handleMessage({ ...event, text, channel: channelId }, client);
    }
  }

  /** Post a message as a specific employee, uploading any workspace images to Slack */
  private async postAsEmployee(
    client: any,
    channel: string,
    employee: EmployeeMapping,
    text: string,
  ): Promise<void> {
    try {
      // Extract workspace image paths from the response text
      const { cleanText, imagePaths } = extractWorkspaceImages(text, employee.id);

      // Post the text message (with image paths cleaned out)
      const messageText = cleanText.trim();
      if (messageText) {
        await client.chat.postMessage({
          channel,
          text: messageText,
          username: employee.name,
          icon_emoji: emojiToSlackIcon(employee.emoji) || ":robot_face:",
        });
      }

      // Upload each image to the Slack channel
      for (const imgPath of imagePaths) {
        try {
          await this.uploadImageToSlack(client, channel, employee, imgPath);
        } catch (uploadErr) {
          console.error(`[slack-proxy] Failed to upload image ${imgPath.hostPath}:`, uploadErr);
        }
      }
    } catch (err) {
      console.error(`[slack-proxy] Failed to post as ${employee.name}:`, err);
    }
  }

  /** Upload an image file from the employee's workspace to a Slack channel */
  private async uploadImageToSlack(
    client: any,
    channel: string,
    employee: EmployeeMapping,
    image: WorkspaceImage,
  ): Promise<void> {
    if (!existsSync(image.hostPath)) {
      console.warn(`[slack-proxy] Image file not found: ${image.hostPath}`);
      return;
    }

    const fileContent = readFileSync(image.hostPath);
    const filename = path.basename(image.hostPath);

    try {
      // Use files.uploadV2 (modern Slack API)
      await client.files.uploadV2({
        channel_id: channel,
        file: fileContent,
        filename,
        initial_comment: image.altText || undefined,
      });
    } catch (err: unknown) {
      // Fallback: if uploadV2 isn't available, try legacy upload
      const errorStr = err instanceof Error ? err.message : String(err);
      if (errorStr.includes("not a function") || errorStr.includes("uploadV2")) {
        try {
          await client.files.upload({
            channels: channel,
            file: fileContent,
            filename,
            initial_comment: image.altText || undefined,
          });
        } catch (legacyErr) {
          throw legacyErr;
        }
      } else {
        throw err;
      }
    }
  }

  /** Check if the proxy is running */
  isRunning(): boolean {
    return this.running;
  }

  /** Create Slack channels for all active employees that don't have one yet */
  async reconcileChannels(): Promise<Array<{ name: string; channelId: string | null }>> {
    if (!this.companyId || !this.webClient) return [];

    const emps = await db.query.employees.findMany({
      where: and(
        eq(employees.companyId, this.companyId),
        eq(employees.status, "active"),
      ),
    });

    const results: Array<{ name: string; channelId: string | null }> = [];
    for (const emp of emps) {
      const accounts = (emp.provisionedAccounts as Record<string, unknown>) || {};
      const slackInfo = accounts.slack as Record<string, unknown> | undefined;
      if (slackInfo?.channelId) {
        results.push({ name: emp.name, channelId: slackInfo.channelId as string });
        continue;
      }

      // No channel — create one
      console.log(`[slack-proxy] Reconcile: creating channel for ${emp.name}`);
      const channelId = await this.createEmployeeChannel(emp.id);
      results.push({ name: emp.name, channelId });
    }

    await this.refreshMappings();
    return results;
  }

  /**
   * Announce a new AI employee in #general so everyone in the workspace gets notified.
   * Uses <!everyone> so all members see the notification.
   */
  private async announceNewEmployee(
    emp: { name: string; emoji: string | null; jobTitle: string },
    channelId: string,
  ): Promise<void> {
    if (!this.webClient) return;

    try {
      // Find #general (or fall back to first public channel)
      const list: any = await this.webClient.conversations.list({
        types: "public_channel",
        limit: 200,
      });
      const general = list.channels?.find((c: any) => c.name === "general" && !c.is_archived);
      if (!general?.id) {
        console.log("[slack-proxy] No #general channel found, skipping new employee announcement");
        return;
      }

      // Join #general if not already a member
      await this.webClient.conversations.join({ channel: general.id }).catch(() => {});

      await this.webClient.chat.postMessage({
        channel: general.id,
        text: `<!everyone> ${emp.emoji || "\u{1F916}"} Meet *${emp.name}*, your new AI ${emp.jobTitle}! Head over to <#${channelId}> to chat with them.`,
        username: emp.name,
        icon_emoji: emojiToSlackIcon(emp.emoji) || ":robot_face:",
      });

      console.log(`[slack-proxy] Announced ${emp.name} in #general`);
    } catch (err) {
      // Non-fatal — don't block channel creation if announcement fails
      console.error(`[slack-proxy] Failed to announce ${emp.name} in #general:`, err);
    }
  }

  /** Post a message as an employee by employee ID (for use from other parts of the API) */
  async postMessageAsEmployee(employeeId: string, channelId: string, text: string): Promise<boolean> {
    if (!this.webClient) return false;

    const emp = await db.query.employees.findFirst({
      where: eq(employees.id, employeeId),
    });
    if (!emp) return false;

    try {
      const mapping: EmployeeMapping = {
        id: emp.id,
        name: emp.name,
        emoji: emp.emoji,
        jobTitle: emp.jobTitle,
        containerHost: emp.containerHost,
        containerPort: emp.containerPort,
        gatewayToken: emp.gatewayToken,
        slackChannelId: channelId,
      };
      await this.postAsEmployee(this.webClient, channelId, mapping, text);
      return true;
    } catch (err) {
      console.error(`[slack-proxy] Failed to post message as ${emp.name}:`, err);
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Image extraction — detects workspace image paths in employee responses
// and maps them to host filesystem paths for Slack upload.
// ---------------------------------------------------------------------------

const CONFIG_BASE = "/opt/ai-employees/openclaw-configs";

interface WorkspaceImage {
  /** Absolute path on the host filesystem */
  hostPath: string;
  /** Optional alt text / context from surrounding text */
  altText?: string;
}

/**
 * Extract workspace image paths from an employee response and return:
 * - cleanText: the response with image paths removed (to avoid showing raw paths in Slack)
 * - imagePaths: list of host-filesystem paths to upload
 *
 * Detects paths like:
 *   /home/node/.openclaw/workspace-main/screenshot.png
 *   /home/node/.openclaw/workspace/chart.jpg
 *   /home/node/.openclaw/media/browser/page.png
 */
function extractWorkspaceImages(
  text: string,
  employeeId: string,
): { cleanText: string; imagePaths: WorkspaceImage[] } {
  const imagePaths: WorkspaceImage[] = [];

  // Match container workspace paths that end with image extensions
  // Covers: /home/node/.openclaw/workspace-main/*, /home/node/.openclaw/workspace/*, /home/node/.openclaw/media/*
  const pathPattern = /(?:\/home\/node\/\.openclaw|~\/\.openclaw)\/((?:workspace-main|workspace|media)\/[^\s"'`)\]>]+\.(?:png|jpe?g|gif|webp|svg|bmp))/gi;

  // Also match markdown image syntax ![alt](path)
  const mdImagePattern = /!\[([^\]]*)\]\((\/home\/node\/\.openclaw|~\/\.openclaw)\/((?:workspace-main|workspace|media)\/[^\s)]+\.(?:png|jpe?g|gif|webp|svg|bmp))\)/gi;

  const seen = new Set<string>();

  // First pass: extract markdown images (these have alt text)
  let cleanText = text.replace(mdImagePattern, (_match, alt, _base, relPath) => {
    const hostPath = path.join(CONFIG_BASE, employeeId, relPath);
    if (!seen.has(hostPath)) {
      seen.add(hostPath);
      imagePaths.push({ hostPath, altText: alt || undefined });
    }
    return ""; // Remove from text
  });

  // Second pass: extract bare workspace paths
  cleanText = cleanText.replace(pathPattern, (_match, relPath) => {
    const hostPath = path.join(CONFIG_BASE, employeeId, relPath);
    if (!seen.has(hostPath)) {
      seen.add(hostPath);
      imagePaths.push({ hostPath });
    }
    return ""; // Remove from text
  });

  // Clean up leftover empty lines from removed paths
  cleanText = cleanText.replace(/\n{3,}/g, "\n\n");

  return { cleanText, imagePaths };
}

/** Split a long message into chunks at line boundaries */
function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt <= 0) splitAt = maxLen;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Singleton instance
let proxyInstance: SlackProxy | null = null;

/** Get or create the singleton Slack proxy */
export function getSlackProxy(): SlackProxy {
  if (!proxyInstance) {
    proxyInstance = new SlackProxy();
  }
  return proxyInstance;
}
