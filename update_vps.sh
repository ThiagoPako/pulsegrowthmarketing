#!/bin/bash
set -euo pipefail

cd /var/www/pulsegrowthmarketing
git fetch --all
git reset --hard origin/main
BUILD_VERSION="$(git rev-parse --short HEAD)-$(date +%s)"
npm install
npm run build
printf '{"version":"%s","builtAt":"%s"}\n' "$BUILD_VERSION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > dist/build-version.json

cd /var/www/pulsegrowthmarketing/vps-api-server
rm -rf node_modules/bcrypt
npm install
node --check server.mjs

if pm2 describe pulse-api >/dev/null 2>&1; then
  pm2 restart pulse-api --update-env
else
  pm2 start /var/www/pulsegrowthmarketing/vps-api-server/server.mjs \
    --name pulse-api \
    --cwd /var/www/pulsegrowthmarketing/vps-api-server
fi
pm2 save

sudo nginx -t
sudo systemctl reload nginx
for attempt in $(seq 1 20); do
  if curl --fail --silent http://127.0.0.1:3002/api/health >/dev/null; then
    break
  fi
  if [ "$attempt" -eq 20 ]; then
    pm2 logs pulse-api --lines 80 --nostream
    exit 1
  fi
  sleep 1
done
pm2 status
