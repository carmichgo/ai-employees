/**
 * DOCX Skill — generates SKILL.md content for the OpenClaw container.
 *
 * Teaches AI employees how to create, edit, analyze, and redline Word documents
 * (.docx files) using pandoc, docx-js, and direct OOXML manipulation.
 */

export function generateDocxSkill(): string {
  return `# Document Creation & Editing (DOCX)

You can create, edit, analyze, and redline Word documents (.docx files). This covers everything from generating new documents from scratch to making tracked-change edits on existing ones.

## When to Use Which Approach

**Reading or analyzing a document** — Use pandoc for text extraction, or unpack the ZIP for raw XML access when you need comments, formatting details, or embedded media.

**Creating a new document from scratch** — Use the docx npm package (docx-js) to build a .docx programmatically with full control over formatting.

**Editing an existing document you created** — Use basic OOXML editing: unpack the docx, modify the XML, repack.

**Editing someone else's document (contracts, legal, academic)** — Use the redlining workflow with tracked changes so the other party can review exactly what you changed.

## Reading & Analyzing Documents

### Text Extraction with Pandoc

Convert a .docx to readable markdown:

\`\`\`bash
pandoc document.docx -o output.md
\`\`\`

Preserve tracked changes in the output:

\`\`\`bash
# Show all tracked changes (insertions and deletions visible)
pandoc --track-changes=all document.docx -o output.md

# Accept all changes (show final state)
pandoc --track-changes=accept document.docx -o output.md

# Reject all changes (show original state)
pandoc --track-changes=reject document.docx -o output.md
\`\`\`

### Raw XML Access

A .docx file is a ZIP archive containing XML. Unpack it when you need access to comments, formatting, embedded media, or metadata:

\`\`\`bash
mkdir unpacked
cd unpacked
unzip ../document.docx
\`\`\`

Key files inside:
- \`word/document.xml\` — Main body content
- \`word/comments.xml\` — Comments referenced in the document
- \`word/styles.xml\` — Style definitions
- \`word/media/\` — Embedded images and files
- \`[Content_Types].xml\` — Content type declarations

After modifying XML files, repack:

\`\`\`bash
cd unpacked
zip -r ../modified.docx . -x ".*"
\`\`\`

## Creating New Documents

Use the **docx** npm package to build documents programmatically:

\`\`\`bash
npm install -g docx
\`\`\`

\`\`\`javascript
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } = require("docx");
const fs = require("fs");

const doc = new Document({
  sections: [{
    properties: {},
    children: [
      new Paragraph({
        text: "Monthly Report",
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Prepared by: ", bold: true }),
          new TextRun("Your Name"),
        ],
        spacing: { after: 200 },
      }),
      new Paragraph({
        text: "This report summarizes our progress over the past month.",
        spacing: { after: 200 },
      }),
      // Table example
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: "Metric", bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: "Value", bold: true })] }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph("Revenue")] }),
              new TableCell({ children: [new Paragraph("$125,000")] }),
            ],
          }),
        ],
      }),
    ],
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync("/home/node/.openclaw/workspace-main/report.docx", buffer);
  console.log("Document saved to /home/node/.openclaw/workspace-main/report.docx");
});
\`\`\`

### Common Formatting Options

\`\`\`javascript
// Bold, italic, underline
new TextRun({ text: "Important", bold: true, italics: true, underline: {} })

// Font size (half-points, so 24 = 12pt)
new TextRun({ text: "Large text", size: 48 })  // 24pt

// Color
new TextRun({ text: "Red text", color: "FF0000" })

// Bullet list
new Paragraph({ text: "First item", bullet: { level: 0 } })
new Paragraph({ text: "Sub-item", bullet: { level: 1 } })

// Numbered list
new Paragraph({ text: "Step 1", numbering: { reference: "my-numbering", level: 0 } })

// Page break
new Paragraph({ children: [], pageBreakBefore: true })

// Images
const { ImageRun } = require("docx");
new Paragraph({
  children: [
    new ImageRun({
      data: fs.readFileSync("image.png"),
      transformation: { width: 400, height: 300 },
      type: "png",
    }),
  ],
})
\`\`\`

## Editing Existing Documents (OOXML)

For editing existing .docx files, manipulate the XML directly:

\`\`\`bash
# 1. Unpack
mkdir work
cd work
unzip ../original.docx

# 2. Inspect the content
cat word/document.xml | head -100

# 3. Edit with a script
python3 << 'PYEOF'
import xml.etree.ElementTree as ET

tree = ET.parse("word/document.xml")
root = tree.getroot()

# Define namespace
ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

# Find and modify text
for t in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"):
    if t.text and "OLD_TEXT" in t.text:
        t.text = t.text.replace("OLD_TEXT", "NEW_TEXT")

tree.write("word/document.xml", xml_declaration=True, encoding="UTF-8")
PYEOF

# 4. Repack
zip -r ../modified.docx . -x ".*"
\`\`\`

## Redlining Workflow (Tracked Changes)

Use this when editing someone else's document — contracts, legal agreements, proposals, academic papers. Tracked changes let them see exactly what you modified.

### Tracked Changes XML Format

Deletions use \`<w:del>\`, insertions use \`<w:ins>\`:

\`\`\`xml
<!-- Original: "The term is 30 days." -->
<!-- Redlined: "The term is 60 days." -->
<w:r w:rsidR="00AB12CD"><w:t xml:space="preserve">The term is </w:t></w:r>
<w:del w:id="1" w:author="AI Employee" w:date="2025-01-15T10:00:00Z">
  <w:r><w:delText>30</w:delText></w:r>
</w:del>
<w:ins w:id="2" w:author="AI Employee" w:date="2025-01-15T10:00:00Z">
  <w:r><w:t>60</w:t></w:r>
</w:ins>
<w:r w:rsidR="00AB12CD"><w:t xml:space="preserve"> days.</w:t></w:r>
\`\`\`

### Key Principles

**Minimal edits** — Only mark the text that actually changes. Preserve unchanged \`<w:r>\` elements with their original RSID attributes.

**Batch changes** — Group 3-10 related modifications per batch. Test each batch before moving on.

**Always verify** — After making changes, convert back to markdown and check the result:

\`\`\`bash
pandoc --track-changes=all modified.docx -o check.md
grep -i "expected_change" check.md
\`\`\`

### Step-by-Step Redlining Process

1. **Extract text** to understand the document:
   \`\`\`bash
   pandoc --track-changes=all original.docx -o review.md
   cat review.md
   \`\`\`

2. **Plan changes** — identify all needed modifications and group into logical batches.

3. **Unpack the document**:
   \`\`\`bash
   mkdir redline && cd redline && unzip ../original.docx
   \`\`\`

4. **Inspect the XML** to find the exact elements to modify:
   \`\`\`bash
   grep -n "text_to_change" word/document.xml
   \`\`\`

5. **Apply changes** using a Python script with proper \`<w:del>\` and \`<w:ins>\` tags.

6. **Repack and verify**:
   \`\`\`bash
   zip -r ../redlined.docx . -x ".*"
   pandoc --track-changes=all ../redlined.docx -o verify.md
   \`\`\`

## Converting Documents to Images

Convert a .docx to images for visual review or sharing:

\`\`\`bash
# Step 1: Convert DOCX to PDF (LibreOffice)
soffice --headless --convert-to pdf document.docx --outdir /home/node/.openclaw/workspace-main/

# Step 2: Convert PDF to images (Poppler)
pdftoppm -jpeg -r 150 /home/node/.openclaw/workspace-main/document.pdf /home/node/.openclaw/workspace-main/page

# Result: page-1.jpg, page-2.jpg, etc.
\`\`\`

Options for pdftoppm:
- \`-r 150\` — DPI (150 is good for review, 300 for high quality)
- \`-f 1 -l 3\` — Only pages 1 through 3
- \`-png\` — Use PNG instead of JPEG

## Sharing Documents

Always save documents to your workspace and include the full path in your response:

\`\`\`bash
# Save to workspace
cp report.docx /home/node/.openclaw/workspace-main/report.docx
\`\`\`

Then mention the path: "Here's the report: /home/node/.openclaw/workspace-main/report.docx"

The system automatically delivers .docx files as downloads in web chat and as file attachments in Slack.

## Dependencies

These tools are pre-installed in your environment:
- **pandoc** — Document conversion and text extraction
- **docx** (npm) — Create new Word documents programmatically
- **LibreOffice** — Convert documents to PDF
- **poppler-utils** — Convert PDFs to images (pdftoppm)
- **Python xml.etree** — Parse and modify OOXML directly
- **unzip/zip** — Pack and unpack .docx archives

If any tool is missing, install it:
\`\`\`bash
sudo apt-get install -y pandoc libreoffice-writer poppler-utils unzip zip
npm install -g docx
pip3 install --break-system-packages defusedxml
\`\`\`
`;
}

/**
 * Returns the bash commands to install docx-related dependencies inside
 * the OpenClaw container. Called during provisioning.
 */
export function generateDocxInstallScript(): string {
  return `
    # DOCX skill dependencies: pandoc, LibreOffice (headless), poppler, docx npm
    apt-get install -y -qq --no-install-recommends pandoc libreoffice-writer poppler-utils unzip 2>/dev/null || true
  `.trim();
}
