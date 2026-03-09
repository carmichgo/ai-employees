import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import path from "path";
import os from "os";

export async function GET() {
  try {
    // The browser-extension directory is at the repo root
    const extDir = path.resolve(process.cwd(), "../../apps/browser-extension");

    // Fallback: try a few common locations
    const candidates = [
      extDir,
      path.resolve(process.cwd(), "../browser-extension"),
      path.resolve(process.cwd(), "apps/browser-extension"),
    ];

    let resolvedDir: string | null = null;
    for (const d of candidates) {
      if (existsSync(path.join(d, "manifest.json"))) {
        resolvedDir = d;
        break;
      }
    }

    if (!resolvedDir) {
      return NextResponse.json(
        { error: "Extension source not found" },
        { status: 404 }
      );
    }

    const tmpZip = path.join(os.tmpdir(), `blitzer-extension-${Date.now()}.zip`);
    execSync(`cd "${resolvedDir}" && zip -r "${tmpZip}" . -x "*.DS_Store" -x "__MACOSX/*"`, {
      timeout: 10000,
    });

    const zipBuffer = readFileSync(tmpZip);
    // Clean up
    try { execSync(`rm "${tmpZip}"`); } catch {}

    return new NextResponse(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="blitzer-chrome-extension.zip"',
        "Content-Length": String(zipBuffer.length),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to package extension", details: err.message },
      { status: 500 }
    );
  }
}
