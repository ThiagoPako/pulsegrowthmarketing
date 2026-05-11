#!/bin/bash
# ============================================
# Pulse Growth Marketing - VPS Update Script
# Execute como root na VPS
# ============================================

set -e

PROJECT_DIR="/var/www/pulsegrowthmarketing"
DB_NAME="pulse_db"
DB_USER="pulse_user"

echo "=== 1. Puxando atualizações do Git ==="
cd $PROJECT_DIR
git pull origin main

echo "=== 2. Instalando dependências ==="
bun install

echo "=== 3. Gerando build do Frontend ==="
bun run build

echo "=== 4. Atualizando Schema do Banco de Dados ==="
# Adiciona o novo enum se não existir
sudo -u postgres psql -d $DB_NAME -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cost_allocation_rule') THEN CREATE TYPE cost_allocation_rule AS ENUM ('approved', 'recorded', 'posted'); END IF; END \$\$;"

# Adiciona a coluna se não existir
sudo -u postgres psql -d $DB_NAME -c "ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS cost_allocation_rule cost_allocation_rule NOT NULL DEFAULT 'approved'::cost_allocation_rule;"

# Re-aplica o schema para garantir que novas tabelas/views sejam criadas
sudo -u postgres psql -d $DB_NAME -f $PROJECT_DIR/vps-migration/pulse_vps_schema.sql

echo "=== 5. Reiniciando Servidor API (se aplicável) ==="
if [ -d "$PROJECT_DIR/vps-api-server" ]; then
    cd "$PROJECT_DIR/vps-api-server"
    # Se estiver usando PM2
    if command -v pm2 &> /dev/null; then
        pm2 restart pulse-api || pm2 start server.mjs --name pulse-api
    else
        echo "PM2 não encontrado. Reinicie seu servidor Node manualmente."
    fi
fi

echo "=== Atualização concluída com sucesso! ==="
