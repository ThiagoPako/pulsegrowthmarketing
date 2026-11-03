// Pulse Direct (funis no direct estilo ManyChat, 02/11/2026): tipos compartilhados das telas.
export interface LinkButton { title: string; url: string }
export interface ReplyButton { title: string; next: string }
export interface FlowStep {
  id: string;
  text: string;
  image_url?: string | null;
  buttons: LinkButton[];
  replies: ReplyButton[];
  ask?: { field: 'nome' | 'telefone' | 'email' | 'texto'; next: string | null } | null;
  next?: string | null;
  tag?: string | null;
  handoff?: boolean;
}
export interface Flow {
  id?: string;
  client_id?: string;
  client_name?: string | null;
  name: string;
  active: boolean;
  trigger: { type: 'comment_keyword' | 'dm_keyword'; keywords: string[]; post_ids: string[]; followers_only?: boolean; follow_message?: string | null };
  public_reply: string | null;
  steps: FlowStep[];
  runs?: number;
  clicks?: Record<string, number>;
  updated_at?: string;
}
export interface Contact {
  id: string; client_id: string; platform: string; ext_id: string; username: string | null; tags: string[]; fields: Record<string, string>;
  flow_id: string | null; flow_name: string | null; step_id: string | null; awaiting: string | null; paused_until: string | null;
  last_in_at: string | null; last_message: string | null; unread: number; created_at: string;
}
export interface DmMessage {
  id: number; contact_id: string; direction: 'in' | 'out'; text: string | null; by_name: string | null; created_at: string;
  meta: { buttons?: LinkButton[]; replies?: string[]; quick_reply_payload?: string | null } | null;
}

export const FIELD_LABELS: Record<string, string> = { nome: 'Nome', telefone: 'Telefone/WhatsApp', email: 'E-mail', texto: 'Texto livre' };

export const FOLLOW_DEFAULT = 'Oi, {primeiro_nome}! 😊 Esse presente é só para quem segue a gente. Segue o perfil e me responde JÁ SIGO aqui que eu te mando na hora 💛';

export const newStepId = () => `s${Math.random().toString(36).slice(2, 8)}`;

/** Modelos prontos para começar um funil. */
export function flowTemplates(): { id: string; label: string; flow: Flow }[] {
  const a = newStepId();
  const b = newStepId();
  const c = newStepId();
  const d = newStepId();
  return [
    {
      id: 'link', label: 'Comentou, recebe o link',
      flow: {
        name: 'Comentou EU QUERO', active: true, trigger: { type: 'comment_keyword', keywords: ['EU QUERO', 'QUERO'], post_ids: [] },
        public_reply: 'Te mandei no direct! 💌',
        steps: [{ id: a, text: 'Oi, {primeiro_nome}! 😊 Aqui está o que você pediu. Toque no botão para ver:', buttons: [{ title: 'Ver agora', url: 'https://' }], replies: [] }],
      },
    },
    {
      id: 'whats', label: 'Captura de WhatsApp',
      flow: {
        name: 'Captura de WhatsApp', active: true, trigger: { type: 'comment_keyword', keywords: ['INFO', 'QUERO SABER'], post_ids: [] },
        public_reply: 'Te chamei no direct! 💛',
        steps: [
          { id: a, text: 'Oi, {primeiro_nome}! Que bom que você se interessou 😊 Quer que a nossa equipe te chame no WhatsApp?', buttons: [], replies: [{ title: 'Sim, quero!', next: b }, { title: 'Agora não', next: d }] },
          { id: b, text: 'Perfeito! Me manda seu WhatsApp com DDD 👇', buttons: [], replies: [], ask: { field: 'telefone', next: c }, tag: 'lead' },
          { id: c, text: 'Anotado! ✅ Em instantes alguém da equipe te chama. Obrigado, {primeiro_nome}!', buttons: [], replies: [], handoff: true },
          { id: d, text: 'Tudo bem! Se mudar de ideia, é só mandar uma mensagem aqui 😉', buttons: [], replies: [] },
        ],
      },
    },
    {
      id: 'menu', label: 'Menu de atendimento no direct',
      flow: {
        name: 'Menu de atendimento', active: true, trigger: { type: 'dm_keyword', keywords: ['OI', 'OLÁ', 'MENU', 'BOM DIA', 'BOA TARDE'], post_ids: [] },
        public_reply: null,
        steps: [
          { id: a, text: 'Olá! 👋 Como podemos te ajudar?', buttons: [], replies: [{ title: 'Ver produtos', next: b }, { title: 'Localização', next: c }, { title: 'Falar com alguém', next: d }] },
          { id: b, text: 'Confira nosso catálogo completo 👇', buttons: [{ title: 'Abrir catálogo', url: 'https://' }], replies: [] },
          { id: c, text: 'Estamos te esperando! 📍', buttons: [{ title: 'Abrir no mapa', url: 'https://maps.google.com' }], replies: [] },
          { id: d, text: 'Já chamei alguém da equipe, só um instante 😊', buttons: [], replies: [], handoff: true },
        ],
      },
    },
  ];
}
