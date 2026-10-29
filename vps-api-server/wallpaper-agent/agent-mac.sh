#!/bin/bash
# Pulse Wallpaper — agente do Mac (roda a cada poucos minutos pelo LaunchAgent)
# Pergunta ao servidor qual papel de parede vale e aplica quando muda ou quando alguém trocou à mão.
# Cada tela recebe a versão da imagem no formato dela (o servidor escolhe pelas telas enviadas).
DIR="$HOME/Library/Application Support/PulseWallpaper"
PLIST="$HOME/Library/LaunchAgents/tech.agenciapulse.wallpaper.plist"
# shellcheck source=/dev/null
. "$DIR/config" || exit 0
AGENT_VERSION='{{AGENT_VERSION}}'

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

# Telas (NSScreen, em pixels reais), fundo atual de cada uma e troca com o ajuste escolhido
DESK_JS='
ObjC.import("AppKit");
function run(argv) {
  const ws = $.NSWorkspace.sharedWorkspace;
  const all = $.NSScreen.screens;
  const screens = [];
  for (let i = 0; i < all.count; i++) screens.push(all.objectAtIndex(i));
  if (argv[0] === "screens") {
    return screens.map((s) => Math.round(s.frame.size.width * s.backingScaleFactor) + "x" + Math.round(s.frame.size.height * s.backingScaleFactor)).join(",");
  }
  if (argv[0] === "current") {
    return screens.map((s) => { const u = ws.desktopImageURLForScreen(s); return u.isNil() ? "" : u.path.js; }).join("\n");
  }
  if (argv[0] === "set") {
    // fill: preenche cortando; fit: inteira; stretch: deforma; center/tile: tamanho original
    const fit = argv[1];
    const scaling = fit === "stretch" ? 1 : (fit === "center" || fit === "tile") ? 2 : 3;
    const opts = $.NSMutableDictionary.dictionary;
    opts.setObjectForKey($.NSNumber.numberWithInt(scaling), $.NSWorkspaceDesktopImageScalingKey);
    opts.setObjectForKey($.NSNumber.numberWithBool(fit !== "fit"), $.NSWorkspaceDesktopImageAllowClippingKey);
    screens.forEach((s, i) => {
      const file = argv[2 + i] || argv[2];
      const error = Ref();
      if (!ws.setDesktopImageURLForScreenOptionsError($.NSURL.fileURLWithPath(file), s, opts, error)) {
        throw new Error("O macOS recusou a troca do papel de parede");
      }
    });
    return "ok";
  }
}'
desk() { osascript -l JavaScript -e "$DESK_JS" "$@"; }

SCREENS="$(desk screens 2>/dev/null)"
RESP="$(curl -sS -m 30 -w '\n%{http_code}' -H "X-Device-Id: $DEVICE_ID" -H "X-Device-Secret: $DEVICE_SECRET" \
  -H "X-Agent-Version: $AGENT_VERSION" -H "X-Screens: $SCREENS" "$API_BASE/wallpaper/agent/state?format=env" 2>/dev/null)" || exit 0
CODE="$(printf '%s' "$RESP" | tail -n 1)"
[ "$CODE" = "410" ] && { uninstall; exit 0; }
[ "$CODE" = "200" ] || exit 0
field() { printf '%s\n' "$RESP" | sed -n "s/^$1=//p" | head -n 1; }

# Versão nova no servidor: troca este arquivo (vale a partir da próxima execução)
SERVER_VERSION="$(field agent_version)"
if [ -n "$SERVER_VERSION" ] && [ "$SERVER_VERSION" != "$AGENT_VERSION" ]; then
  if curl -fsS -m 60 -o "$DIR/agent.sh.new" -H "X-Device-Id: $DEVICE_ID" -H "X-Device-Secret: $DEVICE_SECRET" \
      "$API_BASE/wallpaper/agent/script" 2>/dev/null \
    && grep -q 'Pulse Wallpaper' "$DIR/agent.sh.new" && grep -q 'wallpaper/agent/state' "$DIR/agent.sh.new"; then
    chmod 700 "$DIR/agent.sh.new"
    mv -f "$DIR/agent.sh.new" "$DIR/agent.sh"
  else
    rm -f "$DIR/agent.sh.new"
  fi
fi

IMAGE_ID="$(field image_id)"
URL="$(field url)"
FIT="$(field fit)"
[ -n "$IMAGE_ID" ] && [ -n "$URL" ] || exit 0

# Um arquivo por tela (mesma ordem das telas enviadas); sem isso, a principal em todas
COUNT="$(field screens)"
case "$COUNT" in ''|*[!0-9]*) COUNT=0 ;; esac
KEYS=()
URLS=()
for ((i = 0; i < COUNT; i++)); do
  KEYS+=("$(field "screen_${i}_key")")
  URLS+=("$(field "screen_${i}_url")")
done
if [ "$COUNT" -eq 0 ]; then KEYS=("$IMAGE_ID"); URLS=("$URL"); fi

WANTED=()
for ((i = 0; i < ${#KEYS[@]}; i++)); do
  U="${URLS[$i]}"
  EXT=".${U##*.}"
  EXT="${EXT%%\?*}"
  case "$EXT" in .jpg|.jpeg|.png|.bmp|.webp|.JPG|.JPEG|.PNG) ;; *) EXT=".jpg" ;; esac
  FILE="$DIR/wallpaper-${KEYS[$i]}$EXT"
  if [ ! -f "$FILE" ]; then
    if ! curl -fsS -m 300 -o "$FILE.download" "$U"; then
      rm -f "$FILE.download"
      report "{\"error\":\"Falha ao baixar a imagem\"}"
      exit 0
    fi
    mv -f "$FILE.download" "$FILE"
  fi
  WANTED+=("$FILE")
done
# apaga as imagens que não estão mais em uso
for OLD in "$DIR"/wallpaper-*; do
  [ -e "$OLD" ] || continue
  USED=0
  for W in "${WANTED[@]}"; do [ "$OLD" = "$W" ] && USED=1; done
  [ "$USED" = 1 ] || rm -f "$OLD"
done

# "Estender" no Mac não existe: cada tela recebe a imagem inteira
[ "$FIT" = "span" ] && FIT="fill"
MARKER="$IMAGE_ID|$FIT|$(IFS=';'; printf '%s' "${WANTED[*]}")"
APPLIED="$(cat "$DIR/applied" 2>/dev/null)"
CURRENT="$(desk current 2>/dev/null)"
EXPECTED=""
N_SCREENS="$(printf '%s\n' "$CURRENT" | grep -c .)"
for ((i = 0; i < N_SCREENS; i++)); do
  W="${WANTED[$i]:-${WANTED[0]}}"
  EXPECTED="$EXPECTED$W"$'\n'
done
if [ "$APPLIED" = "$MARKER" ] && [ -n "$CURRENT" ] && [ "$CURRENT"$'\n' = "$EXPECTED" ]; then
  exit 0
fi

# Mesma imagem em todas as telas: o System Events troca também nas outras mesas (Spaces)
if [ "${#WANTED[@]}" -eq 1 ] || [ "$(printf '%s\n' "${WANTED[@]}" | sort -u | wc -l | tr -d ' ')" = "1" ]; then
  osascript -e "tell application \"System Events\" to tell every desktop to set picture to \"${WANTED[0]}\"" >/dev/null 2>&1
fi

if ERR="$(desk set "$FIT" "${WANTED[@]}" 2>&1)"; then
  printf '%s' "$MARKER" > "$DIR/applied"
  report "{\"image_id\":\"$IMAGE_ID\"}"
else
  report "{\"error\":\"$(json_escape "$ERR")\"}"
fi
