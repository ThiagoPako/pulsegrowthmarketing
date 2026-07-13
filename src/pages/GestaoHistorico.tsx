import { useEffect, useState } from 'react';
import { gestaoApi } from '@/services/gestaoApi';
import GestaoLayout from '@/components/gestao/GestaoLayout';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const BRL = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });

export default function GestaoHistorico() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    gestaoApi.history()
      .then(r => setRows(r.closings))
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <GestaoLayout>
      <div className="mb-8">
        <div className="text-[11px] tracking-[0.2em] uppercase text-amber-400/80 mb-1">Registros</div>
        <h1 className="text-3xl font-bold">Histórico de Fechamentos</h1>
        <p className="text-sm text-slate-400 mt-1">Snapshots dos meses fechados por cidade</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="bg-[#12161c] border border-white/5 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/40 text-[10px] uppercase tracking-widest text-slate-400">
              <tr>
                <th className="text-left p-3">Mês</th>
                <th className="text-left p-3">Cidade</th>
                <th className="text-right p-3">Receita</th>
                <th className="text-right p-3">Salários</th>
                <th className="text-right p-3">Despesas</th>
                <th className="text-right p-3">Repasse Out</th>
                <th className="text-right p-3">Repasse In</th>
                <th className="text-right p-3">Margem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="p-3 font-medium">{r.month}</td>
                  <td className="p-3 capitalize">{r.city}</td>
                  <td className="p-3 text-right">{BRL(r.revenue)}</td>
                  <td className="p-3 text-right">{BRL(r.salaries)}</td>
                  <td className="p-3 text-right">{BRL(r.expenses)}</td>
                  <td className="p-3 text-right text-amber-300">{BRL(r.transfer_out)}</td>
                  <td className="p-3 text-right text-emerald-300">{BRL(r.transfer_in)}</td>
                  <td className={`p-3 text-right font-semibold ${Number(r.net_margin) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{BRL(r.net_margin)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-slate-500">Nenhum fechamento registrado ainda</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </GestaoLayout>
  );
}
