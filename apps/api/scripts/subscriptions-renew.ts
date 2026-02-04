import { BillingRepository } from "../src/modules/billing/billing.repository";
import { getPaymentGateway } from "../src/modules/billing/gateway/gateway-factory";
import { ProductsRepository } from "../src/modules/products/products.repository";
import { SubscriptionsRepository } from "../src/modules/subscriptions/subscriptions.repository";
import { SubscriptionsService } from "../src/modules/subscriptions/subscriptions.service";

async function run() {
  const subscriptionsRepository = new SubscriptionsRepository();
  const productsRepository = new ProductsRepository();
  const billingRepository = new BillingRepository();
  const gateway = getPaymentGateway();
  const service = new SubscriptionsService(
    subscriptionsRepository,
    productsRepository,
    billingRepository,
    gateway
  );

  const now = new Date();
  await service.renewDueSubscriptions(now);
  await service.cancelExpiredGrace(now);
}

run().catch((error) => {
  console.error("[subscriptions:renew] failed", error);
  process.exit(1);
});
