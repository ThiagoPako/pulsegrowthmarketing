#!/bin/bash
set -e

cd /var/www/pulsegrowthmarketing
git fetch --all
git reset --hard origin/main
bun install
bun run build

if [ -d dist ] && [ -d /var/www/html ]; then
  rm -rf /var/www/html/*
  cp -r dist/* /var/www/html/
fi

cd /var/www/pulsegrowthmarketing/vps-api-server
npm install
pm2 restart pulse-api || pm2 start server.mjs --name pulse-api
pm2 save

nginx -t && systemctl reload nginx
