// Regras do cliente (05/11/2026, pedido do Thiago): o que o cliente gosta, aprovou e recusou, num lugar só. A equipe lê e
// corrige aqui; os agentes leem e gravam pela API (cada alteração vira aprendizado). Servidor: vps-api-server/lib/clientRules.mjs.
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Bot, Check, EyeOff, Loader2, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';

interface Rule {
  id: string; area: string; text: string; origin: string | null; source_ref: string | null; active: boolean;
  created_by_agent: string | null; created_by_name: string | null; updated_by: string | null; created_at: string;
}

const AREA_LABEL: Record<string, string> = {
  geral: 'Geral', video: 'Vídeo', legenda: 'Legenda', audio: 'Áudio', cor: 'Cor', design: 'Design', social: 'Social media',
  aprovado: 'Aprovou', recusado: 'Recusou',
};
const AREAS = Object.keys(AREA_LABEL);

const dateLabel = (v: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(v));

export default function ClientRulesPanel({ clientId }: { clientId: string }) {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [showOff, setShowOff] = useState(false);
  const [filter, setFilter] = useState<string>('todas');
  const [area, setArea] = useState('geral');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  const load = async () => {
    const { data, error } = await invokeVpsFunction(`clients/${clientId}/rules${showOff ? '?todas=1' : ''}`, { method: 'GET' });
    if (error || data?.error) { toast.error(data?.error || error?.message || 'Não deu para ler as regras'); setRules([]); return; }
    setRules(data.rules || []);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setRules(null); load(); }, [clientId, showOff]);

  const save = async (path: string, method: 'POST' | 'PATCH', body: Record<string, unknown>, key: string, ok: string) => {
    setBusy(key);
    const { data, error } = await invokeVpsFunction(path, { method, body });
    setBusy(null);
    if (error || data?.error) { toast.error(data?.error || error?.message); return false; }
    toast.success(ok);
    await load();
    return true;
  };

  const add = async () => {
    if (text.trim().length < 5) { toast.error('Escreva a regra'); return; }
    if (await save(`clients/${clientId}/rules`, 'POST', { area, text: text.trim() }, 'add', 'Regra gravada')) setText('');
  };

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rules || []) m[r.area] = (m[r.area] || 0) + 1;
    return m;
  }, [rules]);
  const shown = (rules || []).filter((r) => filter === 'todas' || r.area === filter);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        O que este cliente gosta, aprovou e recusou. Os agentes leem antes de editar e gravam aqui o que aprendem em cada
        alteração; a equipe pode corrigir ou desligar qualquer regra.
      </p>

      <div className="space-y-2 rounded-lg border border-border p-2.5">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Área da regra nova">
          {AREAS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={area === a} onClick={() => setArea(a)}
              className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-medium', area === a ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground')}>
              {AREA_LABEL[a]}
            </button>
          ))}
        </div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000}
          placeholder="Ex.: preço sempre na etiqueta no meio da tela, abaixo do peito, sem tampar o produto" />
        <div className="flex justify-end">
          <Button size="sm" className="gap-1" disabled={busy === 'add'} onClick={add}>
            {busy === 'add' ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Gravar regra
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {['todas', ...AREAS.filter((a) => counts[a])].map((a) => (
          <button key={a} type="button" onClick={() => setFilter(a)}
            className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-medium', filter === a ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}>
            {a === 'todas' ? `Todas (${rules?.length || 0})` : `${AREA_LABEL[a]} (${counts[a]})`}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
          <input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> mostrar desligadas
        </label>
      </div>

      {!rules ? <Loader2 size={16} className="animate-spin text-muted-foreground" /> : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Nenhuma regra ainda.</p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((r) => (
            <li key={r.id} className={cn('rounded-lg border border-border p-2.5 text-sm', !r.active && 'opacity-50')}>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">{AREA_LABEL[r.area] || r.area}</span>
                {editing?.id === r.id ? (
                  <div className="flex-1 space-y-1.5">
                    <Textarea value={editing.text} onChange={(e) => setEditing({ id: r.id, text: e.target.value })} rows={3} />
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-7 gap-1 text-xs" disabled={busy === r.id}
                        onClick={async () => { if (await save(`clients/${clientId}/rules/${r.id}`, 'PATCH', { text: editing.text }, r.id, 'Regra corrigida')) setEditing(null); }}>
                        <Check size={12} /> Salvar
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(null)}><X size={12} /></Button>
                    </div>
                  </div>
                ) : (
                  <p className="flex-1 whitespace-pre-wrap leading-snug">{r.text}</p>
                )}
                {editing?.id !== r.id && (
                  <div className="flex shrink-0 gap-0.5">
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Corrigir regra" onClick={() => setEditing({ id: r.id, text: r.text })}><Pencil size={12} /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={r.active ? 'Desligar regra' : 'Religar regra'} disabled={busy === r.id}
                      onClick={() => save(`clients/${clientId}/rules/${r.id}`, 'PATCH', { active: !r.active }, r.id, r.active ? 'Regra desligada' : 'Regra religada')}>
                      {r.active ? <EyeOff size={12} /> : <RotateCcw size={12} />}
                    </Button>
                  </div>
                )}
              </div>
              <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                {r.created_by_agent && <Bot size={10} />}
                {dateLabel(r.created_at)} · {r.origin || r.created_by_agent || r.created_by_name || 'equipe'}
                {r.updated_by && ` · corrigida por ${r.updated_by}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
