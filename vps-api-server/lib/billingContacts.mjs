// ─── Para quem vão a cobrança e o recibo (pedido do usuário, 02/11/2026) ──────────────────────────────────────────
// "Adicione no sistema um lugar para cadastrar o número da pessoa que vai receber os recibos e dê a opção de marcar o
// mesmo do dono… tem empresas que têm financeiro, então as cobranças são enviadas para o financeiro, não para o dono;
// precisa adaptar o sistema para isso, evitando enviar cobrança para lugar errado."
// No cadastro do cliente: quem recebe as cobranças e quem recebe os recibos, cada um com "o mesmo do responsável"
// (padrão, igual a antes) ou um número próprio. Número próprio vazio = não envia (a cobrança vai para "conferir");
// nunca cai no número do dono por engano. O relatório do dia 1 continua indo ao responsável.

const digits = (v) => String(v || '').replace(/\D/g, '');

/** WhatsApp válido para envio: 12 ou 13 dígitos começando por 55 (55 + DDD + número). */
export const validWhatsapp = (v) => /^55\d{10,11}$/.test(digits(v));

/**
 * Destino de uma mensagem do financeiro. kind: 'relatorio' (dia 1, sempre o responsável), 'cobranca' (D−5, dia D,
 * D+3) ou 'recibo' (obrigado + recibo).
 * Devolve { to, name, own } ou { to: null, problem } quando o número próprio está faltando ou errado.
 */
export function billingTarget(client, kind) {
  // o relatório do dia 1 é do dono (resultado do mês); cobrança e recibo seguem o cadastro
  const same = kind === 'relatorio' ? true : kind === 'recibo' ? client?.receipt_same_as_owner : client?.billing_same_as_owner;
  const own = kind === 'recibo' ? client?.receipt_whatsapp : client?.billing_whatsapp;
  const name = kind === 'recibo' ? client?.receipt_contact_name : client?.billing_contact_name;
  const label = kind === 'recibo' ? 'recibos' : 'cobranças';
  if (same !== false) {
    return validWhatsapp(client?.whatsapp)
      ? { to: digits(client.whatsapp), name: client?.responsible_person || null, own: false }
      : { to: null, problem: 'o cliente está sem WhatsApp válido no cadastro' };
  }
  return validWhatsapp(own)
    ? { to: digits(own), name: name || null, own: true }
    : { to: null, problem: `o número de quem recebe as ${label} está vazio ou errado no cadastro do cliente` };
}
