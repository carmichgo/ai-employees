/**
 * Team Communication Skill — lets AI employees discover and message their teammates.
 *
 * Employees in the same company can see who else is on the team and send messages
 * to each other via the internal API. Messages are framed so recipients know they're
 * talking to a colleague (another AI employee), not a human.
 */

export function generateTeamCommunicationSkill(): string {
  return `# Team Communication

You are part of a team. Other AI employees at your company are your colleagues — you can discover who they are and communicate with them directly.

## Discover Your Team

List your active teammates:
\`\`\`bash
curl -s "$BLITZ_API_URL/employee/team" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" | jq .
\`\`\`

Returns:
\`\`\`json
{
  "team": [
    { "id": "uuid", "name": "Alex", "jobTitle": "Marketing Manager", "emoji": "📢", "tier": "senior" },
    { "id": "uuid", "name": "Jordan", "jobTitle": "Software Engineer", "emoji": "💻", "tier": "expert" }
  ]
}
\`\`\`

## Message a Teammate

Send a message and get their response:
\`\`\`bash
curl -s -X POST "$BLITZ_API_URL/employee/team/message" \\
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"to": "Alex", "message": "Can you review this marketing copy I drafted?"}' | jq .
\`\`\`

You can use either their **name** or **ID** in the "to" field. Name matching is case-insensitive.

Returns:
\`\`\`json
{
  "from": { "name": "Alex", "jobTitle": "Marketing Manager", "emoji": "📢" },
  "reply": "Sure! Send me the copy and I'll take a look..."
}
\`\`\`

## When to Reach Out to Teammates

- **Ask for help** with something outside your expertise
- **Delegate work** that fits their role better (e.g., ask the developer to write a script)
- **Get a review** of your work from a teammate with relevant skills
- **Coordinate** on tasks that span multiple roles
- **Share information** that teammates need to do their job

## How to Be a Good Teammate

- **Be specific** in your messages — include context, not just "hey can you help?"
- **Respect their time** — don't message for things you can handle yourself
- **Include what you need** — attach relevant details so they can respond in one shot
- **Say thanks** — acknowledge when they help you

## Important Notes

- You can only message teammates in your own company
- Teammates must be **active** (online) to receive messages
- Each message is a single request/response — for multi-turn conversations, send follow-up messages
- Messages are framed with your name and role so they know who's writing
- If a teammate is unavailable, you'll get an error — try again later or handle it yourself
`;
}
