ALTER TABLE auction_configs
  ADD COLUMN pause_on_limit boolean NOT NULL DEFAULT true;

UPDATE auction_configs
  SET target_position = 1
  WHERE mode = 'smart'
    AND target_position IS NULL;

UPDATE auction_configs
  SET target_position = NULL
  WHERE mode = 'manual'
    AND target_position IS NOT NULL;

ALTER TABLE auction_configs
  ADD CONSTRAINT auction_configs_target_position_chk
  CHECK (target_position IS NULL OR target_position IN (1, 2, 3));

ALTER TABLE auction_configs
  ADD CONSTRAINT auction_configs_mode_target_position_chk
  CHECK (
    (mode = 'smart' AND target_position IS NOT NULL)
    OR (mode = 'manual' AND target_position IS NULL)
  );
