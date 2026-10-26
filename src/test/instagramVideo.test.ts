import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  IG_SCALE_FILTER,
  buildIgFfmpegArgs,
  checkMetaSpec,
  createInstagramVideo,
  decideIgVariant,
  editListKind,
  igBitrateCap,
  inspectMp4Container,
  instagramUrlFor,
  metaDurationProblem,
  metaKindFor,
  parseMetaProbe,
  planPostMedia,
  postMediaUrls,
  readyVariantPath,
} from '../../vps-api-server/lib/instagramVideo.mjs';
import {
  HDR_TO_SDR,
  captureVideoUploads,
  igVariantName,
  igVariantPath,
  igVariantUrl,
  isConvertibleVideoName,
  isDerivedVariantName,
  originalNamesForVariant,
  webVariantName,
} from '../../vps-api-server/lib/webVideo.mjs';

type Over = Record<string, unknown>;

/** Saída do ffprobe (-show_format -show_streams) de um vídeo vertical, com trocas por teste. */
const probe = ({ video = {}, audio = {}, format = {}, noAudio = false }: { video?: Over; audio?: Over; format?: Over; noAudio?: boolean } = {}) => ({
  streams: [
    {
      codec_type: 'video', codec_name: 'h264', profile: 'High', pix_fmt: 'yuv420p', width: 1080, height: 1920,
      avg_frame_rate: '30/1', r_frame_rate: '30/1', field_order: 'progressive', bit_rate: '12000000', duration: '30.000000',
      ...video,
    },
    ...(noAudio ? [] : [{ codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2, bit_rate: '128000', ...audio }]),
  ],
  format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '30.000000', size: '45500000', bit_rate: '12133333', ...format },
});
const good = { ext: '.mp4', faststart: true, editList: 'none' as const };
const codes = (check: { problems: { code: string }[] }) => check.problems.map((p) => p.code);

describe('checagem "cumpre a Meta?"', () => {
  it('H.264 de 12 Mbps com faststart e AAC de 48 kHz cumpre', () => {
    const check = checkMetaSpec(probe(), { kind: 'reels', ...good });
    expect(check.ok).toBe(true);
    expect(check.problems).toEqual([]);
    expect(decideIgVariant(check).action).toBe('none');
  });

  it('40 Mbps não cumpre (e a conversão resolve)', () => {
    const check = checkMetaSpec(probe({ video: { bit_rate: '40000000' }, format: { bit_rate: '40130000', size: '150500000' } }), { kind: 'reels', ...good });
    expect(check.ok).toBe(false);
    expect(codes(check)).toEqual(['bitrate']);
    expect(check.reason).toContain('40.0 Mbps');
    expect(decideIgVariant(check).action).toBe('transcode');
  });

  it('HEVC sem faststart não cumpre', () => {
    const hevc = probe({ video: { codec_name: 'hevc', bit_rate: '15000000' }, format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2' } });
    const check = checkMetaSpec(hevc, { kind: 'reels', ext: '.mov', faststart: false, editList: 'trivial' });
    expect(check.ok).toBe(false);
    expect(codes(check)).toEqual(['moov']);
    expect(check.reason).toContain('sem faststart');
    // só o contêiner: copia o vídeo, sem recodificar
    expect(decideIgVariant(check)).toMatchObject({ action: 'remux', audioOk: true });
    // o mesmo HEVC com faststart cumpre
    expect(checkMetaSpec(hevc, { kind: 'reels', ext: '.mov', faststart: true, editList: 'none' }).ok).toBe(true);
  });

  it('120 fps não cumpre; 23,976 e 59,94 cumprem', () => {
    expect(codes(checkMetaSpec(probe({ video: { avg_frame_rate: '120/1', r_frame_rate: '120/1' } }), good))).toEqual(['fps']);
    expect(checkMetaSpec(probe({ video: { avg_frame_rate: '24000/1001' } }), good).ok).toBe(true);
    expect(checkMetaSpec(probe({ video: { avg_frame_rate: '60000/1001' } }), good).ok).toBe(true);
    expect(codes(checkMetaSpec(probe({ video: { avg_frame_rate: '15/1', r_frame_rate: '15/1' } }), good))).toEqual(['fps']);
  });

  it('áudio de 96 kHz não cumpre; nem 6 canais, MP3 ou 320 kbps; vídeo sem som cumpre', () => {
    expect(codes(checkMetaSpec(probe({ audio: { sample_rate: '96000' } }), good))).toEqual(['audio_rate']);
    expect(codes(checkMetaSpec(probe({ audio: { channels: 6 } }), good))).toEqual(['audio_channels']);
    expect(codes(checkMetaSpec(probe({ audio: { codec_name: 'mp3' } }), good))).toEqual(['audio_codec']);
    expect(codes(checkMetaSpec(probe({ audio: { bit_rate: '320000' } }), good))).toEqual(['audio_bitrate']);
    expect(checkMetaSpec(probe({ audio: { bit_rate: '130000' } }), good).ok).toBe(true); // arredondamento do AAC
    expect(checkMetaSpec(probe({ noAudio: true }), good).ok).toBe(true);
    const audioOnly = checkMetaSpec(probe({ audio: { sample_rate: '96000' } }), good);
    expect(decideIgVariant(audioOnly)).toMatchObject({ action: 'remux', audioOk: false });
  });

  it('story com 70 s é recusado (a conversão não resolve); reels com 70 s cumpre', () => {
    const long = probe({ video: { duration: '70.0' }, format: { duration: '70.000000' } });
    const story = checkMetaSpec(long, { kind: 'stories', ...good });
    expect(story.ok).toBe(false);
    expect(story.problems).toEqual([{ code: 'duration', message: 'Story em vídeo aceita no máximo 60 s (este vídeo tem 1 min 10 s).', fixable: false }]);
    expect(decideIgVariant(story).action).toBe('skip');
    expect(checkMetaSpec(long, { kind: 'reels', ...good }).ok).toBe(true);
    expect(metaDurationProblem(70, 'stories')).toContain('60 s');
    expect(metaDurationProblem(60.02, 'stories')).toBeNull(); // 60 s que o contêiner arredonda para cima
    expect(metaDurationProblem(2, 'stories')).toContain('pelo menos 3 s');
  });

  it('reels: de 3 s a 15 min; vídeo no feed segue o reels; carrossel não tem limite de duração', () => {
    expect(metaDurationProblem(2.4, 'reels')).toBe('Reels precisa ter pelo menos 3 s (este vídeo tem 2,4 s).');
    expect(metaDurationProblem(16 * 60 + 5, 'reels')).toBe('Reels aceita no máximo 15 min (este vídeo tem 16 min 5 s).');
    expect(metaDurationProblem(15 * 60, 'reels')).toBeNull();
    expect(metaDurationProblem(3, 'reels')).toBeNull();
    expect(metaDurationProblem(2, 'feed')).toContain('Vídeo no feed');
    expect(metaDurationProblem(2, 'carousel')).toBeNull();
    expect(metaKindFor('feed')).toBe('reels');
    expect(metaKindFor('stories')).toBe('stories');
    expect(metaKindFor('carousel')).toBe('carousel');
  });

  it('largura acima de 1920, 10 bits, entrelaçado, VP9, .webm, edit list e tamanho do story', () => {
    expect(codes(checkMetaSpec(probe({ video: { width: 2160, height: 3840 } }), good))).toEqual(['width']);
    expect(codes(checkMetaSpec(probe({ video: { pix_fmt: 'yuv420p10le' } }), good))).toEqual(['pix_fmt']);
    expect(codes(checkMetaSpec(probe({ video: { field_order: 'tt' } }), good))).toEqual(['interlaced']);
    expect(codes(checkMetaSpec(probe({ video: { codec_name: 'vp9' } }), good))).toEqual(['codec']);
    expect(codes(checkMetaSpec(probe({ format: { format_name: 'matroska,webm' } }), { ...good, ext: '.webm' }))).toEqual(['container']);
    expect(codes(checkMetaSpec(probe(), { ...good, editList: 'present' }))).toEqual(['edit_list']);
    expect(checkMetaSpec(probe(), { ...good, editList: 'trivial' }).ok).toBe(true);
    const big = probe({ format: { size: '120000000' } });
    expect(codes(checkMetaSpec(big, { kind: 'stories', ...good }))).toEqual(['size']);
    expect(checkMetaSpec(big, { kind: 'reels', ...good }).ok).toBe(true);
    expect(decideIgVariant(checkMetaSpec(big, { kind: 'stories', ...good })).action).toBe('transcode');
  });

  it('girado: confere a largura que aparece na tela', () => {
    const info = parseMetaProbe(probe({ video: { width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] } }));
    expect(info.video).toMatchObject({ width: 1920, height: 1080, displayWidth: 1080, displayHeight: 1920, rotation: 270 });
  });

  it('sem trilha de vídeo não converte', () => {
    const check = checkMetaSpec({ streams: [{ codec_type: 'audio', codec_name: 'aac' }], format: {} }, good);
    expect(check.ok).toBe(false);
    expect(decideIgVariant(check).action).toBe('skip');
  });
});

describe('argumentos do ffmpeg da .ig.mp4', () => {
  const info = (over: Over = {}) => ({ ...parseMetaProbe(probe({ video: { bit_rate: '40000000' } })), ...over });
  const valueOf = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

  it('recodifica: H.264 high, yuv420p, CRF 18 até 20 Mbps, GOP fechado de 2 s, AAC 128k 48 kHz estéreo, faststart, sem edit list', () => {
    const args = buildIgFfmpegArgs({ src: '/u/a.mov', dest: '/u/.web-tmp/x.ig.mp4', action: 'transcode', threads: 2, info: info() });
    expect(valueOf(args, '-i')).toBe('/u/a.mov');
    expect(valueOf(args, '-c:v')).toBe('libx264');
    expect(valueOf(args, '-profile:v')).toBe('high');
    expect(valueOf(args, '-pix_fmt')).toBe('yuv420p');
    expect(valueOf(args, '-crf')).toBe('18');
    expect(valueOf(args, '-maxrate')).toBe('20M');
    expect(valueOf(args, '-bufsize')).toBe('40M');
    expect(valueOf(args, '-g')).toBe('60');
    expect(valueOf(args, '-flags')).toBe('+cgop');
    expect(valueOf(args, '-x264-params')).toBe('vbv-init=0.1');
    expect(valueOf(args, '-c:a')).toBe('aac');
    expect(valueOf(args, '-b:a')).toBe('128k');
    expect(valueOf(args, '-ar')).toBe('48000');
    expect(valueOf(args, '-ac')).toBe('2');
    expect(valueOf(args, '-movflags')).toBe('+faststart');
    expect(valueOf(args, '-use_editlist')).toBe('0');
    expect(valueOf(args, '-f')).toBe('mp4');
    expect(valueOf(args, '-threads')).toBe('2');
    expect(args.at(-1)).toBe('/u/.web-tmp/x.ig.mp4');
    const vf = valueOf(args, '-vf');
    expect(vf).toContain(IG_SCALE_FILTER);
    expect(vf).toContain('format=yuv420p');
    expect(vf).not.toContain('fps=');
    expect(args).toContain('0:a:0?');
  });

  it('fps fora de 23 a 60 vira 30; 59,94 fica e o GOP acompanha', () => {
    let args = buildIgFfmpegArgs({ src: 'a', dest: 'b', action: 'transcode', info: info({ video: { ...info().video, fps: 120 } }) });
    expect(valueOf(args, '-vf').startsWith('fps=30,')).toBe(true);
    expect(valueOf(args, '-g')).toBe('60');
    args = buildIgFfmpegArgs({ src: 'a', dest: 'b', action: 'transcode', info: info({ video: { ...info().video, fps: 60000 / 1001 } }) });
    expect(valueOf(args, '-vf')).not.toContain('fps=');
    expect(valueOf(args, '-g')).toBe('120');
  });

  it('teto de taxa cabe no tamanho máximo: 60 s cabem num story de 100 MB; 15 min num reels de 300 MB', () => {
    expect(igBitrateCap(30)).toMatchObject({ maxrate: '20M', bufsize: '40M' });
    const minute = igBitrateCap(60);
    expect(minute.kbps).toBeLessThan(20_000);
    expect((minute.kbps + 128) * 1000 * 60 / 8).toBeLessThan(100_000_000);
    const long = igBitrateCap(900);
    expect((long.kbps + 128) * 1000 * 900 / 8).toBeLessThan(300_000_000);
    const args = buildIgFfmpegArgs({ src: 'a', dest: 'b', action: 'transcode', info: info({ durationSec: 60 }) });
    expect(valueOf(args, '-maxrate')).toBe(minute.maxrate);
  });

  it('HDR com zscale vira SDR; lado maior até 1920 com medidas pares', () => {
    const hdr = info({ video: { ...info().video, colorTransfer: 'arib-std-b67', pixFmt: 'yuv420p10le' } });
    expect(valueOf(buildIgFfmpegArgs({ src: 'a', dest: 'b', action: 'transcode', info: hdr, hasZscale: true }), '-vf')).toContain(HDR_TO_SDR);
    expect(valueOf(buildIgFfmpegArgs({ src: 'a', dest: 'b', action: 'transcode', info: hdr, hasZscale: false }), '-vf')).not.toContain('zscale');
    expect(IG_SCALE_FILTER).toContain('min(1920,trunc(iw/2)*2)');
    expect(IG_SCALE_FILTER).toContain('min(1920,trunc(ih/2)*2)');
  });

  it('sem recodificar: copia o vídeo (hvc1 no HEVC) e só refaz o áudio quando ele não cumpre', () => {
    const hevc = parseMetaProbe(probe({ video: { codec_name: 'hevc' } }));
    let args = buildIgFfmpegArgs({ src: 'a.mov', dest: 'b', action: 'remux', info: hevc, audioOk: true });
    expect(valueOf(args, '-c:v')).toBe('copy');
    expect(valueOf(args, '-tag:v')).toBe('hvc1');
    expect(valueOf(args, '-c:a')).toBe('copy');
    expect(args).not.toContain('-vf');
    expect(valueOf(args, '-movflags')).toBe('+faststart');
    expect(valueOf(args, '-use_editlist')).toBe('0');
    args = buildIgFfmpegArgs({ src: 'a.mov', dest: 'b', action: 'remux', info: hevc, audioOk: false });
    expect(valueOf(args, '-c:a')).toBe('aac');
    expect(valueOf(args, '-ar')).toBe('48000');
  });
});

describe('contêiner: moov e edit list', () => {
  let dir = '';
  beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'igvideo-')); });
  afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  const box = (type: string, payload: Buffer = Buffer.alloc(0)) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(8 + payload.length, 0);
    head.write(type, 4, 'latin1');
    return Buffer.concat([head, payload]);
  };
  const elst = (mediaTime: number, entries = 1) => {
    const body = Buffer.alloc(8 + entries * 12);
    body.writeUInt32BE(entries, 4); // versão 0, flags 0
    for (let i = 0; i < entries; i++) {
      body.writeUInt32BE(1000, 8 + i * 12);
      body.writeInt32BE(mediaTime, 12 + i * 12);
      body.writeInt16BE(1, 16 + i * 12);
    }
    return box('elst', body);
  };
  const moov = (...traks: Buffer[]) => box('moov', Buffer.concat([box('mvhd', Buffer.alloc(20)), ...traks]));
  const trak = (edit?: Buffer) => box('trak', Buffer.concat([box('tkhd', Buffer.alloc(20)), ...(edit ? [box('edts', edit)] : []), box('mdia', Buffer.alloc(16))]));
  const write = (name: string, ...boxes: Buffer[]) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, Buffer.concat(boxes));
    return file;
  };

  it('moov no começo sem edit list; com edit list trivial; com edit list de verdade; moov no fim', () => {
    expect(inspectMp4Container(write('a.mp4', box('ftyp', Buffer.alloc(12)), moov(trak(), trak()), box('mdat', Buffer.alloc(64)))))
      .toEqual({ faststart: true, editList: 'none' });
    expect(inspectMp4Container(write('b.mp4', box('ftyp', Buffer.alloc(12)), moov(trak(elst(0))), box('mdat', Buffer.alloc(64)))))
      .toEqual({ faststart: true, editList: 'trivial' });
    expect(inspectMp4Container(write('c.mp4', box('ftyp', Buffer.alloc(12)), moov(trak(elst(0)), trak(elst(1024))), box('mdat', Buffer.alloc(64)))))
      .toEqual({ faststart: true, editList: 'present' });
    expect(inspectMp4Container(write('d.mp4', box('ftyp', Buffer.alloc(12)), moov(trak(elst(0, 2))), box('mdat', Buffer.alloc(64)))).editList)
      .toBe('present');
    expect(inspectMp4Container(write('e.mov', box('ftyp', Buffer.alloc(12)), box('wide'), box('mdat', Buffer.alloc(64)), moov(trak(elst(0))))))
      .toEqual({ faststart: false, editList: 'trivial' });
    expect(inspectMp4Container(write('lixo.mp4', Buffer.from([1, 2, 3])))).toEqual({ faststart: null, editList: null });
    expect(editListKind(Buffer.alloc(0))).toBe('none');
  });
});

describe('escolha da URL na hora de publicar', () => {
  const orig = 'https://agenciapulse.tech/uploads/content/c/1_ab.mov';
  const ig = 'https://agenciapulse.tech/uploads/content/c/1_ab.ig.mp4';
  const reason = { reason: 'vídeo de 40.0 Mbps (máximo 25 Mbps)' };

  it('.ig.mp4 pronta vai no lugar do original; original que cumpre vai como está', () => {
    expect(planPostMedia([{ url: orig, status: 'ready', igUrl: ig }])).toMatchObject({ wait: false, urls: [ig], changed: true, fallback: null });
    expect(planPostMedia([{ url: orig, status: 'original' }])).toMatchObject({ wait: false, urls: [orig], changed: false, fallback: null });
    expect(planPostMedia([{ url: 'https://outro.site/x.png', status: 'external' }, { url: orig, status: 'ready', igUrl: ig }]).urls)
      .toEqual(['https://outro.site/x.png', ig]);
  });

  it('ainda convertendo: adia até 30 min de atraso; depois vai o original com o motivo', () => {
    const pending = [{ url: orig, status: 'pending', relative: 'content/c/1_ab.mov', check: reason }];
    expect(planPostMedia(pending, { delayMs: 0 })).toMatchObject({ wait: true, pending: ['content/c/1_ab.mov'] });
    expect(planPostMedia(pending, { delayMs: 29 * 60_000 }).wait).toBe(true);
    const late = planPostMedia(pending, { delayMs: 30 * 60_000 });
    expect(late).toMatchObject({ wait: false, urls: [orig], changed: false });
    expect(late.fallback).toBe('O vídeo não ficou pronto no formato do Instagram a tempo e foi enviado o original: vídeo de 40.0 Mbps (máximo 25 Mbps).');
  });

  it('sem como converter (disco, fila cheia, ffmpeg ausente): vai o original na hora, sem motivo (novas tentativas normais)', () => {
    expect(planPostMedia([{ url: orig, status: 'unavailable', check: reason }], { delayMs: 0 })).toMatchObject({ wait: false, urls: [orig], fallback: null });
  });

  it('conversão que falhou não espera: vai o original na hora, com o motivo', () => {
    const plan = planPostMedia([{ url: orig, status: 'failed', check: reason }], { delayMs: 0 });
    expect(plan.wait).toBe(false);
    expect(plan.urls).toEqual([orig]);
    expect(plan.fallback).toContain('Não deu para ajustar o vídeo ao formato do Instagram');
  });

  it('versão Instagram desligada: vai o original como antes (sem motivo, o post tenta de novo)', () => {
    expect(planPostMedia([{ url: orig, status: 'disabled', check: reason }], { delayMs: 0 })).toMatchObject({ wait: false, urls: [orig], fallback: null });
  });

  it('mídias do post: media_items (lista ou texto JSON) ou media_url', () => {
    expect(postMediaUrls({ media_url: orig, media_items: null })).toEqual([orig]);
    expect(postMediaUrls({ media_url: orig, media_items: JSON.stringify([{ url: 'https://a/1.mp4' }, 'https://a/2.png', { url: '/rel.mp4' }]) }))
      .toEqual(['https://a/1.mp4', 'https://a/2.png']);
    expect(postMediaUrls({ media_url: null, media_items: [] })).toEqual([]);
  });
});

describe('nomes: a .ig.mp4 e a .web.mp4 não se misturam', () => {
  it('.ig.mp4 ao lado do original; cópia gerada nunca vira vídeo novo', () => {
    expect(igVariantName('1729_ab12.mov')).toBe('1729_ab12.ig.mp4');
    expect(igVariantPath('/u/content/1729_ab12.mp4')).toBe('/u/content/1729_ab12.ig.mp4');
    expect(igVariantUrl('https://agenciapulse.tech/uploads/content/a%20b.mov?x=1')).toBe('https://agenciapulse.tech/uploads/content/a%20b.ig.mp4');
    expect(igVariantUrl('/uploads/content/x.png')).toBeNull();
    expect(isConvertibleVideoName('x.ig.mp4')).toBe(false);
    expect(isConvertibleVideoName('x.web.mp4')).toBe(false);
    expect(isDerivedVariantName('X.IG.MP4')).toBe(true);
    expect(webVariantName('x.ig.mp4')).toBeNull();
    expect(igVariantName('x.web.mp4')).toBeNull();
    expect(originalNamesForVariant('1_ab.ig.mp4')).toContain('1_ab.mov');
    expect(originalNamesForVariant('1_ab.web.mp4')).toContain('1_ab.mp4');
    expect(originalNamesForVariant('1_ab.mp4')).toEqual([]);
  });

  it('upload com nome .ig.mp4 não entra na fila da versão leve', () => {
    const seen: string[] = [];
    const middleware = captureVideoUploads((p: string) => seen.push(p));
    const listeners: Record<string, () => void> = {};
    middleware({ method: 'POST', files: [{ path: '/u/a.ig.mp4' }, { path: '/u/b.web.mp4' }, { path: '/u/c.mp4' }] },
      { statusCode: 200, on: (event: string, fn: () => void) => { listeners[event] = fn; } }, () => {});
    listeners.finish?.();
    expect(seen).toEqual(['/u/c.mp4']);
  });

  describe('instagramUrlFor', () => {
    let root = '';
    beforeAll(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'igvideo-raiz-'));
      fs.mkdirSync(path.join(root, 'content'), { recursive: true });
      for (const name of ['pronto.mov', 'sem.mp4', 'velho.mp4']) fs.writeFileSync(path.join(root, 'content', name), 'x');
      fs.writeFileSync(path.join(root, 'content', 'pronto.ig.mp4'), 'ig');
      fs.writeFileSync(path.join(root, 'content', 'velho.ig.mp4'), 'ig');
      const past = new Date(Date.now() - 3_600_000);
      fs.utimesSync(path.join(root, 'content', 'velho.ig.mp4'), past, past);
    });
    afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

    it('a .ig.mp4 quando existe (e não é mais velha que o original); senão o original', () => {
      const opts = { roots: [root] };
      expect(instagramUrlFor('https://agenciapulse.tech/uploads/content/pronto.mov', opts)).toBe('https://agenciapulse.tech/uploads/content/pronto.ig.mp4');
      expect(instagramUrlFor('/uploads/content/pronto.mov', opts)).toBe('/uploads/content/pronto.ig.mp4');
      expect(instagramUrlFor('https://agenciapulse.tech/uploads/content/sem.mp4', opts)).toBe('https://agenciapulse.tech/uploads/content/sem.mp4');
      expect(instagramUrlFor('https://agenciapulse.tech/uploads/content/velho.mp4', opts)).toBe('https://agenciapulse.tech/uploads/content/velho.mp4');
      expect(instagramUrlFor('https://outro.site/uploads/content/pronto.mov', opts)).toBe('https://outro.site/uploads/content/pronto.mov');
      expect(instagramUrlFor('https://agenciapulse.tech/uploads/content/pronto.ig.mp4', opts)).toBe('https://agenciapulse.tech/uploads/content/pronto.ig.mp4');
    });
  });
});

describe('instância: conversão impossível, tipo do post e varredura', () => {
  const ORIGIN = 'https://agenciapulse.tech';
  let root = '';
  let seq = 0;
  // MP4 mínimo com o moov no começo e sem edit list (o ffprobe é falso: 40 Mbps)
  const box = (type: string, payload: Buffer = Buffer.alloc(0)) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(8 + payload.length, 0);
    head.write(type, 4, 'latin1');
    return Buffer.concat([head, payload]);
  };
  const mp4 = Buffer.concat([box('ftyp', Buffer.alloc(12)), box('moov', box('trak', box('tkhd', Buffer.alloc(20)))), box('mdat', Buffer.alloc(64))]);
  const heavyProbe = probe({ video: { bit_rate: '40000000' }, format: { bit_rate: '40130000', size: '1000' } });
  const place = () => {
    seq += 1;
    const rel = `content/c/176200000000${seq}_ab${seq}.mp4`;
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, mp4);
    return { rel, full, url: `${ORIGIN}/uploads/${rel}`, ig: igVariantPath(full) as string };
  };
  type Item = { key: string; run: unknown };
  const make = ({ disk = true, queue = 'queued', probeFile = async () => heavyProbe, pool = null as unknown }: {
    disk?: boolean; queue?: string; probeFile?: () => Promise<unknown>; pool?: unknown;
  } = {}) => {
    const enqueued: Item[] = [];
    const warnings: string[] = [];
    const webVideo = {
      infra: {
        settings: {}, roots: () => [root], runSlot: (t: () => unknown) => t(), lowPriority: (b: string, a: string[]) => [b, a],
        diskHasRoom: () => ({ ok: disk, free: disk ? 9e9 : 1e9, total: 1e10 }), hasZscale: async () => false, resetTools: () => {},
      },
      enqueueTask: (item: Item) => { enqueued.push(item); return queue; },
      taskState: () => null,
    };
    const logger = { log: () => {}, warn: (m: string) => warnings.push(m), error: () => {} };
    const ig = createInstagramVideo({ pool, webVideo, logger, env: {}, allowedOrigins: [ORIGIN], probeFile });
    return { ig, enqueued, warnings };
  };

  beforeAll(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'igvideo-inst-')); });
  afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('com espaço e fila livre: vai para a fila (pendente) e o post espera', async () => {
    const f = place();
    const { ig, enqueued } = make();
    expect((await ig.prepare(f.url, 'reels')).status).toBe('pending');
    expect(enqueued.map((i) => i.key)).toEqual([`ig:${fs.realpathSync(f.full)}`]);
    expect((await ig.chooseMedia([f.url], { publishType: 'reels', scheduledAt: new Date() })).wait).toBe(true);
  });

  it('disco abaixo do limite: "unavailable", o original vai na hora e o aviso sai uma vez só', async () => {
    const f = place();
    const { ig, enqueued, warnings } = make({ disk: false });
    expect((await ig.prepare(f.url, 'reels')).status).toBe('unavailable');
    const plan = await ig.chooseMedia([f.url], { publishType: 'reels', scheduledAt: new Date() });
    expect(plan).toMatchObject({ wait: false, urls: [f.url], fallback: null });
    expect(enqueued).toEqual([]);
    expect(warnings.filter((w) => w.includes('pouco espaço livre'))).toHaveLength(1);
  });

  it('fila cheia: "unavailable" e o original vai na hora', async () => {
    const f = place();
    const { ig } = make({ queue: 'full' });
    expect((await ig.prepare(f.url, 'reels')).status).toBe('unavailable');
    expect(await ig.chooseMedia([f.url], { publishType: 'reels', scheduledAt: new Date() })).toMatchObject({ wait: false, fallback: null });
  });

  it('ffprobe/ffmpeg ausente: "unavailable" (e não tenta de novo por alguns minutos)', async () => {
    const f = place();
    const missing = Object.assign(new Error('spawn ffprobe ENOENT'), { syscall: 'spawn ffprobe' });
    const { ig, warnings } = make({ probeFile: async () => { throw missing; } });
    expect((await ig.prepare(f.url, 'reels')).status).toBe('unavailable');
    expect((await ig.prepare(f.url, 'reels')).status).toBe('unavailable');
    expect(warnings.filter((w) => w.includes('indisponível'))).toHaveLength(1);
  });

  it('.ig.mp4 acima de 100 MB serve para reels, mas não para story: é refeita para o story', async () => {
    const f = place();
    fs.writeFileSync(f.ig, '');
    fs.truncateSync(f.ig, 120_000_000); // arquivo esparso de 120 MB
    expect(readyVariantPath(f.full, 'reels')).toBe(f.ig);
    expect(readyVariantPath(f.full, 'stories')).toBeNull();
    expect(readyVariantPath(f.full)).toBe(f.ig);
    expect(instagramUrlFor(f.url, { roots: [root] })).toBe(igVariantUrl(f.url));
    expect(instagramUrlFor(f.url, { roots: [root], kind: 'stories' })).toBe(f.url);
    const { ig, enqueued } = make();
    expect((await ig.prepare(f.url, 'reels')).status).toBe('ready');
    expect((await ig.prepare(f.url, 'stories')).status).toBe('pending');
    expect(enqueued).toHaveLength(1);
    expect((await ig.chooseMedia([f.url], { publishType: 'stories', scheduledAt: new Date() })).wait).toBe(true);
    expect((await ig.chooseMedia([f.url], { publishType: 'reels', scheduledAt: new Date() })).urls).toEqual([igVariantUrl(f.url)]);
  });

  it('varredura: sem lembrete de story, sem post só do Facebook e no máximo 1 dia para trás', async () => {
    const queries: string[] = [];
    const pool = { query: async (sql: string) => { queries.push(sql); return { rows: [] }; } };
    const { ig } = make({ pool });
    await ig.scan();
    const select = queries.find((q) => q.includes("status = 'agendado'")) || '';
    expect(select).toContain("story_mode IS DISTINCT FROM 'lembrete'");
    expect(select).toContain("platform IS DISTINCT FROM 'facebook'");
    expect(select).toContain("scheduled_at >= now() - interval '1 day'");
  });
});
