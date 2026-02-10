/**
 * Generates an OpenClaw configuration (openclaw.json) for a single employee deployment.
 * Each employee gets their own isolated OpenClaw instance.
 *
 * Every employee automatically gets:
 *   - Webchat channel (for dashboard chat interface)
 *   - HTTP chat completions endpoint (OpenAI-compatible API)
 *   - Email channel (auto-provisioned address)
 *   - Browser tool access
 * Plus any additional channels selected during hiring.
 */

export interface EmployeeInput {
  id: string;
  name: string;
  jobTitle: string;
  emoji?: string;
  persona?: string | null;
  goals?: string | null;
  companySlug?: string;
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

export interface OpenClawConfig {
  gateway: {
    auth: { token: string };
    http: {
      endpoints: {
        chatCompletions: { enabled: boolean };
      };
    };
  };
  hooks: {
    enabled: boolean;
    token: string;
  };
  agents: {
    defaults: {
      model: { primary: string };
      sandbox: { mode: string; scope: string };
    };
    list: AgentConfig[];
  };
  channels: Record<string, ChannelConfig>;
  bindings: BindingConfig[];
  skills?: {
    entries: SkillEntry[];
  };
}

interface AgentConfig {
  id: string;
  default: boolean;
  workspace: string;
  model: { primary: string; fallbacks?: string[] };
  identity: { name: string; emoji: string };
  tools?: { profile?: string; allow?: string[]; deny?: string[] };
}

interface ChannelConfig {
  enabled: boolean;
  [key: string]: unknown;
}

interface BindingConfig {
  agentId: string;
  match: {
    channel: string;
    [key: string]: unknown;
  };
}

interface SkillEntry {
  name: string;
  path: string;
  enabled: boolean;
}

export function generateOpenClawConfig(
  employee: EmployeeInput,
  gatewayToken: string,
): OpenClawConfig {
  const agentId = slugify(employee.name);

  // Always include webchat channel for dashboard chat interface
  const allChannels = ensureDefaultChannels(employee.channels);

  const config: OpenClawConfig = {
    gateway: {
      auth: { token: gatewayToken },
      http: {
        endpoints: {
          chatCompletions: { enabled: true },
        },
      },
    },
    hooks: {
      enabled: true,
      token: gatewayToken,
    },
    agents: {
      defaults: {
        model: { primary: employee.modelConfig.primary },
        sandbox: { mode: "non-main", scope: "agent" },
      },
      list: [
        {
          id: agentId,
          default: true,
          workspace: `/home/node/.openclaw/workspace`,
          model: employee.modelConfig,
          identity: {
            name: employee.name,
            emoji: employee.emoji || "🤖",
          },
          ...(Object.keys(employee.toolsConfig).length > 0
            ? { tools: employee.toolsConfig }
            : {}),
        },
      ],
    },
    channels: buildChannels(allChannels),
    bindings: buildBindings(agentId, allChannels),
  };

  return config;
}

export function generateSoulMd(employee: EmployeeInput): string {
  const parts: string[] = [];

  parts.push(`# ${employee.name} — ${employee.jobTitle}`);
  parts.push("");

  if (employee.persona) {
    parts.push(employee.persona);
    parts.push("");
  }

  if (employee.goals) {
    parts.push("## Goals");
    parts.push(employee.goals);
    parts.push("");
  }

  parts.push("## Communication Guidelines");
  parts.push("- Be professional, clear, and concise");
  parts.push("- Proactively share progress and blockers");
  parts.push("- Ask clarifying questions when requirements are ambiguous");
  parts.push("- Tag relevant team members when their input is needed");
  parts.push("");

  parts.push("## Capabilities");
  parts.push("- You can send and receive emails");
  parts.push("- You can browse the web and research topics");
  parts.push("- You can create documents and reports");
  parts.push("- You can communicate via chat, email, and other channels");
  parts.push("- You have access to a sandboxed computer environment");
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

/** Ensure webchat channel is always present */
function ensureDefaultChannels(channels: ChannelInput[]): ChannelInput[] {
  const result = [...channels];

  // Always add webchat if not already present
  const hasWebchat = result.some((c) => c.type === "webchat");
  if (!hasWebchat) {
    result.push({
      type: "webchat",
      credentials: {},
      config: { welcomeMessage: "Hello! How can I help you today?" },
    });
  }

  return result;
}

function buildChannels(channels: ChannelInput[]): Record<string, ChannelConfig> {
  const result: Record<string, ChannelConfig> = {};

  for (const ch of channels) {
    switch (ch.type) {
      case "slack":
        result.slack = {
          enabled: true,
          ...ch.credentials,
          ...ch.config,
        };
        break;
      case "discord":
        result.discord = {
          enabled: true,
          ...ch.credentials,
          ...ch.config,
        };
        break;
      case "telegram":
        result.telegram = {
          enabled: true,
          ...ch.credentials,
          ...ch.config,
        };
        break;
      case "whatsapp":
        result.whatsapp = {
          enabled: true,
          ...ch.credentials,
          ...ch.config,
        };
        break;
      case "email":
        result.email = {
          enabled: true,
          ...ch.credentials,
          ...ch.config,
        };
        break;
      case "webchat":
        result.webchat = {
          enabled: true,
          ...ch.config,
        };
        break;
      default:
        result[ch.type] = {
          enabled: true,
          ...ch.credentials,
          ...ch.config,
        };
    }
  }

  return result;
}

function buildBindings(agentId: string, channels: ChannelInput[]): BindingConfig[] {
  return channels.map((ch) => ({
    agentId,
    match: {
      channel: ch.type,
    },
  }));
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
