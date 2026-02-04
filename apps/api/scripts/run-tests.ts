import { spawnSync } from "node:child_process";

const rawArgs = process.argv.slice(2);
const normalizedArgs = rawArgs.map((arg) =>
  arg === "subscription*.test.ts" ? "subscription.test.ts" : arg
);

const result = spawnSync(
  "vitest",
  ["run", "--exclude", "tests/e2e/**", ...normalizedArgs],
  { stdio: "inherit", shell: true }
);

process.exit(result.status ?? 1);
