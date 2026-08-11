#!/bin/bash
# ==============================================================================
# PULSE CRITICAL REPAIR - 502 BAD GATEWAY & 401 UNAUTHORIZED
# ==============================================================================
# Este script resolve o erro onde o Nginx não consegue conectar com a API Node.js
# ou o banco de dados recusa a conexão do usuário da API.
# ==============================================================================

set -e

PROJECT_ROOT="/var/www/pulsegrowthmarketing"
DB_NAME="pulse_db"
DB_USER="pulse_user"

echo "Step 1: Fixing Directory Permissions & Ownership..."
sudo chown -R pulse_user:pulse_user $PROJECT_ROOT
sudo chmod -R 755 $PROJECT_ROOT

echo "Step 2: Syncing latest code..."
cd $PROJECT_ROOT
git pull

echo "Step 3: Repairing Database Permissions (CRITICAL for 401/502)..."
# O erro 'must be owner' impede a API de funcionar corretamente.
# Este comando garante que o usuário pulse_user tenha controle total das tabelas de auth.
sudo -u postgres psql -d $DB_NAME <<EOF
GRANT ALL PRIVILEGES ON SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
ALTER TABLE auth_users OWNER TO $DB_USER;
ALTER TABLE profiles OWNER TO $DB_USER;
ALTER TABLE user_roles OWNER TO $DB_USER;
EOF

echo "Step 4: Running Auth Synchronization..."
cd $PROJECT_ROOT/vps-api-server
npm install
node repair-auth.mjs

echo "Step 5: Building Frontend with Stability Gates..."
cd $PROJECT_ROOT
npm install
npm run build:verified

echo "Step 6: Hard Restart of PM2 Services..."
# Usamos 'delete' e 'start' para garantir que NENHUM cache de processo antigo sobreviva
pm2 delete pulse-api 2>/dev/null || true
cd $PROJECT_ROOT/vps-api-server
pm2 start server.mjs --name pulse-api --watch
pm2 save

echo "Step 7: Reloading Nginx Proxy..."
sudo systemctl reload nginx

echo "=============================================================================="
echo "✅ REPARO CONCLUÍDO COM SUCESSO!"
echo "O erro 502 Bad Gateway deve ter desaparecido."
echo "Se o login ainda falhar, verifique o log: pm2 logs pulse-api"
echo "=============================================================================="
pm2 status
