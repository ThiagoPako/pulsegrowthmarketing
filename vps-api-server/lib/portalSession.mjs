// ═══════════════════════════════════════════════════════════════
// Sessão do portal do cliente (Pulse Club)
// ═══════════════════════════════════════════════════════════════
// O login do portal devolve um token próprio, assinado com um segredo diferente
// do JWT da equipe e sem `sub`: ele nunca vale como sessão da equipe no verifyUser.
// As rotas do portal aceitam esse token (x-portal-token) OU o JWT da equipe
// (Authorization: Bearer), para o "Acessar Portal" continuar funcionando.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * @param {{ jwt: { sign: Function, verify: Function }, secret: string, expiresIn?: string }} deps
 */
export function createPortalSession({ jwt, secret, expiresIn = '7d' }) {
  if (!jwt || !secret) throw new Error('portalSession: jwt e secret são obrigatórios');

  function sign({ clientId, portalUserId = null }) {
    if (!isUuid(String(clientId || ''))) throw new Error('portalSession: client_id inválido');
    return jwt.sign({ typ: 'portal', cid: String(clientId), puid: portalUserId || null }, secret, { expiresIn });
  }

  /** { clientId, portalUserId } ou null quando o token falta, expirou ou não é do portal. */
  function read(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') return null;
    try {
      const decoded = jwt.verify(rawToken, secret);
      if (!decoded || decoded.typ !== 'portal' || decoded.sub || !isUuid(decoded.cid)) return null;
      return { clientId: decoded.cid, portalUserId: decoded.puid || null };
    } catch {
      return null;
    }
  }

  /**
   * Quem chama a rota do portal:
   * - equipe (JWT válido em Authorization: Bearer) → { kind: 'team', user, clientId: null }
   * - cliente logado no portal (x-portal-token)     → { kind: 'client', clientId, portalUserId }
   * - ninguém                                         → null
   * A equipe vem primeiro: quem é da equipe e também tem um token de cliente no
   * navegador continua navegando pelo client_id da tela, e não pelo do token.
   */
  async function resolveCaller(req, verifyTeam) {
    const auth = String(req?.headers?.authorization || '');
    if (auth.startsWith('Bearer ') && typeof verifyTeam === 'function') {
      try {
        const { user } = await verifyTeam(req);
        if (user) return { kind: 'team', user, clientId: null };
      } catch { /* JWT da equipe inválido ou expirado: tenta o token do portal */ }
    }
    const session = read(req?.headers?.['x-portal-token']);
    if (session) return { kind: 'client', ...session };
    return null;
  }

  return { sign, read, resolveCaller };
}

/** client_id usado pela ação: o do token para o cliente (o do corpo é ignorado); o do corpo para a equipe. */
export function effectiveClientId(caller, bodyClientId) {
  if (caller?.kind === 'client') return caller.clientId;
  return bodyClientId;
}

/**
 * client_id para filtrar ações por id de item (conteúdo, comentário, arte, panfleto...).
 * Cliente: sempre o do token. Equipe: o do corpo, se vier; sem ele, null (sem filtro).
 */
export function itemScopeClientId(caller, bodyClientId) {
  if (caller?.kind === 'client') return caller.clientId;
  return isUuid(bodyClientId) ? bodyClientId : null;
}
