import { FastifyInstance } from "fastify";

import { AuctionController } from "../../modules/auction/auction.controller";
import { AuctionRepository } from "../../modules/auction/auction.repository";
import { AuctionService } from "../../modules/auction/auction.service";
import { AuthController } from "../../modules/auth/auth.controller";
import { AuthRepository } from "../../modules/auth/auth.repository";
import { AuthService } from "../../modules/auth/auth.service";
import { BillingController } from "../../modules/billing/billing.controller";
import { BillingRepository } from "../../modules/billing/billing.repository";
import { BillingService } from "../../modules/billing/billing.service";
import { CatalogController } from "../../modules/catalog/catalog.controller";
import { CatalogRepository } from "../../modules/catalog/catalog.repository";
import { CatalogService } from "../../modules/catalog/catalog.service";
import { CompaniesController } from "../../modules/companies/companies.controller";
import { CompaniesRepository } from "../../modules/companies/companies.repository";
import { CompaniesService } from "../../modules/companies/companies.service";
import { WhatsappController } from "../../modules/integrations/whatsapp.controller";
import { WhatsappService } from "../../modules/integrations/whatsapp.service";
import { WhatsappAbuseController } from "../../modules/whatsapp-abuse/whatsapp-abuse.controller";
import { WhatsappAbuseService } from "../../modules/whatsapp-abuse/whatsapp-abuse.service";
import { ClaimsController } from "../../modules/claims/claims.controller";
import { SerpapiController } from "../../modules/serpapi/serpapi.controller";
import { SerpapiService } from "../../modules/serpapi/serpapi.service";
import { InternalAuditRepository } from "../../modules/internal-audit/internal-audit.repository";
import { InternalAuditService } from "../../modules/internal-audit/internal-audit.service";
import { ProductsController } from "../../modules/products/products.controller";
import { ProductsRepository } from "../../modules/products/products.repository";
import { ProductsService } from "../../modules/products/products.service";
import { AnalyticsController } from "../../modules/analytics/analytics.controller";
import { AnalyticsRepository } from "../../modules/analytics/analytics.repository";
import { AnalyticsService } from "../../modules/analytics/analytics.service";
import { SearchAnalyticsController } from "../../modules/search/search-analytics.controller";
import { SearchAnalyticsService } from "../../modules/search/search-analytics.service";
import { SearchController } from "../../modules/search/search.controller";
import { SearchRepository } from "../../modules/search/search.repository";
import { SearchService } from "../../modules/search/search.service";
import { ComplaintsController } from "../../modules/complaints/complaints.controller";
import { ComplaintsRepository } from "../../modules/complaints/complaints.repository";
import { ComplaintsService } from "../../modules/complaints/complaints.service";
import { ContactController } from "../../modules/contacts/contact.controller";
import { ContactRepository } from "../../modules/contacts/contact.repository";
import { ContactService } from "../../modules/contacts/contact.service";
import { MessagesController } from "../../modules/messages/messages.controller";
import { MessagesRepository } from "../../modules/messages/messages.repository";
import { MessagesService } from "../../modules/messages/messages.service";
import { NotificationsController } from "../../modules/notifications/notifications.controller";
import { NotificationsRepository } from "../../modules/notifications/notifications.repository";
import { NotificationsService } from "../../modules/notifications/notifications.service";
import { OfferedByController } from "../../modules/offered-by/offered-by.controller";
import { OfferedByService } from "../../modules/offered-by/offered-by.service";
import { SubscriptionsController } from "../../modules/subscriptions/subscriptions.controller";
import { SubscriptionsRepository } from "../../modules/subscriptions/subscriptions.repository";
import { SubscriptionsService } from "../../modules/subscriptions/subscriptions.service";
import { getPaymentGateway } from "../../modules/billing/gateway/gateway-factory";
import { ENV } from "../../config/env";
import { db } from "../database/client";
import { logger } from "../logger";
import { sql } from "drizzle-orm";

import { adminGuard, authGuard } from "./auth-guard";
import { registerInternalRoutes } from "./routes/internal";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const companiesRepository = new CompaniesRepository();
  const billingRepository = new BillingRepository();
  const productsRepository = new ProductsRepository();
  const auctionRepository = new AuctionRepository();
  const notificationsRepository = new NotificationsRepository();
  const notificationsService = new NotificationsService(notificationsRepository);
  const notificationsController = new NotificationsController(notificationsService);
  const authController = new AuthController(
    new AuthService(new AuthRepository(), companiesRepository)
  );
  const catalogController = new CatalogController(
    new CatalogService(new CatalogRepository())
  );
  const companiesController = new CompaniesController(
    new CompaniesService(
      companiesRepository,
      billingRepository,
      productsRepository,
      auctionRepository
    )
  );
  const claimsController = new ClaimsController();
  const serpapiService = new SerpapiService();
  const serpapiController = new SerpapiController(serpapiService);
  const searchRepository = new SearchRepository();
  const auditService = new InternalAuditService(new InternalAuditRepository());
  const messagesService = new MessagesService(new MessagesRepository());
  const complaintsRepository = new ComplaintsRepository();
  const complaintsService = new ComplaintsService(
    complaintsRepository,
    searchRepository,
    auditService
  );
  const complaintsController = new ComplaintsController(complaintsService);
  const contactRepository = new ContactRepository();
  const contactService = new ContactService(contactRepository, companiesRepository);
  const contactController = new ContactController(contactService);
  const auctionService = new AuctionService(
    auctionRepository,
    searchRepository,
    billingRepository
  );
  const billingService = new BillingService(
    billingRepository,
    companiesRepository,
    notificationsService
  );
  const offeredByService = new OfferedByService();
  const subscriptionsRepository = new SubscriptionsRepository();
  const subscriptionsService = new SubscriptionsService(
    subscriptionsRepository,
    productsRepository,
    billingRepository,
    getPaymentGateway(),
    notificationsService
  );
  const subscriptionsController = new SubscriptionsController(
    subscriptionsService,
    subscriptionsRepository,
    notificationsService
  );
  const auctionController = new AuctionController(auctionService, companiesRepository);
  const billingController = new BillingController(billingService, companiesRepository);
  const searchService = new SearchService(
    searchRepository,
    auctionService,
    billingService,
    auditService,
    contactService,
    notificationsService,
    serpapiService,
    offeredByService
  );
  const searchController = new SearchController(searchService);
  const whatsappAbuseService = new WhatsappAbuseService();
  const productsService = new ProductsService(
    productsRepository,
    companiesRepository,
    auditService,
    notificationsService
  );
  const whatsappService = new WhatsappService(
    searchService,
    auditService,
    undefined,
    messagesService,
    whatsappAbuseService,
    productsService,
    companiesRepository,
    contactService
  );
  const whatsappController = new WhatsappController(whatsappService);
  const whatsappAbuseController = new WhatsappAbuseController(whatsappAbuseService);
  const messagesController = new MessagesController(messagesService);
  const productsController = new ProductsController(productsService, companiesRepository);
  const offeredByController = new OfferedByController(offeredByService, searchService);
  const searchAnalyticsController = new SearchAnalyticsController(
    new SearchAnalyticsService(searchRepository)
  );
  const analyticsController = new AnalyticsController(
    new AnalyticsService(
      new AnalyticsRepository(),
      contactRepository,
      auctionService,
      companiesRepository,
      searchRepository
    ),
    companiesRepository
  );

  app.get("/", async () => ({ status: "ok", service: "buscai-api" }));
  app.post("/auth/login", (request, reply) => authController.login(request, reply));
  app.post("/auth/refresh", (request, reply) => authController.refresh(request, reply));
  app.post("/auth/logout", (request, reply) => authController.logout(request, reply));
  app.get("/auth/me", { preHandler: authGuard }, (request, reply) =>
    authController.me(request, reply)
  );
  app.post(
    "/auth/admin/invalidate-tokens",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => authController.invalidateTokens(request, reply)
  );

  app.get("/cities", (request, reply) => catalogController.listCities(request, reply));
  app.get("/niches", (request, reply) => catalogController.listNiches(request, reply));
  app.get("/product-plans", (request, reply) =>
    productsController.listProductPlans(request, reply)
  );
  app.get("/products/plans", (request, reply) =>
    productsController.listProductPlans(request, reply)
  );

  app.get(
    "/companies",
    { preHandler: authGuard },
    (request, reply) => companiesController.listCompanies(request, reply)
  );
  app.get(
    "/companies/search",
    { preHandler: authGuard },
    (request, reply) => companiesController.searchCompanies(request, reply)
  );
  app.post(
    "/companies",
    { preHandler: authGuard },
    (request, reply) => companiesController.createCompany(request, reply)
  );
  app.get(
    "/companies/:companyId",
    { preHandler: authGuard },
    (request, reply) => companiesController.getCompany(request, reply)
  );
  app.get(
    "/companies/:companyId/competitive-summary",
    { preHandler: authGuard },
    (request, reply) => companiesController.getCompetitiveSummary(request, reply)
  );
  app.patch(
    "/companies/:companyId",
    { preHandler: authGuard },
    (request, reply) => companiesController.updateCompany(request, reply)
  );
  app.post(
    "/companies/:companyId/claim",
    { preHandler: authGuard },
    (request, reply) => companiesController.claimCompany(request, reply)
  );
  app.get(
    "/claims/candidates",
    { preHandler: authGuard },
    (request, reply) => claimsController.listCandidates(request, reply)
  );
  app.post(
    "/claims/request",
    { preHandler: authGuard },
    (request, reply) => claimsController.requestClaim(request, reply)
  );
  app.post(
    "/claims/cnpj/confirm",
    { preHandler: authGuard },
    (request, reply) => claimsController.confirmCnpj(request, reply)
  );
  app.post(
    "/admin/serpapi/import",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.import(request, reply)
  );
  app.post(
    "/admin/serpapi/import-manual",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.importManual(request, reply)
  );
  app.get(
    "/admin/companies",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => companiesController.listAdminCompanies(request, reply)
  );
  app.post(
    "/admin/companies",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => companiesController.createAdminCompany(request, reply)
  );
  app.get(
    "/admin/companies/:companyId",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => companiesController.getAdminCompany(request, reply)
  );
  app.patch(
    "/admin/companies/:companyId",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => companiesController.updateAdminCompany(request, reply)
  );
  app.patch(
    "/admin/companies/:companyId/status",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => companiesController.updateAdminCompanyStatus(request, reply)
  );
  app.get(
    "/admin/offered-by",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => offeredByController.listConfigs(request, reply)
  );
  app.post(
    "/admin/offered-by",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => offeredByController.createConfig(request, reply)
  );
  app.patch(
    "/admin/offered-by/:id",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => offeredByController.updateConfig(request, reply)
  );
  app.post(
    "/admin/offered-by/:id/enable",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => offeredByController.enableConfig(request, reply)
  );
  app.post(
    "/admin/offered-by/:id/disable",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => offeredByController.disableConfig(request, reply)
  );
  app.get(
    "/admin/offered-by/:id/dashboard",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => offeredByController.dashboard(request, reply)
  );
  app.get(
    "/admin/serpapi/runs",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.listRuns(request, reply)
  );
  app.get(
    "/admin/serpapi/runs/:runId",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.getRun(request, reply)
  );
  app.get(
    "/admin/serpapi/runs/:runId/records",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.listRecords(request, reply)
  );
  app.post(
    "/admin/serpapi/runs/:runId/resolve-conflict",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.resolveConflict(request, reply)
  );
  app.post(
    "/admin/serpapi/runs/:runId/records/:recordId/publish",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.publishRecord(request, reply)
  );
  app.post(
    "/admin/serpapi/runs/:runId/publish",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.publishRun(request, reply)
  );
  app.post(
    "/admin/serpapi/runs/:runId/invalidate",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.invalidate(request, reply)
  );
  app.get(
    "/admin/serpapi/export",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.export(request, reply)
  );
  app.get(
    "/admin/serpapi/metrics",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.getMetrics(request, reply)
  );
  app.get(
    "/admin/serpapi/api-key",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.getApiKeyStatus(request, reply)
  );
  app.get(
    "/admin/serpapi/api-keys",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.listApiKeys(request, reply)
  );
  app.post(
    "/admin/serpapi/api-key",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.updateApiKey(request, reply)
  );
  app.get(
    "/admin/serpapi/niches",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.listNiches(request, reply)
  );
  app.post(
    "/admin/serpapi/niches",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.createNiche(request, reply)
  );
  app.post(
    "/admin/serpapi/niches/bulk",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.createNichesBulk(request, reply)
  );
  app.patch(
    "/admin/serpapi/niches/:nicheId",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.updateNiche(request, reply)
  );
  app.get(
    "/admin/serpapi/niches/:nicheId/companies",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.listNicheCompanies(request, reply)
  );
  app.post(
    "/admin/serpapi/niches/:nicheId/reprocess",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.reprocessNiche(request, reply)
  );
  app.delete(
    "/admin/serpapi/niches/:nicheId",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.deleteNicheCompanies(request, reply)
  );
  app.delete(
    "/admin/serpapi/niches/:nicheId/companies/:companyId",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.deleteNicheCompany(request, reply)
  );
  app.get(
    "/admin/serpapi/export/niches",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.exportNiches(request, reply)
  );
  app.get(
    "/admin/serpapi/export/companies",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.exportCompanies(request, reply)
  );
  app.get(
    "/admin/serpapi/export/full",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.exportFull(request, reply)
  );
  app.get(
    "/admin/serpapi/export-filtered",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => serpapiController.exportFiltered(request, reply)
  );
  app.patch(
    "/companies/:companyId/channels",
    { preHandler: authGuard },
    (request, reply) => companiesController.updateCompanyChannels(request, reply)
  );

  app.get(
    "/me/company",
    { preHandler: authGuard },
    (request, reply) => companiesController.getMyCompany(request, reply)
  );
  app.get(
    "/auction/configs",
    { preHandler: authGuard },
    (request, reply) => auctionController.listConfigs(request, reply)
  );
  app.post(
    "/auction/configs",
    { preHandler: authGuard },
    (request, reply) => auctionController.upsertConfig(request, reply)
  );
  app.get(
    "/auction/slots",
    { preHandler: authGuard },
    (request, reply) => auctionController.listSlots(request, reply)
  );
  app.get(
    "/auction/summary",
    { preHandler: authGuard },
    (request, reply) => auctionController.getSummary(request, reply)
  );

  app.get(
    "/billing/wallet",
    { preHandler: authGuard },
    (request, reply) => billingController.getWallet(request, reply)
  );
  app.get(
    "/billing/transactions",
    { preHandler: authGuard },
    (request, reply) => billingController.listTransactions(request, reply)
  );
  app.post(
    "/billing/purchase",
    { preHandler: authGuard },
    (request, reply) => billingController.purchase(request, reply)
  );
  app.post(
    "/billing/recharge-intents",
    { preHandler: authGuard },
    (request, reply) => billingController.createRechargeIntent(request, reply)
  );
  app.post(
    "/billing/recharges",
    { preHandler: authGuard },
    (request, reply) => billingController.createRechargeIntent(request, reply)
  );
  app.post(
    "/billing/recharges/:rechargeId/confirm",
    { preHandler: authGuard },
    (request, reply) => billingController.confirmRecharge(request, reply)
  );

  app.get(
    "/companies/:companyId/contacts",
    { preHandler: authGuard },
    (request, reply) => contactController.list(request, reply)
  );
  app.get(
    "/company/niches",
    { preHandler: authGuard },
    (request, reply) => companiesController.listCompanyNiches(request, reply)
  );
  app.patch(
    "/companies/:companyId/contacts/:contactId",
    { preHandler: authGuard },
    (request, reply) => contactController.updateClassification(request, reply)
  );

  app.post("/search", (request, reply) => searchController.search(request, reply));
  app.post("/public/search", (request, reply) => searchController.publicSearch(request, reply));
  app.post("/search/:searchId/events", (request, reply) =>
    searchController.trackEvent(request, reply)
  );
  app.post("/offered-by/:id/events", (request, reply) =>
    offeredByController.trackEvent(request, reply)
  );
  app.get("/offered-by/redirect/:token", (request, reply) =>
    offeredByController.redirect(request, reply)
  );
  app.get("/r/w/:searchId/:companyId", (request, reply) =>
    searchController.redirectWhatsapp(request, reply)
  );
  app.get("/r/c/:searchId/:companyId", (request, reply) =>
    searchController.redirectCall(request, reply)
  );
  app.post("/search/:searchId/click", (request, reply) =>
    searchController.registerClick(request, reply)
  );
  app.get("/notifications", { preHandler: authGuard }, (request, reply) =>
    notificationsController.list(request, reply)
  );
  app.post("/notifications/mark-read", { preHandler: authGuard }, (request, reply) =>
    notificationsController.markRead(request, reply)
  );
  app.get("/notification-preferences", { preHandler: authGuard }, (request, reply) =>
    notificationsController.getPreferences(request, reply)
  );
  app.put("/notification-preferences", { preHandler: authGuard }, (request, reply) =>
    notificationsController.updatePreferences(request, reply)
  );
  app.post("/search/products", (request, reply) =>
    productsController.searchProducts(request, reply)
  );
  app.get("/search/products", (request, reply) =>
    productsController.searchProducts(request, reply)
  );
  app.post("/integrations/whatsapp/webhook", (request, reply) =>
    whatsappController.handleWebhook(request, reply)
  );
  app.post(
    "/admin/whatsapp/send-test",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => whatsappController.sendTest(request, reply)
  );
  app.get(
    "/admin/whatsapp/alerts",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => whatsappAbuseController.listAlerts(request, reply)
  );
  app.post(
    "/admin/whatsapp/blocks",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => whatsappAbuseController.blockNumber(request, reply)
  );
  app.post(
    "/admin/whatsapp/blocks/:phone/unblock",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => whatsappAbuseController.unblockNumber(request, reply)
  );
  app.get(
    "/messages/history",
    { preHandler: authGuard },
    (request, reply) => messagesController.listHistory(request, reply)
  );
  app.post("/complaints", (request, reply) =>
    complaintsController.register(request, reply)
  );
  app.get("/analytics/searches", { preHandler: [authGuard, adminGuard] }, (request, reply) =>
    searchAnalyticsController.getAnalytics(request, reply)
  );
  app.get(
    "/analytics/dashboard",
    { preHandler: authGuard },
    (request, reply) => analyticsController.getDashboard(request, reply)
  );

  app.get(
    "/subscriptions",
    { preHandler: authGuard },
    (request, reply) => subscriptionsController.getSubscription(request, reply)
  );
  app.post(
    "/admin/subscriptions/:companyId/downgrade",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => subscriptionsController.scheduleDowngrade(request, reply)
  );
  app.post(
    "/admin/payment-methods/:companyId",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => subscriptionsController.registerPaymentMethod(request, reply)
  );
  app.delete(
    "/admin/payment-methods/:companyId/:id",
    { preHandler: [authGuard, adminGuard] },
    (request, reply) => subscriptionsController.revokePaymentMethod(request, reply)
  );

  if (ENV.NODE_ENV !== "production") {
    app.get("/internal/db-debug", async (_request, reply) => {
      try {
        const [row] = await db.execute(
          sql`select current_user as db_user, current_database() as db_name`
        );
        return reply.send({
          ok: true,
          dbUser: (row as { db_user?: string }).db_user ?? null,
          dbName: (row as { db_name?: string }).db_name ?? null,
        });
      } catch (error) {
        logger.error("[DB-DEBUG] Error testing DB", {
          error: (error as Error).message,
          stack: (error as Error).stack,
        });
        return reply.send({
          ok: false,
          error: (error as Error).message,
        });
      }
    });
  }

  await registerInternalRoutes(app);

  app.get(
    "/companies/:companyId/product-subscription",
    { preHandler: authGuard },
    (request, reply) => productsController.getCompanySubscription(request, reply)
  );
  app.post(
    "/companies/:companyId/product-subscription",
    { preHandler: authGuard },
    (request, reply) => productsController.setCompanySubscription(request, reply)
  );
  app.get(
    "/companies/:companyId/product-offers",
    { preHandler: authGuard },
    (request, reply) => productsController.listCompanyOffers(request, reply)
  );
  app.post(
    "/companies/:companyId/product-offers",
    { preHandler: authGuard },
    (request, reply) => productsController.createCompanyOffer(request, reply)
  );
  app.patch(
    "/companies/:companyId/product-offers/:offerId",
    { preHandler: authGuard },
    (request, reply) => productsController.updateCompanyOffer(request, reply)
  );

  app.get("/products", { preHandler: authGuard }, (request, reply) =>
    productsController.listProducts(request, reply)
  );
  app.get(
    "/products/subscription",
    { preHandler: authGuard },
    (request, reply) => productsController.getMySubscription(request, reply)
  );
  app.post(
    "/products/subscription",
    { preHandler: authGuard },
    (request, reply) => productsController.changeMySubscription(request, reply)
  );
  app.get("/products/:id", { preHandler: authGuard }, (request, reply) =>
    productsController.getProduct(request, reply)
  );
  app.post("/products", { preHandler: authGuard }, (request, reply) =>
    productsController.createProduct(request, reply)
  );
  app.put("/products/:id", { preHandler: authGuard }, (request, reply) =>
    productsController.updateProduct(request, reply)
  );
  app.delete("/products/:id", { preHandler: authGuard }, (request, reply) =>
    productsController.deleteProduct(request, reply)
  );
  app.post(
    "/products/:id/renew",
    { preHandler: authGuard },
    (request, reply) => productsController.renewProduct(request, reply)
  );
}
