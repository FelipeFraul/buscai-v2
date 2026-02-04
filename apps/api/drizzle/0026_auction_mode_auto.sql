ALTER TYPE auction_mode ADD VALUE IF NOT EXISTS 'auto';

ALTER TABLE auction_configs
  DROP CONSTRAINT IF EXISTS auction_configs_mode_target_position_chk;

ALTER TABLE auction_configs
  ADD CONSTRAINT auction_configs_mode_target_position_chk
  CHECK (
    (mode IN ('smart', 'auto') AND target_position IS NOT NULL)
    OR (mode = 'manual' AND target_position IS NULL)
  );
