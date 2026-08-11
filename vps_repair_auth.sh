#!/bin/bash
# ==============================================================================
# PULSE REPAIR SCRIPT - AUTH & PERMISSIONS
# ==============================================================================
set -e

PROJECT_ROOT="/var/www/pulsegrowthmarketing"
DB_NAME="pulse_db"
DB_USER="pulse_user"

echo "Step 1: Fixing File Ownership and Permissions..."
sudo chown -R pulse_user:pulse_user $PROJECT_ROOT
sudo chmod -R 755 $PROJECT_ROOT

echo "Step 2: Syncing Repository..."
cd $PROJECT_ROOT
git pull

echo "Step 3: Database Repairs (Table Ownership & Permissions)..."
# Garante que o usuário da API seja o dono das tabelas de auth para permitir sincronização de schema e CRUD
sudo -u postgres psql -d $DB_NAME <<EOF
GRANT ALL PRIVILEGES ON SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
ALTER TABLE auth_users OWNER TO $DB_USER;
ALTER TABLE profiles OWNER TO $DB_USER;
ALTER TABLE user_roles OWNER TO $DB_USER;
ALTER TABLE crm_leads OWNER TO $DB_USER;
EOF

echo "Step 4: Running Auth Repair Script (Node)..."
cd $PROJECT_ROOT/vps-api-server
npm install
# O script repair-auth.mjs garante que o admin exista e as senhas estejam consistentes
node repair-auth.mjs

echo "Step 5: Frontend Build & Asset Verification..."
cd $PROJECT_ROOT
npm install
npm run build:verified

echo "Step 6: Restarting Services..."
# O comando mata e inicia para garantir que variáveis de ambiente do .env sejam recarregadas
pm2 delete pulse-api 2>/dev/null || true
cd $PROJECT_ROOT/vps-api-server
pm2 start server.mjs --name pulse-api
pm2 save

sudo systemctl reload nginx

echo "=============================================================================="
echo "REPAIR COMPLETE! The 502/401 errors should be resolved."
echo "Check logs with: pm2 logs pulse-api"
echo "=============================================================================="
pm2 status
