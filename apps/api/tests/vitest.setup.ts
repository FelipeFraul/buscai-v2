import { beforeEach } from "vitest";

const DEFAULT_ENV: Record<string, string> = {
  NODE_ENV: "test",
  WHATSAPP_PROVIDER: "meta",
  WHATSAPP_WEBHOOK_SECRET: "super-secret-webhook",
  WHATSAPP_WEBHOOK_RATE_LIMIT: "5",
};

beforeEach(() => {
  for (const [key, value] of Object.entries(DEFAULT_ENV)) {
    process.env[key] = value;
  }
});
