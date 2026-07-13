import { useEffect, useMemo, useState } from 'react';
import { gestaoApi, GestaoSummary } from '@/services/gestaoApi';
import GestaoLayout from '@/components/gestao/GestaoLayout';
import { TrendingUp, TrendingDown, ArrowRightLeft, Users, DollarSign, Wallet, Loader2, Lock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const BRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
const PCT = (n: number) => `${n.toFixed(1)}%`;

function currentMonth() { return new Date().toISOString().slice(0, 7); }

export default function GestaoDashboard() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<GestaoSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setData(await gestaoApi.summary(month)); }
    catch (e: any) { toast.error(e.message || 'Erro ao carregar'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [month]);

  const closeMonth = async () => {
    if (!confirm(`Fechar o mês ${month}? Um snapshot será salvo no histórico.`)) return;
    setClosing(true);
    try {
      const r = await gestaoApi.closeMonth(month);
      toast.success(`Mês fechado. Repasse: ${BRL(r.transferOut)}`);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setClosing(false); }
  };

  const uruacuPlans = useMemo(() => data?.plans.filter(p => p.city === 'uruacu') || [], [data]);
  const minacuPlans = useMemo(() => data?.plans.filter(p => p.city === 'minacu') || [], [data]);

  return (
    <GestaoLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="text-[11px] tracking-[0.2em] uppercase text-amber-400/80 mb-1">Painel Executivo</div>
          <h1 className="text-3xl font-bold">Gestão de Ativos</h1>
          <p className="text-sm text-slate-400 mt-1">Custos, margens e repasses inter-cidades</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="h-10 px-3 rounded-lg bg-[#12161c] border border-white/10 text-sm"
          />
          <button onClick={load} className="h-10 w-10 rounded-lg bg-[#12161c] border border-white/10 flex items-center justify-center hover:border-amber-500/40">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={closeMonth} disabled={closing || loading}
            className="h-10 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm flex items-center gap-2 disabled:opacity-60"
          >
            {closing ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
            Fechar Mês
          </button>
        </div>
      </div>

      {loading || !data ? (
        <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="animate-spin" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
            <KpiCard label="Receita Uruaçu" value={BRL(data.kpis.revenue_uruacu)} icon={DollarSign} tone="emerald" />
            <KpiCard label="Salários Uruaçu" value={BRL(data.kpis.salaries_uruacu)} icon={Wallet} tone="slate" />
            <KpiCard label="Despesas Uruaçu" value={BRL(data.kpis.expenses_uruacu)} icon={TrendingDown} tone="rose" />
            <KpiCard label="Repasse → Minaçu" value={BRL(data.kpis.transfer_to_minacu)} icon={ArrowRightLeft} tone="amber" />
            <KpiCard label="Margem Líquida" value={BRL(data.kpis.net_margin_uruacu)} icon={TrendingUp} tone={data.kpis.net_margin_uruacu >= 0 ? 'emerald' : 'rose'} />
            <KpiCard label="Contratos Ativos" value={String(data.kpis.active_contracts_uruacu)} icon={Users} tone="slate" />
          </div>

          {/* Repasse detalhado */}
          <Section title="Repasse Uruaçu → Minaçu" subtitle="Produção realizada por Minaçu para clientes de Uruaçu">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {data.transfer_breakdown.map(r => (
                <div key={r.content_type} className="bg-[#12161c] border border-white/5 rounded-xl p-4">
                  <div className="text-[10px] tracking-widest uppercase text-slate-400">{r.content_type}</div>
                  <div className="text-2xl font-bold mt-1">{r.qty}</div>
                  <div className="text-[11px] text-slate-500">× {BRL(r.unit_cost)}</div>
                  <div className="text-sm text-amber-300 font-semibold mt-2">{BRL(r.total)}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* Planos */}
          <Section title="Margem por Plano" subtitle="Custo de produção vs. preço praticado">
            <div className="grid md:grid-cols-2 gap-4">
              <PlansTable title="Uruaçu" plans={uruacuPlans} />
              <PlansTable title="Minaçu" plans={minacuPlans} />
            </div>
          </Section>

          {/* Clientes Uruaçu */}
          <Section title="Clientes Uruaçu — Consumo no Mês">
            <div className="bg-[#12161c] border border-white/5 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-black/40 text-[10px] uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="text-left p-3">Cliente</th>
                    <th className="text-left p-3">Plano</th>
                    <th className="text-right p-3">Reels</th>
                    <th className="text-right p-3">Stories</th>
                    <th className="text-right p-3">Artes</th>
                    <th className="text-right p-3">Roteiros</th>
                    <th className="text-right p-3">Custo Prod.</th>
                    <th className="text-right p-3">Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clients_uruacu.map(c => (
                    <tr key={c.id} className="border-t border-white/5">
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3 text-slate-400">{c.plan_name || '—'}</td>
                      <td className="p-3 text-right">{c.reels}</td>
                      <td className="p-3 text-right">{c.stories}</td>
                      <td className="p-3 text-right">{c.artes}</td>
                      <td className="p-3 text-right">{c.roteiros}</td>
                      <td className="p-3 text-right text-slate-300">{BRL(c.production_cost)}</td>
                      <td className={`p-3 text-right font-semibold ${c.margin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{BRL(c.margin)}</td>
                    </tr>
                  ))}
                  {data.clients_uruacu.length === 0 && (
                    <tr><td colSpan={8} className="p-6 text-center text-slate-500">Nenhum cliente ativo em Uruaçu</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </GestaoLayout>
  );
}

function KpiCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone: 'emerald'|'rose'|'amber'|'slate' }) {
  const tones: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    slate: 'text-slate-300 bg-white/5 border-white/10',
  };
  return (
    <div className={`rounded-xl p-4 border ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] tracking-widest uppercase opacity-80">{label}</span>
        <Icon size={14} />
      </div>
      <div className="text-xl font-bold mt-2">{value}</div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function PlansTable({ title, plans }: { title: string; plans: GestaoSummary['plans'] }) {
  return (
    <div className="bg-[#12161c] border border-white/5 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-slate-400">{title}</span>
        <span className="text-[10px] text-slate-500">{plans.length} planos</span>
      </div>
      <table className="w-full text-sm">
        <thead className="text-[10px] uppercase text-slate-500">
          <tr><th className="text-left p-2 pl-4">Plano</th><th className="text-right p-2">Preço</th><th className="text-right p-2">Ativos</th><th className="text-right p-2 pr-4">Margem</th></tr>
        </thead>
        <tbody>
          {plans.map(p => (
            <tr key={p.id} className="border-t border-white/5">
              <td className="p-2 pl-4 font-medium">{p.name}</td>
              <td className="p-2 text-right">{BRL(p.price)}</td>
              <td className="p-2 text-right">{p.active_clients}</td>
              <td className={`p-2 pr-4 text-right font-semibold ${p.margin_pct >= 30 ? 'text-emerald-400' : p.margin_pct >= 10 ? 'text-amber-400' : 'text-rose-400'}`}>{PCT(p.margin_pct)}</td>
            </tr>
          ))}
          {plans.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-slate-500 text-xs">Sem planos</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
