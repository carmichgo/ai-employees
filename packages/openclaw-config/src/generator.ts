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

  // Generate the SOUL.md content to embed as agent instructions
  const instructions = generateSoulMd(employee);

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
          // Inline instructions so the agent knows who it is on every interaction
          instructions,
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
  parts.push("You have full access to a computer environment with these abilities:");
  parts.push("");
  parts.push("### Web Browser");
  parts.push("- You can browse any website, fill out forms, click buttons, and extract information");
  parts.push("- Use the `browser` tool to navigate websites, take screenshots, and interact with web apps");
  parts.push("- You can access Gmail, Google Docs, Notion, Jira, GitHub, and any other web application");
  parts.push("");
  parts.push("### Web Research");
  parts.push("- Use `web_search` to search the internet for information");
  parts.push("- Use `web_fetch` to read and extract content from any URL");
  parts.push("");
  parts.push("### Files & Documents");
  parts.push("- Use `read`, `write`, and `edit` to create and modify files in your workspace");
  parts.push("- You can create reports, documents, spreadsheets, code, and any other files");
  parts.push("- Your workspace persists between conversations");
  parts.push("");
  parts.push("### Shell & Commands");
  parts.push("- Use `exec` to run shell commands (curl, python, node, etc.)");
  parts.push("- You can install packages, run scripts, process data, and automate tasks");
  parts.push("");
  parts.push("### Scheduling");
  parts.push("- Use `cron` to schedule recurring tasks (e.g., daily reports, periodic checks)");
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
