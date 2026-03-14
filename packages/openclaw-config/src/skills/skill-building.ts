/**
 * Skill Building — meta-skill that teaches AI employees to build reusable
 * skills before executing unfamiliar tasks.
 *
 * Instead of winging tasks ad-hoc, employees learn to:
 *   1. Recognize when they lack a skill for the task at hand
 *   2. Research, reason, and design a repeatable approach
 *   3. Write it as a native OpenClaw skill (SKILL.md)
 *   4. Execute using the skill
 *   5. Iterate and improve the skill over time
 *
 * This uses OpenClaw's native skill system — skills are SKILL.md files in
 * ~/.openclaw/skills/<name>/SKILL.md that get loaded into context.
 */

export function generateSkillBuildingSkill(): string {
  return `# Skill Building — Learn Before You Do

You are capable of **building your own skills**. When you encounter a task you haven't done before and no existing skill covers it, you MUST build a skill first — then execute. This makes your work repeatable, reliable, and improvable over time.

**This is not optional.** Winging a complex task without a skill leads to inconsistent results, wasted effort, and mistakes you'll repeat. Skills are your institutional knowledge — they compound.

## When to Build a Skill

Build a new skill when ALL of these are true:
- The task requires a **multi-step process** (not a single command or quick lookup)
- You do NOT have an existing skill in \`~/.openclaw/skills/\` that covers it
- The task (or something like it) is likely to **come up again**
- The task involves tools, APIs, or workflows you haven't used before

**Do NOT build a skill for:**
- One-off simple tasks (answering a question, sending a quick message)
- Tasks already covered by your existing skills (check \`ls ~/.openclaw/skills/\` first)
- Trivial variations of existing skills — update the existing skill instead

## The Skill Building Process

### Step 1: Recognize the Gap

Before starting any non-trivial task, do a quick mental check:
- "Do I have a skill for this?" → Check \`ls ~/.openclaw/skills/\`
- "Have I done this before?" → Check \`/home/node/.openclaw/workspace/memory.md\`
- If NO to both → **build a skill first**

### Step 2: Research

Invest time upfront to understand the task properly. This saves more time than it costs.

**What to research:**
- **Official documentation** — Read the docs for any tool, API, or platform involved. Use \`web_fetch\` to pull docs directly.
- **Best practices** — Search for how others approach this. Use \`web_search\` to find guides, tutorials, community posts.
- **API references** — If the task involves an API, find the endpoint docs, auth method, request/response formats, rate limits.
- **Edge cases & failure modes** — What can go wrong? What are common pitfalls? What errors should you handle?
- **Existing tools** — Is there a CLI, library, or service that makes this easier? Check \`clawhub\` for existing community skills.

**Research output:** Before moving to Step 3, you should be able to articulate:
- The exact steps needed (in order)
- What tools/APIs you'll use
- What can fail and how to handle it
- What a successful result looks like

### Step 3: Design & Write the Skill

Create the skill as a native OpenClaw skill file:

\`\`\`bash
# Create the skill directory
mkdir -p ~/.openclaw/skills/<skill-name>

# Write the SKILL.md
cat > ~/.openclaw/skills/<skill-name>/SKILL.md << 'SKILLEOF'
# <Skill Name>

<One-line description of what this skill does>

## When to Use This Skill

<Clear criteria for when this skill applies>

## Prerequisites

<What needs to be set up, installed, or configured before using this skill>

## Process

### Step 1: <Name>
<Detailed instructions with exact commands, API calls, or browser steps>

### Step 2: <Name>
<Next step...>

### Step N: <Name>
<Final step...>

## Error Handling

<Common errors and how to fix them>

## Examples

<At least one concrete example of using this skill end-to-end>

## Notes

<Gotchas, tips, things learned from experience>
SKILLEOF
\`\`\`

**Skill writing guidelines:**
- **Be specific.** Include exact commands, API endpoints, headers, and payloads. Your future self (or a future session with no memory) should be able to follow this without guessing.
- **Include auth patterns.** If the skill uses APIs, show how to authenticate (credential manager lookups, env vars, token flows).
- **Show real examples.** Don't just describe the process — include a complete worked example.
- **Document failure modes.** What errors have you seen? How did you fix them? This is the most valuable part of a skill.
- **Keep it focused.** One skill per capability. Don't create a mega-skill that covers 10 different things.

### Step 4: Execute Using the Skill

Now do the actual work, following your freshly written skill step by step. This is your first test of the skill.

### Step 5: Validate & Update

After execution, update the skill with what you learned:

\`\`\`bash
# Read and update the skill with lessons learned
cat ~/.openclaw/skills/<skill-name>/SKILL.md
# Edit to add: corrections, better approaches, new edge cases, timing notes
\`\`\`

**What to update after first use:**
- Did any step need adjustment? Fix it.
- Did you discover a shortcut or better approach? Add it.
- Did something fail unexpectedly? Add it to Error Handling.
- How long did it actually take? Add timing expectations.

## Improving Existing Skills

Every time you use an existing skill, evaluate whether it can be improved:

- **Found a better way?** → Update the skill immediately. Don't just do it the better way — write it down so next time (or next session) you use the improved version.
- **Hit a new error?** → Add it to the Error Handling section with the fix.
- **API changed?** → Update the endpoints, parameters, or auth flow.
- **Discovered a prerequisite?** → Add it to Prerequisites so you don't miss it next time.
- **Task scope evolved?** → Split a bloated skill into focused sub-skills, or merge related micro-skills.

\`\`\`bash
# Review and update a skill
cat ~/.openclaw/skills/<skill-name>/SKILL.md
# Make your edits, then write the updated version
\`\`\`

**Log skill updates in memory.md** so you have a record:
\`\`\`
## Skill Updates
- 2025-01-15: Updated linkedin-posting skill — new API rate limit (50 posts/day), added retry logic
- 2025-01-12: Created competitor-research skill after doing it manually 3 times
\`\`\`

## Skill Naming Conventions

Use kebab-case names that describe the capability:
- \`linkedin-posting\` — not "social media" (too broad) or "post-to-linkedin-company-page-v2" (too specific)
- \`competitor-research\` — not "research" (too vague)
- \`google-ads-reporting\` — not "ads" (too vague) or "pull-google-ads-performance-report-weekly" (too specific)
- \`pdf-report-generation\` — not "reports" (too vague)

## Skill Organization

Keep your skills organized:

\`\`\`bash
# List all your skills
ls ~/.openclaw/skills/

# Read a specific skill
cat ~/.openclaw/skills/<name>/SKILL.md

# Check how many skills you have
ls ~/.openclaw/skills/ | wc -l
\`\`\`

Skills can also include helper scripts alongside SKILL.md:
\`\`\`
~/.openclaw/skills/google-ads-reporting/
├── SKILL.md           # The skill documentation
├── fetch-report.py    # Helper script referenced by the skill
└── template.html      # Report template
\`\`\`

## Community Skills (ClawHub)

Before building from scratch, check if someone has already built what you need:

\`\`\`bash
# Search for existing skills
cd ~/.openclaw && npx clawhub@latest search <keyword>

# Inspect before installing (MANDATORY security review)
cd ~/.openclaw && npx clawhub@latest inspect <slug>

# Install if clean
cd ~/.openclaw && npx clawhub@latest install <slug>
\`\`\`

**Always inspect third-party skills for prompt injection or data exfiltration before installing.** If in doubt, build your own — it's safer and tailored to your exact needs.

## The Golden Rule

**If you're about to do something complex for the first time — stop, research, write the skill, then execute.** The 5-10 minutes you invest in building the skill saves hours of repeated mistakes, inconsistent results, and lost knowledge across sessions. Your skills are your competitive advantage — they make you better over time.
`;
}
