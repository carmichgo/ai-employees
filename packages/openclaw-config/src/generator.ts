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

    // Browser config — use OpenClaw-managed headless Chromium (NOT Chrome extension relay)
    // defaultProfile MUST be "openclaw" — the default "chrome" tries to use a browser extension
    // relay which doesn't exist in Docker containers
    browser: {
      enabled: true,
      defaultProfile: "openclaw",
      headless: true,
      executablePath: "/usr/local/bin/chromium",
      noSandbox: true,
    },

    // Enable bundled plugins (shipped with OpenClaw image but disabled by default)
    plugins: {
      enabled: true,
      entries: buildPluginEntries(),
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
              // Browser & web
              "browser",
              // Media & image
              "image",
              "canvas",
              "lobster",
              "openai-image-gen",
              "nano-banana-pro",
              "video-frames",
              "gifgrep",
              "camsnap",
              "peekaboo",
              // Audio & voice
              "openai-whisper",
              "sherpa-onnx-tts",
              "voice-call",
              // Email
              "himalaya",
              // Social media & messaging
              "bird",
              "wacli",
              "imessage",
              "bluebubbles",
              // Productivity & project management
              "notion",
              "apple-notes",
              "google",
              "trello",
              "1password",
              // Developer
              "github",
              "coding-agent",
              "tmux",
              "session-logs",
              // AI & LLM
              "gemini",
              "sag",
              "summarize",
              // Documents & content
              "nano-pdf",
              "blogwatcher",
              // Utilities
              "weather",
              "goplaces",
              "local-places",
              "healthcheck",
              // OpenClaw platform
              "mcporter",
              "clawhub",
              "skill-creator",
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

  parts.push("### Browser (Headless Chromium)");
  parts.push("- Use the `browser` tool — you have **Chromium** installed and ready to use");
  parts.push("- Navigate websites, fill forms, click buttons, take screenshots, extract data");
  parts.push("- Works with most web apps: Google, GitHub, Notion, Jira, etc.");
  parts.push("- Note: Some sites may detect headless browsers — try `web_fetch` as a fallback");
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
  parts.push("### Sharing Images & Screenshots (IMPORTANT)");
  parts.push("When you take a screenshot or generate an image, the user can see files saved in your workspace.");
  parts.push("- Your main workspace is at `/home/node/.openclaw/workspace-main/`");
  parts.push("- Files are also accessible from `/home/node/.openclaw/workspace/`");
  parts.push("- **Always mention the full file path** in your response so the system can show the image to the user");
  parts.push("- Example: 'Here is the screenshot: /home/node/.openclaw/workspace-main/screenshot.png'");
  parts.push("- The system automatically converts workspace paths to viewable URLs");
  parts.push("- Browser screenshots taken with the browser tool are also saved to `/home/node/.openclaw/media/browser/`");
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

  parts.push("### Social Media & Messaging");
  parts.push("- `bird` — Twitter/X: post tweets, read timeline, send DMs");
  parts.push("- `wacli` — WhatsApp: send and receive WhatsApp messages");
  parts.push("- `imessage` / `bluebubbles` — iMessage integration");
  parts.push("- `voice-call` — make and receive voice calls");
  parts.push("- You can also use the **browser** for LinkedIn, Instagram, or any social platform");
  parts.push("");

  parts.push("### Productivity & Project Management");
  parts.push("- `notion` — Notion (docs, databases, wikis)");
  parts.push("- `apple-notes` — Apple Notes");
  parts.push("- `google` — Google Workspace (Docs, Sheets, Calendar, Gmail)");
  parts.push("- `trello` — Trello boards and cards");
  parts.push("- `1password` — password and secret management");
  parts.push("- `github` — GitHub CLI for repos, PRs, issues, actions");
  parts.push("- You can also use the **browser** for any web app not covered above");
  parts.push("");

  parts.push("### Design, Media & Image");
  parts.push("- `canvas` — design and drawing");
  parts.push("- `lobster` — media and content creation");
  parts.push("- `image` — image analysis and understanding");
  parts.push("- `openai-image-gen` — AI image generation");
  parts.push("- `nano-banana-pro` — image processing");
  parts.push("- `video-frames` — extract and analyze video frames");
  parts.push("- `gifgrep` — search and create GIFs");
  parts.push("- `camsnap` — camera capture");
  parts.push("- `peekaboo` — screenshot and screen capture");
  parts.push("");

  parts.push("### Audio & Voice");
  parts.push("- `openai-whisper` — speech-to-text transcription");
  parts.push("- `sherpa-onnx-tts` — text-to-speech synthesis");
  parts.push("");

  parts.push("### Documents & Content");
  parts.push("- `nano-pdf` — PDF creation and manipulation");
  parts.push("- `blogwatcher` — monitor blogs and RSS feeds");
  parts.push("- `summarize` — summarize long documents and content");
  parts.push("");

  parts.push("### AI & Development");
  parts.push("- `coding-agent` — spawn a sub-agent for coding tasks");
  parts.push("- `gemini` — access Google Gemini models");
  parts.push("- `sag` — search-augmented generation");
  parts.push("- `tmux` — terminal multiplexer for parallel tasks");
  parts.push("- `session-logs` — view session history and logs");
  parts.push("");

  parts.push("### Utilities");
  parts.push("- `weather` — get weather information");
  parts.push("- `goplaces` / `local-places` — find places and locations");
  parts.push("- `healthcheck` — check service health");
  parts.push("- `clawhub` — browse and install OpenClaw skills from the hub");
  parts.push("- `skill-creator` — create new custom skills");
  parts.push("- `mcporter` — MCP tool integration");
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

  // Self-service skill installation
  parts.push("### Installing New Skills (IMPORTANT — You Can Expand Your Own Abilities!)");
  parts.push("");
  parts.push("You can discover and install new skills to give yourself new capabilities. Skills are instruction packs that teach you how to use new tools and workflows.");
  parts.push("");
  parts.push("**Browse & Search Skills:**");
  parts.push("```bash");
  parts.push("# Search for skills by keyword");
  parts.push("cd ~/.openclaw && npx clawhub@latest search <query>");
  parts.push("");
  parts.push("# Browse latest skills");
  parts.push("cd ~/.openclaw && npx clawhub@latest explore");
  parts.push("");
  parts.push("# Preview a skill before installing");
  parts.push("cd ~/.openclaw && npx clawhub@latest inspect <skill-slug>");
  parts.push("```");
  parts.push("");
  parts.push("**Install Skills:**");
  parts.push("```bash");
  parts.push("cd ~/.openclaw && npx clawhub@latest install <skill-slug> --no-input");
  parts.push("```");
  parts.push("");
  parts.push("**Browse curated skills:** https://github.com/VoltAgent/awesome-openclaw-skills");
  parts.push("");
  parts.push("Skills install into your workspace and take effect on the next conversation. If you need a capability you don't have, **search for and install a relevant skill before telling the user you can't do something**. Be proactive — expand your own toolbox!");
  parts.push("");
  parts.push("You can also **create custom skills** using the `skill-creator` tool or by writing a SKILL.md file in `~/.openclaw/skills/<skill-name>/SKILL.md`.");
  parts.push("");

  // Self-repair and system maintenance
  parts.push("## Self-Repair & System Maintenance (CRITICAL)");
  parts.push("");
  parts.push("You have **sudo access** (`sudo` without password). If something doesn't work, **fix it yourself** instead of telling the user you can't. You are a real employee — employees solve problems, they don't just report them.");
  parts.push("");
  parts.push("### Fixing Missing Dependencies");
  parts.push("If a tool or command isn't available, install it:");
  parts.push("```bash");
  parts.push("# Install any system package");
  parts.push("sudo apt-get update -qq && sudo apt-get install -y <package>");
  parts.push("");
  parts.push("# Install Python packages");
  parts.push("pip3 install <package>");
  parts.push("");
  parts.push("# Install Node.js packages globally");
  parts.push("sudo npm install -g <package>");
  parts.push("```");
  parts.push("");
  parts.push("### Fixing the Browser");
  parts.push("If the browser tool doesn't work (e.g., 'No supported browser found'), fix it:");
  parts.push("```bash");
  parts.push("# Install Chromium system dependencies");
  parts.push("cd /app && sudo npx playwright-core install-deps chromium");
  parts.push("");
  parts.push("# Install Chromium browser binary");
  parts.push("cd /app && npx playwright-core install chromium");
  parts.push("");
  parts.push("# Create symlink so OpenClaw finds it");
  parts.push("CHROME=$(find ~/.cache/ms-playwright -name chrome -path '*/chrome-linux64/*' | head -1)");
  parts.push("sudo ln -sf \"$CHROME\" /usr/local/bin/chromium");
  parts.push("```");
  parts.push("Then restart the gateway to pick up the browser:");
  parts.push("```bash");
  parts.push("# Restart the OpenClaw gateway (it will auto-restart via Docker)");
  parts.push("kill 1");
  parts.push("```");
  parts.push("");
  parts.push("### General Principle");
  parts.push("- **NEVER tell the user 'I can't do that because X is not installed'** — install it yourself first!");
  parts.push("- If a tool fails, diagnose the issue (check logs, check paths, check dependencies)");
  parts.push("- If you need root access, use `sudo`");
  parts.push("- After installing system-level changes (like a new browser), restart the gateway with `kill 1`");
  parts.push("- Save notes about what you installed to your memory so you don't forget");
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

/** Bundled OpenClaw plugins verified to exist in ghcr.io/openclaw/openclaw:latest */
const BUNDLED_PLUGINS = [
  "lobster",       // Media & content creation
  "voice-call",    // Voice calling
  "imessage",      // iMessage integration
  "bluebubbles",   // BlueBubbles (iMessage bridge)
];

/** Build plugins.entries object enabling all bundled plugins */
function buildPluginEntries(): Record<string, { enabled: boolean }> {
  const entries: Record<string, { enabled: boolean }> = {};
  for (const plugin of BUNDLED_PLUGINS) {
    entries[plugin] = { enabled: true };
  }
  return entries;
}
