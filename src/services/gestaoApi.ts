const VPS_API_BASE = 'https://agenciapulse.tech/api';
const TOKEN_KEY = 'pulse_jwt';

async function req(path: string, init: RequestInit = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${VPS_API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export interface GestaoSummary {
  month: string;
  kpis: {
    revenue_uruacu: number;
    expenses_uruacu: number;
    salaries_uruacu: number;
    transfer_to_minacu: number;
    net_margin_uruacu: number;
    active_contracts_uruacu: number;
  };
  unit_costs: Record<string, number>;
  transfer_breakdown: { content_type: string; qty: number; unit_cost: number; total: number }[];
  plans: {
    id: string; name: string; city: string; price: number;
    active_clients: number; revenue: number; production_cost: number;
    gross_margin_unit: number; margin_pct: number;
  }[];
  clients_uruacu: {
    id: string; name: string; plan_name: string | null; revenue: number;
    reels: number; stories: number; artes: number; roteiros: number;
    production_cost: number; margin: number;
  }[];
}

export const gestaoApi = {
  summary: (month: string) => req(`/gestao/summary?month=${encodeURIComponent(month)}`) as Promise<GestaoSummary>,
  getCosts: () => req('/gestao/unit-costs') as Promise<{ costs: { content_type: string; unit_cost: number }[] }>,
  saveCosts: (costs: { content_type: string; unit_cost: number }[]) =>
    req('/gestao/unit-costs', { method: 'PUT', body: JSON.stringify({ costs }) }),
  closeMonth: (month: string) =>
    req('/gestao/close-month', { method: 'POST', body: JSON.stringify({ month }) }),
  history: () => req('/gestao/history') as Promise<{ closings: any[] }>,
};
