import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const [companyId, cityId, nicheId, seedBatchIdRaw] = args;
const seedBatchId = seedBatchIdRaw ?? "";

const uuidRegex = /^[0-9a-fA-F-]{36}$/;

const requireUuid = (value: string | undefined, label: string) => {
  if (!value || !uuidRegex.test(value)) {
    console.error(`Missing or invalid ${label}.`);
    console.error(
      "Usage: pnpm tsx scripts/remove-seed-auction-auto.ts <companyId> <cityId> <nicheId> [seedBatchId]"
    );
    process.exit(1);
  }
};

if (!companyId || !cityId || !nicheId) {
  console.error("Missing required arguments.");
  console.error(
    "Usage: pnpm tsx scripts/remove-seed-auction-auto.ts <companyId> <cityId> <nicheId> [seedBatchId]"
  );
  process.exit(1);
}

requireUuid(companyId, "companyId");
requireUuid(cityId, "cityId");
requireUuid(nicheId, "nicheId");

console.log("[remove-seed-auction-auto] starting", {
  companyId,
  cityId,
  nicheId,
  seedBatchId: seedBatchId || "last-24h",
});

const sql = `
DO $$
DECLARE
  seed_total numeric;
  wallet_before numeric;
  wallet_after numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO seed_total
  FROM billing_transactions
  WHERE company_id = :'company_id'::uuid
    AND type = 'credit'
    AND status = 'confirmed'
    AND provider = 'seed-auction-auto'
    AND reason = 'seed-auction-auto'
    AND metadata ->> 'seed' = 'seed-auction-auto'
    AND metadata ->> 'companyId' = :'company_id'
    AND metadata ->> 'cityId' = :'city_id'
    AND metadata ->> 'nicheId' = :'niche_id'
    AND (
      (:'seed_batch_id' <> '' AND metadata ->> 'batchId' = :'seed_batch_id')
      OR (:'seed_batch_id' = '' AND occurred_at >= now() - interval '24 hours')
    );

  IF seed_total > 0 THEN
    SELECT balance INTO wallet_before
    FROM billing_wallet
    WHERE company_id = :'company_id'::uuid;

    UPDATE billing_wallet
    SET balance = balance - seed_total
    WHERE company_id = :'company_id'::uuid;

    SELECT balance INTO wallet_after
    FROM billing_wallet
    WHERE company_id = :'company_id'::uuid;
    RAISE NOTICE 'seed_total=%', seed_total;
    RAISE NOTICE 'wallet_before=%', wallet_before;
    RAISE NOTICE 'wallet_after=%', wallet_after;
  ELSE
    RAISE NOTICE 'seed_total=0';
    RAISE NOTICE 'nothing_to_remove=true';
  END IF;

  DELETE FROM billing_transactions
  WHERE company_id = :'company_id'::uuid
    AND type = 'credit'
    AND status = 'confirmed'
    AND provider = 'seed-auction-auto'
    AND reason = 'seed-auction-auto'
    AND metadata ->> 'seed' = 'seed-auction-auto'
    AND metadata ->> 'companyId' = :'company_id'
    AND metadata ->> 'cityId' = :'city_id'
    AND metadata ->> 'nicheId' = :'niche_id'
    AND (
      (:'seed_batch_id' <> '' AND metadata ->> 'batchId' = :'seed_batch_id')
      OR (:'seed_batch_id' = '' AND occurred_at >= now() - interval '24 hours')
    );

  DELETE FROM auction_configs
  WHERE company_id = :'company_id'::uuid
    AND city_id = :'city_id'::uuid
    AND niche_id = :'niche_id'::uuid;
END $$;

SELECT company_id, balance, reserved
FROM billing_wallet
WHERE company_id = :'company_id'::uuid;
`;

execSync(
  `docker exec -i buscai-db psql -U buscai -d buscai -v ON_ERROR_STOP=1 -v company_id=${companyId} -v city_id=${cityId} -v niche_id=${nicheId} -v seed_batch_id=${seedBatchId}`,
  { input: sql, stdio: "inherit" }
);

console.log("[remove-seed-auction-auto] done");
