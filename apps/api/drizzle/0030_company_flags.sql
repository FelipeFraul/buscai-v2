ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS participates_in_auction boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_whatsapp boolean NOT NULL DEFAULT false;

UPDATE companies
SET has_whatsapp = CASE
  WHEN whatsapp IS NOT NULL AND trim(whatsapp) <> '' THEN true
  ELSE false
END
WHERE has_whatsapp = false;
