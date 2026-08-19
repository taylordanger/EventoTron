import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLaunchScript, buildLauncherSource } from "../scripts/build-macos-app.mjs";

/**
 * The desktop app previously baked an absolute Node path into the bundle at
 * build time. A `brew upgrade node` deleted that exact Cellar directory and
 * every click of the icon failed silently for eleven days. These tests run the
 * generated resolution logic for real, under the kind of minimal environment
 * Finder actually gives a launched app.
 */

const script = buildLaunchScript("/tmp/eventotron-test-root");

/** Runs the launch script with the background launch replaced by an echo. */
function runResolution({ env = {}, replaceCandidates = {} } = {}) {
  let body = script.replace(/^nohup .*$/m, 'echo "RESOLVED:$NODE"');
  for (const [from, to] of Object.entries(replaceCandidates)) {
    body = body.split(from).join(to);
  }
  // `cd` into a directory that does not exist would abort before resolving.
  body = body.replace(/^cd .*$/m, "cd /tmp || exit 1");
  const dir = mkdtempSync(join(tmpdir(), "eventotron-probe-"));
  const path = join(dir, "probe.sh");
  writeFileSync(path, body);
  try {
    const stdout = execFileSync("/bin/sh", [path], {
      encoding: "utf8",
      env: { HOME: process.env.HOME ?? "/tmp", PATH: "/usr/bin:/bin:/usr/sbin:/sbin", ...env },
    });
    return { ok: true, resolved: (stdout.match(/RESOLVED:(.*)/) ?? [])[1]?.trim() ?? "" };
  } catch (error) {
    return { ok: false, stderr: String(error.stderr ?? ""), status: error.status };
  }
}

test("the launcher never bakes in a versioned interpreter path", () => {
  // The exact shape of the original bug: /opt/homebrew/Cellar/node/26.5.0_1/bin/node
  assert.doesNotMatch(script, /Cellar/);
  assert.doesNotMatch(script, /\/node\/\d+\.\d+\.\d+/);
  // It must probe the stable symlinks Homebrew re-points on upgrade instead.
  assert.match(script, /\/opt\/homebrew\/bin\/node/);
  assert.match(script, /\/usr\/local\/bin\/node/);
});

test("Node is resolved at click time under a Finder-style minimal PATH", () => {
  const result = runResolution();
  assert.equal(result.ok, true, `resolution failed: ${result.stderr ?? ""}`);
  assert.ok(result.resolved, "no interpreter was resolved");
  // Whatever it picked must actually run and satisfy the engines floor.
  const version = execFileSync(result.resolved, ["-p", "process.versions.node"], {
    encoding: "utf8",
  }).trim();
  const [major, minor] = version.split(".").map(Number);
  assert.ok(major > 22 || (major === 22 && minor >= 13), `resolved Node ${version} is too old`);
});

test("an interpreter older than the engines floor is skipped", () => {
  const dir = mkdtempSync(join(tmpdir(), "eventotron-oldnode-"));
  mkdirSync(join(dir, "bin"), { recursive: true });
  const fake = join(dir, "bin", "node");
  writeFileSync(fake, "#!/bin/sh\necho 18.20.0\n");
  chmodSync(fake, 0o755);

  const result = runResolution({
    replaceCandidates: { "/opt/homebrew/bin/node": fake },
  });
  assert.equal(result.ok, true, `resolution failed: ${result.stderr ?? ""}`);
  assert.notEqual(result.resolved, fake, "a Node below the engines floor was accepted");
});

test("a missing Node fails loudly instead of silently doing nothing", () => {
  const result = runResolution({
    env: { HOME: "/nonexistent-eventotron-home" },
    replaceCandidates: {
      "/opt/homebrew/bin/node": "/nonexistent/a/node",
      "/usr/local/bin/node": "/nonexistent/b/node",
      "/opt/local/bin/node": "/nonexistent/c/node",
    },
  });
  assert.equal(result.ok, false, "a missing Node should be a non-zero exit");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /could not find Node/i);
  assert.match(result.stderr, /brew install node/);
});

test("the resolved interpreter's directory is put on PATH for npm", () => {
  // desktop-launcher.mjs shells out to `npm run build` on first run, which
  // fails under launchd's minimal PATH unless we extend it.
  assert.match(script, /PATH="\$\(dirname "\$NODE"\):\$PATH"/);
  assert.match(script, /export PATH/);
});

test("a failed launch surfaces a dialog rather than only a log line", () => {
  const source = buildLauncherSource(script);
  assert.match(source, /try \{/);
  assert.match(source, /displayAlert\("EventoTron could not start"/);
  assert.match(source, /as: "critical"/);
  assert.match(source, /desktop-app\.log/);
});
