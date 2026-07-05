export type CampaignType = 'institucional' | 'promocional' | 'sazonal' | 'lancamento' | 'responsabilidade_social' | 'evento';
export type SlotKind = 'editorial' | 'video' | 'creative';
export type SlotStatus = 'pendente' | 'roteiro_pronto' | 'gravado' | 'editado' | 'postado';
export type CampaignStatus = 'rascunho' | 'ativa' | 'concluida' | 'arquivada';

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  institucional: 'Institucional',
  promocional: 'Promocional',
  sazonal: 'Sazonal',
  lancamento: 'Lançamento de Produto',
  responsabilidade_social: 'Responsabilidade Social',
  evento: 'Evento (captura de leads)',
};

export const CAMPAIGN_TYPE_DESCRIPTIONS: Record<CampaignType, string> = {
  institucional: 'Fortalece marca e autoridade, vende no médio prazo.',
  promocional: 'Oferta com urgência — venda de curto prazo.',
  sazonal: 'Aproveita datas comemorativas ou momentos do ano.',
  lancamento: 'Gera expectativa e demanda antes da abertura.',
  responsabilidade_social: 'Conecta a marca a uma causa real.',
  evento: 'Corrida, palestra, competição ou workshop para captar WhatsApp e e-mail e alimentar o funil.',
};

export const SLOT_STATUS_LABELS: Record<SlotStatus, string> = {
  pendente: 'Pendente',
  roteiro_pronto: 'Roteiro pronto',
  gravado: 'Gravado',
  editado: 'Editado',
  postado: 'Postado',
};

/** Distribui N postagens uniformemente entre start e end (inclusive). Datas em YYYY-MM-DD. */
export function distributeDates(start: string, end: string, count: number): string[] {
  if (count <= 0) return [];
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const totalDays = Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000));
  const step = count === 1 ? 0 : totalDays / (count - 1);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(s.getTime() + Math.round(step * i) * 86400000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function recordingDeadline(postDate: string | null | undefined): string | null {
  if (!postDate) return null;
  const d = new Date(postDate + 'T00:00:00');
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

export function isSlotDelayed(postDate: string | null | undefined, status: SlotStatus): boolean {
  if (!postDate) return false;
  if (status === 'gravado' || status === 'editado' || status === 'postado') return false;
  const deadline = recordingDeadline(postDate);
  if (!deadline) return false;
  const today = new Date().toISOString().slice(0, 10);
  return today > deadline;
}

export function formatBrDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
