/**
 * Links que saem de cadastro (encurtador, regulamentos, botões da bio).
 * Um destino 'javascript:' em window.location ou num href roda no domínio do sistema,
 * onde fica a sessão da equipe, então só passam os esquemas abaixo.
 */

/** Destino de redirecionamento: só http(s). */
export function isSafeRedirectUrl(value: unknown): value is string {
  try {
    const url = new URL(String(value ?? '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** href de botão: http(s), tel: e mailto:. Qualquer outro esquema vira '#'. */
export function safeLinkHref(value: unknown): string {
  const raw = String(value ?? '').trim();
  try {
    const url = new URL(raw);
    if (['http:', 'https:', 'tel:', 'mailto:'].includes(url.protocol)) return raw;
  } catch {
    /* sem esquema: não é um link válido */
  }
  return '#';
}
