-- Mostra os registros da integração Meta SEM revelar secrets (só os 4 últimos dígitos).
SELECT id, status, updated_at,
       config->>'meta_app_id'       AS meta_app_id,
       config->>'instagram_app_id'  AS instagram_app_id,
       right(config->>'instagram_app_secret_encrypted', 4) AS ig_secret_final,
       right(config->>'meta_app_secret_encrypted', 4)      AS meta_secret_final
FROM api_integrations WHERE provider = 'meta_ads' ORDER BY updated_at DESC;
