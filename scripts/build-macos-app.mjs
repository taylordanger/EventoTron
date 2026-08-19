import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
const appName = "EventoTron Local";
const bundleRoot = `${projectRoot}/build/macos/${appName}.app`;

/**
 * Minimum Node the app will accept, matching the `engines` field. Probing for
 * this rather than trusting the first Node found means a stale system copy on
 * the PATH cannot start the app into a confusing runtime failure.
 */
const MIN_MAJOR = 22;
const MIN_MINOR = 13;

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

/**
 * The launcher resolves Node when the icon is clicked, not when this script
 * runs. Baking in an absolute interpreter path is what previously broke the
 * app: it pointed into a versioned Homebrew Cellar directory, which `brew
 * upgrade node` deleted, and every click then failed silently.
 *
 * Candidates are ordered most-stable first. `/opt/homebrew/bin/node` and
 * `/usr/local/bin/node` are symlinks Homebrew re-points on upgrade, so they
 * survive version bumps. Version managers are searched newest-first.
 *
 * Note the launcher runs from Finder with launchd's minimal environment, so
 * PATH cannot be relied on — hence the absolute candidates. The resolved
 * Node's directory is prepended to PATH before launching so that the
 * first-run `npm run build` inside desktop-launcher.mjs can find `npm` too.
 */
export function buildLaunchScript(root, minMajor = MIN_MAJOR, minMinor = MIN_MINOR) {
  return [
  'LOG_DIR="$HOME/Library/Logs/EventoTron"',
  'mkdir -p "$LOG_DIR"',
  'LOG="$LOG_DIR/desktop-app.log"',
  `cd ${shellQuote(root)} || exit 1`,
  "",
  "find_node() {",
  "  {",
  "    printf '%s\\n' /opt/homebrew/bin/node",
  "    printf '%s\\n' /usr/local/bin/node",
  "    printf '%s\\n' /opt/local/bin/node",
  "    command -v node 2>/dev/null",
  '    ls -1d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -Vr',
  '    ls -1d "$HOME"/.volta/tools/image/node/*/bin/node 2>/dev/null | sort -Vr',
  '    ls -1d "$HOME"/.asdf/installs/nodejs/*/bin/node 2>/dev/null | sort -Vr',
  '    ls -1d "$HOME"/.fnm/node-versions/*/installation/bin/node 2>/dev/null | sort -Vr',
  "  } | while IFS= read -r candidate; do",
  '    [ -n "$candidate" ] && [ -x "$candidate" ] || continue',
  '    version=$("$candidate" -p process.versions.node 2>/dev/null) || continue',
  '    major=$(printf %s "$version" | cut -d. -f1)',
  '    minor=$(printf %s "$version" | cut -d. -f2)',
  '    case "$major$minor" in "" | *[!0-9]*) continue ;; esac',
  `    if [ "$major" -gt ${minMajor} ] || { [ "$major" -eq ${minMajor} ] && [ "$minor" -ge ${minMinor} ]; }; then`,
  '      printf \'%s\\n\' "$candidate"',
  "      break",
  "    fi",
  "  done",
  "}",
  "",
  "NODE=$(find_node | head -n 1)",
  'if [ -z "$NODE" ]; then',
  `  echo "EventoTron could not find Node ${minMajor}.${minMinor} or newer on this Mac." >&2`,
  '  echo "Install it (for example: brew install node) and click EventoTron again." >&2',
  `  printf '[%s] no usable Node found\\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"`,
  "  exit 1",
  "fi",
  "",
  'NODE_VERSION=$("$NODE" -p process.versions.node 2>/dev/null)',
  `printf '[%s] launching with %s (v%s)\\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$NODE" "$NODE_VERSION" >> "$LOG"`,
  'PATH="$(dirname "$NODE"):$PATH"',
  "export PATH",
  "EVENTOTRON_DESKTOP=1",
  "export EVENTOTRON_DESKTOP",
  `nohup "$NODE" ${shellQuote(`${root}/scripts/desktop-launcher.mjs`)} >> "$LOG" 2>&1 &`,
  ].join("\n");
}

// A failed launch used to be invisible: the error only reached a log file, so
// clicking the icon simply did nothing. Surface it instead.
export function buildLauncherSource(launchScript) {
  return `const app = Application.currentApplication();
app.includeStandardAdditions = true;
try {
  app.doShellScript(${JSON.stringify(launchScript)});
} catch (error) {
  const detail = String((error && error.message) || error);
  app.displayAlert("EventoTron could not start", {
    message: detail + "\\n\\nDetails: ~/Library/Logs/EventoTron/desktop-app.log",
    as: "critical",
  });
}
`;
}

async function main() {
  const script = buildLauncherSource(buildLaunchScript(projectRoot));

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
}

// Importing this module (for tests) must not compile a bundle.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
