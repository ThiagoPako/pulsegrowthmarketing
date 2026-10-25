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

  /**
   * Oferta de remarcação feita no cancelamento (backup do videomaker do cliente ou
   * horários de videomakers alternativos). O accept_backup só aceita uma opção desta
   * oferta: data, hora e videomaker não vêm mais livres do corpo.
   * options: [{ vm, date, times: ['09:00', ...], main? }] (main = backup do videomaker do cliente)
   */
  function signBackupOffer({ clientId, recordingId, options, expiresIn: offerExpiresIn = '2h' }) {
    return jwt.sign({ typ: 'backup_offer', cid: String(clientId), rid: String(recordingId || ''), opts: options || [] }, secret, { expiresIn: offerExpiresIn });
  }

  /** { recordingId, options, issuedAt } ou null se faltar, expirou, não é oferta ou é de outro cliente. */
  function readBackupOffer(rawToken, clientId) {
    if (!rawToken || typeof rawToken !== 'string') return null;
    try {
      const decoded = jwt.verify(rawToken, secret);
      if (!decoded || decoded.typ !== 'backup_offer' || decoded.sub || decoded.cid !== String(clientId)) return null;
      return { recordingId: decoded.rid || null, options: Array.isArray(decoded.opts) ? decoded.opts : [], issuedAt: decoded.iat || null };
    } catch {
      return null;
    }
  }

  return { sign, read, resolveCaller, signBackupOffer, readBackupOffer };
}

/**
 * Opção escolhida dentro da oferta. Sem videomaker escolhido vale só o backup do
 * videomaker do cliente (opção marcada com main). Devolve a opção ou null.
 */
export function pickBackupOption(offer, { videomakerId, date, time }) {
  if (!offer || !Array.isArray(offer.options)) return null;
  const candidates = videomakerId
    ? offer.options.filter(o => o && !o.main && o.vm === videomakerId)
    : offer.options.filter(o => o && o.main);
  return candidates.find(o => o.date === date && Array.isArray(o.times) && o.times.includes(time)) || null;
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
