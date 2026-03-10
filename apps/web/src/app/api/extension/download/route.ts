import { NextResponse } from "next/server";
import { existsSync, readdirSync, statSync, readFileSync } from "fs";
import path from "path";
import archiver from "archiver";
import { PassThrough } from "stream";

async function zipDirectory(dirPath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    const passthrough = new PassThrough();

    passthrough.on("data", (chunk: Buffer) => chunks.push(chunk));
    passthrough.on("end", () => resolve(Buffer.concat(chunks)));
    passthrough.on("error", reject);
    archive.on("error", reject);

    archive.pipe(passthrough);
    archive.glob("**/*", {
      cwd: dirPath,
      ignore: ["*.DS_Store", "__MACOSX/**"],
      dot: false,
    });
    archive.finalize();
  });
}

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

    const zipBuffer = await zipDirectory(resolvedDir);

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
