import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const [companyId, cityId, nicheId, txLimitRaw] = args;
const txLimit = txLimitRaw ?? "10";

const uuidRegex = /^[0-9a-fA-F-]{36}$/;

const requireUuid = (value: string | undefined, label: string) => {
  if (!value || !uuidRegex.test(value)) {
    console.error(`Missing or invalid ${label}.`);
    console.error(
      "Usage: pnpm tsx scripts/auction-sanity.ts <companyId> <cityId> <nicheId> [txLimit]"
    );
    process.exit(1);
  }
};

if (!companyId || !cityId || !nicheId) {
  console.error(
    "Usage: pnpm tsx scripts/auction-sanity.ts <companyId> <cityId> <nicheId> [txLimit]"
  );
  process.exit(1);
}

requireUuid(companyId, "companyId");
requireUuid(cityId, "cityId");
requireUuid(nicheId, "nicheId");

const parsedLimit = Number(txLimit);
if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
  console.error("Invalid txLimit.");
  process.exit(1);
}

console.log("[auction-sanity] start", {
  companyId,
  cityId,
  nicheId,
  txLimit: parsedLimit,
});

const sql = `
SELECT 'wallet' AS section, company_id, balance, reserved
FROM billing_wallet
WHERE company_id = :'company_id'::uuid;

SELECT 'transactions' AS section, id, type, amount, amount_cents, status, provider, reason, metadata, occurred_at
FROM billing_transactions
WHERE company_id = :'company_id'::uuid
ORDER BY occurred_at DESC
LIMIT :'tx_limit'::int;

SELECT 'configs_company' AS section, id, company_id, city_id, niche_id, mode, target_position, daily_budget, pause_on_limit, is_active
FROM auction_configs
WHERE company_id = :'company_id'::uuid
ORDER BY id DESC;

SELECT 'configs_pair' AS section, id, mode, target_position, daily_budget, pause_on_limit, is_active
FROM auction_configs
WHERE company_id = :'company_id'::uuid
  AND city_id = :'city_id'::uuid
  AND niche_id = :'niche_id'::uuid
ORDER BY id DESC;

SELECT 'check_manual_with_target' AS check, COUNT(*) AS total
FROM auction_configs
WHERE mode = 'manual'
  AND target_position IS NOT NULL;

SELECT 'check_auto_without_target' AS check, COUNT(*) AS total
FROM auction_configs
WHERE mode IN ('auto', 'smart')
  AND target_position IS NULL;

SELECT 'check_auto_invalid_target' AS check, COUNT(*) AS total
FROM auction_configs
WHERE mode IN ('auto', 'smart')
  AND (target_position < 1 OR target_position > 3);
`;

execSync(
  `docker exec -i buscai-db psql -U buscai -d buscai -v ON_ERROR_STOP=1 -v company_id=${companyId} -v city_id=${cityId} -v niche_id=${nicheId} -v tx_limit=${parsedLimit}`,
  { input: sql, stdio: "inherit" }
);

console.log("[auction-sanity] done");
