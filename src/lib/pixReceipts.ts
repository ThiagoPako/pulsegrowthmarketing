import { vpsAuthedFetch } from '@/lib/vpsDb';
import type { PaymentCity } from '@/lib/paymentAccounts';

/**
 * Pix pela chave (vps-api-server/pixReceiptRoutes.mjs): comprovantes que os clientes mandaram na página /pagar, com a
 * conferência da IA, e a baixa pelo extrato do banco (.ofx) ou pelo toque da gestão.
 */
export interface ReceiptCheck { id: string; ok: boolean; label: string; detail: string }

export interface PixReceipt {
  id: string;
  client_name: string | null;
  month: string | null;
  city: PaymentCity | null;
  amount: string | number;
  mime: string;
  ai: { valor: number | null; pagador_nome: string | null; instituicao: string | null; data_hora: string | null } | null;
  checks: ReceiptCheck[] | null;
  verdict: 'conferido' | 'conferir' | 'recusado';
  e2e_id: string | null;
  paid_at: string | null;
  status: 'aguardando' | 'confirmado' | 'recusado';
  confirmed_by: string | null;
  confirmed_at: string | null;
  reason: string | null;
  created_at: string;
  revenue_status: string | null;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await vpsAuthedFetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Não deu certo. Tente de novo.');
  return body as T;
}

export const fetchPixReceipts = (all = false) => call<{ receipts: PixReceipt[] }>(`/pix-receipts${all ? '?status=todos' : ''}`);

export const confirmPixReceipt = (id: string) => call<{ success: boolean; marked: boolean }>(`/pix-receipts/${id}/confirmar`, { method: 'POST', body: '{}' });

export const rejectPixReceipt = (id: string, motivo: string) =>
  call<{ success: boolean }>(`/pix-receipts/${id}/recusar`, { method: 'POST', body: JSON.stringify({ motivo }) });

/** Abre o comprovante numa aba nova (o arquivo só sai com o login do admin). */
export async function openPixReceiptFile(id: string) {
  const tab = window.open('', '_blank');
  const response = await vpsAuthedFetch(`/pix-receipts/${id}/arquivo`);
  if (!response.ok) { tab?.close(); throw new Error('Não deu para abrir o comprovante'); }
  const url = URL.createObjectURL(await response.blob());
  if (tab) tab.location.href = url;
  else window.location.href = url;
}

export interface StatementResult { creditos: number; novos: number; confirmados: number; baixadas: number; aguardando: number }

/** Envia o extrato .ofx da cidade: os créditos que batem com comprovantes conferidos dão baixa sozinhos. */
export async function importStatement(city: PaymentCity, file: File): Promise<StatementResult> {
  // OFX dos bancos brasileiros costuma vir em windows-1252
  const ofx = new TextDecoder('windows-1252').decode(await file.arrayBuffer());
  return call<StatementResult>('/pix-receipts/extrato', { method: 'POST', body: JSON.stringify({ city, ofx }) });
}
