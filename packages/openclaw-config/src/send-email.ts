/**
 * Send Email CLI — generates a Node.js script that gets installed inside each
 * OpenClaw container for sending emails via the internal Resend API.
 *
 * This bypasses SMTP entirely (containers often have SMTP ports blocked).
 * The script calls the droplet's API which forwards to Resend.
 *
 * CLI commands:
 *   send-email --from <addr> --to <addr> --subject <text> --body <text>
 *   send-email --from <addr> --to <addr> --subject <text> --html <html>
 *   send-email --from <addr> --to <addr> --subject <text> --body <text> --attach <path>
 */

/** Returns the Node.js script content for the send-email CLI */
export function generateSendEmailScript(): string {
  return `#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const API_URL = process.env.BLITZ_API_URL || process.env.INTERNAL_API_URL || "http://host.docker.internal:3001";
const SECRET = process.env.INTERSERVICE_SECRET || "";
const EMPLOYEE_ID = process.env.EMPLOYEE_ID || "";

function usage() {
  console.log(\`
send-email — Send email via the internal Resend API (no SMTP required)

Usage:
  send-email --to <address> --subject <text> --body <text>
  send-email --to <address> --subject <text> --html <html>
  send-email --to <address> --subject <text> --body <text> --attach <file>

Options:
  --from      Sender email address (or use EMAIL_ADDRESS env var)
  --to        Recipient email address(es), comma-separated
  --subject   Email subject line
  --body      Plain text body
  --html      HTML body (alternative to --body)
  --cc        CC recipients, comma-separated
  --bcc       BCC recipients, comma-separated
  --reply-to  Reply-to address
  --attach    File path to attach (can be used multiple times)

Environment:
  EMAIL_ADDRESS         Default sender address
  BLITZ_API_URL         API endpoint (default: http://host.docker.internal:3001)
  INTERSERVICE_SECRET   Auth secret for internal API
  EMPLOYEE_ID           Employee ID (for resolving workspace file paths)

Examples:
  send-email --to user@example.com --subject "Hello" --body "Hi there!"
  send-email --to user@example.com --subject "Report" --body "See attached" --attach /home/node/.openclaw/workspace/report.pdf
\`);
}

function parseArgs(argv) {
  const args = {
    from: process.env.EMAIL_ADDRESS || "",
    to: "",
    subject: "",
    body: "",
    html: "",
    cc: "",
    bcc: "",
    replyTo: "",
    attachments: [],
  };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case "--from": args.from = argv[++i] || ""; break;
      case "--to": args.to = argv[++i] || ""; break;
      case "--subject": args.subject = argv[++i] || ""; break;
      case "--body": args.body = argv[++i] || ""; break;
      case "--html": args.html = argv[++i] || ""; break;
      case "--cc": args.cc = argv[++i] || ""; break;
      case "--bcc": args.bcc = argv[++i] || ""; break;
      case "--reply-to": args.replyTo = argv[++i] || ""; break;
      case "--attach":
      case "--attachment":
        args.attachments.push(argv[++i] || "");
        break;
      case "--help":
      case "-h":
        usage();
        process.exit(0);
      default:
        console.error("Unknown option: " + argv[i]);
        usage();
        process.exit(1);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.to || !args.subject) {
    console.error("Error: --to and --subject are required.");
    usage();
    process.exit(1);
  }

  if (!args.body && !args.html) {
    console.error("Error: --body or --html is required.");
    usage();
    process.exit(1);
  }

  if (!SECRET) {
    console.error("Error: INTERSERVICE_SECRET environment variable is not set.");
    process.exit(1);
  }

  // Build request payload
  const payload = {
    from: args.from,
    to: args.to.split(",").map(s => s.trim()),
    subject: args.subject,
    employeeId: EMPLOYEE_ID,
  };

  if (args.body) payload.text = args.body;
  if (args.html) payload.html = args.html;
  if (args.cc) payload.cc = args.cc.split(",").map(s => s.trim());
  if (args.bcc) payload.bcc = args.bcc.split(",").map(s => s.trim());
  if (args.replyTo) payload.replyTo = args.replyTo;

  // Handle attachments — read files and convert to base64
  if (args.attachments.length > 0) {
    payload.attachments = [];
    for (const filePath of args.attachments) {
      if (!fs.existsSync(filePath)) {
        console.error("Attachment not found: " + filePath);
        process.exit(1);
      }
      const content = fs.readFileSync(filePath);
      payload.attachments.push({
        content: content.toString("base64"),
        filename: path.basename(filePath),
      });
    }
  }

  // Send via internal API
  const url = API_URL + "/internal/email/send";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-interservice-secret": SECRET,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      console.log("Email sent successfully. ID: " + (data.emailId || data.id || "ok"));
    } else {
      const err = await res.text();
      console.error("Failed to send email (HTTP " + res.status + "): " + err);
      process.exit(1);
    }
  } catch (err) {
    console.error("Error sending email: " + err.message);
    console.error("Make sure the internal API is reachable at " + API_URL);
    process.exit(1);
  }
}

main();
`;
}
