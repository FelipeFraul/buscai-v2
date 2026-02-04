import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchResponse } from "@buscai/shared-schema";

import type { InternalAuditService } from "../src/modules/internal-audit/internal-audit.service";
import type { SearchService } from "../src/modules/search/search.service";

const dbMock = {
  select: vi.fn(),
};

vi.mock("../src/core/database/client", () => ({
  db: dbMock,
}));

function setCityRows(names: string[]) {
  dbMock.select.mockImplementation(() => ({
    from: vi.fn().mockResolvedValue(names.map((name) => ({ name }))),
  }));
}

function setEnv(defaultCityName?: string, provider: "meta" | "zapi" = "meta") {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? "secret-secret-secret-123";
  process.env.REFRESH_SECRET = process.env.REFRESH_SECRET ?? "refresh-secret-456789";
  process.env.WHATSAPP_WEBHOOK_SECRET = "super-secret-webhook";
  process.env.WHATSAPP_WEBHOOK_RATE_LIMIT = "5";
  process.env.WHATSAPP_WEBHOOK_RATE_WINDOW_MS = "60000";
  process.env.WHATSAPP_PROVIDER = provider;
  process.env.WHATSAPP_API_URL = "http://localhost";
  process.env.WHATSAPP_API_TOKEN = "token-for-tests-123456789";
  process.env.CLAIM_SUPPORT_WHATSAPP = "5515999999999";
  process.env.SERPAPI_API_KEY = "serpapi-test-key";
  process.env.WHATSAPP_DEFAULT_CITY_ID =
    process.env.WHATSAPP_DEFAULT_CITY_ID ?? "00000000-0000-0000-0000-000000000000";
  process.env.WHATSAPP_DEFAULT_NICHE_ID = process.env.WHATSAPP_DEFAULT_NICHE_ID ?? "niche-for-tests";
  process.env.DEFAULT_CITY_NAME = defaultCityName ?? "Itapetininga";
  process.env.PUBLIC_BASE_URL = "http://localhost:3001";
  process.env.ZAPI_BASE_URL = "https://api.z-api.io";
  process.env.ZAPI_INSTANCE_ID = "instance-1";
  process.env.ZAPI_INSTANCE_TOKEN = "token-1";
  process.env.ZAPI_CLIENT_TOKEN = "client-token-1";
}

async function buildService(
  defaultCityName?: string,
  provider: "meta" | "zapi" = "meta",
  options?: { mockSendText?: boolean }
) {
  setEnv(defaultCityName, provider);
  vi.resetModules();

  const { WhatsappService } = await import("../src/modules/integrations/whatsapp.service");

  const searchService = {
    publicSearch: vi.fn(),
    findCityIdByName: vi.fn().mockResolvedValue("city-1"),
    getNicheCandidates: vi.fn().mockResolvedValue([]),
    findSearchById: vi.fn().mockResolvedValue(null),
  } as unknown as SearchService;

  const auditService = {
    logEvent: vi.fn().mockResolvedValue(undefined),
  } as unknown as InternalAuditService;

  const httpClient = { post: vi.fn() };
  const service = new WhatsappService(searchService, auditService, httpClient as never);
  const shouldMockSendText = options?.mockSendText !== false;
  const sendTextMock = shouldMockSendText
    ? vi
        .spyOn(service as unknown as { sendText: () => Promise<void> }, "sendText")
        .mockResolvedValue(undefined)
    : undefined;

  return { service, searchService, sendTextMock, httpClient };
}

function buildResponse(withOfferedBy: boolean): SearchResponse {
  const results = Array.from({ length: 6 }).map((_, index) => ({
    company: {
      id: `company-${index + 1}`,
      tradeName: `Empresa ${index + 1}`,
      channels: {
        whatsapp: "5511999999999",
        phone: "551133333333",
        address: `Rua ${index + 1}`,
      },
    },
    rank: index + 1,
    position: index + 1,
    isPaid: index < 3,
    chargedAmount: 1,
  }));

  return {
    searchId: "search-1",
    offeredBy: withOfferedBy
      ? { text: "Empresa Parceira", website: "https://exemplo.com" }
      : undefined,
    results,
  } as SearchResponse;
}

describe("Whatsapp reply via public search", () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    setCityRows(["Itapetininga", "Sao Paulo"]);
  });

  it("calls publicSearch and formats paid entries for the auction layout", async () => {
    const { service, searchService, sendTextMock } = await buildService();
    const response = buildResponse(true);
    const publicSearchMock = searchService.publicSearch as unknown as ReturnType<typeof vi.fn>;
    publicSearchMock.mockResolvedValue(response);

    await service.handleInboundSearch({
      from: "5511999999999",
      text: "cidade: Itapetininga; dentista",
      phoneNumberId: "12345",
    });

    expect(searchService.publicSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "dentista",
        city: "Itapetininga",
        limit: 5,
        source: "whatsapp",
      })
    );

    expect(sendTextMock).toHaveBeenCalledTimes(2);
    const reply = sendTextMock.mock.calls[0][1] as string;
    expect(reply).toContain("*Empresa 1* \uD83E\uDD47");
    expect(reply).toContain("Endereco: ```Rua 1```");
    expect(reply).toContain("> Telefone: 551133333333");
    expect(reply).toContain("> WhatsApp: 5511999999999");
    const offeredByReply = sendTextMock.mock.calls[1][1] as string;
    expect(offeredByReply).toContain("Oferecido por:");
  });

  it("returns a reply when offeredBy is not present", async () => {
    const { service, searchService, sendTextMock } = await buildService();
    const response = buildResponse(false);
    const publicSearchMock = searchService.publicSearch as unknown as ReturnType<typeof vi.fn>;
    publicSearchMock.mockResolvedValue(response);

    await service.handleInboundSearch({
      from: "5511999999999",
      text: "cidade: Itapetininga; loja",
      phoneNumberId: "12345",
    });

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    const reply = sendTextMock.mock.calls[0][1] as string;
    expect(reply).not.toContain("Oferecido por:");
  });

  it("asks for city when missing and default is empty", async () => {
    const { service, searchService, sendTextMock } = await buildService("");

    await service.handleInboundSearch({
      from: "5511999999999",
      text: "dentista",
      phoneNumberId: "12345",
    });

    expect(searchService.publicSearch).not.toHaveBeenCalled();
    expect(sendTextMock).toHaveBeenCalledTimes(1);
    const reply = sendTextMock.mock.calls[0][1] as string;
    expect(reply).toContain("Me diga sua cidade");
  });

  it("stores city when message is only a city name", async () => {
    const { service, searchService, sendTextMock } = await buildService();

    await service.handleInboundSearch({
      from: "5511999999999",
      text: "Itapetininga",
      phoneNumberId: "12345",
    });

    expect(searchService.publicSearch).not.toHaveBeenCalled();
    expect(sendTextMock).toHaveBeenCalledTimes(1);
    const reply = sendTextMock.mock.calls[0][1] as string;
    expect(reply).toContain("Ok. O que voce procura?");
  });

  it("splits query and city from the same message", async () => {
    const { service, searchService } = await buildService();
    const response = buildResponse(false);
    const publicSearchMock = searchService.publicSearch as unknown as ReturnType<typeof vi.fn>;
    publicSearchMock.mockResolvedValue(response);

    await service.handleInboundSearch({
      from: "5511999999999",
      text: "Vibe coding Itapetininga",
      phoneNumberId: "12345",
    });

    expect(searchService.publicSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "vibe coding",
        city: "Itapetininga",
        limit: 5,
        source: "whatsapp",
      })
    );
  });

  it("uses session city when only the query is provided", async () => {
    const { service, searchService } = await buildService();
    const response = buildResponse(false);
    const publicSearchMock = searchService.publicSearch as unknown as ReturnType<typeof vi.fn>;
    publicSearchMock.mockResolvedValue(response);

    await service.handleInboundSearch({
      from: "5511999999999",
      text: "Itapetininga",
      phoneNumberId: "12345",
    });

    await service.handleInboundSearch({
      from: "5511999999999",
      text: "Vibe coding",
      phoneNumberId: "12345",
    });

    expect(searchService.publicSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "vibe coding",
        city: "Itapetininga",
        limit: 5,
        source: "whatsapp",
      })
    );
  });

  it("does not prompt for city when session already has it", async () => {
    const { service, searchService, sendTextMock } = await buildService();
    const response = buildResponse(false);
    const publicSearchMock = searchService.publicSearch as unknown as ReturnType<typeof vi.fn>;
    publicSearchMock.mockResolvedValue(response);

    await service.handleInboundSearch({
      from: "5515997503836",
      text: "Itapetininga",
      phoneNumberId: "12345",
    });

    await service.handleInboundSearch({
      from: "5515997503836",
      text: "Vibe coding",
      phoneNumberId: "12345",
    });

    const replies = sendTextMock.mock.calls.map((call) => String(call[1]));
    expect(replies.some((reply) => reply.includes("Me diga sua cidade"))).toBe(false);
    expect(searchService.publicSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "vibe coding",
        city: "Itapetininga",
        limit: 5,
        source: "whatsapp",
      })
    );
  });

  it("removes stopwords before searching", async () => {
    const { service, searchService } = await buildService();
    const response = buildResponse(false);
    const publicSearchMock = searchService.publicSearch as unknown as ReturnType<typeof vi.fn>;
    publicSearchMock.mockResolvedValue(response);

    await service.handleInboundSearch({
      from: "5511999999999",
      text: "Vibe coding em Itapetininga",
      phoneNumberId: "12345",
    });

    expect(searchService.publicSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "vibe coding",
        city: "Itapetininga",
        limit: 5,
        source: "whatsapp",
      })
    );
  });

  it("sends Z-API text payload", async () => {
    const { service, searchService, httpClient } = await buildService(undefined, "zapi", {
      mockSendText: false,
    });
    (httpClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 200, data: {} });
    const response = buildResponse(true);
    const publicSearchMock = searchService.publicSearch as unknown as ReturnType<typeof vi.fn>;
    publicSearchMock.mockResolvedValue(response);

    await service.handleInboundSearch({
      from: "5511999999999",
      text: "cidade: Itapetininga; dentista",
      phoneNumberId: "12345",
    });

    const calls = (httpClient.post as ReturnType<typeof vi.fn>).mock.calls;
    const textCall = calls.find((call) => String(call[0]).includes("/send-text"));
    expect(textCall).toBeTruthy();
    const payload = textCall?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({
      phone: "5511999999999",
    });
    expect(String(payload.message)).toContain("*Empresa 1* \uD83E\uDD47");
  });
});



