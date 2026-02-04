import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const [companyId, cityId, nicheId] = args;
const targetPosition = args[3] ?? "1";
const dailyBudget = args[4] ?? "10";
const seedAmount = args[5] ?? "50";
const seedBatchIdRaw = args[6];

const uuidRegex = /^[0-9a-fA-F-]{36}$/;
const usage = [
  "Usage: pnpm tsx scripts/seed-auction-auto.ts <companyId> <cityId> <nicheId> [targetPosition] [dailyBudget] [seedAmount] [seedBatchId]",
  "Example: pnpm tsx scripts/seed-auction-auto.ts <companyId> <cityId> <nicheId> 1 10 50",
].join("\n");

const requireUuid = (value: string | undefined, label: string) => {
  if (!value || !uuidRegex.test(value)) {
    console.error(`Missing or invalid ${label}.`);
    console.error(usage);
    process.exit(1);
  }
};

const parseNumber = (value: string, label: string) => {
  const normalized = value.replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    console.error(`Invalid ${label}.`);
    console.error(usage);
    process.exit(1);
  }
  return parsed;
};

const getSaoPauloDateStamp = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}`;
};

const seedBatchId =
  seedBatchIdRaw ?? `seed-auction-auto-${getSaoPauloDateStamp()}`;

if (!companyId || !cityId || !nicheId) {
  console.error("Missing required arguments.");
  console.error(usage);
  process.exit(1);
}

requireUuid(companyId, "companyId");
requireUuid(cityId, "cityId");
requireUuid(nicheId, "nicheId");

const targetPositionValue = parseNumber(targetPosition, "targetPosition");
const dailyBudgetValue = parseNumber(dailyBudget, "dailyBudget");
const seedAmountValue = parseNumber(seedAmount, "seedAmount");
if (seedAmountValue <= 0) {
  console.error("seedAmount must be greater than 0.");
  console.error(usage);
  process.exit(1);
}
const seedAmountCents = Math.round(seedAmountValue * 100);

if (targetPositionValue < 1 || targetPositionValue > 3) {
  console.error("targetPosition must be 1, 2 or 3.");
  console.error(usage);
  process.exit(1);
}

console.log("[seed-auction-auto] starting", {
  companyId,
  cityId,
  nicheId,
  targetPosition: targetPositionValue,
  dailyBudget: dailyBudgetValue,
  seedAmountCents,
  seedBatchId,
  idempotency: "America/Sao_Paulo day",
});

const sql = `
DO $$
DECLARE
  config_id uuid;
  seed_txn_id uuid;
  wallet_balance numeric;
  company_exists boolean;
  city_exists boolean;
  niche_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM companies WHERE id = :'company_id'::uuid) INTO company_exists;
  SELECT EXISTS(SELECT 1 FROM cities WHERE id = :'city_id'::uuid) INTO city_exists;
  SELECT EXISTS(SELECT 1 FROM niches WHERE id = :'niche_id'::uuid) INTO niche_exists;

  IF NOT company_exists THEN
    RAISE EXCEPTION 'company not found: %', :'company_id';
  END IF;
  IF NOT city_exists THEN
    RAISE EXCEPTION 'city not found: %', :'city_id';
  END IF;
  IF NOT niche_exists THEN
    RAISE EXCEPTION 'niche not found: %', :'niche_id';
  END IF;

  INSERT INTO billing_wallet (company_id, balance, reserved)
  VALUES (:'company_id'::uuid, 0, 0)
  ON CONFLICT (company_id) DO NOTHING;

  SELECT id INTO seed_txn_id
  FROM billing_transactions
  WHERE company_id = :'company_id'::uuid
    AND metadata ->> 'seed' = 'seed-auction-auto'
    AND metadata ->> 'companyId' = :'company_id'
    AND metadata ->> 'cityId' = :'city_id'
    AND metadata ->> 'nicheId' = :'niche_id'
    AND (occurred_at AT TIME ZONE 'America/Sao_Paulo')::date =
        (now() AT TIME ZONE 'America/Sao_Paulo')::date
  ORDER BY occurred_at DESC
  LIMIT 1;

  IF seed_txn_id IS NULL THEN
    UPDATE billing_wallet
    SET balance = balance + :'seed_amount_cents'::numeric
    WHERE company_id = :'company_id'::uuid;

    INSERT INTO billing_transactions (
      company_id,
      type,
      reason,
      amount,
      amount_cents,
      status,
      provider,
      metadata
    )
    VALUES (
      :'company_id'::uuid,
      'credit',
      'seed-auction-auto',
      :'seed_amount_cents'::numeric,
      :'seed_amount_cents'::int,
      'confirmed',
      'seed-auction-auto',
      jsonb_build_object(
        'seed','seed-auction-auto',
        'amountCents',:'seed_amount_cents'::int,
        'companyId',:'company_id',
        'cityId',:'city_id',
        'nicheId',:'niche_id',
        'batchId',:'seed_batch_id'
      )
    )
    RETURNING id INTO seed_txn_id;
    RAISE NOTICE 'seed_status=created';
  ELSE
    RAISE NOTICE 'seed_status=exists';
  END IF;

  SELECT balance INTO wallet_balance
  FROM billing_wallet
  WHERE company_id = :'company_id'::uuid;

  DELETE FROM auction_configs
  WHERE company_id = :'company_id'::uuid
    AND city_id = :'city_id'::uuid
    AND niche_id = :'niche_id'::uuid;

  INSERT INTO auction_configs (
    company_id,
    city_id,
    niche_id,
    mode,
    target_position,
    daily_budget,
    pause_on_limit,
    is_active
  )
  VALUES (
    :'company_id'::uuid,
    :'city_id'::uuid,
    :'niche_id'::uuid,
    'auto',
    :'target_position'::int,
    :'daily_budget'::numeric,
    true,
    true
  )
  RETURNING id INTO config_id;

  RAISE NOTICE 'seed_txn_id=%', seed_txn_id;
  RAISE NOTICE 'seed_batch_id=%', :'seed_batch_id';
  RAISE NOTICE 'wallet_balance=%', wallet_balance;
  RAISE NOTICE 'config_id=%', config_id;
END $$;

SELECT id, company_id, city_id, niche_id, mode, target_position, daily_budget, pause_on_limit, is_active
FROM auction_configs
WHERE company_id = :'company_id'::uuid
  AND city_id = :'city_id'::uuid
  AND niche_id = :'niche_id'::uuid;
`;

execSync(
  `docker exec -i buscai-db psql -U buscai -d buscai -v ON_ERROR_STOP=1 -v company_id=${companyId} -v city_id=${cityId} -v niche_id=${nicheId} -v target_position=${targetPositionValue} -v daily_budget=${dailyBudgetValue} -v seed_amount_cents=${seedAmountCents} -v seed_batch_id=${seedBatchId}`,
  { input: sql, stdio: "inherit" }
);

console.log("[seed-auction-auto] done");
