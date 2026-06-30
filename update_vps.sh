#!/bin/bash
set -e

cd /var/www/pulsegrowthmarketing
git fetch --all
git reset --hard origin/main
BUILD_VERSION="$(git rev-parse --short HEAD)-$(date +%s)"
npm install
npm run build
printf '{"version":"%s","builtAt":"%s"}\n' "$BUILD_VERSION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > dist/build-version.json

if [ -d dist ] && [ -d /var/www/html ]; then
  rsync -a --delete dist/ /var/www/html/
  chown -R www-data:www-data /var/www/html
  find /var/www/html -type d -exec chmod 755 {} \;
  find /var/www/html -type f -exec chmod 644 {} \;
fi

cd /var/www/pulsegrowthmarketing/vps-api-server
npm install
pm2 restart pulse-api || pm2 start server.mjs --name pulse-api
pm2 save

nginx -t && systemctl reload nginx
