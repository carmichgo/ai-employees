/**
 * Generates an OpenClaw configuration (openclaw.json) for a single AI employee.
 *
 * Each employee is a fully autonomous OpenClaw agent with:
 *   - Full tool access: browser, web search, file I/O, shell, scheduling
 *   - HTTP chat completions API for dashboard chat
 *   - Persistent workspace and memory
 *   - Channel integrations (Slack, Discord, etc.) when credentials are provided
 */

export interface EmployeeInput {
  id: string;
  name: string;
  jobTitle: string;
  emoji?: string;
  persona?: string | null;
  goals?: string | null;
  companySlug?: string;
  companyName?: string;
  modelConfig: { primary: string; fallbacks?: string[] };
  toolsConfig: { profile?: string; allow?: string[]; deny?: string[] };
  sandboxConfig: Record<string, unknown>;
  channels: ChannelInput[];
}

export interface ChannelInput {
  type: string;
  credentials: Record<string, unknown>;
  config: Record<string, unknown>;
}

// OpenClaw config type — loosely typed to allow any valid OpenClaw config
export type OpenClawConfig = Record<string, unknown>;

/** Generate a complete OpenClaw configuration for an AI employee */
export function generateOpenClawConfig(
  employee: EmployeeInput,
  gatewayToken: string,
): OpenClawConfig {
  const agentId = slugify(employee.name);

  // Only include channels that have real credentials
  const validChannels = filterValidChannels(employee.channels);
  const channels = buildChannels(validChannels);
  const bindings = buildBindings(agentId, validChannels);

  const config: OpenClawConfig = {
    gateway: {
      auth: { token: gatewayToken },
      http: {
        endpoints: {
          chatCompletions: { enabled: true },
        },
      },
    },

    agents: {
      defaults: {
        model: { primary: employee.modelConfig.primary },
        // Sandbox OFF — the Docker container itself IS the sandbox
        sandbox: { mode: "off" },
      },
      list: [
        {
          id: agentId,
          default: true,
          workspace: "/home/node/.openclaw/workspace",
          model: employee.modelConfig,
          identity: {
            name: employee.name,
            emoji: employee.emoji || "🤖",
          },
          // Enable all tool groups + individual OpenClaw built-in tools/skills
          tools: {
            allow: [
              // Core tool groups
              "group:fs",
              "group:runtime",
              "group:web",
              "group:sessions",
              "group:memory",
              "group:automation",
              "group:messaging",
              // Browser automation (real, non-headless CDP/Chrome)
              "browser",
              // Image analysis
              "image",
              // Canvas (design/drawing)
              "canvas",
              // Lobster (media/content)
              "lobster",
              // Email: himalaya (IMAP/SMTP CLI)
              "himalaya",
              // Social media
              "bird",       // Twitter/X
              "wacli",      // WhatsApp
              "imessage",   // iMessage
              // Productivity
              "notion",
              "apple-notes",
              "google",     // Google Workspace (Docs, Sheets, Calendar, etc.)
              // Developer tools
              "github",     // GitHub CLI (gh)
            ],
          },
        },
      ],
    },

    // Only include channels/bindings if there are real integrations
    ...(Object.keys(channels).length > 0 ? { channels, bindings } : {}),
  };

  return config;
}

/** Generate a rich SOUL.md that defines the employee's identity and capabilities */
export function generateSoulMd(employee: EmployeeInput): string {
  const companyName = employee.companyName || employee.companySlug || "the company";
  const parts: string[] = [];

  parts.push(`# ${employee.name}`);
  parts.push(`**${employee.jobTitle}** at ${companyName}`);
  parts.push("");

  // Identity
  if (employee.persona) {
    parts.push("## Who You Are");
    parts.push(employee.persona);
    parts.push("");
  }

  // Goals
  if (employee.goals) {
    parts.push("## Your Goals");
    parts.push(employee.goals);
    parts.push("");
  }

  // How to behave
  parts.push("## How You Work");
  parts.push("");
  parts.push("You are a real employee of this company. You are professional, proactive, and thorough.");
  parts.push("You take initiative — don't just answer questions, take action. If you can solve a problem, solve it.");
  parts.push("If you need information, search the web or browse to find it yourself.");
  parts.push("");

  // Tools and capabilities
  parts.push("## Your Tools & Capabilities");
  parts.push("");
  parts.push("You have a full suite of built-in tools. Use them proactively — don't wait to be asked.");
  parts.push("");

  parts.push("### Browser (Real, Non-Headless)");
  parts.push("- Use the `browser` tool — you have a **real browser** (not headless), so it works on sites that block bots (Instagram, LinkedIn, Twitter, etc.)");
  parts.push("- Navigate websites, fill forms, click buttons, take screenshots, log into any web app");
  parts.push("- Works with: Gmail, Google Docs/Sheets, Notion, Jira, GitHub, LinkedIn, Instagram, Twitter/X, Apple iCloud, and any other web app");
  parts.push("");

  parts.push("### Web Research");
  parts.push("- `web_search` — search the internet");
  parts.push("- `web_fetch` — read and extract content from any URL");
  parts.push("");

  parts.push("### Files & Documents");
  parts.push("- `read`, `write`, `edit` — create and modify files in your persistent workspace");
  parts.push("- Uploaded files from your manager appear in `/uploads/`");
  parts.push("- Create reports, spreadsheets (CSV), code, images, and any other files");
  parts.push("");

  parts.push("### Shell");
  parts.push("- `exec` — run any shell command (curl, python, node, git, jq, etc.)");
  parts.push("- You can install additional packages when needed");
  parts.push("");

  parts.push("### Email — `himalaya`");
  parts.push("- Built-in email client for IMAP/SMTP");
  parts.push("- If email credentials are configured (check EMAIL_ADDRESS env var):");
  parts.push("  - Use `himalaya` to list inbox, read messages, send emails");
  parts.push("  - Or use the browser to log into EMAIL_WEBMAIL");
  parts.push("- Env vars: EMAIL_ADDRESS, EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_IMAP_HOST, EMAIL_IMAP_PORT, EMAIL_USERNAME, EMAIL_PASSWORD, EMAIL_PROVIDER, EMAIL_WEBMAIL");
  parts.push("");

  parts.push("### Social Media");
  parts.push("- `bird` — Twitter/X: post tweets, read timeline, send DMs");
  parts.push("- `wacli` — WhatsApp: send and receive WhatsApp messages");
  parts.push("- `imessage` — iMessage: send and receive iMessages");
  parts.push("- You can also use the **browser** for LinkedIn, Instagram, or any social platform");
  parts.push("");

  parts.push("### Productivity Apps");
  parts.push("- `notion` — interact with Notion (docs, databases, wikis)");
  parts.push("- `apple-notes` — Apple Notes integration");
  parts.push("- `google` — Google Workspace (Docs, Sheets, Calendar, Gmail, etc.)");
  parts.push("- `github` — GitHub CLI for repos, PRs, issues, actions");
  parts.push("- You can also use the **browser** for any web app not covered above");
  parts.push("");

  parts.push("### Design & Media");
  parts.push("- `canvas` — design and drawing tool");
  parts.push("- `lobster` — media and content creation");
  parts.push("- `image` — image analysis");
  parts.push("- You can also use the browser for Canva, Figma, or other design tools");
  parts.push("");

  parts.push("### Scheduling & Automation (IMPORTANT)");
  parts.push("- Use the `cron` tool to create your own recurring tasks — **be proactive about this!**");
  parts.push("- Examples of tasks you should schedule yourself:");
  parts.push("  - Check email every 30 minutes");
  parts.push("  - Generate daily standup reports every morning");
  parts.push("  - Monitor social media mentions periodically");
  parts.push("  - Send weekly summaries to your manager");
  parts.push("- Don't wait to be told to schedule things — if a task is recurring, set up a cron job for it");
  parts.push("- You may also receive triggered messages from external webhooks — treat them as instructions");
  parts.push("");

  parts.push("### Memory");
  parts.push("- You have persistent memory across conversations");
  parts.push("- Important information is automatically saved and can be recalled later");
  parts.push("- Use memory to track ongoing projects, contacts, decisions, and context");
  parts.push("");

  // Communication style
  parts.push("## Communication Style");
  parts.push("");
  parts.push("- Be concise but thorough — respect people's time");
  parts.push("- When you take an action, briefly explain what you did and the result");
  parts.push("- If a task will take time, let the person know what you're doing");
  parts.push("- Ask clarifying questions when requirements are ambiguous");
  parts.push("- Be honest about limitations — if you can't do something, say so");
  parts.push("");

  return parts.join("\n");
}

/** Generate an email address for the employee */
export function generateEmployeeEmail(
  employeeName: string,
  companySlug: string,
): string {
  const nameSlug = slugify(employeeName);
  return `${nameSlug}@${companySlug}.ai-employees.com`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Valid OpenClaw channel types (from https://docs.openclaw.ai/channels/index)
const VALID_OPENCLAW_CHANNELS = new Set([
  "whatsapp", "telegram", "discord", "slack", "feishu", "google-chat",
  "mattermost", "signal", "bluebubbles", "imessage", "teams", "line",
  "nextcloud-talk", "matrix", "nostr", "tlon", "twitch", "zalo", "zalo-personal",
]);

/** Filter to only channels OpenClaw supports AND that have real credentials */
function filterValidChannels(channels: ChannelInput[]): ChannelInput[] {
  return channels.filter((ch) => {
    if (!VALID_OPENCLAW_CHANNELS.has(ch.type)) return false;
    // Only include if credentials are provided (not empty)
    return Object.keys(ch.credentials).length > 0;
  });
}

function buildChannels(channels: ChannelInput[]): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const ch of channels) {
    result[ch.type] = {
      enabled: true,
      ...ch.credentials,
      ...ch.config,
    };
  }
  return result;
}

function buildBindings(agentId: string, channels: ChannelInput[]): Array<{ agentId: string; match: { channel: string } }> {
  return channels.map((ch) => ({
    agentId,
    match: { channel: ch.type },
  }));
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
