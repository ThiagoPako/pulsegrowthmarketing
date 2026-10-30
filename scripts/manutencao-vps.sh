#!/bin/bash
# ==============================================================================
# Manutenção da VPS (disco, memória e banco) sem apagar dado do sistema.
#
#   bash scripts/manutencao-vps.sh            → só mede e mostra (não muda nada)
#   bash scripts/manutencao-vps.sh --limpar   → mede, limpa o que é descartável e otimiza o banco
#
# O --limpar mexe só em coisa que se refaz sozinha: logs do PM2 e do sistema,
# cache do apt e do npm, o dist-prev do último deploy, temporários com mais de
# 2 dias em /tmp e VACUUM ANALYZE no banco (reorganiza, não apaga linha).
# Nada de uploads, vídeos, cards, mensagens ou tabelas.
# ==============================================================================
set -uo pipefail

PROJECT_ROOT="/var/www/pulsegrowthmarketing"
DB_NAME="pulse_db"
UPLOADS="${UPLOAD_ROOT:-/var/www/uploads}"
LIMPAR=0
[ "${1:-}" = "--limpar" ] && LIMPAR=1

psql_db() { sudo -u postgres psql -d "$DB_NAME" -X -q -P pager=off "$@"; }

medir() {
  echo "=== Disco ==="
  df -h / "$UPLOADS" 2>/dev/null | awk '!seen[$0]++'
  echo
  echo "=== Memória ==="
  free -h
  echo
  echo "=== Processos que mais usam memória ==="
  ps -eo pid,rss,comm,args --sort=-rss | head -8 | awk 'NR==1{print;next}{printf "%-7s %6.0f MB  %s\n",$1,$2/1024,substr($0,index($0,$4),90)}'
  echo
  pm2 status 2>/dev/null || true
  echo
  echo "=== Pastas maiores ==="
  du -sh "$UPLOADS" "$PROJECT_ROOT" "$PROJECT_ROOT/dist" "$PROJECT_ROOT/dist-prev" \
    ~/.pm2/logs /var/log /var/cache/apt ~/.npm /tmp /var/lib/postgresql 2>/dev/null | sort -rh
  echo
  echo "=== Uploads por pasta (10 maiores) ==="
  du -sh "$UPLOADS"/* 2>/dev/null | sort -rh | head -10
  echo
  echo "=== Banco ==="
  psql_db -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME')) AS tamanho_do_banco;"
  psql_db -c "SELECT relname AS tabela,
                     pg_size_pretty(pg_total_relation_size(relid)) AS tamanho,
                     n_live_tup AS linhas, n_dead_tup AS linhas_mortas,
                     COALESCE(to_char(GREATEST(last_vacuum, last_autovacuum), 'DD/MM HH24:MI'), 'nunca') AS ultimo_vacuum
              FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 15;"
  psql_db -c "SELECT count(*) AS conexoes, state FROM pg_stat_activity WHERE datname = '$DB_NAME' GROUP BY state;"
}

medir 2>&1 | tee /tmp/pulse-manutencao-antes.txt

if [ "$LIMPAR" -eq 0 ]; then
  echo
  echo "Só medição. Para limpar e otimizar: bash scripts/manutencao-vps.sh --limpar"
  exit 0
fi

echo
echo "=== Limpando ==="
pm2 flush >/dev/null 2>&1 && echo "logs do PM2 esvaziados"
journalctl --vacuum-size=200M 2>/dev/null | tail -1
find /var/log -type f \( -name "*.gz" -o -name "*.[0-9]" \) -mtime +7 -delete 2>/dev/null && echo "logs girados com mais de 7 dias apagados"
apt-get clean 2>/dev/null && echo "cache do apt limpo"
npm cache clean --force >/dev/null 2>&1 && echo "cache do npm limpo"
rm -rf "$PROJECT_ROOT/dist-prev" "$PROJECT_ROOT/dist-next" && echo "dist-prev/dist-next do deploy apagados"
find /tmp -maxdepth 1 -mindepth 1 -mtime +2 \( -name "pulse-*" -o -name "*.mp4" -o -name "*.wav" -o -name "*.mov" -o -name "tmp-*" \) \
  -exec rm -rf {} + 2>/dev/null && echo "temporários com mais de 2 dias em /tmp apagados"

echo
echo "=== Otimizando o banco (VACUUM ANALYZE, pode levar alguns minutos) ==="
psql_db -c "VACUUM (ANALYZE);" && echo "banco otimizado"

echo
echo "=== Depois ==="
df -h / | tail -1
free -h | sed -n 2p
psql_db -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME')) AS tamanho_do_banco;"
echo
echo "Medição de antes em /tmp/pulse-manutencao-antes.txt"
