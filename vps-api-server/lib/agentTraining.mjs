// ─── Treino dos agentes: regras puras (sem banco) ─────────────────────────────
// Usadas por agentTrainingRoutes.mjs e pelos testes (src/test/agentTraining.test.ts).

export const TRAINER_MODULE = 'treino_agentes';
export const MAX_TRAINING_TEXT = 8000;
export const MAX_TRAINING_ATTACHMENTS = 10;

/** Tipo do anexo pelo nome/endereço e pelo tipo informado pelo navegador. */
export function attachmentKind(nameOrUrl, mime = '') {
  const type = String(mime || '').toLowerCase();
  const ext = (String(nameOrUrl || '').split('?')[0].match(/\.([a-z0-9]{1,5})$/i)?.[1] || '').toLowerCase();
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'svg'].includes(ext)) return 'imagem';
  if (type.startsWith('video/') || ['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'].includes(ext)) return 'video';
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (type.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'ogg', 'aac'].includes(ext)) return 'audio';
  if (type.startsWith('text/') || ['txt', 'md', 'csv', 'json', 'srt'].includes(ext)) return 'texto';
  return 'arquivo';
}

/**
 * Anexos que a tela mandou: só arquivos já enviados para /uploads do próprio sistema (o upload da equipe),
 * no máximo 10. Devolve [{ url, name, type, kind, size }] ou lança { status: 400 }.
 */
export function sanitizeAttachments(list, uploadsBase) {
  if (list == null) return [];
  if (!Array.isArray(list)) throw Object.assign(new Error('Anexos inválidos'), { status: 400 });
  if (list.length > MAX_TRAINING_ATTACHMENTS) {
    throw Object.assign(new Error(`No máximo ${MAX_TRAINING_ATTACHMENTS} anexos por ensinamento`), { status: 400 });
  }
  const base = String(uploadsBase || '').replace(/\/+$/, '');
  return list.map((item) => {
    const url = String(item?.url || '').trim();
    const fromUploads = url.startsWith('/uploads/') || (base && url.startsWith(`${base}/`));
    if (!url || !fromUploads || url.includes('..')) {
      throw Object.assign(new Error('Anexo fora dos arquivos do sistema'), { status: 400 });
    }
    const name = String(item?.name || url.split('/').pop() || 'arquivo').slice(0, 200);
    const type = String(item?.type || '').slice(0, 100);
    const size = Number.isFinite(Number(item?.size)) ? Math.max(0, Math.round(Number(item.size))) : null;
    return { url, name, type, kind: attachmentKind(name || url, type), size };
  });
}

/** Endereço completo do anexo (o agente baixa de fora do servidor). */
export function absoluteUploadUrl(url, uploadsBase) {
  const value = String(url || '');
  if (/^https?:\/\//i.test(value)) return value;
  const base = String(uploadsBase || 'https://agenciapulse.tech/uploads').replace(/\/+$/, '');
  // uploadsBase já termina em /uploads
  return value.startsWith('/uploads/') ? `${base}${value.slice('/uploads'.length)}` : `${base}/${value.replace(/^\/+/, '')}`;
}

/** Recado curto que avisa o agente (agent_messages) do ensinamento novo. */
export function trainingNotice({ authorName, clientName, body, attachments }) {
  const who = String(authorName || 'Alguém da equipe').trim().split(/\s+/)[0];
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  const clip = text.length > 220 ? `${text.slice(0, 217)}…` : text;
  const files = (attachments || []).length;
  return [
    `📚 Ensinamento novo de ${who}${clientName ? ` · cliente ${String(clientName).trim()}` : ''}`,
    clip ? `: "${clip}"` : '',
    files ? ` (+${files} anexo${files > 1 ? 's' : ''})` : '',
    '. Leia com `pulse treino` e guarde o que vale como regra.',
  ].join('');
}
