import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build output at any depth. The `--ignore-pattern dist` flag on the lint
    // script resolves relative to the working directory, so it only catches
    // the top-level copy; a nested one, such as a git worktree under
    // .claude/, would otherwise be linted as source.
    "**/dist/**",
    "**/.wrangler/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
