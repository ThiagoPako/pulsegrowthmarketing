#!/usr/bin/env bash
# Deploy definitivo Pulse Growth Marketing: GitHub -> build -> Nginx
set -euo pipefail

APP_DIR="/var/www/pulsegrowthmarketing"
DOMAIN="agenciapulse.tech"
cd "$APP_DIR"

echo "==> 1. Sincronizando com a branch principal do GitHub"
git fetch origin --prune
BRANCH="$(git remote show origin | sed -n 's/.*HEAD branch: //p')"
if [ -z "$BRANCH" ] || ! git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
fi
git reset --hard "origin/$BRANCH"
git clean -fd -e node_modules -e .env -e uploads
DEPLOY_COMMIT="$(git rev-parse HEAD)"
echo "Commit: $DEPLOY_COMMIT"

echo "==> 2. Instalando dependencias e gerando build limpo"
npm install --no-audit --no-fund
rm -rf dist
node scripts/generate-build-id.mjs
npm run build
test -s dist/index.html
test -s dist/build-version.json
printf '%s\n' "$DEPLOY_COMMIT" > dist/deploy-commit.txt

echo "==> 3. Corrigindo o root do Nginx"
while IFS= read -r CONFIG; do
  [ -f "$CONFIG" ] || continue
  if grep -Eq 'root[[:space:]]+/(var/www/html|var/www/pulsegrowthmarketing)(/dist)?[[:space:]]*;' "$CONFIG"; then
    sudo cp "$CONFIG" "$CONFIG.bak.$(date +%Y%m%d%H%M%S)"
    sudo sed -Ei 's#root[[:space:]]+/(var/www/html|var/www/pulsegrowthmarketing)(/dist)?[[:space:]]*;#root /var/www/pulsegrowthmarketing/dist;#g' "$CONFIG"
  fi
done < <(find -L /etc/nginx/sites-enabled -maxdepth 1 -type f 2>/dev/null)
sudo nginx -t

echo "==> 4. Reiniciando API e recarregando Nginx"
pm2 restart pulse-api --update-env || pm2 start vps-api-server/server.mjs --name pulse-api
if pm2 describe pulse-uploads >/dev/null 2>&1; then
  pm2 restart pulse-uploads --update-env
fi
sudo systemctl reload nginx

echo "==> 5. Confirmando que o Nginx entrega o build novo"
LOCAL_ASSET="$(grep -o 'assets/[^\"]*\.js' dist/index.html | head -1)"
SERVED_HTML="$(curl -fsS -H "Host: $DOMAIN" -H 'Cache-Control: no-cache' "http://127.0.0.1/index.html?deploy=$(date +%s)")"
SERVED_ASSET="$(printf '%s' "$SERVED_HTML" | grep -o 'assets/[^\"]*\.js' | head -1)"

echo "Asset no build: $LOCAL_ASSET"
echo "Asset servido:  $SERVED_ASSET"
if [ -z "$LOCAL_ASSET" ] || [ "$LOCAL_ASSET" != "$SERVED_ASSET" ]; then
  echo "ERRO: Nginx nao esta servindo $APP_DIR/dist. Roots ativos:"
  sudo nginx -T 2>/dev/null | grep -E 'server_name|root ' | tail -30
  exit 1
fi

PUBLIC_COMMIT="$(curl -fsS -H "Host: $DOMAIN" -H 'Cache-Control: no-cache' "http://127.0.0.1/deploy-commit.txt?deploy=$(date +%s)" | tr -d '\r\n')"
if [ "$PUBLIC_COMMIT" != "$DEPLOY_COMMIT" ]; then
  echo "ERRO: commit servido ($PUBLIC_COMMIT) difere do commit gerado ($DEPLOY_COMMIT)."
  exit 1
fi

pm2 status
echo "DEPLOY CONFIRMADO: commit $DEPLOY_COMMIT esta publicado."