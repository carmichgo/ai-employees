/**
 * Captcha Solving Skill — generates SKILL.md content for the Blitzer container.
 *
 * Supports two providers:
 *   1. 2captcha — CLI binary (solve-captcha) that calls 2captcha.com human-powered API
 *   2. capsolver — Chrome extension that auto-solves CAPTCHAs in the browser
 *
 * The skill teaches the AI employee how to handle CAPTCHAs when browsing the web,
 * creating accounts, or automating tasks.
 */

export function generateCaptchaSolvingSkill(): string {
  return `# Captcha Solving

You have the ability to solve CAPTCHAs programmatically using two available providers. Choose the best one depending on the situation.

## Provider 1: 2captcha (CLI — recommended for token-based CAPTCHAs)

The \`solve-captcha\` CLI tool sends CAPTCHAs to 2captcha.com's human solver network and returns the solution.

### Setup (one-time)
\`\`\`bash
# Check if already installed
which solve-captcha || {
  # Install the 2captcha CLI
  curl -fsSL https://github.com/2captcha/cli/releases/latest/download/solve-captcha-linux-amd64 -o /usr/local/bin/solve-captcha
  sudo chmod +x /usr/local/bin/solve-captcha
}

# Store API key securely
cred store 2captcha api_key "YOUR_2CAPTCHA_API_KEY"
\`\`\`

### Usage: Image CAPTCHA
\`\`\`bash
# Take a screenshot of just the CAPTCHA image, save it, then solve
solve-captcha normal --file /tmp/captcha.png --api-key $(cred get-raw 2captcha api_key)
\`\`\`

### Usage: reCAPTCHA v2
\`\`\`bash
# Extract the sitekey from the page source (data-sitekey attribute)
# Then submit to 2captcha
solve-captcha recaptcha-v2 \\
  --site-key "SITE_KEY_FROM_PAGE" \\
  --url "https://example.com/page" \\
  --api-key $(cred get-raw 2captcha api_key)
# Returns a g-recaptcha-response token — inject it into the form
\`\`\`

### Usage: reCAPTCHA v3
\`\`\`bash
solve-captcha recaptcha-v3 \\
  --site-key "SITE_KEY" \\
  --url "https://example.com/page" \\
  --action "submit" \\
  --min-score 0.7 \\
  --api-key $(cred get-raw 2captcha api_key)
\`\`\`

### Usage: hCaptcha
\`\`\`bash
solve-captcha hcaptcha \\
  --site-key "SITE_KEY" \\
  --url "https://example.com/page" \\
  --api-key $(cred get-raw 2captcha api_key)
\`\`\`

### Usage: Cloudflare Turnstile
\`\`\`bash
solve-captcha turnstile \\
  --site-key "SITE_KEY" \\
  --url "https://example.com/page" \\
  --api-key $(cred get-raw 2captcha api_key)
\`\`\`

### Injecting Token Solutions
After solving a token-based CAPTCHA (reCAPTCHA, hCaptcha, Turnstile), inject the token using the browser:
\`\`\`javascript
// In the browser console (via browser tool):
// For reCAPTCHA v2:
document.getElementById('g-recaptcha-response').value = 'TOKEN_HERE';

// For hCaptcha:
document.querySelector('[name="h-captcha-response"]').value = 'TOKEN_HERE';

// Then submit the form
document.querySelector('form').submit();
\`\`\`

### Checking Balance
\`\`\`bash
solve-captcha balance --api-key $(cred get-raw 2captcha api_key)
\`\`\`

## Provider 2: CapSolver (Browser Extension — recommended for interactive CAPTCHAs)

CapSolver works as a Chromium extension that automatically detects and solves CAPTCHAs in the browser. This is the easiest option when you're already using the browser tool.

### Setup (one-time)
\`\`\`bash
# Check if already set up
if [ ! -d ~/.openclaw/capsolver-extension ]; then
  # Download and extract the CapSolver extension
  mkdir -p /tmp/capsolver
  cd /tmp/capsolver
  LATEST=$(curl -s https://api.github.com/repos/nicklhy/capsolver-browser-extension/releases/latest | jq -r '.assets[] | select(.name | contains("chrome")) | .browser_download_url')
  if [ -n "$LATEST" ]; then
    curl -fsSL "$LATEST" -o capsolver.zip
  else
    # Fallback: download known working version
    curl -fsSL "https://github.com/nicklhy/capsolver-browser-extension/releases/download/v1.15.0/CapSolver.Browser.Extension-chrome-v1.15.0.zip" -o capsolver.zip
  fi
  mkdir -p ~/.openclaw/capsolver-extension
  unzip -o capsolver.zip -d ~/.openclaw/capsolver-extension/
  cd -
  rm -rf /tmp/capsolver
  echo "CapSolver extension installed"
fi

# Store API key securely
cred store capsolver api_key "YOUR_CAPSOLVER_API_KEY"

# Configure the extension with your API key
CAPSOLVER_KEY=$(cred get-raw capsolver api_key)
cat > ~/.openclaw/capsolver-extension/assets/config.js << CFGEOF
export const defaultConfig = {
  apiKey: '$CAPSOLVER_KEY',
  useCapsolver: true,
  solveInvisibleRecaptcha: true,
  solveRecaptchaV3: true,
  recaptchaV3MinScore: 0.7,
};
CFGEOF

echo "CapSolver configured"
\`\`\`

### Usage
When CapSolver is installed, it auto-solves CAPTCHAs in the browser. Just navigate to the page and wait:
1. Use the \`browser\` tool to navigate to the target page
2. If a CAPTCHA appears, **wait 30-60 seconds** for CapSolver to solve it automatically
3. Check if the CAPTCHA is solved by looking for success indicators
4. Continue with your task

### Important Notes for CapSolver
- The extension requires Chromium/Chrome for Testing — the container already has this
- After installing the extension, you need to update the browser config to load it
- CapSolver handles: reCAPTCHA v2/v3, hCaptcha, Cloudflare Turnstile, AWS WAF, FunCaptcha

## When to Use Which Provider

| Scenario | Recommended Provider |
|----------|---------------------|
| You're already in a browser session | CapSolver (extension auto-solves) |
| Headless API-style solving | 2captcha (CLI) |
| reCAPTCHA/hCaptcha on a form | Either — CapSolver is simpler |
| Image CAPTCHA (text from image) | 2captcha CLI |
| Cloudflare Turnstile challenge page | CapSolver (auto-detects) |
| Budget-conscious (cheapest) | 2captcha (~$0.001/image, ~$0.003/token) |

## Troubleshooting
- If \`solve-captcha\` times out, the CAPTCHA might be too complex — retry once
- If CapSolver doesn't trigger, check that the extension config has the correct API key
- Check your balance: \`solve-captcha balance --api-key $(cred get-raw 2captcha api_key)\`
- Some sites detect automated browsers — try adding random delays between actions
- If a CAPTCHA keeps failing, switch to the other provider

## Security Notes
- API keys are stored encrypted via the \`cred\` credential manager
- Never log or echo API keys in plain text
- Monitor your solving balance to detect unusual usage
`;
}

/** Returns the install script for captcha tools in the container */
export function generateCaptchaInstallScript(containerName: string): string {
  return `
    # Install 2captcha CLI solver
    docker exec -u root ${containerName} bash -c '
      curl -fsSL https://github.com/2captcha/cli/releases/latest/download/solve-captcha-linux-amd64 -o /usr/local/bin/solve-captcha 2>/dev/null &&
      chmod +x /usr/local/bin/solve-captcha &&
      echo "2captcha CLI installed" ||
      echo "2captcha CLI install failed (non-critical)"
    '
  `;
}
