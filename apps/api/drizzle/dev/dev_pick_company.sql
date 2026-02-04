DO $$
DECLARE
  selected_company_id uuid;
  selected_city_id uuid;
  selected_niche_id uuid;
  selected_owner_id uuid;
BEGIN
  SELECT id, city_id
    INTO selected_company_id, selected_city_id
  FROM companies
  WHERE status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF selected_company_id IS NULL THEN
    SELECT id INTO selected_owner_id
    FROM users
    ORDER BY created_at ASC
    LIMIT 1;

    IF selected_owner_id IS NULL THEN
      RAISE EXCEPTION 'no users found to own test company';
    END IF;

    SELECT id INTO selected_city_id
    FROM cities
    WHERE is_active = true
    ORDER BY name ASC
    LIMIT 1;

    IF selected_city_id IS NULL THEN
      RAISE EXCEPTION 'no active cities found';
    END IF;

    INSERT INTO companies (
      owner_id,
      created_by_user_id,
      trade_name,
      status,
      city_id,
      source
    )
    VALUES (
      selected_owner_id,
      selected_owner_id,
      'Empresa Teste Leilao',
      'active',
      selected_city_id,
      'manual'
    )
    RETURNING id INTO selected_company_id;
  END IF;

  SELECT niche_id INTO selected_niche_id
  FROM company_niches
  WHERE company_id = selected_company_id
  LIMIT 1;

  IF selected_niche_id IS NULL THEN
    SELECT id INTO selected_niche_id
    FROM niches
    WHERE is_active = true
    ORDER BY label ASC
    LIMIT 1;

    IF selected_niche_id IS NULL THEN
      RAISE EXCEPTION 'no active niches found';
    END IF;

    INSERT INTO company_niches (company_id, niche_id)
    VALUES (selected_company_id, selected_niche_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RAISE NOTICE 'companyId=%', selected_company_id;
  RAISE NOTICE 'cityId=%', selected_city_id;
  RAISE NOTICE 'nicheId=%', selected_niche_id;
END $$;
