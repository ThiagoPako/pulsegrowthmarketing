// Meta falsa para os testes de ponta a ponta: carregada antes do server.mjs (node --import), troca o
// fetch global. Nenhuma chamada sai para a Meta de verdade:
// - graph.facebook.com / graph.instagram.com (e qualquer *.facebook.com, *.instagram.com, *.fbcdn.net)
//   respondem daqui e cada chamada é gravada (sem o token) em META_FALSA_LOG, uma linha JSON por chamada;
// - a origem das mídias de teste (META_FALSA_MEDIA_ORIGIN) responde ao HEAD com o arquivo de
//   META_FALSA_UPLOAD_ROOT (200 se existe, 404 se não);
// - legenda com "#recusa-original": a Meta recusa vídeo que não seja a .ig.mp4 (formato não suportado).

import fs from 'node:fs';
import path from 'node:path';

const LOG = process.env.META_FALSA_LOG;
const UPLOAD_ROOT = process.env.META_FALSA_UPLOAD_ROOT || '';
const MEDIA_ORIGIN = process.env.META_FALSA_MEDIA_ORIGIN || '';
const realFetch = globalThis.fetch;
let seq = 0;

function record(entry) {
  if (!LOG) return;
  try { fs.appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`); } catch {}
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function isMetaHost(hostname) {
  return /(^|\.)(facebook\.com|instagram\.com|fbcdn\.net)$/i.test(hostname);
}

function metaFalsa(url, method) {
  const params = Object.fromEntries([...url.searchParams.entries()].filter(([k]) => k !== 'access_token' && k !== 'client_secret'));
  const segments = url.pathname.split('/').filter(Boolean); // ['v21.0', '<id>', 'media']
  const edge = segments[2] || '';
  record({ kind: 'meta', method, host: url.hostname, path: url.pathname, params });
  if (method === 'POST' && edge === 'media') {
    const video = params.video_url || '';
    if (video && String(params.caption || '').includes('#recusa-original') && !video.endsWith('.ig.mp4')) {
      return json(400, { error: { message: "The video file you selected is in a format that we don't support.", type: 'OAuthException', code: 352 } });
    }
    return json(200, { id: `container-${++seq}` });
  }
  if (method === 'POST' && edge === 'media_publish') return json(200, { id: `midia-${++seq}` });
  if (method === 'POST' && ['videos', 'photos', 'feed'].includes(edge)) return json(200, { id: `fb-${++seq}` });
  if (method === 'GET' && segments.length === 2 && String(params.fields || '').includes('status_code')) {
    return json(200, { status_code: 'FINISHED', status: 'Finished' });
  }
  return json(400, { error: { message: 'meta falsa: rota não simulada', code: 100 } });
}

function media(url, method) {
  let relative;
  try { relative = decodeURIComponent(url.pathname.replace(/^\/uploads\//, '')); } catch { return new Response(null, { status: 400 }); }
  const file = path.join(UPLOAD_ROOT, relative);
  record({ kind: 'media', method, url: url.href });
  if (!UPLOAD_ROOT || relative.includes('..') || !fs.existsSync(file)) return new Response(null, { status: 404 });
  const ext = path.extname(file).toLowerCase();
  const type = ext === '.mov' ? 'video/quicktime' : ext === '.png' ? 'image/png' : ext === '.jpg' ? 'image/jpeg' : 'video/mp4';
  return new Response(method === 'HEAD' ? null : 'x', { status: 200, headers: { 'content-type': type, 'content-length': String(fs.statSync(file).size) } });
}

globalThis.fetch = async function fetchComMetaFalsa(input, init = {}) {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
  let url;
  try { url = new URL(href); } catch { return realFetch(input, init); }
  const method = String(init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
  if (isMetaHost(url.hostname)) return metaFalsa(url, method);
  if (MEDIA_ORIGIN && url.origin === MEDIA_ORIGIN) return media(url, method);
  return realFetch(input, init);
};
