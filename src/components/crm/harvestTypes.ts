export type ConfidenceLevel = 'confirmado' | 'alta' | 'media' | 'baixa' | 'nao_confirmado';

export interface DataOrigin {
  valor: string;
  fontes: string[];
  coletado_em: string;
  confianca: ConfidenceLevel;
}

export interface HistoryEntry {
  evento: string;
  em: string;
}

export interface Company {
  id: string;
  razao_social: string;
  razao_social_oficial?: string;
  contato: string;
  email: string;
  emails_extras?: string[];
  telefone: string;
  telefones?: string[];
  whatsapp?: string;
  whatsapp_status?: 'confirmado' | 'provavel';
  atuacao: string;
  categoria?: string;
  endereco: string;
  bairro?: string;
  cep?: string;
  cidade: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  horario?: string;
  maps_url?: string;
  score?: number;
  completude?: number;
  classificacao?: 'quente' | 'bom' | 'moderado' | 'fraco';
  confianca?: ConfidenceLevel;
  potencial_mensal?: number;
  tem_contato?: boolean;
  tem_decisor?: boolean;
  pronto_para_contato?: boolean;
  cnpj?: string;
  decisor?: string;
  decisor_cargo?: string;
  socios?: string[];
  porte?: string;
  capital_social?: number | null;
  fontes?: string[];
  origem?: Record<string, DataOrigin>;
  historico?: HistoryEntry[];
  enriquecido_em?: string;
  cache?: boolean;
}

export interface HarvestStats {
  total: number;
  com_telefone: number;
  com_whatsapp: number;
  com_instagram: number;
  com_email: number;
  com_decisor: number;
  com_site: number;
  prontos: number;
  enriquecidos: number;
  completude_media: number;
  score_medio: number;
  taxa_enriquecimento: number;
}

export interface HarvestResult {
  data: Company[];
  total: number;
  com_contato: number;
  potencial_total: number;
  page: number;
  total_pages: number;
  stats?: HarvestStats;
  mode?: string;
}

export const brl = (v?: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  confirmado: 'Confirmado',
  alta: 'Alta confiança',
  media: 'Média confiança',
  baixa: 'Baixa confiança',
  nao_confirmado: 'Não confirmado',
};

export const CLASS_LABEL: Record<string, string> = {
  quente: 'Lead Quente',
  bom: 'Lead Bom',
  moderado: 'Lead Moderado',
  fraco: 'Lead Fraco',
};

export const classTone = (c?: string) => {
  if (c === 'quente') return 'bg-primary/15 text-primary';
  if (c === 'bom') return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
  if (c === 'moderado') return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
  return 'bg-muted text-muted-foreground';
};

const EXPORT_FIELDS: Array<[string, (c: Company) => string]> = [
  ['CNPJ', c => c.cnpj || ''],
  ['Razao Social', c => c.razao_social || ''],
  ['Nome Oficial', c => c.razao_social_oficial || ''],
  ['Segmento', c => c.categoria || c.atuacao || ''],
  ['Cidade', c => c.cidade || ''],
  ['Endereco', c => c.endereco || ''],
  ['CEP', c => c.cep || ''],
  ['Telefone', c => c.telefone || ''],
  ['Telefones', c => (c.telefones || []).join(' | ')],
  ['WhatsApp', c => c.whatsapp || ''],
  ['WhatsApp Status', c => c.whatsapp_status || 'nao identificado'],
  ['Email', c => c.email || ''],
  ['Site', c => c.website || ''],
  ['Instagram', c => c.instagram || ''],
  ['Facebook', c => c.facebook || ''],
  ['Responsavel', c => c.decisor || ''],
  ['Cargo', c => c.decisor_cargo || ''],
  ['Score', c => String(c.score ?? '')],
  ['Completude', c => String(c.completude ?? '')],
  ['Confianca', c => c.confianca || ''],
  ['Fontes', c => (c.fontes || []).join(', ')],
  ['Coletado em', c => c.enriquecido_em || ''],
];

export function exportCompanies(companies: Company[], format: 'csv' | 'json') {
  let blob: Blob;
  if (format === 'json') {
    blob = new Blob([JSON.stringify(companies, null, 2)], { type: 'application/json' });
  } else {
    const header = EXPORT_FIELDS.map(([label]) => label).join(';');
    const rows = companies.map(c =>
      EXPORT_FIELDS.map(([, fn]) => `"${String(fn(c)).replace(/"/g, '""')}"`).join(';')
    );
    blob = new Blob([`\uFEFF${[header, ...rows].join('\n')}`], { type: 'text/csv;charset=utf-8' });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `colheita-leads-${new Date().toISOString().slice(0, 10)}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}
