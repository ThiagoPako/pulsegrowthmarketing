// ─── Proteção das contas dos clientes contra bloqueio (auditoria de 03/11/2026, pedido do usuário) ───────────────────
// "Corrija erros que possam levar contas de clientes a tomar bloqueio." O Instagram trata como spam: muitas mensagens
// automáticas em pouco tempo, a mesma resposta pública repetida em vários comentários, rajadas de respostas e mais de uma
// mensagem para a mesma pessoa pelo mesmo gatilho. Aqui ficam os tetos por conta (janela de 1 hora, em memória: um
// servidor só) e a variação da resposta pública.

export const LIMITS = {
  dm: 150, // mensagens automáticas no direct por hora (o Instagram corta perto de 200)
  public_reply: 40, // respostas públicas automáticas a comentários por hora
};
// espaço mínimo entre duas da mesma conta; no direct, não (as etapas encadeadas de um funil saem juntas, em resposta à pessoa)
const MIN_GAP_MS = { dm: 0, public_reply: 20_000 };

export function createLimiter({ now = () => Date.now() } = {}) {
  const hits = new Map(); // `${kind}:${account}` → instantes (ms)
  /** Reserva uma vaga; false = passou do teto da hora ou chegou cedo demais (não manda). */
  function take(kind, account) {
    const k = `${kind}:${account}`;
    const t = now();
    const list = (hits.get(k) || []).filter((x) => t - x < 3600_000);
    if (list.length >= (LIMITS[kind] ?? Infinity)) { hits.set(k, list); return false; }
    const last = list[list.length - 1];
    if (last !== undefined && t - last < (MIN_GAP_MS[kind] || 0)) { hits.set(k, list); return false; }
    list.push(t);
    hits.set(k, list);
    return true;
  }
  return { take };
}

/** Resposta pública variada: aceita várias versões separadas por "|" e chama a pessoa pelo @ (texto nunca igual). */
export function varyPublicReply(template, username, pick = Math.random) {
  const options = String(template || '').split('|').map((s) => s.trim()).filter(Boolean);
  if (!options.length) return '';
  const base = options[Math.floor(pick() * options.length) % options.length];
  const handle = String(username || '').replace(/^@/, '').trim();
  return handle && !base.includes(`@${handle}`) ? `@${handle} ${base}` : base;
}

export const sharedLimiter = createLimiter();
