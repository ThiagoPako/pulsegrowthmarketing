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

/**
 * Para o privado do PULSE (PR da "Marcely no WhatsApp"): lê a configuração da cidade e o Assistente PULSE no banco.
 * city 'uruacu' | 'minacu' | null. Devolve { nome, telefone } com o telefone só em dígitos e com o 55, ou null quando
 * não há contato com telefone. Cidade sem contato (ou null) usa o de Uruaçu (Thiago) com fallback: true.
 */
export async function contactInfo(pool, city) {
  const [{ rows: configs }, { rows: numbers }] = await Promise.all([
    pool.query('SELECT * FROM payment_config').catch(() => ({ rows: [] })),
    pool.query('SELECT name, phone, active FROM assistant_numbers').catch(() => ({ rows: [] })),
  ]);
  const configFor = (c) => configs.find((r) => (normalizeCityValue(r.city) || 'minacu') === c) || null;
  const digits = (v) => {
    const d = String(v || '').replace(/\D/g, '');
    if (!d) return null;
    return d.length === 10 || d.length === 11 ? `55${d}` : d;
  };
  const key = normalizeCityValue(city);
  if (key && DEFAULT_CONTACTS[key]) {
    const c = contactForCity(key, configFor(key), numbers);
    const raw = String(configFor(key)?.contact_phone || '').trim()
      || (c.name === DEFAULT_CONTACTS[key].name ? DEFAULT_CONTACTS[key].phone : null)
      || numbers.find((n) => n.active !== false && String(n.name || '').trim().toLowerCase().split(/\s+/)[0] === c.name.toLowerCase().split(/\s+/)[0])?.phone;
    if (digits(raw)) return { nome: c.name, telefone: digits(raw), fallback: false };
  }
  const u = contactForCity('uruacu', configFor('uruacu'), numbers);
  const rawU = String(configFor('uruacu')?.contact_phone || '').trim() || DEFAULT_CONTACTS.uruacu.phone;
  return digits(rawU) ? { nome: u.name, telefone: digits(rawU), fallback: true } : null;
}
