-- ============================================================
-- AUDITORIA FINANCEIRA — URUAÇU  (SOMENTE LEITURA)
-- Nenhum dado é alterado. Rode na VPS:
--   sudo -u postgres psql -d pulse_db -f vps-migration/audit_financeiro_uruacu.sql
-- ============================================================

\echo '=== 1) SALDO ATUAL (conta) e RESERVA — Uruaçu ==========================='
SELECT
  round(COALESCE(SUM(CASE WHEN NOT is_reserve AND type='entrada' THEN amount
                          WHEN NOT is_reserve AND type='saida'   THEN -amount END),0),2) AS saldo_conta,
  round(COALESCE(SUM(CASE WHEN is_reserve AND type='entrada' THEN amount
                          WHEN is_reserve AND type='saida'   THEN -amount END),0),2)     AS saldo_reserva,
  round(COALESCE(SUM(CASE WHEN NOT is_reserve AND type='entrada' THEN amount END),0),2)  AS total_entradas,
  round(COALESCE(SUM(CASE WHEN NOT is_reserve AND type='saida'   THEN amount END),0),2)  AS total_saidas,
  count(*) AS movimentacoes
FROM cash_reserve_movements
WHERE city = 'uruacu';

\echo ''
\echo '=== 2) SALDO POR MÊS (conta) ==========================================='
SELECT to_char(date,'YYYY-MM') AS mes,
       round(SUM(CASE WHEN type='entrada' THEN amount ELSE -amount END),2) AS resultado_mes,
       round(SUM(CASE WHEN type='entrada' THEN amount ELSE 0 END),2) AS entradas,
       round(SUM(CASE WHEN type='saida'   THEN amount ELSE 0 END),2) AS saidas
FROM cash_reserve_movements
WHERE city='uruacu' AND NOT is_reserve
GROUP BY 1 ORDER BY 1;

\echo ''
\echo '=== 3) CONFERÊNCIA: receitas recebidas x entradas espelhadas ==========='
WITH recebidas AS (
  SELECT id, amount FROM revenues
  WHERE city='uruacu' AND status IN ('recebida','pago')
), espelhos AS (
  SELECT (regexp_match(description,'ID:\s*([0-9a-fA-F-]{36})'))[1]::uuid AS src, amount
  FROM cash_reserve_movements
  WHERE city='uruacu' AND description ILIKE '[Receita]%'
)
SELECT round(COALESCE(SUM(r.amount),0),2) AS total_receitas_recebidas,
       (SELECT round(COALESCE(SUM(amount),0),2) FROM espelhos) AS total_entradas_espelhadas,
       (SELECT count(*) FROM recebidas x WHERE NOT EXISTS (SELECT 1 FROM espelhos e WHERE e.src=x.id)) AS receitas_sem_espelho
FROM recebidas r;

\echo ''
\echo '=== 4) CONFERÊNCIA: despesas pagas x saídas espelhadas ================='
-- Regra do sistema: salário/bônus só contam como pagos com o sufixo " - PAGO".
WITH pagas AS (
  SELECT id, amount FROM expenses
  WHERE city='uruacu'
    AND (description !~* '(sal[áa]rio|b[ôo]nus)' OR description ~* '-\s*PAGO\s*$')
), espelhos AS (
  SELECT (regexp_match(description,'ID:\s*([0-9a-fA-F-]{36})'))[1]::uuid AS src, amount
  FROM cash_reserve_movements
  WHERE city='uruacu' AND description ILIKE '[Despesa]%'
)
SELECT round(COALESCE(SUM(p.amount),0),2) AS total_despesas_pagas,
       (SELECT round(COALESCE(SUM(amount),0),2) FROM espelhos) AS total_saidas_espelhadas,
       (SELECT count(*) FROM pagas x WHERE NOT EXISTS (SELECT 1 FROM espelhos e WHERE e.src=x.id)) AS despesas_sem_espelho
FROM pagas p;

\echo ''
\echo '=== 5) DESPESAS PAGAS QUE NÃO ESTÃO NO CAIXA (detalhe) ================='
SELECT e.date, e.description, e.amount
FROM expenses e
WHERE e.city='uruacu'
  AND (e.description !~* '(sal[áa]rio|b[ôo]nus)' OR e.description ~* '-\s*PAGO\s*$')
  AND NOT EXISTS (
    SELECT 1 FROM cash_reserve_movements m
    WHERE m.city='uruacu' AND m.description ILIKE '%'||e.id::text||'%')
ORDER BY e.date DESC LIMIT 50;

\echo ''
\echo '=== 6) RECEITAS RECEBIDAS QUE NÃO ESTÃO NO CAIXA (detalhe) ============='
SELECT r.due_date, r.paid_at, r.description, r.amount
FROM revenues r
WHERE r.city='uruacu' AND r.status IN ('recebida','pago')
  AND NOT EXISTS (
    SELECT 1 FROM cash_reserve_movements m
    WHERE m.city='uruacu' AND m.description ILIKE '%'||r.id::text||'%')
ORDER BY r.due_date DESC LIMIT 50;

\echo ''
\echo '=== 7) ESPELHOS ÓRFÃOS (origem apagada) ================================'
WITH e AS (
  SELECT id, date, description, amount,
         (regexp_match(description,'ID:\s*([0-9a-fA-F-]{36})'))[1]::uuid AS src
  FROM cash_reserve_movements
  WHERE city='uruacu' AND description ~* '^\s*\[(Receita|Despesa)\]'
)
SELECT e.date, e.description, e.amount
FROM e
WHERE e.src IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM expenses x WHERE x.id=e.src)
  AND NOT EXISTS (SELECT 1 FROM revenues  y WHERE y.id=e.src)
ORDER BY e.date DESC;

\echo ''
\echo '=== 8) ESPELHOS DUPLICADOS (mesma origem 2x) ==========================='
WITH e AS (
  SELECT (regexp_match(description,'ID:\s*([0-9a-fA-F-]{36})'))[1]::uuid AS src,
         count(*) AS qtd, round(SUM(amount),2) AS total
  FROM cash_reserve_movements
  WHERE city='uruacu' AND description ~* '^\s*\[(Receita|Despesa)\]'
  GROUP BY 1
)
SELECT * FROM e WHERE src IS NOT NULL AND qtd > 1 ORDER BY total DESC;

\echo ''
\echo '=== 9) SALÁRIOS/BÔNUS AINDA NÃO PAGOS QUE FORAM PARA O CAIXA ==========='
SELECT e.date, e.description, e.amount
FROM expenses e
JOIN cash_reserve_movements m
  ON m.city='uruacu' AND m.description ILIKE '%'||e.id::text||'%'
WHERE e.city='uruacu'
  AND e.description ~* '(sal[áa]rio|b[ôo]nus)'
  AND e.description !~* '-\s*PAGO\s*$'
ORDER BY e.date DESC;

\echo ''
\echo '=== 10) LANÇAMENTOS SEM CIDADE DEFINIDA / SUSPEITOS ===================='
SELECT 'cash' AS origem, city::text, count(*) FROM cash_reserve_movements GROUP BY 1,2
UNION ALL SELECT 'revenues', city::text, count(*) FROM revenues GROUP BY 1,2
UNION ALL SELECT 'expenses', city::text, count(*) FROM expenses GROUP BY 1,2
ORDER BY 1,2;
