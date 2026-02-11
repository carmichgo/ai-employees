/**
 * Credential Manager — generates a Node.js CLI script that gets installed
 * inside each OpenClaw container for secure credential storage.
 *
 * Uses AES-256-GCM encryption with the container's ENCRYPTION_KEY env var.
 * Credentials are stored as encrypted JSON files in ~/.openclaw/credentials/
 *
 * CLI commands:
 *   cred store <name> <key> <value>   — Store an encrypted credential
 *   cred get <name> [key]             — Decrypt and retrieve a credential
 *   cred list                         — List all stored credential names
 *   cred delete <name>                — Delete a stored credential
 *   cred export <name>                — Export as env-compatible KEY=VALUE lines
 */

/** Returns the Node.js script content for the credential manager CLI */
export function generateCredentialManagerScript(): string {
  return `#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CRED_DIR = path.join(process.env.HOME || "/home/node", ".openclaw", "credentials");
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    console.error("ERROR: ENCRYPTION_KEY environment variable is not set.");
    console.error("This key is required for encrypting/decrypting credentials.");
    process.exit(1);
  }
  // Derive a consistent 32-byte key from the env var using SHA-256
  return crypto.createHash("sha256").update(raw).digest();
}

function ensureDir() {
  fs.mkdirSync(CRED_DIR, { recursive: true, mode: 0o700 });
}

function credPath(name) {
  // Sanitize name to prevent path traversal
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(CRED_DIR, safe + ".enc");
}

function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv (12) + tag (16) + ciphertext
  return Buffer.concat([iv, tag, encrypted]);
}

function decrypt(buffer) {
  const key = getKey();
  const iv = buffer.subarray(0, IV_BYTES);
  const tag = buffer.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buffer.subarray(IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8");
}

function store(name, key, value) {
  ensureDir();
  const fp = credPath(name);
  let data = {};
  if (fs.existsSync(fp)) {
    try {
      const raw = fs.readFileSync(fp);
      data = JSON.parse(decrypt(raw));
    } catch {
      // Corrupted file, start fresh
      data = {};
    }
  }
  data[key] = value;
  const encrypted = encrypt(JSON.stringify(data));
  fs.writeFileSync(fp, encrypted, { mode: 0o600 });
  console.log(\`Stored credential: \${name}.\${key}\`);
}

function get(name, key) {
  const fp = credPath(name);
  if (!fs.existsSync(fp)) {
    console.error(\`No credentials found for: \${name}\`);
    process.exit(1);
  }
  try {
    const raw = fs.readFileSync(fp);
    const data = JSON.parse(decrypt(raw));
    if (key) {
      if (data[key] === undefined) {
        console.error(\`Key '\${key}' not found in \${name}\`);
        process.exit(1);
      }
      console.log(data[key]);
    } else {
      // Print all keys (mask values for safety)
      for (const [k, v] of Object.entries(data)) {
        const masked = typeof v === "string" && v.length > 4
          ? v.slice(0, 2) + "*".repeat(Math.min(v.length - 4, 20)) + v.slice(-2)
          : "****";
        console.log(\`  \${k}: \${masked}\`);
      }
    }
  } catch (err) {
    console.error(\`Failed to decrypt \${name}: \${err.message}\`);
    process.exit(1);
  }
}

function getRaw(name, key) {
  const fp = credPath(name);
  if (!fs.existsSync(fp)) {
    process.exit(1);
  }
  try {
    const raw = fs.readFileSync(fp);
    const data = JSON.parse(decrypt(raw));
    if (key && data[key] !== undefined) {
      process.stdout.write(String(data[key]));
    }
  } catch {
    process.exit(1);
  }
}

function list() {
  ensureDir();
  const files = fs.readdirSync(CRED_DIR).filter(f => f.endsWith(".enc"));
  if (files.length === 0) {
    console.log("No stored credentials.");
    return;
  }
  console.log("Stored credentials:");
  for (const f of files) {
    const name = f.replace(/\\.enc$/, "");
    console.log(\`  - \${name}\`);
  }
}

function del(name) {
  const fp = credPath(name);
  if (fs.existsSync(fp)) {
    fs.unlinkSync(fp);
    console.log(\`Deleted credentials for: \${name}\`);
  } else {
    console.log(\`No credentials found for: \${name}\`);
  }
}

function exportEnv(name) {
  const fp = credPath(name);
  if (!fs.existsSync(fp)) {
    console.error(\`No credentials found for: \${name}\`);
    process.exit(1);
  }
  try {
    const raw = fs.readFileSync(fp);
    const data = JSON.parse(decrypt(raw));
    for (const [k, v] of Object.entries(data)) {
      const envKey = k.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      console.log(\`\${envKey}=\${v}\`);
    }
  } catch (err) {
    console.error(\`Failed to decrypt \${name}: \${err.message}\`);
    process.exit(1);
  }
}

// CLI
const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case "store":
  case "set":
    if (args.length < 3) {
      console.error("Usage: cred store <name> <key> <value>");
      process.exit(1);
    }
    store(args[0], args[1], args.slice(2).join(" "));
    break;
  case "get":
    if (args.length < 1) {
      console.error("Usage: cred get <name> [key]");
      process.exit(1);
    }
    get(args[0], args[1]);
    break;
  case "get-raw":
    if (args.length < 2) {
      console.error("Usage: cred get-raw <name> <key>");
      process.exit(1);
    }
    getRaw(args[0], args[1]);
    break;
  case "list":
  case "ls":
    list();
    break;
  case "delete":
  case "rm":
    if (args.length < 1) {
      console.error("Usage: cred delete <name>");
      process.exit(1);
    }
    del(args[0]);
    break;
  case "export":
    if (args.length < 1) {
      console.error("Usage: cred export <name>");
      process.exit(1);
    }
    exportEnv(args[0]);
    break;
  default:
    console.log(\`
Credential Manager — Secure encrypted credential storage

Commands:
  cred store <name> <key> <value>   Store a credential (creates or updates)
  cred get <name> [key]             Retrieve credentials (masked without key)
  cred get-raw <name> <key>         Get raw value (for scripts, no newline)
  cred list                         List all stored credential names
  cred delete <name>                Delete a credential set
  cred export <name>                Export as KEY=VALUE lines

Examples:
  cred store github token ghp_abc123def456
  cred store aws access_key AKIAIOSFODNN7EXAMPLE
  cred store aws secret_key wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
  cred get aws
  cred get-raw aws access_key
  cred export aws

Credentials are encrypted with AES-256-GCM and stored in:
  ~/.openclaw/credentials/
\`);
}
`;
}

/** Returns a setup script that installs the credential manager in the container */
export function generateCredentialManagerInstallScript(containerName: string): string {
  return `
    # Install credential manager CLI
    docker exec ${containerName} bash -c '
      mkdir -p /home/node/.openclaw/credentials &&
      chmod 700 /home/node/.openclaw/credentials
    '
  `;
}
