#!/usr/bin/env node
/**
 * Pre-build script: packages monorepo source into a tarball for hot-update.
 * This runs during `next build` when the full source tree is available.
 * At runtime on Vercel, the source tree is NOT available, so we must
 * create the tarball at build time and include it in the deployment.
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const monoRoot = path.resolve(__dirname, "../../..");
const outDir = path.join(__dirname, "../public");
const outPath = path.join(outDir, "hot-update-source.tar.gz");

// Ensure public dir exists
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

try {
  execSync(
    `tar czf "${outPath}" ` +
      `--exclude='node_modules' --exclude='.next' --exclude='.git' ` +
      `--exclude='dist' --exclude='.turbo' --exclude='.cache' ` +
      `--exclude='.vercel' --exclude='hot-update-source.tar.gz' ` +
      `-C "${monoRoot}" .`,
    { timeout: 30000, stdio: "pipe" },
  );
  const size = fs.statSync(outPath).size;
  console.log(
    `[package-source] Created ${outPath} (${(size / 1024 / 1024).toFixed(1)}MB)`,
  );
} catch (err) {
  console.error("[package-source] Failed to create source tarball:", err.message);
  // Non-fatal — hot-update will fall back to GitHub download
}
