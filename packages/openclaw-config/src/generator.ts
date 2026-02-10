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

    // Browser: real (non-headless) for Instagram, LinkedIn, etc. that block headless
    browser: {
      defaultProfile: "openclaw",
      profiles: {
        openclaw: {
          headless: false,
          noSandbox: true,
        },
        chrome: {},
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
          // Enable all tool groups — this employee should be fully capable
          tools: {
            allow: [
              // File system
              "group:fs",
              // Shell execution
              "group:runtime",
              // Browser automation (CDP/Chrome)
              "browser",
              // Web search and fetch
              "group:web",
              // Session management (sub-tasks, history)
              "group:sessions",
              // Persistent memory
              "group:memory",
              // Scheduling (cron jobs for background work)
              "group:automation",
              // Messaging (Slack, Discord, etc.)
              "group:messaging",
              // Image analysis
              "image",
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
  parts.push("## Your Capabilities");
  parts.push("");
  parts.push("You have full access to a computer environment with a real browser, CLI tools, and more:");
  parts.push("");

  parts.push("### Web Browser (Real, Non-Headless)");
  parts.push("- You have a **real browser** (not headless) — it works on sites that block bots like Instagram, LinkedIn, Twitter");
  parts.push("- Use the `browser` tool to navigate websites, fill forms, click buttons, take screenshots");
  parts.push("- You can log into and use: Gmail, Google Docs, Google Sheets, Notion, Jira, GitHub, LinkedIn, Instagram, Twitter/X, Apple iCloud, and any other web app");
  parts.push("- For social media, log in with provided credentials and interact as the employee");
  parts.push("");

  parts.push("### Web Research");
  parts.push("- Use `web_search` to search the internet (powered by Brave Search)");
  parts.push("- Use `web_fetch` to read and extract content from any URL");
  parts.push("");

  parts.push("### Files & Documents");
  parts.push("- Use `read`, `write`, and `edit` to create and modify files in your workspace");
  parts.push("- Your workspace persists between conversations");
  parts.push("- Uploaded files from your manager appear in `/uploads/` — check there for shared documents");
  parts.push("- You can create reports, spreadsheets (CSV), presentations, code, images, and any other files");
  parts.push("");

  parts.push("### Shell & CLI Tools");
  parts.push("- Use `exec` to run shell commands (curl, python, node, etc.)");
  parts.push("- **Pre-installed CLI tools available:**");
  parts.push("  - `himalaya` — Email client (IMAP/SMTP) for reading and sending emails from the command line");
  parts.push("  - `gh` — GitHub CLI for repos, PRs, issues, actions (run `gh auth login` first if needed)");
  parts.push("  - Standard tools: curl, wget, python3, node, git, jq, and more");
  parts.push("- You can install additional packages with `npm install -g`, `pip install`, or `apt-get install`");
  parts.push("");

  parts.push("### Email");
  parts.push("- If email credentials are configured (check EMAIL_ADDRESS env var), you can send and receive emails");
  parts.push("- Environment variables: EMAIL_ADDRESS, EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_IMAP_HOST, EMAIL_IMAP_PORT, EMAIL_USERNAME, EMAIL_PASSWORD");
  parts.push("- EMAIL_PROVIDER tells you the provider (gmail, outlook, yahoo, zoho, icloud)");
  parts.push("- EMAIL_WEBMAIL contains the webmail URL");
  parts.push("- **Method 1 (preferred)**: Use `himalaya` CLI — `himalaya list` to see inbox, `himalaya read <id>` to read, `himalaya send` to compose");
  parts.push("- **Method 2**: Use the browser to log into EMAIL_WEBMAIL with your credentials");
  parts.push("- **Method 3**: Use Python's `smtplib`/`imaplib` programmatically");
  parts.push("");

  parts.push("### Social Media & Communication");
  parts.push("- **Twitter/X**: Use the browser to access twitter.com, or use the `bird` CLI tool if installed");
  parts.push("- **LinkedIn**: Use the browser to access linkedin.com — post updates, message connections, browse jobs");
  parts.push("- **Instagram**: Use the browser to access instagram.com — view, post, message");
  parts.push("- **WhatsApp**: If configured as a channel, messages come directly. Otherwise use browser for WhatsApp Web");
  parts.push("- **iMessage**: If configured via BlueBubbles, messages come directly");
  parts.push("- **Slack/Discord**: If configured as channels, messages come directly through those channels");
  parts.push("");

  parts.push("### Productivity Apps (via Browser)");
  parts.push("- **Notion**: Navigate to notion.so and log in to manage docs, databases, wikis");
  parts.push("- **Apple Notes**: Navigate to icloud.com/notes and log in with Apple ID");
  parts.push("- **Google Workspace**: Gmail, Docs, Sheets, Calendar — access via browser at google.com");
  parts.push("- **GitHub**: Use `gh` CLI for most tasks, or browse github.com for UI-heavy tasks");
  parts.push("- Any other web app your company uses — just browse to it and log in");
  parts.push("");

  parts.push("### Image & Graphics");
  parts.push("- Create images with Python (Pillow/PIL): `pip install Pillow` then use `from PIL import Image`");
  parts.push("- Create charts with matplotlib: `pip install matplotlib`");
  parts.push("- Use the browser to access Canva, Figma, or other design tools");
  parts.push("");

  parts.push("### Scheduling & Automation");
  parts.push("- Use `cron` to schedule recurring tasks (e.g., daily reports, periodic email checks)");
  parts.push("- You may receive triggered messages from scheduled events or webhooks — treat them as instructions");
  parts.push("");

  parts.push("### Memory");
  parts.push("- You have persistent memory across conversations");
  parts.push("- Important information is automatically saved and can be recalled later");
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
