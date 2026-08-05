import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
const appName = "EventoTron Local";
const bundleRoot = `${projectRoot}/build/macos/${appName}.app`;
const logDir = "$HOME/Library/Logs/EventoTron";
const nodePath = process.execPath;

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

const launchCommand = [
  `mkdir -p ${logDir}`,
  `cd ${shellQuote(projectRoot)}`,
  [
    "EVENTOTRON_DESKTOP=1",
    "nohup",
    shellQuote(nodePath),
    shellQuote(`${projectRoot}/scripts/desktop-launcher.mjs`),
    `>> ${logDir}/desktop-app.log`,
    "2>&1",
    "&",
  ].join(" "),
].join("; ");

const script = `const app = Application.currentApplication();
app.includeStandardAdditions = true;
app.doShellScript(${JSON.stringify(launchCommand)});
`;

await rm(bundleRoot, { recursive: true, force: true });
await mkdir(`${projectRoot}/build/macos`, { recursive: true });

const tempDir = await mkdtemp(join(tmpdir(), "eventotron-app-"));
const sourcePath = join(tempDir, "EventoTron.js");
const debugSourcePath = `${projectRoot}/build/macos/EventoTronLauncher.js`;
await writeFile(sourcePath, script);
await writeFile(debugSourcePath, script);

const compiled = spawnSync("/usr/bin/osacompile", ["-l", "JavaScript", "-o", bundleRoot, sourcePath], {
  cwd: projectRoot,
  encoding: "utf8",
});
await rm(tempDir, { recursive: true, force: true });

if (compiled.status !== 0) {
  throw new Error(
    [
      "Could not create EventoTron Local.app with osacompile.",
      compiled.stderr,
      compiled.stdout,
    ].filter(Boolean).join("\n"),
  );
}

console.log(`Created ${bundleRoot}`);
console.log("Double-click the app, or run:");
console.log(`open "${bundleRoot}"`);
console.log("Launcher log:");
console.log("~/Library/Logs/EventoTron/desktop-app.log");
