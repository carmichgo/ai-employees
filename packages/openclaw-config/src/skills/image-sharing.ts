/**
 * File & Image Sharing Skill — generates SKILL.md content for the OpenClaw container.
 *
 * Teaches AI employees how to create, generate, and share images and files across
 * all conversation channels (web chat, Slack, Discord, WhatsApp, email, etc.).
 */

export function generateImageSharingSkill(): string {
  return `# File & Image Sharing

You can create and share files (images, PDFs, documents, spreadsheets, etc.) with your manager and colleagues across all conversation channels. This skill covers image generation, document creation, screenshots, and how to deliver files effectively on every channel.

## How File Sharing Works

When you include a **full workspace file path** in your response, the system automatically delivers it on the appropriate channel:
- **Web chat:** Images render inline. PDFs, CSVs, and other documents become clickable download links.
- **Slack:** All files (images, PDFs, spreadsheets, etc.) are uploaded as native Slack file attachments visible inline.
- **Email:** Workspace files can be attached to outgoing emails by referencing their path.
- **WhatsApp, Discord, Telegram:** Your built-in channel integrations deliver files to the conversation.

**The key rule:** Always save files to your workspace and mention the full path in your response.

## Where to Save Files

Save files to one of these directories (all are accessible to the sharing system):
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

## Creating Documents & Files

### PDFs (\`nano-pdf\` or shell)
\`\`\`bash
# Create PDF from HTML
pip3 install -q weasyprint
python3 -c "
from weasyprint import HTML
HTML(string='<h1>Monthly Report</h1><p>Content here...</p>').write_pdf('/home/node/.openclaw/workspace-main/report.pdf')
"

# Or use the browser to print a page to PDF
# Navigate to the page, then use page.pdf() to save it
\`\`\`

### Spreadsheets (CSV/XLSX)
\`\`\`bash
# Simple CSV
echo "Name,Revenue,Growth" > /home/node/.openclaw/workspace-main/data.csv
echo "Product A,50000,12%" >> /home/node/.openclaw/workspace-main/data.csv

# Excel file
pip3 install -q openpyxl
python3 << 'PYEOF'
from openpyxl import Workbook
wb = Workbook()
ws = wb.active
ws.append(["Name", "Revenue", "Growth"])
ws.append(["Product A", 50000, "12%"])
wb.save("/home/node/.openclaw/workspace-main/report.xlsx")
PYEOF
\`\`\`

### HTML Reports
\`\`\`bash
cat > /home/node/.openclaw/workspace-main/report.html << 'EOF'
<html><body><h1>Report Title</h1><p>Content...</p></body></html>
EOF
\`\`\`

## Sharing via Email (Attachments)

When sending emails, you can attach workspace files:
\`\`\`bash
# The internal email API supports attachments via workspace paths
# When composing an email with himalaya or the internal API,
# reference the workspace path as an attachment:
#   path: "/home/node/.openclaw/workspace-main/report.pdf"
#   filename: "report.pdf"
\`\`\`

## Sharing Multiple Files

When sharing multiple files, put each on its own line with context:

"Here are the deliverables:

**Banner designs:**
/home/node/.openclaw/workspace-main/banner-bold.png
/home/node/.openclaw/workspace-main/banner-minimal.png

**Full report:**
/home/node/.openclaw/workspace-main/q4-report.pdf

**Raw data:**
/home/node/.openclaw/workspace-main/q4-data.csv"

## Supported Formats

**Images:** PNG, JPEG/JPG, GIF, WebP, SVG, BMP
**Documents:** PDF, DOCX, TXT, MD, HTML
**Spreadsheets:** CSV, TSV, XLSX, XLS
**Archives:** ZIP, TAR, GZ
**Media:** MP3, MP4, WAV, OGG
**Data:** JSON, YAML, XML

For images, prefer **PNG** (lossless) or **JPEG** (smaller, good for photos).
For documents, prefer **PDF** (universal) or **CSV** (for data).

## Troubleshooting

- **File not showing in chat?** Make sure you used the full absolute path starting with \`/home/node/.openclaw/\`
- **Image file too large?** Resize or compress it: \`convert input.png -quality 85 -resize 1920x1080\\> output.jpg\`
- **PDF too large for email?** Compress: \`gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/screen -o compressed.pdf input.pdf\`
- **Tool not installed?** Install it yourself: \`sudo apt-get install -y imagemagick ghostscript\` or \`pip3 install matplotlib pillow openpyxl weasyprint\`
`;
}
