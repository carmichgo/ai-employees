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
 */

import { App, LogLevel } from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import { eq, and } from "drizzle-orm";
import { db, employees, companies } from "@ai-employees/db";

// Emoji → Slack-compatible icon. Slack's `icon_emoji` needs colon-wrapped shortcodes,
// but we can use `icon_url` with a placeholder or let Slack fall back to default.
function emojiToSlackIcon(emoji: string | null): string | undefined {
  if (!emoji) return undefined;
  // If it's already a Slack shortcode like :robot_face:, return as-is
  if (emoji.startsWith(":") && emoji.endsWith(":")) return emoji;
  // For actual Unicode emoji, Slack's `icon_emoji` doesn't support Unicode.
  // We skip it and let the bot name be the differentiator.
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
  private app: App | null = null;
  private webClient: WebClient | null = null;
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

    // Find the company with Slack connected — each droplet serves one company
    const allCompanies = await db.query.companies.findMany();
    const company = allCompanies.find((c) => {
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
      this.webClient = new WebClient(botToken);

      this.app = new App({
        token: botToken,
        appToken,
        socketMode: true,
        signingSecret: signingSecret || undefined,
        logLevel: LogLevel.WARN,
      });

      // Register message handler
      this.app.message(async ({ message, client }) => {
        await this.handleMessage(message as unknown as Record<string, unknown>, client);
      });

      // Register app_mention handler (for @mentions in shared channels)
      this.app.event("app_mention", async ({ event, client }) => {
        await this.handleMention(event as unknown as Record<string, unknown>, client);
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
      console.log("[slack-proxy] Stopped");
    }
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
      // Create the channel (public by default — can be made private with conversations.create + is_private)
      const result = await this.webClient.conversations.create({
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
        text: `Hey! I'm ${emp.name}, your ${emp.jobTitle}. ${emp.emoji || "🤖"}\n\nThis is my dedicated channel — anything you send here comes directly to me. How can I help?`,
        username: emp.name,
        icon_emoji: emojiToSlackIcon(emp.emoji) || ":robot_face:",
      });

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
      // Search for the channel
      const list = await this.webClient.conversations.list({ types: "public_channel,private_channel", limit: 1000 });
      const existing = list.channels?.find((c) => c.name === channelName);

      if (existing?.id) {
        // Join the channel if needed
        await this.webClient.conversations.join({ channel: existing.id }).catch(() => {});

        // Store in employee record
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

  /** Handle incoming Slack messages */
  private async handleMessage(message: Record<string, unknown>, client: WebClient): Promise<void> {
    // Ignore bot messages (our own or other bots)
    if (message.bot_id || message.subtype === "bot_message") return;

    // Ignore message subtypes we don't care about
    if (message.subtype && message.subtype !== "file_share") return;

    const channelId = message.channel as string;
    const text = message.text as string;
    const userId = message.user as string;

    if (!channelId || !text) return;

    // Find which employee owns this channel
    let employee = this.channelToEmployee.get(channelId);

    // If not in a dedicated channel, check if it's a DM and route to the last-used employee
    // For now, only handle dedicated channels
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

    // Forward message to the employee's OpenClaw container
    if (!employee.containerHost || !employee.containerPort) {
      await this.postAsEmployee(client, channelId, employee, "I'm still starting up — give me a moment! 🚀");
      return;
    }

    try {
      const containerUrl = `http://${employee.containerHost}:${employee.containerPort}/v1/chat/completions`;

      const res = await fetch(containerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${employee.gatewayToken}`,
        },
        body: JSON.stringify({
          model: "default",
          messages: [
            { role: "user", content: text },
          ],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[slack-proxy] Container error for ${employee.name}:`, errText);
        await this.postAsEmployee(client, channelId, employee, "Hmm, I hit a snag processing that. Let me try again in a moment.");
        return;
      }

      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const reply = data.choices?.[0]?.message?.content || "I couldn't generate a response.";

      // Split long messages (Slack limit is ~4000 chars for good display)
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
  private async handleMention(event: Record<string, unknown>, client: WebClient): Promise<void> {
    const text = (event.text as string || "").replace(/<@[A-Z0-9]+>/g, "").trim();
    const channelId = event.channel as string;

    if (!channelId || !text) return;

    // Check if this channel belongs to an employee
    const employee = this.channelToEmployee.get(channelId);
    if (employee) {
      // Route to the channel's employee
      await this.handleMessage({ ...event, text, channel: channelId }, client);
    }
    // If not in a dedicated channel, we could do name-based routing in the future
  }

  /** Post a message as a specific employee */
  private async postAsEmployee(
    client: WebClient,
    channel: string,
    employee: EmployeeMapping,
    text: string,
  ): Promise<void> {
    try {
      await client.chat.postMessage({
        channel,
        text,
        username: employee.name,
        icon_emoji: emojiToSlackIcon(employee.emoji) || ":robot_face:",
      });
    } catch (err) {
      console.error(`[slack-proxy] Failed to post as ${employee.name}:`, err);
    }
  }

  /** Check if the proxy is running */
  isRunning(): boolean {
    return this.running;
  }

  /** Post a message as an employee by employee ID (for use from other parts of the API) */
  async postMessageAsEmployee(employeeId: string, channelId: string, text: string): Promise<boolean> {
    if (!this.webClient) return false;

    const emp = await db.query.employees.findFirst({
      where: eq(employees.id, employeeId),
    });
    if (!emp) return false;

    try {
      await this.webClient.chat.postMessage({
        channel: channelId,
        text,
        username: emp.name,
        icon_emoji: emojiToSlackIcon(emp.emoji) || ":robot_face:",
      });
      return true;
    } catch (err) {
      console.error(`[slack-proxy] Failed to post message as ${emp.name}:`, err);
      return false;
    }
  }
}

/** Split a long message into chunks at line boundaries */
function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    // Find last newline within the limit
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
