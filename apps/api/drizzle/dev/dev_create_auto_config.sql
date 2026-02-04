DO $$
DECLARE new_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM auction_configs
    WHERE company_id = :'company_id'::uuid
      AND city_id = :'city_id'::uuid
      AND niche_id = :'niche_id'::uuid
  ) THEN
    RAISE EXCEPTION 'auction_config already exists for company/city/niche';
  END IF;

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
  RETURNING id INTO new_id;

  RAISE NOTICE 'created auction_config id=%', new_id;
END $$;
