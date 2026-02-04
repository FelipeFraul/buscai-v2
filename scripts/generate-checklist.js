import { mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";

const checklist = [
  "- ENV vars set (DB, JWT, WhatsApp tokens, chaos flags)",
  "- Migrations applied",
  "- Rate limiting, timeout, chaos, and error handler enabled",
  "- Prometheus metrics reachable at /internal/metrics",
  "- Health check /internal/health returns 200",
  "- Circuit breakers/reset policies reviewed",
  "- E2E tests passing",
  "- Frontend fault injection disabled in production",
];

const content = `# Production Checklist\n\n${checklist.join("\n")}\n`;

const target = resolve(process.cwd(), "build/production-checklist.md");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, content, "utf-8");
console.log("production-checklist.md generated");
