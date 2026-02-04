import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      id: string;
      role?: "admin" | "company_owner";
      companyId?: string;
    };
  }
}
