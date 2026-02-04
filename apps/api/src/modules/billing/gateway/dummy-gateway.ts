import { createHash } from "crypto";

import { ENV } from "../../../config/env";

import type { PaymentChargeRequest, PaymentChargeResult, PaymentGateway } from "./payment-gateway";

export class DummyGateway implements PaymentGateway {
  async createCharge(request: PaymentChargeRequest): Promise<PaymentChargeResult> {
    const externalId = createHash("sha256")
      .update(request.idempotencyKey)
      .digest("hex")
      .slice(0, 24);

    const envValue = process.env.DUMMY_GATEWAY_ALWAYS_APPROVE;
    const shouldApprove =
      envValue === undefined ? ENV.DUMMY_GATEWAY_ALWAYS_APPROVE : envValue === "true";
    const status = shouldApprove ? "paid" : "failed";

    return {
      externalId: `dummy_${externalId}`,
      status,
    };
  }
}
