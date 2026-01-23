-- Initialize peak_profit_percent for open trades that don't have it set
-- For profitable trades, set peak to current profit
-- For losing trades, set peak to 0 (never been profitable)

UPDATE trades
SET peak_profit_percent =
  CASE
    WHEN profit_loss_percent > 0 THEN profit_loss_percent
    ELSE 0
  END,
peak_profit_recorded_at = NOW()
WHERE status = 'open'
  AND peak_profit_percent IS NULL;
