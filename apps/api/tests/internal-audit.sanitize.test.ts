import { describe, expect, it } from "vitest";

import {
  assertNoSensitiveKeys,
  sanitizeAuditPayload,
} from "../src/core/audit/sanitize";

describe("sanitizeAuditPayload", () => {
  it("removes PII/dangerous keys and keeps safe metadata", () => {
    const payload = {
      provider: "zapi",
      phoneMasked: "55*****99",
      status: 500,
      reason: "send_failed",
      queryLength: 12,
      attempts: 2,
      from: "5511999999999",
      to: "5511888888888",
      query: "pizzaria",
      data: { anything: "secret" },
      headers: { authorization: "Bearer token" },
      error: { message: "socket hang up", stack: "very long stack" },
      durationMs: 321,
    };

    const sanitized = sanitizeAuditPayload(payload);

    expect(sanitized).toMatchObject({
      provider: "zapi",
      phoneMasked: "55*****99",
      status: 500,
      reason: "send_failed",
      queryLength: 12,
      attempts: 2,
      durationMs: 321,
    });
    expect(sanitized).not.toHaveProperty("from");
    expect(sanitized).not.toHaveProperty("to");
    expect(sanitized).not.toHaveProperty("query");
    expect(sanitized).not.toHaveProperty("data");
    expect(sanitized).not.toHaveProperty("headers");
    expect(typeof sanitized.error).toBe("string");
  });

  it("keeps useful suffix fields and tenant context fields", () => {
    const sanitized = sanitizeAuditPayload({
      appVersion: "1.2.3",
      eventKind: "webhook",
      trafficSource: "whatsapp",
      companyId: "company-1",
      tenantId: "tenant-1",
      cityId: "city-1",
      nicheId: "niche-1",
    });

    expect(sanitized).toMatchObject({
      appVersion: "1.2.3",
      eventKind: "webhook",
      trafficSource: "whatsapp",
      companyId: "company-1",
      tenantId: "tenant-1",
      cityId: "city-1",
      nicheId: "niche-1",
    });
  });

  it("removes nested sensitive keys from arrays/objects", () => {
    const sanitized = sanitizeAuditPayload({
      provider: "zapi",
      attempts: 2,
      nested: {
        headers: { authorization: "Bearer token" },
        responsePayload: { data: "secret" },
        safeCount: 3,
      },
      steps: [
        { messageId: "m1", recipient: "5511999999999", status: 200 },
        { source: "whatsapp", traceId: "abc-123" },
      ],
    });

    expect(sanitized).toEqual({
      provider: "zapi",
      attempts: 2,
    });
  });
});

describe("assertNoSensitiveKeys", () => {
  it("throws when sensitive keys exist in nested payload", () => {
    expect(() =>
      assertNoSensitiveKeys({
        reason: "send_failed",
        nested: {
          sender: "5511999999999",
          responsePayload: { foo: "bar" },
          deep: [{ trace: "stacktrace" }],
        },
      })
    ).toThrow(/Sensitive keys/);
  });

  it("does not throw for safe payload", () => {
    expect(() =>
      assertNoSensitiveKeys({
        provider: "zapi",
        phoneMasked: "55*****99",
        reason: "send_failed",
        status: 500,
        durationMs: 123,
        appVersion: "1.0.0",
      })
    ).not.toThrow();
  });
});
