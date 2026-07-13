import { useEffect, useState } from 'react';
import { gestaoApi } from '@/services/gestaoApi';
import GestaoLayout from '@/components/gestao/GestaoLayout';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

const LABELS: Record<string, string> = {
  reels: 'Reels / Vídeo',
  arte: 'Arte / Design',
  story: 'Story',
  roteiro: 'Roteiro',
  social_media: 'Social Media (post completo)',
};

export default function GestaoCustos() {
  const [rows, setRows] = useState<{ content_type: string; unit_cost: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    gestaoApi.getCosts()
      .then(r => setRows(r.costs))
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const update = (t: string, v: number) =>
    setRows(prev => prev.map(r => r.content_type === t ? { ...r, unit_cost: v } : r));

  const save = async () => {
    setSaving(true);
    try {
      await gestaoApi.saveCosts(rows);
      toast.success('Custos atualizados');
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <GestaoLayout>
      <div className="mb-8">
        <div className="text-[11px] tracking-[0.2em] uppercase text-amber-400/80 mb-1">Configuração</div>
        <h1 className="text-3xl font-bold">Custos Unitários de Produção</h1>
        <p className="text-sm text-slate-400 mt-1">Valores usados para calcular repasses e margens</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="bg-[#12161c] border border-white/5 rounded-2xl p-6 max-w-2xl">
          <div className="space-y-4">
            {rows.map(r => (
              <div key={r.content_type} className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-sm font-medium">{LABELS[r.content_type] || r.content_type}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest">{r.content_type}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-sm">R$</span>
                  <input
                    type="number" step="0.01" value={r.unit_cost}
                    onChange={e => update(r.content_type, Number(e.target.value))}
                    className="w-28 h-10 px-3 rounded-lg bg-black/40 border border-white/10 focus:border-amber-500/40 outline-none text-right text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={save} disabled={saving}
            className="mt-6 h-11 px-5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm flex items-center gap-2 disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar alterações
          </button>
        </div>
      )}
    </GestaoLayout>
  );
}
