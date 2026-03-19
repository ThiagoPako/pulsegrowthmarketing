#!/bin/bash
# ============================================
# Pulse Growth Marketing - VPS PostgreSQL Setup
# Execute como root na VPS
# ============================================

set -e

echo "=== 1. Instalando PostgreSQL 15 ==="
apt update
apt install -y postgresql-15 postgresql-client-15

echo "=== 2. Configurando PostgreSQL ==="
systemctl enable postgresql
systemctl start postgresql

# Criar usuário e banco
sudo -u postgres psql -c "CREATE USER pulse_user WITH PASSWORD 'TROQUE_ESTA_SENHA_AQUI';"
sudo -u postgres psql -c "CREATE DATABASE pulse_db OWNER pulse_user;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE pulse_db TO pulse_user;"

# Habilitar extensão
sudo -u postgres psql -d pulse_db -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

echo "=== 3. Importando schema ==="
sudo -u postgres psql -d pulse_db -f /var/www/pulsegrowthmarketing/pulse_vps_schema.sql

echo "=== 4. Configurando acesso local ==="
# Permitir conexões locais do Node.js
PG_HBA=$(sudo -u postgres psql -t -c "SHOW hba_file;" | tr -d ' ')
echo "host pulse_db pulse_user 127.0.0.1/32 md5" >> "$PG_HBA"
systemctl reload postgresql

echo "=== 5. Configurando backup automático ==="
mkdir -p /var/backups/postgresql
cat > /etc/cron.d/pulse-db-backup << 'CRON'
# Backup diário às 3h da manhã
0 3 * * * postgres pg_dump pulse_db | gzip > /var/backups/postgresql/pulse_db_$(date +\%Y\%m\%d).sql.gz
# Limpar backups com mais de 30 dias
0 4 * * * root find /var/backups/postgresql -name "*.sql.gz" -mtime +30 -delete
CRON

echo "=== Setup concluído! ==="
echo "Banco: pulse_db"
echo "Usuário: pulse_user"
echo "Porta: 5432 (localhost)"
echo ""
echo "IMPORTANTE: Troque a senha em 'TROQUE_ESTA_SENHA_AQUI'"
echo "Próximo passo: importar dados com os CSVs"
