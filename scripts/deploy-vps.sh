#!/usr/bin/env bash
# Deploy Pulse Growth Marketing na VPS (force-sync com o GitHub)
# Uso: bash scripts/deploy-vps.sh
set -euo pipefail

APP_DIR="/var/www/pulsegrowthmarketing"
cd "$APP_DIR"

echo "==> 1. Diagnostico inicial"
echo "Pasta atual: $(pwd)"
echo "Branch atual: $(git rev-parse --abbrev-ref HEAD)"
echo "Commit local ANTES: $(git rev-parse --short HEAD)"

echo "==> 2. Descobrindo branch remota principal"
git fetch origin --prune
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if ! git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  BRANCH="$(git remote show origin | sed -n 's/.*HEAD branch: //p')"
fi
echo "Branch de deploy: $BRANCH"

echo "==> 3. Force sync com origin/$BRANCH (descarta alteracoes locais de codigo)"
git reset --hard "origin/$BRANCH"
git clean -fd -e node_modules -e .env -e dist -e uploads
echo "Commit local DEPOIS: $(git rev-parse --short HEAD)"

echo "==> 4. Dependencias"
npm install --no-audit --no-fund

echo "==> 5. Build limpo com novo build id"
rm -rf dist
node scripts/generate-build-id.mjs
npm run build

echo "==> 6. Reiniciando servicos"
pm2 restart pulse-api --update-env || pm2 start vps-api-server/server.mjs --name pulse-api
pm2 restart pulse-uploads --update-env 2>/dev/null || true
sudo systemctl reload nginx

echo "==> 7. Verificacao final"
pm2 status
echo "--- build-version.json gerado ---"
cat dist/build-version.json 2>/dev/null || echo "(nao encontrado)"
echo "--- root(s) configurados no nginx ---"
grep -rhn "root " /etc/nginx/sites-enabled/ | sed 's/^/  /'
echo "--- index.html servido pelo nginx ---"
curl -s -H "Cache-Control: no-cache" http://127.0.0.1/index.html | grep -o 'assets/[^"]*\.js' | head -5
echo "--- index.html no dist ---"
grep -o 'assets/[^"]*\.js' dist/index.html | head -5
echo ""
echo "Se as duas listas de assets acima forem DIFERENTES, o nginx NAO esta servindo $APP_DIR/dist."
echo "Deploy finalizado."
