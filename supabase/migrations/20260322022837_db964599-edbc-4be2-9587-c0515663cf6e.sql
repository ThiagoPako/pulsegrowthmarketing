-- Remove any existing duplicates keeping only the earliest record per client+month
DELETE FROM revenues
WHERE id NOT IN (
  SELECT DISTINCT ON (client_id, reference_month) id
  FROM revenues
  ORDER BY client_id, reference_month, created_at ASC
);

-- Add unique constraint to prevent duplicate revenues for same client+month
CREATE UNIQUE INDEX IF NOT EXISTS idx_revenues_client_month_unique 
ON revenues (client_id, reference_month);