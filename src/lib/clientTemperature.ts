import { vpsAuthedFetch } from '@/lib/vpsDb';

/** Temperatura do cliente (0–100). Faixas iguais às do servidor (vps-api-server/assistant/temperatureScore.mjs). */
export type TemperatureBand = 'satisfeito' | 'atencao' | 'insatisfeito';

export const TEMPERATURE_BANDS: Record<TemperatureBand, { label: string; min: number }> = {
  satisfeito: { label: 'Satisfeito', min: 70 },
  atencao: { label: 'Atenção', min: 40 },
  insatisfeito: { label: 'Insatisfeito', min: 0 },
};

/** Ordem do mais frio para o mais quente (filtros e listas). */
export const TEMPERATURE_BAND_ORDER: TemperatureBand[] = ['insatisfeito', 'atencao', 'satisfeito'];

/** Quem vê a temperatura (o servidor confere o mesmo conjunto). */
export const TEMPERATURE_ROLES = ['admin', 'social_media', 'gestor_projetos', 'socio_gestor'] as const;

export function temperatureBand(score: number | null | undefined): TemperatureBand | null {
  if (score === null || score === undefined || !Number.isFinite(Number(score))) return null;
  const n = Number(score);
  if (n >= TEMPERATURE_BANDS.satisfeito.min) return 'satisfeito';
  if (n >= TEMPERATURE_BANDS.atencao.min) return 'atencao';
  return 'insatisfeito';
}

export function canSeeTemperature(roles: readonly string[] | null | undefined): boolean {
  return (roles || []).some((role) => (TEMPERATURE_ROLES as readonly string[]).includes(role));
}

export const SIGNAL_LABELS: Record<string, string> = {
  atraso: 'atraso',
  qualidade: 'qualidade',
  preco: 'preço',
  atendimento: 'atendimento',
  sumico: 'sumiço',
  ameaca_cancelar: 'ameaça de cancelar',
};

export const ALERT_LABELS: Record<string, string> = {
  faixa_vermelha: 'Insatisfeito',
  queda: 'Queda forte na semana',
  ameaca_cancelar: 'Ameaça de cancelar',
  insatisfacao_grupo: 'Insatisfação no grupo',
};

export interface ClientTemperatureItem {
  client_id: string;
  company_name: string;
  logo_url: string | null;
  color: string | null;
  tem_grupo: boolean;
  nota: number | null;
  faixa: TemperatureBand | null;
  variacao: number | null;
  motivo: string | null;
  analisado_em: string | null;
  dia: string | null;
  nota_dados: number | null;
  nota_conversa: number | null;
  serie: number[];
}

export interface TemperatureReason {
  chave: string;
  texto: string;
  pontos: number;
}

/** Sinais de dados gravados com a nota (cada um pode faltar: null = sem dado). */
export interface TemperatureSignals {
  atrasos?: { atual: number; anterior: number } | null;
  ajustes?: { atual: number; anterior: number; entregas: number; entregasAnterior: number } | null;
  devolvidos?: { atual: number; anterior: number } | null;
  aprovacao?: { horas: number | null; anterior: number | null; aprovados: number; esperando: number } | null;
  gravacoes?: { atual: number; anterior: number; canceladas: number; remarcadas: number } | null;
  entregas?: {
    referencia: 'mes' | 'mes_anterior';
    contratado: number;
    previsto: number;
    feitas: number;
    mesAnterior?: number;
    mesAtual?: number;
  } | null;
  inadimplencia?: { parcelas: number; maxDias: number; total?: number } | null;
  portal?: { diasComAcesso: number; diasAnterior: number; videosVistos: number | null; videosAnterior: number | null } | null;
  respostaEquipe?: { conversas: number; medianaHoras: number | null } | null;
  silencio?: { observado: boolean; dias: number; mensagensCliente: number } | null;
}

export interface TemperatureReading {
  id: string;
  fonte: string;
  mensagens: number;
  nota: number;
  sinais: string[];
  trechos: string[];
  resumo: string | null;
  created_at: string;
}

export interface ClientTemperatureDetail {
  client: { id: string; company_name: string; logo_url: string | null; color: string | null; cidade: string; tem_grupo: boolean };
  atual: {
    dia: string;
    nota: number;
    faixa: TemperatureBand;
    nota_dados: number;
    nota_conversa: number | null;
    variacao: number | null;
    motivos: TemperatureReason[];
    trechos: string[];
    sinais: TemperatureSignals;
    resumo: string | null;
    fonte: string;
    analisado_em: string;
  } | null;
  historico: { dia: string; nota: number; nota_dados: number; nota_conversa: number | null }[];
  conversas: TemperatureReading[];
  alertas: { id: string; motivo: string; nota: number | null; notificado: boolean; whatsapp: number; created_at: string }[];
  /** "Atualizar agora" ainda terminando no servidor. */
  pendente?: boolean;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await vpsAuthedFetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Falha ao carregar a temperatura');
  return body as T;
}

export const fetchClientTemperatures = () =>
  request<{ cidade: string; clientes: ClientTemperatureItem[] }>('/api/client-temperature');

export const fetchClientTemperature = (clientId: string) =>
  request<ClientTemperatureDetail>(`/api/client-temperature/${encodeURIComponent(clientId)}`);

export const refreshClientTemperature = (clientId: string) =>
  request<ClientTemperatureDetail>(`/api/client-temperature/${encodeURIComponent(clientId)}/refresh`, { method: 'POST' });
