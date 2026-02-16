/**
 * Account Creation Skill — generates SKILL.md content for the Blitzer container.
 *
 * Teaches AI employees how to create accounts on websites using:
 *   - Browser automation for filling forms
 *   - Credential manager for secure storage
 *   - Captcha solving for bypassing verification
 *   - Email verification handling
 */
export function generateAccountCreationSkill() {
    return `# Account Creation

You can create accounts on websites and services on behalf of your company. This skill covers the full workflow: registration, email verification, 2FA setup, and secure credential storage.

## Prerequisites
- **Browser tool** — for navigating registration pages
- **Credential Manager** (\`cred\`) — for securely storing created credentials
- **Captcha Solving** — for handling CAPTCHAs during registration (if needed)
- **Email** (\`himalaya\` or browser) — for receiving verification emails

## Standard Account Creation Workflow

### Step 1: Plan the Registration
Before starting, gather:
- The target service URL (e.g., https://example.com/signup)
- Required information (name, email, password, company name, etc.)
- Which email address to use (check \`EMAIL_ADDRESS\` env var or ask your manager)
- Whether a CAPTCHA solver is needed (check the signup page first)

### Step 2: Generate Strong Credentials
\`\`\`bash
# Generate a secure random password (20 chars, mixed case + numbers + symbols)
PASSWORD=$(node -e "
  const crypto = require('crypto');
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let pw = '';
  const bytes = crypto.randomBytes(20);
  for (let i = 0; i < 20; i++) pw += chars[bytes[i] % chars.length];
  process.stdout.write(pw);
")
echo "Generated password (store it securely, don't log it)"
\`\`\`

### Step 3: Navigate and Fill the Registration Form
Use the browser tool to:
1. Go to the signup/registration page
2. Fill in each field carefully
3. If a CAPTCHA appears, use the captcha solving skill
4. Submit the form

**Browser Tips:**
- Wait for pages to fully load before interacting
- Use \`document.querySelector()\` to verify elements exist before clicking
- Take a screenshot after each major step for debugging
- If a field requires a specific format (e.g., phone number), format it correctly

### Step 4: Handle Email Verification
Most services send a verification email. Handle it:

\`\`\`bash
# Option A: Check email via himalaya CLI
himalaya list -f INBOX | head -20
# Find the verification email, read it:
himalaya read <message-id>
# Extract the verification link from the email body

# Option B: Check email via browser (webmail)
# Navigate to the webmail URL and find the verification email
\`\`\`

Then use the browser to click the verification link or enter the verification code.

### Step 5: Store Credentials Securely
**CRITICAL: Always store credentials immediately after creation.**

\`\`\`bash
# Store the account credentials
cred store <service-name> email "user@example.com"
cred store <service-name> username "username123"
cred store <service-name> password "the-generated-password"
cred store <service-name> url "https://example.com/login"
cred store <service-name> created_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cred store <service-name> notes "Created for <purpose>"
\`\`\`

### Step 6: Verify the Account Works
\`\`\`bash
# Log out and log back in to verify credentials work
# Use the browser to:
# 1. Navigate to the login page
# 2. Enter the stored credentials
# 3. Verify successful login
# 4. Take a screenshot as proof
\`\`\`

## Handling Common Challenges

### CAPTCHAs
If a registration form has a CAPTCHA:
1. **Try CapSolver first** — if the extension is installed, it auto-solves most CAPTCHAs
2. **Fall back to 2captcha CLI** — for image CAPTCHAs or if CapSolver doesn't trigger
3. See the **Captcha Solving** skill for detailed instructions

### Phone Number Verification
Some services require a phone number:
- Ask your manager if they can provide a phone number for verification
- Check if the service offers alternative verification (email, authenticator app)
- Some services accept VoIP numbers — try the company's phone if available

### Two-Factor Authentication (2FA)
If the service offers or requires 2FA:
\`\`\`bash
# For TOTP (Google Authenticator style):
# 1. When shown the QR code/secret, save the TOTP secret
cred store <service-name> totp_secret "THE_BASE32_SECRET"

# 2. Generate TOTP codes when needed:
# Install oathtool if not present
sudo apt-get install -y -qq oathtool 2>/dev/null
oathtool --totp -b "$(cred get-raw <service-name> totp_secret)"
\`\`\`

### Rate Limiting / Anti-Bot Detection
- Add random delays (2-5 seconds) between actions
- Don't rush through forms — simulate human-like pace
- If blocked, wait 5-10 minutes before retrying
- Use a different browser user agent if needed
- Clear cookies and try again if the session is flagged

## Service-Specific Guides

### Google Account
1. Navigate to https://accounts.google.com/signup
2. Fill: First name, Last name, Username (email), Password
3. May require phone verification — ask manager for a phone number
4. Handle CAPTCHA if it appears
5. Complete profile setup
6. Store: \`cred store google email "..." && cred store google password "..."\`

### GitHub Account
1. Navigate to https://github.com/signup
2. Fill: Email, Password, Username
3. Complete the puzzle verification
4. Verify email via link sent to inbox
5. Store: \`cred store github email "..." && cred store github password "..." && cred store github username "..."\`
6. Optionally set up SSH key and store it

### Generic SaaS (Notion, Trello, Slack, etc.)
1. Find the signup page
2. Many support "Sign up with Google" — use stored Google credentials if available
3. Otherwise fill the standard registration form
4. Store credentials via \`cred store <service> ...\`

## Security Best Practices
- **Always use generated passwords** — never reuse or create weak passwords
- **Store credentials immediately** — don't rely on memory across sessions
- **Use unique passwords per service** — the credential manager handles this
- **Record what account was created and why** — add notes to credentials
- **Tell your manager** — after creating an account, report what was created and the purpose
- **Never share raw credentials** in chat — only say "I created an account and stored the credentials securely"

## Retrieving Stored Credentials Later
\`\`\`bash
# List all stored accounts
cred list

# View an account's details (values are masked)
cred get github

# Get a specific value for use in scripts
cred get-raw github password

# Export as environment variables
eval $(cred export github)
\`\`\`
`;
}
//# sourceMappingURL=account-creation.js.map