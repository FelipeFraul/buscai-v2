import client from "prom-client";

const register = new client.Registry();

client.collectDefaultMetrics({ register });

export const requestCounter = new client.Counter({
  name: "buscai_requests_total",
  help: "Total de requisições recebidas",
  labelNames: ["method", "route", "status"] as const,
});

register.registerMetric(requestCounter);

export async function getMetrics(): Promise<string> {
  return register.metrics();
}
