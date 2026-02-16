/**
 * Image Sharing Skill — generates SKILL.md content for the OpenClaw container.
 *
 * Teaches AI employees how to create, generate, and share images across
 * all conversation channels (web chat, Slack, Discord, etc.).
 */

export function generateImageSharingSkill(): string {
  return `# Image Sharing

You can create and share images with your manager and colleagues across all conversation channels. This skill covers image generation, screenshots, image processing, and how to deliver images effectively.

## How Image Sharing Works

When you include a **full workspace file path** to an image in your response, the system automatically:
- **Web chat:** Rewrites the path to a viewable URL and embeds it inline
- **Slack:** Uploads the image file to the Slack channel so it appears inline
- **Other channels:** Attaches or embeds the image as supported by the channel

**The key rule:** Always save images to your workspace and mention the full path in your response.

## Where to Save Images

Save images to one of these directories (all are accessible to the sharing system):
- \`/home/node/.openclaw/workspace-main/\` — primary workspace (recommended)
- \`/home/node/.openclaw/workspace/\` — secondary workspace
- \`/home/node/.openclaw/media/\` — media directory

## Creating Images

### AI Image Generation (\`openai-image-gen\`)
Generate images from text descriptions. Great for:
- Logos, icons, and branding assets
- Social media graphics and posts
- Illustrations and concept art
- Marketing materials and banners
- Product mockups

After generating, save the result to your workspace and share the path.

### Browser Screenshots (\`browser\`)
Capture screenshots of web pages, dashboards, or any visual content:
1. Navigate to the target page with the browser tool
2. Take a screenshot — it saves to \`/home/node/.openclaw/media/browser/\`
3. Share the screenshot path in your response

Use screenshots to:
- Show the user what a website or dashboard looks like
- Capture visual proof of completed tasks (e.g., account creation, form submission)
- Share visual data from web apps (charts, reports, feeds)

### Canvas (\`canvas\`)
Create designs and drawings programmatically. Useful for:
- Simple diagrams and flowcharts
- Annotated visuals
- Custom graphics

### Image Processing (\`nano-banana-pro\`)
Process existing images:
- Resize, crop, and rotate
- Convert between formats (PNG, JPEG, WebP, etc.)
- Apply filters and adjustments

### Shell-Based Tools (\`exec\`)
For advanced image work, use command-line tools:

\`\`\`bash
# Install ImageMagick if not present
sudo apt-get install -y -qq imagemagick

# Resize an image
convert input.png -resize 800x600 /home/node/.openclaw/workspace-main/resized.png

# Create a chart with Python/matplotlib
pip3 install -q matplotlib
python3 << 'PYEOF'
import matplotlib.pyplot as plt
data = [10, 25, 40, 30, 55]
labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
plt.bar(labels, data, color='#2563eb')
plt.title('Weekly Sales')
plt.savefig('/home/node/.openclaw/workspace-main/sales-chart.png', dpi=150, bbox_inches='tight')
print('Chart saved')
PYEOF

# Create a simple image with ImageMagick
convert -size 400x200 xc:'#2563eb' -fill white -gravity center -pointsize 36 -annotate 0 'Hello!' /home/node/.openclaw/workspace-main/greeting.png
\`\`\`

### GIFs (\`gifgrep\`)
Search for and create GIFs:
- Find relevant GIFs by keyword
- Create animated GIFs from image sequences

### Rich Media (\`lobster\`)
Create rich media content including images and visual assets.

## Sharing Images — Step by Step

### Step 1: Create or obtain the image
Use any of the tools above to create your image.

### Step 2: Save to workspace
Ensure the image is saved to your workspace with a descriptive filename:
\`\`\`bash
# Example: move a generated image to workspace with a clear name
cp /tmp/generated-logo.png /home/node/.openclaw/workspace-main/company-logo-draft.png
\`\`\`

### Step 3: Reference the full path in your response
Include the full path in your message text. The system detects it automatically.

**Good examples:**
- "Here's the logo draft: /home/node/.openclaw/workspace-main/company-logo-draft.png"
- "I took a screenshot of the dashboard: /home/node/.openclaw/media/browser/dashboard.png"
- "Here's the sales chart I created: /home/node/.openclaw/workspace-main/sales-chart.png"

**Bad examples (don't do this):**
- "I created a logo" (no path — the user can't see it!)
- "Check the file at ./logo.png" (relative path — system can't detect it)
- "Here's the image: [logo]" (no actual file path)

### Step 4: Add context
Always describe what the image shows alongside the path. This helps the user understand the image before it loads and provides context if the image can't be displayed:
- "I generated three logo options. Here's option 1 (modern, minimalist): /home/node/.openclaw/workspace-main/logo-v1.png"

## Sharing Multiple Images

When sharing multiple images, put each on its own line with context:

"I created three variations of the banner:

**Version A — Bold and colorful:**
/home/node/.openclaw/workspace-main/banner-bold.png

**Version B — Clean and minimal:**
/home/node/.openclaw/workspace-main/banner-minimal.png

**Version C — Dark theme:**
/home/node/.openclaw/workspace-main/banner-dark.png"

## Supported Image Formats

The system supports: **PNG**, **JPEG/JPG**, **GIF**, **WebP**, **SVG**, **BMP**

For best compatibility across all channels, prefer **PNG** (lossless, widely supported) or **JPEG** (smaller files, good for photos).

## Troubleshooting

- **Image not showing in chat?** Make sure you used the full absolute path starting with \`/home/node/.openclaw/\`
- **Image file too large?** Resize or compress it before sharing. Use \`convert input.png -quality 85 -resize 1920x1080\\> output.jpg\`
- **Need to share a non-image file?** Use the same workspace path approach — the system will create a download link instead of an inline image
- **Tool not installed?** Install it yourself: \`sudo apt-get install -y imagemagick\` or \`pip3 install matplotlib pillow\`
`;
}
