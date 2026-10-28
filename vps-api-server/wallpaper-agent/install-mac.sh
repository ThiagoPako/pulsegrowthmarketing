#!/bin/bash
# Pulse Wallpaper — instalador do Mac (para o usuário atual, sem senha de administrador)
# Uso no Terminal: curl -fsSL '{{API_BASE}}/wallpaper/install/{{TOKEN}}/mac' | bash
# Tudo dentro de main: o bash só executa depois de baixar o script inteiro (curl | bash)
main() {
  API_BASE='{{API_BASE}}'
  TOKEN='{{TOKEN}}'
  AGENT_VERSION='{{AGENT_VERSION}}'
  DIR="$HOME/Library/Application Support/PulseWallpaper"
  PLIST="$HOME/Library/LaunchAgents/tech.agenciapulse.wallpaper.plist"

  json_escape() { printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g'; }

  echo ""
  echo "Pulse Wallpaper - instalando neste Mac..."
  mkdir -p "$DIR" "$HOME/Library/LaunchAgents"

  OLD_ID=""
  OLD_SECRET=""
  if [ -f "$DIR/config" ]; then
    OLD_ID="$(sed -n "s/^DEVICE_ID='\(.*\)'$/\1/p" "$DIR/config")"
    OLD_SECRET="$(sed -n "s/^DEVICE_SECRET='\(.*\)'$/\1/p" "$DIR/config")"
  fi

  HOSTNAME_VALUE="$(scutil --get ComputerName 2>/dev/null || hostname)"
  BODY="{\"token\":\"$TOKEN\",\"os\":\"mac\",\"hostname\":\"$(json_escape "$HOSTNAME_VALUE")\",\"user\":\"$(json_escape "$USER")\",\"os_version\":\"$(sw_vers -productVersion 2>/dev/null)\",\"agent_version\":\"$AGENT_VERSION\",\"device_id\":\"$OLD_ID\",\"device_secret\":\"$OLD_SECRET\"}"

  RESP="$(curl -fsS -m 30 -X POST -H 'Content-Type: application/json' -d "$BODY" "$API_BASE/wallpaper/agent/register?format=env")"
  DEVICE_ID="$(printf '%s\n' "$RESP" | sed -n 's/^device_id=//p')"
  DEVICE_SECRET="$(printf '%s\n' "$RESP" | sed -n 's/^device_secret=//p')"
  if [ -z "$DEVICE_ID" ] || [ -z "$DEVICE_SECRET" ]; then
    echo "Nao foi possivel conectar. Confira a internet e se o link ainda vale (peca um novo a agencia)."
    exit 1
  fi

  umask 077
  cat > "$DIR/config" <<EOF
API_BASE='$API_BASE'
DEVICE_ID='$DEVICE_ID'
DEVICE_SECRET='$DEVICE_SECRET'
AGENT_VERSION='$AGENT_VERSION'
EOF
  printf '%s' '{{AGENT_SH_B64}}' | base64 -D > "$DIR/agent.sh"
  chmod 700 "$DIR/agent.sh"
  rm -f "$DIR/applied"

  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>tech.agenciapulse.wallpaper</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$DIR/agent.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>$(( {{INTERVAL_MIN}} * 60 ))</integer>
</dict>
</plist>
EOF

  launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null
  launchctl bootstrap "gui/$(id -u)" "$PLIST"

  # primeira troca aqui no Terminal: se o Mac pedir permissão para controlar o "System Events", clique em OK
  /bin/bash "$DIR/agent.sh"

  echo ""
  echo "Pronto! Este Mac esta conectado."
  echo "Se aparecer um pedido de permissao para \"System Events\", clique em OK."
  echo "O papel de parede passa a ser atualizado automaticamente. Pode fechar o Terminal."
}

main "$@" < /dev/null
