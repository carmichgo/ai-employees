const archiver = require("archiver");
const fs = require("fs");
const path = require("path");

const extDir = path.resolve(__dirname, "../../../apps/browser-extension");
const outFile = path.resolve(__dirname, "../public/blitzer-chrome-extension.zip");

if (!fs.existsSync(path.join(extDir, "manifest.json"))) {
  console.warn("[package-extension] browser-extension dir not found, skipping");
  process.exit(0);
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });

const output = fs.createWriteStream(outFile);
const archive = archiver("zip", { zlib: { level: 9 } });

archive.pipe(output);
archive.glob("**/*", { cwd: extDir, ignore: ["*.DS_Store", "__MACOSX/**"], dot: false });
archive.finalize();

output.on("close", () => {
  console.log(`[package-extension] Created ${outFile} (${archive.pointer()} bytes)`);
});

archive.on("error", (err) => {
  console.error("[package-extension] Error:", err);
  process.exit(1);
});
