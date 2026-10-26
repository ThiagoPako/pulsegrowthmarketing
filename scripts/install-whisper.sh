#!/bin/bash
# Whisper (whisper.cpp) para o áudio do Assistente PULSE: transcreve no próprio servidor, sem API externa.
# Chamado pelo update_vps.sh só quando falta o binário ou o modelo. Sai com erro se algo falhar; quem chama
# trata o erro como aviso (o deploy do site segue e o PULSE pede o comando por escrito).
#
#   binário: /opt/whisper.cpp/build/bin/whisper-cli   (WHISPER_BIN na API)
#   modelo:  /opt/whisper.cpp/models/ggml-small-q5_1.bin (WHISPER_MODEL na API)
set -euo pipefail

WHISPER_TAG=v1.9.4                       # versão fixa (lançada em 11/09/2026)
WHISPER_REPO=https://github.com/ggml-org/whisper.cpp.git
WHISPER_DIR=/opt/whisper.cpp
MODEL_NAME=ggml-small-q5_1.bin
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$MODEL_NAME"
MODEL_SHA256=ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb  # oid LFS do arquivo no HuggingFace
MODEL_FILE="$WHISPER_DIR/models/$MODEL_NAME"
BIN="$WHISPER_DIR/build/bin/whisper-cli"

command -v ffmpeg >/dev/null 2>&1 || { echo "Whisper: ffmpeg não encontrado (o áudio é convertido por ele)"; exit 1; }

if [ ! -x "$BIN" ]; then
  echo "Whisper: compilando whisper.cpp $WHISPER_TAG…"
  if ! command -v cmake >/dev/null 2>&1 || ! command -v g++ >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q cmake build-essential git
  fi
  sudo rm -rf "$WHISPER_DIR"
  sudo mkdir -p "$WHISPER_DIR"
  sudo chown "$(id -u):$(id -g)" "$WHISPER_DIR"
  git -c advice.detachedHead=false clone --depth 1 --branch "$WHISPER_TAG" "$WHISPER_REPO" "$WHISPER_DIR"
  cmake -S "$WHISPER_DIR" -B "$WHISPER_DIR/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
    -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF
  cmake --build "$WHISPER_DIR/build" --config Release --target whisper-cli -j "$(nproc 2>/dev/null || echo 2)"
  [ -x "$BIN" ] || { echo "Whisper: binário não gerado em $BIN"; exit 1; }
fi

model_ok() { [ -f "$1" ] && echo "$MODEL_SHA256  $1" | sha256sum -c --status; }
if ! model_ok "$MODEL_FILE"; then
  echo "Whisper: baixando o modelo $MODEL_NAME (~265 MB)…"
  mkdir -p "$(dirname "$MODEL_FILE")"
  rm -f "$MODEL_FILE.part"
  curl -fL --retry 3 --connect-timeout 20 -o "$MODEL_FILE.part" "$MODEL_URL"
  if ! model_ok "$MODEL_FILE.part"; then
    rm -f "$MODEL_FILE.part"
    echo "Whisper: o SHA-256 do modelo baixado não confere; apagado"
    exit 1
  fi
  mv "$MODEL_FILE.part" "$MODEL_FILE"
fi

echo "Whisper pronto: $BIN + $MODEL_FILE"
