import fastify from "fastify";
import { beforeAll, describe, expect, it } from "vitest";

import { registerRoutes } from "../src/core/http/router";
import { signAccessToken } from "../src/core/auth/jwt";
import { db } from "../src/core/database/client";
import { cities } from "../src/modules/catalog/catalog.schema";
import { companies } from "../src/modules/companies/companies.schema";
import { messageHistory } from "../src/modules/messages/messages.schema";
import { users } from "../src/modules/auth/auth.schema";

describe("Messages history", () => {
  let app: ReturnType<typeof fastify>;
  let token: string;
  let companyId: string;
  const peerE164 = "+5515999999999";

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "secret-secret-secret-123456";
    process.env.REFRESH_SECRET = process.env.REFRESH_SECRET ?? "refresh-secret-456789";
    process.env.WHATSAPP_WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET ?? "webhook-secret-123456";
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://buscai:buscai@localhost:5433/buscai";

    app = fastify();
    await registerRoutes(app);
    await app.ready();

    const [createdUser] = await db
      .insert(users)
      .values({
        name: "Messages Owner",
        email: `messages-owner-${Date.now()}@buscai.local`,
        passwordHash: "hash",
        role: "company_owner",
      })
      .returning({ id: users.id });
    const userId = createdUser?.id ?? "00000000-0000-0000-0000-000000000002";
    token = signAccessToken({ id: userId, role: "company_owner" });

    let [city] = await db.select({ id: cities.id }).from(cities).limit(1);
    if (!city) {
      const [createdCity] = await db
        .insert(cities)
        .values({ name: "Cidade Teste", state: "SP", isActive: true })
        .returning({ id: cities.id });
      city = createdCity;
    }
    const [created] = await db
      .insert(companies)
      .values({
        ownerId: userId,
        tradeName: "Empresa Teste Mensagens",
        cityId: city?.id ?? "00000000-0000-0000-0000-000000000001",
      })
      .returning({ id: companies.id });
    companyId = created?.id ?? "00000000-0000-0000-0000-000000000010";
  });

  it("lists inbound and outbound messages ordered by createdAt", async () => {
    await db.insert(messageHistory).values([
      {
        companyId,
        direction: "inbound",
        peerE164,
        providerMessageId: "msg-in-1",
        text: "Oi, preciso de ajuda",
        searchId: null,
        meta: { source: "test" },
      },
      {
        companyId,
        direction: "outbound",
        peerE164,
        providerMessageId: null,
        text: "Resposta teste",
        searchId: null,
        meta: { source: "test" },
      },
    ]);

    const res = await app.inject({
      method: "GET",
      url: `/messages/history?limit=50&peerE164=${encodeURIComponent(peerE164)}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.items.length).toBeGreaterThanOrEqual(2);
    expect(payload.items[0].createdAt >= payload.items[1].createdAt).toBe(true);
    expect(payload.items[0].peerE164).toBe(peerE164);
  });
});
