import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildFfmpegArgs,
  captureVideoUploads,
  decideWebVariant,
  isConvertibleVideoName,
  isWebVariantName,
  mp4HasFaststart,
  originalNamesForWebVariant,
  parseProbe,
  resolveUploadFile,
  uploadRelativeFromUrl,
  webVariantName,
  webVariantPath,
  webVariantUrl,
} from '../../vps-api-server/lib/webVideo.mjs';

const h264 = (overrides: Record<string, unknown> = {}) => ({
  durationSec: 30,
  bitRate: 5_000_000,
  videoBitRate: 4_800_000,
  video: { codec: 'h264', pixFmt: 'yuv420p', width: 1080, height: 1920, colorTransfer: '' },
  audio: { codec: 'aac' },
  ...overrides,
});

describe('decisão de converter', () => {
  it('não converte o que já é leve: H.264 até 8 Mbps, faststart e .mp4', () => {
    expect(decideWebVariant(h264(), { ext: '.mp4', faststart: true }).action).toBe('none');
    expect(decideWebVariant(h264({ videoBitRate: 8_000_000 }), { ext: '.mp4', faststart: true }).action).toBe('none');
  });

  it('converte H.264 pesado (os de 33 a 44 Mbps), mesmo com faststart', () => {
    const d = decideWebVariant(h264({ videoBitRate: 37_000_000, bitRate: 37_200_000 }), { ext: '.mp4', faststart: true });
    expect(d.action).toBe('transcode');
    expect(d.reason).toContain('37.0 Mbps');
  });

  it('converte HEVC (.mov de hoje), 10 bits e VP9', () => {
    const hevc = h264({ video: { codec: 'hevc', pixFmt: 'yuv420p', width: 1080, height: 1920, colorTransfer: '' }, videoBitRate: 15_000_000 });
    expect(decideWebVariant(hevc, { ext: '.mov', faststart: false }).action).toBe('transcode');
    const tenBit = h264({ video: { codec: 'h264', pixFmt: 'yuv420p10le', width: 1080, height: 1920, colorTransfer: '' } });
    expect(decideWebVariant(tenBit, { ext: '.mp4', faststart: true }).action).toBe('transcode');
    const vp9 = h264({ video: { codec: 'vp9', pixFmt: 'yuv420p', width: 1080, height: 1920, colorTransfer: '' } });
    expect(decideWebVariant(vp9, { ext: '.webm', faststart: null }).action).toBe('transcode');
  });

  it('H.264 leve sem faststart ou em .mov só troca o contêiner (sem recodificar)', () => {
    expect(decideWebVariant(h264(), { ext: '.mp4', faststart: false }).action).toBe('remux');
    expect(decideWebVariant(h264(), { ext: '.mov', faststart: true }).action).toBe('remux');
  });

  it('leve, mas maior que 1080 no lado menor ou HDR: recodifica', () => {
    const big = h264({ video: { codec: 'h264', pixFmt: 'yuv420p', width: 2160, height: 3840, colorTransfer: '' } });
    expect(decideWebVariant(big, { ext: '.mov', faststart: false }).action).toBe('transcode');
    const hdr = h264({ video: { codec: 'h264', pixFmt: 'yuv420p', width: 1080, height: 1920, colorTransfer: 'arib-std-b67' } });
    expect(decideWebVariant(hdr, { ext: '.mov', faststart: false }).action).toBe('transcode');
  });

  it('taxa desconhecida não conta como leve; sem trilha de vídeo não faz nada', () => {
    expect(decideWebVariant(h264({ videoBitRate: 0, bitRate: 0 }), { ext: '.mp4', faststart: true }).action).toBe('transcode');
    expect(decideWebVariant({ durationSec: 10, bitRate: 128000, videoBitRate: 0, video: null, audio: { codec: 'aac' } }, { ext: '.mp4' }).action).toBe('skip');
  });

  it('lê a saída do ffprobe (taxa pelo tamanho quando falta bit_rate, ignora capa)', () => {
    const probe = parseProbe({
      format: { duration: '10.0', size: '50000000' },
      streams: [
        { codec_type: 'video', codec_name: 'mjpeg', disposition: { attached_pic: 1 } },
        { codec_type: 'video', codec_name: 'HEVC', pix_fmt: 'yuv420p', width: 1080, height: 1920 },
        { codec_type: 'audio', codec_name: 'aac' },
      ],
    });
    expect(probe.video?.codec).toBe('hevc');
    expect(probe.bitRate).toBe(40_000_000);
    expect(probe.durationSec).toBe(10);
  });
});

describe('parâmetros do ffmpeg', () => {
  it('recodifica com os parâmetros combinados e grava mp4 com faststart', () => {
    const args = buildFfmpegArgs({ src: '/u/a.mov', dest: '/u/.web-tmp/x.mp4', action: 'transcode', threads: 1, probe: h264() });
    const s = args.join(' ');
    for (const part of ['-c:v libx264', '-preset veryfast', '-crf 23', '-maxrate 6M', '-bufsize 12M', '-pix_fmt yuv420p',
      '-c:a aac', '-b:a 128k', '-movflags +faststart', '-f mp4', '-threads 1']) {
      expect(s).toContain(part);
    }
    expect(s).toContain("min(1080,trunc(iw/2)*2)");
    expect(args[args.length - 1]).toBe('/u/.web-tmp/x.mp4');
    expect(s).not.toContain('tonemap');
  });

  it('HDR com zscale disponível: converte as cores antes de ir para 8 bits', () => {
    const hdr = h264({ video: { codec: 'hevc', pixFmt: 'yuv420p10le', width: 1080, height: 1920, colorTransfer: 'arib-std-b67' } });
    expect(buildFfmpegArgs({ src: 'a', dest: 'b', action: 'transcode', probe: hdr, hasZscale: true }).join(' ')).toContain('tonemap');
    expect(buildFfmpegArgs({ src: 'a', dest: 'b', action: 'transcode', probe: hdr, hasZscale: false }).join(' ')).not.toContain('tonemap');
  });

  it('remux copia o vídeo; áudio que o mp4 não aceita vira AAC', () => {
    const copy = buildFfmpegArgs({ src: 'a', dest: 'b', action: 'remux', probe: h264() }).join(' ');
    expect(copy).toContain('-c:v copy');
    expect(copy).toContain('-c:a copy');
    const pcm = buildFfmpegArgs({ src: 'a', dest: 'b', action: 'remux', probe: h264({ audio: { codec: 'pcm_s16le' } }) }).join(' ');
    expect(pcm).toContain('-c:a aac');
    expect(pcm).not.toContain('libx264');
  });
});

describe('nome da versão leve', () => {
  it('<nome>.web.mp4 ao lado do original, para .mp4 e .mov', () => {
    expect(webVariantName('1761000000000_ab12cd34ef56.mp4')).toBe('1761000000000_ab12cd34ef56.web.mp4');
    expect(webVariantName('1761000000000_ab12cd34ef56.MOV')).toBe('1761000000000_ab12cd34ef56.web.mp4');
    expect(webVariantPath('/var/www/uploads/content/c/t/x.mov')).toBe('/var/www/uploads/content/c/t/x.web.mp4');
  });

  it('a própria .web.mp4 e o que não é vídeo não ganham versão leve', () => {
    expect(isWebVariantName('x.web.mp4')).toBe(true);
    expect(isConvertibleVideoName('x.web.mp4')).toBe(false);
    expect(webVariantName('x.web.mp4')).toBeNull();
    expect(webVariantName('arte.png')).toBeNull();
    expect(webVariantName('contrato.pdf')).toBeNull();
  });

  it('URL da versão leve no mesmo formato (completa ou relativa), sem query', () => {
    expect(webVariantUrl('https://agenciapulse.tech/uploads/content/c/t/x.mov')).toBe('https://agenciapulse.tech/uploads/content/c/t/x.web.mp4');
    expect(webVariantUrl('/uploads/content/c/t/x.mp4?v=2#t=3')).toBe('/uploads/content/c/t/x.web.mp4');
    expect(webVariantUrl('https://agenciapulse.tech/uploads/content/c/t/x.web.mp4')).toBeNull();
  });

  it('originais possíveis de uma .web.mp4 (para a auditoria de arquivos sem uso)', () => {
    const names = originalNamesForWebVariant('x.web.mp4');
    expect(names).toContain('x.mp4');
    expect(names).toContain('x.mov');
    expect(originalNamesForWebVariant('x.mp4')).toEqual([]);
  });
});

describe('validação de caminho', () => {
  it('aceita só /uploads/ (relativo ou da origem do sistema)', () => {
    expect(uploadRelativeFromUrl('https://agenciapulse.tech/uploads/content/c/t/x.mp4')).toBe('content/c/t/x.mp4');
    expect(uploadRelativeFromUrl('/uploads/content/c/t/x%20y.mov')).toBe('content/c/t/x y.mov');
    expect(uploadRelativeFromUrl('https://outro.com/uploads/content/x.mp4')).toBeNull();
    expect(uploadRelativeFromUrl('https://agenciapulse.tech/api/health')).toBeNull();
    expect(uploadRelativeFromUrl('/etc/passwd')).toBeNull();
    expect(uploadRelativeFromUrl('file:///etc/passwd')).toBeNull();
    expect(uploadRelativeFromUrl('uploads/content/x.mp4')).toBeNull();
  });

  it('recusa "..", barra invertida, byte nulo, pasta oculta e treinamento', () => {
    expect(uploadRelativeFromUrl('/uploads/content/..%2f..%2f.env')).toBeNull();
    expect(uploadRelativeFromUrl('/uploads/content/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
    expect(uploadRelativeFromUrl('/uploads/..%5cetc%5cpasswd')).toBeNull();
    expect(uploadRelativeFromUrl('/uploads/content/x%00.mp4')).toBeNull();
    expect(uploadRelativeFromUrl('/uploads/.web-tmp/x.mp4')).toBeNull();
    expect(uploadRelativeFromUrl('/uploads/training-videos/aula.mp4')).toBeNull();
    expect(uploadRelativeFromUrl('/uploads/content/%E0%A4%A.mp4')).toBeNull();
  });

  describe('no disco (realpath)', () => {
    let root = '';
    let outside = '';
    beforeAll(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'webvideo-raiz-'));
      outside = fs.mkdtempSync(path.join(os.tmpdir(), 'webvideo-fora-'));
      fs.mkdirSync(path.join(root, 'content'), { recursive: true });
      fs.writeFileSync(path.join(root, 'content', 'x.mp4'), 'x');
      fs.writeFileSync(path.join(outside, 'segredo.mp4'), 'segredo');
      fs.symlinkSync(path.join(outside, 'segredo.mp4'), path.join(root, 'content', 'atalho.mp4'));
    });
    afterAll(() => {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    });

    it('acha o arquivo dentro da raiz e nunca o que um atalho aponta para fora', () => {
      const found = resolveUploadFile('/uploads/content/x.mp4', [root]);
      expect(found?.relative).toBe('content/x.mp4');
      expect(found?.localPath).toBe(fs.realpathSync(path.join(root, 'content', 'x.mp4')));
      expect(resolveUploadFile('/uploads/content/atalho.mp4', [root])).toBeNull();
      expect(resolveUploadFile('/uploads/content/nao-existe.mp4', [root])).toBeNull();
      expect(resolveUploadFile('/uploads/content', [root])).toBeNull();
    });

    it('faststart: moov antes de mdat', () => {
      const box = (type: string, payload = 0) => {
        const b = Buffer.alloc(8 + payload);
        b.writeUInt32BE(8 + payload, 0);
        b.write(type, 4, 'latin1');
        return b;
      };
      const fast = path.join(root, 'fast.mp4');
      const slow = path.join(root, 'slow.mov');
      fs.writeFileSync(fast, Buffer.concat([box('ftyp', 12), box('moov', 40), box('mdat', 100)]));
      fs.writeFileSync(slow, Buffer.concat([box('ftyp', 12), box('wide'), box('mdat', 100), box('moov', 40)]));
      expect(mp4HasFaststart(fast)).toBe(true);
      expect(mp4HasFaststart(slow)).toBe(false);
      fs.writeFileSync(path.join(root, 'lixo.mp4'), Buffer.from([1, 2, 3]));
      expect(mp4HasFaststart(path.join(root, 'lixo.mp4'))).toBeNull();
    });
  });
});

describe('captura dos uploads', () => {
  it('só vídeos de respostas com sucesso entram na fila (req.file, req.files em lista e por campo)', () => {
    const seen: string[] = [];
    const middleware = captureVideoUploads((p: string) => seen.push(p));
    const run = (req: Record<string, unknown>, status: number) => {
      const listeners: Record<string, () => void> = {};
      const res = { statusCode: status, on: (event: string, fn: () => void) => { listeners[event] = fn; } };
      middleware({ method: 'POST', ...req }, res, () => {});
      listeners.finish?.();
    };
    run({ file: { path: '/u/a.mp4' } }, 200);
    run({ files: [{ path: '/u/b.mov' }, { path: '/u/arte.png' }] }, 200);
    run({ files: { video: [{ path: '/u/c.mp4' }], plan: [{ path: '/u/plan.json' }] } }, 200);
    run({ file: { path: '/u/falhou.mp4' } }, 409);
    run({ file: { path: '/u/d.web.mp4' } }, 200);
    expect(seen).toEqual(['/u/a.mp4', '/u/b.mov', '/u/c.mp4']);
  });
});
