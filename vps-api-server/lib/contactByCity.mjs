// ─── Contato para dúvidas por cidade (pedido do usuário, 01/11/2026) ───────────────────────────────────────────
// Rodapé das mensagens automáticas ao cliente: Uruaçu → Thiago (62) 98538-2981; Minaçu → Victor (telefone do
// cadastro dele no Assistente PULSE). Editável por cidade em payment_config.contact_name / contact_phone.
// Mesma regra do privado do PULSE (sessão "Marcely no WhatsApp"): use contactForCity daqui.

import { normalizeCityValue } from './cityResolution.mjs';

export const DEFAULT_CONTACTS = {
  uruacu: { name: 'Thiago', phone: '5562985382981' },
  minacu: { name: 'Victor', phone: null }, // telefone vem do Assistente PULSE (assistant_numbers)
};

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** "5562985382981" → "(62) 98538-2981"; o que não for número brasileiro volta como veio. */
export function formatPhoneBr(value) {
  const d = String(value || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(value || '').trim() || null;
}

/**
 * Contato da cidade: o da configuração da cidade, senão o padrão; sem telefone, busca o nome no Assistente PULSE.
 * @param city              cidade do cliente
 * @param config            linha de payment_config da cidade (contact_name, contact_phone)
 * @param assistantNumbers  [{ name, phone, active }] do Assistente PULSE
 */
export function contactForCity(city, config = null, assistantNumbers = []) {
  const key = normalizeCityValue(city) || 'minacu';
  const base = DEFAULT_CONTACTS[key] || DEFAULT_CONTACTS.minacu;
  const name = String(config?.contact_name || '').trim() || base.name;
  let phone = String(config?.contact_phone || '').trim() || (name === base.name ? base.phone : null);
  if (!phone) {
    const hit = assistantNumbers.find((n) => n.active !== false && semAcento(n.name).split(/\s+/)[0] === semAcento(name).split(/\s+/)[0]);
    phone = hit?.phone || null;
  }
  return { city: key, name, phone: formatPhoneBr(phone) };
}
