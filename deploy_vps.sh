#!/bin/bash
# =============================================================================
# Pulse — Deploy completo e auto-diagnosticável para a VPS
# Uso:  bash deploy_vps.sh
# =============================================================================
set -uo pipefail

PROJECT_DIR="/var/www/pulsegrowthmarketing"
DOMAIN="agenciapulse.tech"
API_PORT="3002"

red()  { printf '\033[31m%s\033[0m\n' "$*"; }
grn()  { printf '\033[32m%s\033[0m\n' "$*"; }
ylw()  { printf '\033[33m%s\033[0m\n' "$*"; }
step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
die()  { red "ERRO: $*"; exit 1; }

cd "$PROJECT_DIR" || die "diretório $PROJECT_DIR não existe"

# --- 1. Código -------------------------------------------------------------
step "1/8 Sincronizando código com origin/main"
git fetch origin main --prune || die "git fetch falhou"
git reset --hard origin/main || die "git reset falhou"
git clean -fd dist >/dev/null 2>&1 || true
HEAD_SHA="$(git rev-parse --short HEAD)"
grn "HEAD = $HEAD_SHA — $(git log -1 --pretty=%s)"

# --- 2. Sanidade do código-fonte ------------------------------------------
step "2/8 Verificando se os recursos existem no CÓDIGO-FONTE"
MISSING_SRC=0
check_src() {
  if grep -Rqs --include='*.tsx' --include='*.ts' -- "$1" src/; then
    grn "  ✓ $2"
  else
    red "  ✗ $2 — NÃO está no código-fonte"
    MISSING_SRC=1
  fi
}
check_src "Excluir vídeos por período" "Botão excluir vídeos do Portal"
check_src "Prévia do Vídeo"            "Player inline no card de revisão"
check_src "PULSE_STABLE_NO_AUTO_RELOAD_V1" "Proteção de estabilidade e rascunho"

if grep -Rqs --include='*.tsx' --include='*.ts' -- "location.reload()" src/main.tsx src/App.tsx src/contexts/CityContext.tsx 2>/dev/null; then
  die "foi encontrada recarga automática no núcleo da aplicação"
fi
grn "  ✓ núcleo sem atualização automática de página"
[ "$MISSING_SRC" -eq 0 ] || die "o commit baixado é antigo. Publique/faça push das alterações do Lovable para o GitHub e rode de novo."

# --- 3. Build --------------------------------------------------------------
step "3/8 Build limpo do frontend"
rm -rf dist node_modules/.vite
npm install || die "npm install falhou"
npm run build || die "npm run build falhou"

BUILD_VERSION="${HEAD_SHA}-$(date +%s)"
printf '{"version":"%s","builtAt":"%s"}\n' \
  "$BUILD_VERSION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > dist/build-version.json

# --- 4. Gate: recursos presentes no bundle ---------------------------------
step "4/8 Verificando o bundle gerado"
node scripts/verify-bundle.mjs dist || die "gate de bundle reprovou o build"

# --- 5. Descobrir o root real do Nginx -------------------------------------
step "5/8 Conferindo qual pasta o Nginx serve"
NGINX_CONF="$(sudo nginx -T 2>/dev/null | grep -n "server_name .*${DOMAIN}" -A 40 | grep -m1 -oP '^\s*\d+-\s*root\s+\K[^;]+' | tr -d ' ')"
[ -z "$NGINX_CONF" ] && NGINX_CONF="$(sudo nginx -T 2>/dev/null | grep -m1 -oP '^\s*root\s+\K[^;]+' | tr -d ' ')"
NGINX_ROOT="${NGINX_CONF:-desconhecido}"
echo "  root do Nginx : $NGINX_ROOT"
echo "  dist do build : $PROJECT_DIR/dist"

if [ "$NGINX_ROOT" != "$PROJECT_DIR/dist" ] && [ -d "$NGINX_ROOT" ]; then
  ylw "  Nginx aponta para outra pasta — copiando o build para lá"
  sudo rm -rf "${NGINX_ROOT:?}/"*
  sudo cp -a "$PROJECT_DIR/dist/." "$NGINX_ROOT/"
  grn "  ✓ build copiado para $NGINX_ROOT"
fi

# --- 6. API ----------------------------------------------------------------
step "6/8 Atualizando a API (pulse-api)"
( cd "$PROJECT_DIR/vps-api-server" && npm install && node --check server.mjs ) || die "API inválida"
if pm2 describe pulse-api >/dev/null 2>&1; then
  pm2 restart pulse-api --update-env
else
  pm2 start "$PROJECT_DIR/vps-api-server/server.mjs" --name pulse-api --cwd "$PROJECT_DIR/vps-api-server"
fi
pm2 save >/dev/null

for i in $(seq 1 25); do
  curl -fs "http://127.0.0.1:${API_PORT}/api/health" >/dev/null && { grn "  ✓ API respondendo"; break; }
  [ "$i" -eq 25 ] && { pm2 logs pulse-api --lines 60 --nostream; die "API não subiu"; }
  sleep 1
done

# --- 7. Nginx --------------------------------------------------------------
step "7/8 Recarregando o Nginx"
sudo nginx -t || die "configuração do Nginx inválida"
sudo systemctl reload nginx
grn "  ✓ Nginx recarregado"

# --- 8. Verificação pública -----------------------------------------------
step "8/8 Conferindo o que o domínio está servindo"
sleep 2
PUBLIC_VERSION="$(curl -fs -H 'Cache-Control: no-cache' "https://${DOMAIN}/build-version.json?t=$(date +%s)" || echo '')"
echo "  esperado : $BUILD_VERSION"
echo "  publicado: ${PUBLIC_VERSION:-<sem resposta>}"

INDEX_HTML="$(curl -fs -H 'Cache-Control: no-cache' "https://${DOMAIN}/?t=$(date +%s)" || echo '')"
MAIN_JS="$(echo "$INDEX_HTML" | grep -oP '/assets/[^"]+\.js' | head -1)"
if [ -n "$MAIN_JS" ]; then
  if [ -f "$PROJECT_DIR/dist$MAIN_JS" ]; then
    grn "  ✓ o domínio está servindo os assets deste build"
  else
    red  "  ✗ o domínio serve $MAIN_JS, que NÃO existe no build novo (cache/CDN ou root errado)"
  fi
fi

if [[ "$PUBLIC_VERSION" == *"$BUILD_VERSION"* ]]; then
  grn "\n✅ DEPLOY OK — versão $BUILD_VERSION no ar."
  ylw "   No navegador: Cmd+Shift+R (ou Ctrl+F5) para descartar o cache local."
else
  red "\n❌ O domínio ainda não serve o build novo."
  echo "   Root do Nginx detectado: $NGINX_ROOT"
  echo "   Verifique com: sudo nginx -T | grep -n 'root\\|server_name'"
fi

pm2 status
