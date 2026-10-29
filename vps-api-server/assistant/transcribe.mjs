// Assistente PULSE — áudio → texto no próprio servidor (whisper.cpp), sem API externa.
//   1. o processo do WhatsApp baixou a mensagem de voz (.ogg) na pasta privada (waPrivateDir()/audio);
//   2. o ffmpeg converte para wav 16 kHz mono;
//   3. o whisper-cli transcreve em português;
//   4. os arquivos (o .ogg e o .wav) são apagados.
// Binário e modelo por env (instalados pelo update_vps.sh): WHISPER_BIN, WHISPER_MODEL; FFMPEG_BIN (padrão "ffmpeg").

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { waPrivateDir } from '../whatsapp/shared.mjs';

const run = promisify(execFile);

export function whisperConfig() {
  return {
    bin: process.env.WHISPER_BIN || '/opt/whisper.cpp/build/bin/whisper-cli',
    model: process.env.WHISPER_MODEL || '/opt/whisper.cpp/models/ggml-small-q5_1.bin',
    ffmpeg: process.env.FFMPEG_BIN || 'ffmpeg',
    threads: String(Math.max(1, Math.min(8, Number(process.env.WHISPER_THREADS) || Math.max(1, os.cpus().length - 1)))),
  };
}

export async function whisperAvailable() {
  const { bin, model } = whisperConfig();
  try {
    await fs.access(bin, fs.constants.X_OK);
    await fs.access(model, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

// um áudio por vez: a VPS não tem CPU sobrando para duas transcrições juntas
let queue = Promise.resolve();
const oneAtATime = (fn) => {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
};

/** Só lê áudio da pasta privada do WhatsApp (o caminho vem do banco). */
export function isPrivateAudio(file) {
  const base = path.join(waPrivateDir(), 'audio') + path.sep;
  return typeof file === 'string' && path.resolve(file).startsWith(base);
}

export async function removeAudio(file) {
  if (isPrivateAudio(file)) await fs.unlink(file).catch(() => {});
}

/**
 * Vídeo de um link (brutos do Drive, entrada de vídeos do agentDriveRoutes.mjs): o ffmpeg lê direto do
 * link só o áudio (até maxSeconds), sem guardar o vídeo; mesma fila de um por vez do WhatsApp.
 * { ok: true, text } ou { ok: false, reason } (sem_whisper, vazio, falha).
 */
export function transcribeUrl(url, { maxSeconds = 240 } = {}) {
  return oneAtATime(async () => {
    if (!/^https:\/\//.test(String(url || ''))) return { ok: false, reason: 'falha' };
    if (!(await whisperAvailable())) return { ok: false, reason: 'sem_whisper' };
    const { bin, model, ffmpeg, threads } = whisperConfig();
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-bruto-'));
    try {
      const wav = path.join(tmp, 'audio.wav');
      await run(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', url, '-vn', '-t', String(maxSeconds),
        '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], { timeout: 480_000 });
      const out = path.join(tmp, 'texto');
      await run(bin, ['-m', model, '-f', wav, '-l', 'pt', '-t', threads, '-nt', '-np', '-otxt', '-of', out],
        { timeout: 480_000, maxBuffer: 4 * 1024 * 1024 });
      const text = (await fs.readFile(`${out}.txt`, 'utf8'))
        .replace(/\[(BLANK_AUDIO|MÚSICA|MUSIC|Música)\]/gi, ' ').replace(/\((música|music|risos)\)/gi, ' ').replace(/\s+/g, ' ').trim();
      return text ? { ok: true, text } : { ok: false, reason: 'vazio' };
    } catch (error) {
      console.error('[drive] transcrição:', error.message);
      return { ok: false, reason: 'falha' };
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  });
}

/** { ok: true, text } ou { ok: false, reason } (sem_whisper, arquivo_invalido, vazio, falha). */
export function transcribe(file) {
  return oneAtATime(async () => {
    if (!isPrivateAudio(file)) return { ok: false, reason: 'arquivo_invalido' };
    if (!(await whisperAvailable())) return { ok: false, reason: 'sem_whisper' };
    const { bin, model, ffmpeg, threads } = whisperConfig();
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-voz-'));
    try {
      const wav = path.join(tmp, 'audio.wav');
      await run(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', path.resolve(file), '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav],
        { timeout: 60_000 });
      const out = path.join(tmp, 'texto');
      await run(bin, ['-m', model, '-f', wav, '-l', 'pt', '-t', threads, '-nt', '-np', '-otxt', '-of', out],
        { timeout: 180_000, maxBuffer: 4 * 1024 * 1024 });
      const text = (await fs.readFile(`${out}.txt`, 'utf8'))
        .replace(/\[(BLANK_AUDIO|MÚSICA|MUSIC|Música)\]/gi, ' ').replace(/\s+/g, ' ').trim();
      return text ? { ok: true, text } : { ok: false, reason: 'vazio' };
    } catch (error) {
      console.error('[assistente] transcrição:', error.message);
      return { ok: false, reason: 'falha' };
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  });
}
