import { ENV } from "../../../config/env";

import { DummyGateway } from "./dummy-gateway";
import type { PaymentGateway } from "./payment-gateway";

export function getPaymentGateway(): PaymentGateway {
  switch (ENV.PAYMENT_PROVIDER) {
    case "dummy":
      return new DummyGateway();
    case "stripe":
    case "pagarme":
    case "mercadopago":
      return new DummyGateway();
    default:
      return new DummyGateway();
  }
}
