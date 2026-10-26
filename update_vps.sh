#!/bin/bash
set -euo pipefail

cd /var/www/pulsegrowthmarketing
git fetch --all
git reset --hard origin/main
BUILD_VERSION="$(git rev-parse --short HEAD)-$(date +%s)"
npm install

# Build numa pasta nova: o dist/ servido pelo Nginx só é trocado depois que o
# build e os gates passarem. Antes o Vite esvaziava o dist/ com o site no ar e
# um gate reprovado deixava o bundle ruim publicado.
NEXT_DIST=dist-next
rm -rf "$NEXT_DIST"
npx vite build --outDir "$NEXT_DIST" --emptyOutDir
printf '{"version":"%s","builtAt":"%s"}\n' "$BUILD_VERSION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$NEXT_DIST/build-version.json"

# Gate de deploy: aborta se marcadores críticos de UI não entraram no bundle.
node scripts/verify-bundle.mjs "$NEXT_DIST"

# Gate de estabilidade: o núcleo nunca pode recarregar a página sozinho.
if grep -Rqs --include='*.tsx' --include='*.ts' -- "location.reload()" \
  src/main.tsx src/App.tsx src/contexts/CityContext.tsx 2>/dev/null; then
  echo "ERRO: recarga automática encontrada no núcleo da aplicação."
  exit 1
fi

# Abas abertas ainda pedem os chunks da versão anterior: copia os assets dos
# últimos 14 dias (com a data original, para expirarem) sem sobrescrever os novos.
if [ -d dist/assets ]; then
  mkdir -p "$NEXT_DIST/assets"
  find dist/assets -maxdepth 1 -type f -mtime -14 -exec cp -pn {} "$NEXT_DIST/assets/" \; || true
fi

# Troca quase instantânea (dois renames na mesma pasta); dist-prev fica para rollback manual.
rm -rf dist-prev
if [ -d dist ]; then mv dist dist-prev; fi
mv "$NEXT_DIST" dist

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

# WhatsApp próprio (processo separado da API). Só reinicia quando o código dele muda: reiniciar derruba as
# conexões por alguns segundos. Falha aqui não derruba o deploy do site.
WA_DIR=/var/www/pulsegrowthmarketing/vps-api-server
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "AVISO: Node $NODE_MAJOR na VPS; o WhatsApp precisa do Node 20 ou mais novo. Processo pulse-wa não iniciado."
else
  WA_HASH="$(cat "$WA_DIR"/whatsapp/*.mjs "$WA_DIR"/package-lock.json 2>/dev/null | sha256sum | cut -d' ' -f1)"
  WA_HASH_FILE=/var/www/pulsegrowthmarketing/.pulse-wa-hash
  if pm2 describe pulse-wa >/dev/null 2>&1; then
    if [ "$(cat "$WA_HASH_FILE" 2>/dev/null)" != "$WA_HASH" ]; then
      pm2 restart pulse-wa --update-env || echo "AVISO: pulse-wa não reiniciou"
    else
      echo "pulse-wa: código igual, sem reiniciar"
    fi
  else
    pm2 start "$WA_DIR/whatsapp/wa-server.mjs" --name pulse-wa --cwd "$WA_DIR" --max-memory-restart 600M \
      || echo "AVISO: pulse-wa não iniciou"
  fi
  echo "$WA_HASH" > "$WA_HASH_FILE"
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

# Exercise the real database-backed login path without using a valid account.
# A healthy endpoint returns 401; HTTP 500 means auth is still broken.
AUTH_STATUS="$(curl --silent --output /tmp/pulse-auth-probe.json --write-out '%{http_code}' \
  --header 'Content-Type: application/json' \
  --data '{"email":"healthcheck-invalid@pulse.local","password":"invalid-healthcheck-password"}' \
  http://127.0.0.1:3002/api/auth/login)"
if [ "$AUTH_STATUS" != "401" ]; then
  echo "Falha na verificação do login: HTTP $AUTH_STATUS"
  cat /tmp/pulse-auth-probe.json
  pm2 logs pulse-api --lines 100 --nostream
  exit 1
fi
rm -f /tmp/pulse-auth-probe.json

PUBLIC_BUILD_VERSION="$(curl --fail --silent --header 'Cache-Control: no-cache' "https://agenciapulse.tech/build-version.json?t=$(date +%s)")"
if [[ "$PUBLIC_BUILD_VERSION" != *"$BUILD_VERSION"* ]]; then
  echo "ERRO: o Nginx não está servindo o dist recém-gerado."
  echo "Esperado: $BUILD_VERSION"
  echo "Recebido: $PUBLIC_BUILD_VERSION"
  exit 1
fi

echo "OK: botão no bundle e versão pública atualizada ($BUILD_VERSION)."

# Ferramentas do Assistente PULSE (ffmpeg + Whisper) e da prévia leve do portal (ffmpeg): só quando faltam,
# em segundo plano e com prioridade baixa, depois do site já no ar. O servidor tem 2 núcleos e compilar o
# whisper.cpp leva minutos: o deploy não espera. Tag fixa e modelo conferido por SHA-256
# (scripts/install-whisper.sh). Acompanhar em /var/log/pulse-whisper-install.log.
if ! command -v ffmpeg >/dev/null 2>&1 || [ ! -x /opt/whisper.cpp/build/bin/whisper-cli ] || [ ! -f /opt/whisper.cpp/models/ggml-small-q5_1.bin ]; then
  if ! pgrep -f "install-whisper.sh" >/dev/null 2>&1; then
    nohup nice -n 19 bash -c '
      if ! command -v ffmpeg >/dev/null 2>&1; then
        apt-get update -q || true
        DEBIAN_FRONTEND=noninteractive apt-get install -y -q ffmpeg
      fi
      timeout 3600 bash /var/www/pulsegrowthmarketing/scripts/install-whisper.sh
    ' > /var/log/pulse-whisper-install.log 2>&1 < /dev/null &
    echo "Ferramentas do PULSE (ffmpeg/Whisper) instalando em segundo plano: /var/log/pulse-whisper-install.log"
  fi
fi

pm2 status
