// ─── Avisos de dinheiro para a equipe no WhatsApp (pedido do usuário, 02/11/2026) ─────────────────────────────────
// "Avise Thiago e Victor pelo WhatsApp de clientes que pagaram em Minaçu, e clientes que aderiram ao Pix Automático
// também; em Uruaçu avisar apenas o Thiago dos pagamentos de clientes. Avisar o Thiago e o Victor de movimentações da
// conta de Minaçu; de Uruaçu, apenas o Thiago." Vai aos números do Assistente com a permissão "avisos_pagamentos" e a
// cidade em assistant_numbers.cities (vazio = as duas): Thiago tem as duas, Victor só Minaçu.

import { sendToNumber } from '../assistant/common.mjs';
import { normalizeCityValue } from './cityResolution.mjs';

export const CITY_NAME = { uruacu: 'Uruaçu', minacu: 'Minaçu' };
export const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Quem recebe o aviso da cidade: permissão avisos_pagamentos e a cidade na lista do número. */
export function recipientsFor(numbers, city) {
  return numbers.filter((n) => n.active !== false && (n.permissions || []).includes('avisos_pagamentos')
    && (!(n.cities || []).length || (n.cities || []).includes(city)));
}

/** Manda o texto aos números da cidade; devolve quantos receberam. Erro em um não trava os outros. */
export async function alertTeam(pool, city, text, { logger = console } = {}) {
  if (!city || !text) return 0;
  const { rows } = await pool.query(`SELECT * FROM assistant_numbers WHERE active AND 'avisos_pagamentos' = ANY(permissions)`)
    .catch(() => ({ rows: [] }));
  let sent = 0;
  for (const number of recipientsFor(rows, city)) {
    try {
      await sendToNumber(pool, number, text);
      sent += 1;
    } catch (error) {
      logger.error('[avisos] WhatsApp:', number.name, error.message);
    }
  }
  return sent;
}

/** Como a mensalidade foi paga (para o aviso): Pix Automático, cartão, Pix da Efí, Pix pela chave ou baixa manual. */
async function methodOf(pool, revenueId) {
  const has = async (sql) => (await pool.query(sql, [revenueId]).catch(() => ({ rows: [] }))).rows.length > 0;
  if (await has(`SELECT 1 FROM pix_auto_cobr WHERE revenue_id = $1 AND status = 'paga'`)) return 'Pix Automático';
  if (await has(`SELECT 1 FROM efi_card_links WHERE revenue_id = $1 AND paid_at IS NOT NULL`)) return 'cartão (Efí)';
  if (await has(`SELECT 1 FROM efi_charges WHERE revenue_id = $1 AND status = 'CONCLUIDA'`)) return 'Pix (Efí)';
  if (await has(`SELECT 1 FROM efi_pix_received WHERE revenue_id = $1 AND status = 'conciliado'`)) return 'Pix pela chave';
  if (await has(`SELECT 1 FROM pix_receipts WHERE revenue_id = $1 AND status = 'confirmado'`)) return 'Pix (comprovante)';
  return 'baixa no sistema';
}

/** Receita baixada → aviso "pagou" à equipe da cidade do cliente. */
export async function alertRevenuePaid(pool, revenueId, { logger = console } = {}) {
  const { rows: [r] } = await pool.query(
    `SELECT r.amount, r.reference_month, r.city, c.company_name, c.city AS client_city
       FROM revenues r LEFT JOIN clients c ON c.id = r.client_id WHERE r.id = $1`, [revenueId]
  ).catch(() => ({ rows: [] }));
  if (!r) return 0;
  const city = normalizeCityValue(r.city || r.client_city) || 'minacu';
  const ref = r.reference_month ? String(r.reference_month instanceof Date ? r.reference_month.toISOString() : r.reference_month).slice(0, 7) : '';
  const text = [
    `💰 Pagamento recebido · ${CITY_NAME[city]}`,
    `${String(r.company_name || 'Cliente').trim()} · ${brl(r.amount)}${ref ? ` · mensalidade ${ref.slice(5, 7)}/${ref.slice(0, 4)}` : ''}`,
    `Forma: ${await methodOf(pool, revenueId)}`,
  ].join('\n');
  return alertTeam(pool, city, text, { logger });
}
