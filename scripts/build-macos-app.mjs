import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
const appName = "EventoTron Local";
const bundleRoot = `${projectRoot}/build/macos/${appName}.app`;
const contentsDir = `${bundleRoot}/Contents`;
const macosDir = `${contentsDir}/MacOS`;
const resourcesDir = `${contentsDir}/Resources`;
const executablePath = `${macosDir}/EventoTron`;

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>${appName}</string>
  <key>CFBundleExecutable</key>
  <string>EventoTron</string>
  <key>CFBundleIdentifier</key>
  <string>com.sheppard.eventotron.local</string>
  <key>CFBundleName</key>
  <string>${appName}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;

const executable = `#!/bin/zsh
set -euo pipefail
export EVENTOTRON_DESKTOP=1
cd "${projectRoot}"
exec /usr/bin/env node "${projectRoot}/scripts/desktop-launcher.mjs"
`;

await rm(bundleRoot, { recursive: true, force: true });
await mkdir(macosDir, { recursive: true });
await mkdir(resourcesDir, { recursive: true });
await writeFile(`${contentsDir}/Info.plist`, plist);
await writeFile(executablePath, executable);
await chmod(executablePath, 0o755);

console.log(`Created ${bundleRoot}`);
console.log("Double-click the app, or run:");
console.log(`open "${bundleRoot}"`);
