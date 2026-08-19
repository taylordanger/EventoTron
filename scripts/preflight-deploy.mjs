import { fileURLToPath } from "node:url";

/**
 * Refuses obviously-wrong deployments before Wrangler is invoked.
 *
 * These are the mistakes that are cheap to make and expensive to notice:
 * shipping against the placeholder database (which silently is not your data),
 * or shipping a build that grants admin without sign-in.
 */

export const PLACEHOLDER_DATABASE_ID = "00000000-0000-4000-8000-000000000000";

export function preflightProblems(env) {
  const problems = [];

  const databaseId = env.EVENTOTRON_D1_DATABASE_ID;
  if (!databaseId) {
    problems.push(
      "EVENTOTRON_D1_DATABASE_ID is not set, so this would deploy against the placeholder database.\n" +
        "  Create one with:  npx wrangler d1 create eventotron\n" +
        "  Then export the id it prints as EVENTOTRON_D1_DATABASE_ID.",
    );
  } else if (databaseId === PLACEHOLDER_DATABASE_ID) {
    problems.push(
      "EVENTOTRON_D1_DATABASE_ID is still the placeholder id. Set it to a real D1 database.",
    );
  }

  if (env.EVENTOTRON_LOCAL_MODE) {
    problems.push(
      "EVENTOTRON_LOCAL_MODE is set in this shell. That flag grants admin with no sign-in and\n" +
        "  must never reach a deployment. Unset it and deploy again.",
    );
  }

  return problems;
}

/** Reminders rather than blockers — these live in Wrangler secrets, not the shell. */
export const REQUIRED_SECRETS = [
  "CF_ACCESS_TEAM_DOMAIN",
  "CF_ACCESS_AUD",
  "INITIAL_ADMIN_EMAIL",
  "TOKEN_ENCRYPTION_KEY",
  "OAUTH_STATE_SECRET",
];

function main() {
  const problems = preflightProblems(process.env);
  if (problems.length) {
    console.error("EventoTron will not deploy yet:\n");
    for (const problem of problems) console.error(`• ${problem}\n`);
    process.exitCode = 1;
    return;
  }
  console.log("Preflight passed. Confirm these are set as Wrangler secrets on the target Worker:");
  for (const secret of REQUIRED_SECRETS) console.log(`  - ${secret}`);
  console.log("  (npx wrangler secret put <NAME>)\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
