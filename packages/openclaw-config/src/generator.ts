/**
 * Generates an OpenClaw configuration (openclaw.json) for a single employee deployment.
 * Each employee gets their own isolated OpenClaw instance.
 */

export interface EmployeeInput {
  id: string;
  name: string;
  jobTitle: string;
  emoji?: string;
  persona?: string | null;
  goals?: string | null;
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
  agent: string;
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
    channels: buildChannels(employee.channels),
    bindings: buildBindings(agentId, employee.channels),
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

  return parts.join("\n");
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
    agent: agentId,
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
