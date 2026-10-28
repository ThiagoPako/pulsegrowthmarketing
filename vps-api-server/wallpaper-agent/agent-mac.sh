#!/bin/bash
# Pulse Wallpaper — agente do Mac (roda a cada poucos minutos pelo LaunchAgent)
# Pergunta ao servidor qual papel de parede vale e aplica quando muda ou quando alguém trocou à mão.
DIR="$HOME/Library/Application Support/PulseWallpaper"
PLIST="$HOME/Library/LaunchAgents/tech.agenciapulse.wallpaper.plist"
# shellcheck source=/dev/null
. "$DIR/config" || exit 0

uninstall() {
  rm -rf "$DIR"
  launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null
  rm -f "$PLIST"
}

report() {
  curl -sS -m 30 -o /dev/null -X POST -H 'Content-Type: application/json' \
    -H "X-Device-Id: $DEVICE_ID" -H "X-Device-Secret: $DEVICE_SECRET" \
    -d "$1" "$API_BASE/wallpaper/agent/report" 2>/dev/null
}

json_escape() { printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g'; }

RESP="$(curl -sS -m 30 -w '\n%{http_code}' -H "X-Device-Id: $DEVICE_ID" -H "X-Device-Secret: $DEVICE_SECRET" \
  -H "X-Agent-Version: $AGENT_VERSION" "$API_BASE/wallpaper/agent/state?format=env" 2>/dev/null)" || exit 0
CODE="$(printf '%s' "$RESP" | tail -n 1)"
[ "$CODE" = "410" ] && { uninstall; exit 0; }
[ "$CODE" = "200" ] || exit 0
field() { printf '%s\n' "$RESP" | sed -n "s/^$1=//p" | head -n 1; }
IMAGE_ID="$(field image_id)"
URL="$(field url)"
[ -n "$IMAGE_ID" ] && [ -n "$URL" ] || exit 0

EXT=".${URL##*.}"
EXT="${EXT%%\?*}"
case "$EXT" in .jpg|.jpeg|.png|.bmp|.webp|.JPG|.JPEG|.PNG) ;; *) EXT=".jpg" ;; esac
FILE="$DIR/wallpaper-$IMAGE_ID$EXT"

if [ ! -f "$FILE" ]; then
  if ! curl -fsS -m 300 -o "$FILE.download" "$URL"; then
    rm -f "$FILE.download"
    report "{\"error\":\"Falha ao baixar a imagem\"}"
    exit 0
  fi
  mv -f "$FILE.download" "$FILE"
  find "$DIR" -maxdepth 1 -name 'wallpaper-*' ! -path "$FILE" -delete 2>/dev/null
fi

CURRENT="$(osascript -e 'tell application "System Events" to get picture of every desktop' 2>/dev/null)"
APPLIED="$(cat "$DIR/applied" 2>/dev/null)"
if [ "$APPLIED" = "$IMAGE_ID" ] && [ -n "$CURRENT" ] && [ "$(printf '%s' "$CURRENT" | tr ',' '\n' | sed 's/^ *//' | sort -u)" = "$FILE" ]; then
  exit 0
fi

# todas as telas e todas as mesas (Spaces) abertas
if ERR="$(osascript -e "tell application \"System Events\" to tell every desktop to set picture to \"$FILE\"" 2>&1)"; then
  printf '%s' "$IMAGE_ID" > "$DIR/applied"
  report "{\"image_id\":\"$IMAGE_ID\"}"
else
  report "{\"error\":\"$(json_escape "$ERR")\"}"
fi
