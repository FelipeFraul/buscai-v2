import axios, { AxiosError } from "axios";

type Company = {
  id: string;
  tradeName?: string;
  name?: string;
};

type WalletResponse = {
  balance: number;
  reserved: number;
  currency: string;
  lastTransactions?: Transaction[];
};

type Transaction = {
  id: string;
  type: "recharge" | "search_debit" | string;
  status?: string;
  amount: number;
  occurredAt?: string;
};

type RechargeIntent = {
  id: string;
  status?: string;
  amount: number;
};

type AuctionConfig = {
  id: string;
  bidAmount: number;
  dailyBudget?: number | null;
};

type SearchResult = {
  companyId?: string;
  position: number;
  isPaid: boolean;
  chargedAmount: number;
};

const API_BASE = "http://localhost:3001";
const DEMO_EMAIL = "demo@buscai.app";
const DEMO_PASSWORD = "demo123";

function decodeCompanyIdFromRefreshToken(refreshToken: string): string {
  try {
    const [, payloadBase64] = refreshToken.split(".");
    if (!payloadBase64) {
      throw new Error("refreshToken inválido (sem payload)");
    }

    const json = Buffer.from(payloadBase64, "base64").toString("utf8");
    const payload = JSON.parse(json) as { companyId?: string; company_id?: string };

    const companyId = payload.companyId ?? (payload as any).company_id;
    if (!companyId) {
      throw new Error("companyId não encontrado no refreshToken");
    }

    return companyId;
  } catch (err) {
    console.error("Falha ao decodificar companyId do refreshToken:", err);
    throw err;
  }
}

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10_000,
});

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function createAxiosError(err: AxiosError) {
  return {
    message: err.message,
    code: err.code,
    request: {
      method: err.config?.method,
      url: err.config?.url,
    },
    response: err.response
      ? {
          status: err.response.status,
          data: err.response.data,
        }
      : undefined,
  };
}

async function loginAndCreateClient(): Promise<{ client: typeof api; companyId: string }> {
  try {
    const loginRes = await api.post("/auth/login", {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });

    console.log("Login status:", loginRes.status);
    console.log("Login data:", loginRes.data);

    const { accessToken, refreshToken } = loginRes.data ?? {};

    if (!accessToken || !refreshToken) {
      throw new Error("Login não retornou accessToken/refreshToken");
    }

    const companyId = decodeCompanyIdFromRefreshToken(refreshToken);

    const client = axios.create({
      baseURL: API_BASE,
      timeout: 8_000,
    });

    client.interceptors.request.use((config) => {
      if (!config.headers) {
        config.headers = {};
      }
      (config.headers as any).Authorization = `Bearer ${accessToken}`;
      return config;
    });

    return { client, companyId };
  } catch (err: any) {
    if (axios.isAxiosError(err)) {
      console.error("Erro Axios:", createAxiosError(err));
    } else {
      console.error("Erro inesperado no login:", err);
    }
    throw err;
  }
}

async function getWallet(client: typeof api): Promise<WalletResponse> {
  const res = await client.get("/billing/wallet");
  if (res.status !== 200) {
    throw new Error(`Falha ao buscar wallet: status=${res.status}`);
  }
  return res.data as WalletResponse;
}

async function createRechargeIntent(client: typeof api, amount: number): Promise<RechargeIntent> {
  const res = await client.post("/billing/recharges", { amount });
  if (res.status !== 201) {
    throw new Error(`Falha ao criar recarga: status=${res.status} payload=${JSON.stringify(res.data)}`);
  }

  return {
    id: res.data?.id,
    status: res.data?.status ?? "pending",
    amount: Number(res.data?.amount ?? amount),
  };
}

async function confirmRecharge(client: typeof api, rechargeId: string) {
  const res = await client.post(`/billing/recharges/${rechargeId}/confirm`, {});
  if (res.status >= 300) {
    throw new Error(
      `Falha ao confirmar recarga: status=${res.status} payload=${JSON.stringify(res.data)}`
    );
  }

  return {
    rechargeId: res.data?.rechargeId ?? rechargeId,
    status: res.data?.status ?? "confirmed",
    amount: Number(res.data?.amount ?? 0),
    newBalance: Number(res.data?.newBalance ?? 0),
  };
}

async function fetchCityAndNiche(): Promise<{ cityId: string; nicheId: string }> {
  const citiesRes = await api.get("/cities");
  const nichesRes = await api.get("/niches");

  const cityId = (citiesRes.data ?? [])[0]?.id as string | undefined;
  const nicheId = (nichesRes.data ?? [])[0]?.id as string | undefined;

  if (!cityId || !nicheId) {
    throw new Error("Não foi possível obter cityId/nicheId dos endpoints públicos");
  }

  return { cityId, nicheId };
}

async function ensureAuctionConfig(
  client: typeof api,
  companyId: string,
  cityId: string,
  nicheId: string
): Promise<AuctionConfig> {
  const existing = await client.get("/auction/configs", {
    params: { companyId, cityId, nicheId },
  });

  if (Array.isArray(existing.data) && existing.data.length > 0) {
    const config = existing.data[0];
    return {
      id: config.id ?? "unknown",
      bidAmount: Number(config.bids?.position1 ?? 0),
      dailyBudget: config.dailyBudget ? Number(config.dailyBudget) : undefined,
    };
  }

  const createRes = await client.post("/auction/configs", {
    companyId,
    cityId,
    nicheId,
    mode: "manual",
    bids: { position1: 5, position2: 4, position3: 3 },
  });

  if (createRes.status >= 300) {
    throw new Error(
      `Falha ao criar config de leilão: status=${createRes.status} payload=${JSON.stringify(createRes.data)}`
    );
  }

  const data = createRes.data ?? {};
  return {
    id: data.id ?? "unknown",
    bidAmount: Number(data.bids?.position1 ?? 0),
    dailyBudget: data.dailyBudget ? Number(data.dailyBudget) : undefined,
  };
}

async function performSearch(client: typeof api, cityId: string, nicheId: string) {
  const res = await client.post("/search", {
    query: "teste",
    cityId,
    nicheId,
    source: "web",
  });

  if (res.status !== 200) {
    throw new Error(`Busca falhou: status=${res.status} payload=${JSON.stringify(res.data)}`);
  }

  const results = (res.data?.results ?? []) as Array<{
    company?: { id?: string; tradeName?: string };
    rank?: number;
    position: number;
    isPaid: boolean;
    chargedAmount?: number;
  }>;

  const mapped: SearchResult[] = results.map((r) => ({
    companyId: r.company?.id,
    position: r.position,
    isPaid: r.isPaid,
    chargedAmount: Number(r.chargedAmount ?? 0),
  }));

  const paid = mapped.filter((r) => r.isPaid && r.position <= 3);
  const organic = mapped.filter((r) => !r.isPaid);

  return { paid, organic };
}

async function fetchTransactions(client: typeof api): Promise<Transaction[]> {
  const res = await client.get("/billing/transactions");
  if (res.status !== 200) {
    throw new Error(`Falha ao listar transações: status=${res.status}`);
  }
  return (res.data ?? []) as Transaction[];
}

function summarizeTransactions(transactions: Transaction[]) {
  const totalRecharge = transactions
    .filter((tx) => tx.type === "recharge")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const totalSearchDebit = transactions
    .filter((tx) => tx.type === "search_debit")
    .reduce((sum, tx) => sum + tx.amount, 0);

  return { totalRecharge, totalSearchDebit };
}

async function main() {
  try {
    console.log("Iniciando fluxo dev de billing/leilão/busca...");

    // 1) Login + client autenticado + companyId direto do refreshToken
    const { client, companyId } = await loginAndCreateClient();
    console.log(`Empresa (companyId do token): ${companyId}`);

    // 2) Wallet antes da recarga
    const walletBefore = await getWallet(client);
    console.log("\n--- Carteira ANTES da recarga ---");
    console.log("Saldo:", formatBRL(walletBefore.balance));
    console.log("Reservado:", formatBRL(walletBefore.reserved ?? 0));

    // 3) Criar recarga fake de R$ 100 e confirmar
    const recharge = await createRechargeIntent(client, 100);
    const confirmed = await confirmRecharge(client, recharge.id);

    console.log("\n--- Recarga ---");
    console.log("Recarga ID:", confirmed.rechargeId);
    console.log("Valor recarga:", formatBRL(confirmed.amount));
    console.log("Novo saldo (API):", formatBRL(confirmed.newBalance));

    // 4) Wallet depois da recarga
    const walletAfter = await getWallet(client);
    console.log("\n--- Carteira DEPOIS da recarga ---");
    console.log("Saldo:", formatBRL(walletAfter.balance));
    console.log("Reservado:", formatBRL(walletAfter.reserved ?? 0));

    // 5) Cidade/nicho de teste
    console.log("\nBuscando cidade/nicho para teste...");
    const { cityId, nicheId } = await fetchCityAndNiche();
    console.log("Cidade ID:", cityId);
    console.log("Nicho ID:", nicheId);

    // 6) Garantir config de leilão para ESSA empresa
    const auctionConfig = await ensureAuctionConfig(client, companyId, cityId, nicheId);

    console.log("\n--- Configuração de leilão usada ---");
    console.log("Config ID:", auctionConfig.id);
    console.log("Lance:", formatBRL(auctionConfig.bidAmount));
    console.log(
      "Budget diário:",
      auctionConfig.dailyBudget != null ? formatBRL(auctionConfig.dailyBudget) : "não definido"
    );

    // 7) Disparar uma busca e separar pagos vs orgânicos
    const { paid, organic } = await performSearch(client, cityId, nicheId);

    console.log("\n--- Resultados da busca ---");
    console.log("Pagos (1–3):");
    for (const r of paid) {
      console.log(
        `  pos=${r.position} companyId=${r.companyId} isPaid=${r.isPaid} charged=${formatBRL(
          r.chargedAmount
        )}`
      );
    }

    console.log("Orgânicos (4–5):");
    for (const r of organic) {
      console.log(
        `  pos=${r.position} companyId=${r.companyId} isPaid=${r.isPaid} charged=${formatBRL(
          r.chargedAmount
        )}`
      );
    }

    // 8) Transações e resumo
    const transactions = await fetchTransactions(client);
    const summary = summarizeTransactions(transactions);

    console.log("\n--- Resumo de transações ---");
    console.log("Total recargas (recharge):", formatBRL(summary.totalRecharge));
    console.log("Total débitos de busca (search_debit):", formatBRL(summary.totalSearchDebit));
    console.log("Transações brutas (últimas):");
    for (const tx of transactions) {
      console.log(
        `  ${tx.id} | ${tx.type} | ${tx.status ?? "n/a"} | ${formatBRL(tx.amount)} | ${
          tx.occurredAt ?? "-"
        }`
      );
    }

    console.log("\nFluxo concluído com sucesso.");
  } catch (error: any) {
    console.error("Erro no fluxo de billing/leilão/busca:");
    if (error?.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
    } else if (axios.isAxiosError(error)) {
      console.error("Erro Axios:", createAxiosError(error));
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

void main();
