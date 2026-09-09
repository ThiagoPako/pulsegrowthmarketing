-- Remove registros de entrega duplicados pela mesma gravação e impede novos duplicados.
-- Mantém sempre o registro mais recente de cada recording_id.

DELETE FROM delivery_records d
USING delivery_records k
WHERE d.recording_id IS NOT NULL
  AND d.recording_id = k.recording_id
  AND d.id <> k.id
  AND (
    COALESCE(d.updated_at, d.created_at) < COALESCE(k.updated_at, k.created_at)
    OR (COALESCE(d.updated_at, d.created_at) = COALESCE(k.updated_at, k.created_at) AND d.id < k.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS delivery_records_recording_id_unique
  ON delivery_records (recording_id)
  WHERE recording_id IS NOT NULL;
