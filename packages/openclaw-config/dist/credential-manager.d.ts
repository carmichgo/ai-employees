/**
 * Credential Manager — generates a Node.js CLI script that gets installed
 * inside each Blitzer container for secure credential storage.
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
export declare function generateCredentialManagerScript(): string;
/** Returns a setup script that installs the credential manager in the container */
export declare function generateCredentialManagerInstallScript(containerName: string): string;
//# sourceMappingURL=credential-manager.d.ts.map