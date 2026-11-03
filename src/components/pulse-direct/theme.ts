// Pulse Direct: cores por área (usuário, 02/11/2026: "mais cores… divisão das categorias organizada") e o botão de
// WhatsApp que vira link sozinho ("quero colocar o número do cliente e o sistema que transforme em link").
import { Inbox, LayoutDashboard, MapPin, Users, Workflow, Zap } from 'lucide-react';

export type Area = 'inicio' | 'funis' | 'inbox' | 'contatos' | 'rapidas' | 'google';

export const AREAS: { id: Area; label: string; hint: string; color: string; soft: string; Icon: typeof Zap }[] = [
  { id: 'inicio', label: 'Visão geral', hint: 'Como está o direct do cliente', color: '#F15A24', soft: 'rgba(241,90,36,0.12)', Icon: LayoutDashboard },
  { id: 'funis', label: 'Funis', hint: 'Conversas automáticas com botões', color: '#7C5CFF', soft: 'rgba(124,92,255,0.12)', Icon: Workflow },
  { id: 'inbox', label: 'Caixa de entrada', hint: 'Responder quem escreveu', color: '#3797F0', soft: 'rgba(55,151,240,0.12)', Icon: Inbox },
  { id: 'contatos', label: 'Contatos', hint: 'Quem passou pelos funis', color: '#10B981', soft: 'rgba(16,185,129,0.12)', Icon: Users },
  { id: 'rapidas', label: 'Automações rápidas', hint: 'Palavra no comentário, direct na hora', color: '#F59E0B', soft: 'rgba(245,158,11,0.14)', Icon: Zap },
  { id: 'google', label: 'Google e avaliações', hint: 'Ficha do Google e respostas', color: '#F43F5E', soft: 'rgba(244,63,94,0.12)', Icon: MapPin },
];
export const areaOf = (id: Area) => AREAS.find((a) => a.id === id) || AREAS[0];

/** Número do WhatsApp em qualquer formato → link wa.me (com 55 quando falta) e a mensagem opcional. */
export function whatsappLink(number: string, message = ''): string | null {
  let digits = String(number || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.length < 12 || digits.length > 13) return null;
  return `https://wa.me/${digits}${message.trim() ? `?text=${encodeURIComponent(message.trim())}` : ''}`;
}

/** O contrário: lê um link wa.me para mostrar número e mensagem no editor. */
export function parseWhatsapp(url: string): { number: string; message: string } | null {
  const m = String(url || '').match(/^https?:\/\/(?:wa\.me|api\.whatsapp\.com\/send)\/?(\d*)(?:\?(.*))?$/i);
  if (!m) return null;
  const params = new URLSearchParams(m[2] || '');
  const digits = m[1] || params.get('phone') || '';
  return { number: formatPhone(digits), message: params.get('text') || '' };
}

/** 5562999990000 → (62) 99999-0000 */
export function formatPhone(digits: string): string {
  const d = String(digits || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}
