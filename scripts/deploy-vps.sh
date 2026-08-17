#!/bin/bash
# Script de deploy definitivo para VPS Pulse Growth Marketing
# Versão 2.3 - Atualização de Schema e Cache-Busting

set -e

PROJECT_ROOT="/var/www/pulsegrowthmarketing"
SERVER_PATH="$PROJECT_ROOT/vps-api-server"

echo "🚀 Iniciando deploy na VPS..."

cd $PROJECT_ROOT

# 1. Garantir que o repositório está limpo e atualizado
git fetch origin
git reset --hard origin/main

# 2. Instalar dependências e buildar o front-end
npm install
npm run build

# 3. Limpar cache do Nginx para garantir que o novo build seja servido
# (O script de build gera IDs únicos, mas o Nginx pode ter o index.html em cache)
sudo rm -rf /var/lib/nginx/tmp/proxy/*
sudo rm -rf /var/lib/nginx/tmp/fastcgi/*

# 4. Atualizar o servidor da API (vps-api-server)
cd $SERVER_PATH
npm install

# 5. Reiniciar processos PM2
# O pulse-api contém a lógica de migração automática ao iniciar
pm2 restart pulse-api --update-env || pm2 start server.mjs --name pulse-api --update-env

# 6. Recarregar Nginx
sudo systemctl reload nginx

echo "✅ Deploy concluído com sucesso!"
pm2 status
