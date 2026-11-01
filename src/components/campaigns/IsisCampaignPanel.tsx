import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, PenLine, Sparkles } from 'lucide-react';
import { vpsAuthedFetch } from '@/lib/vpsDb';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/** Campos da estratégia que a Ísis escreve (vps-api-server/lib/campaignIsis.mjs STRATEGY_FIELDS). */
const STRATEGY_LABELS: [string, string][] = [
  ['publico', 'Público'], ['mensagem', 'Mensagem central'], ['oferta', 'Oferta'], ['gancho', 'Gancho'],
  ['cta', 'CTA'], ['tom', 'Tom'], ['datas', 'Datas e momento'], ['por_que', 'Por que agora'],
];

interface VictoriaState { active: boolean; total: number; done: number; failed: number; last_error: string | null }

async function call<T>(path: string, method = 'GET'): Promise<T> {
  const response = await vpsAuthedFetch(path, { method, ...(method === 'POST' ? { body: '{}' } : {}) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Não deu certo. Tente de novo.');
  return body as T;
}

/**
 * Campanha criada pela Ísis (social media; pedido do usuário, 01/11/2026): mostra a estratégia, aprova (rascunho →
 * ativa) e manda os vídeos para a Victoria escrever os roteiros, com o andamento.
 */
export default function IsisCampaignPanel({ campaign, onChanged }: {
  campaign: { id: string; status: string; editorial: any };
  onChanged: () => void;
}) {
  const isis = campaign.editorial?.isis;
  const [busy, setBusy] = useState(false);
  const [victoria, setVictoria] = useState<VictoriaState | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const draft = campaign.status === 'rascunho';

  useEffect(() => {
    if (!isis || draft) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const d = await call<{ victoria: VictoriaState | null; pending: number }>(`/campaigns/${campaign.id}/victoria`);
        if (stop) return;
        setVictoria(d.victoria);
        setPending(d.pending);
        if (d.victoria?.active) { timer = setTimeout(tick, 4000); onChanged(); }
      } catch {
        // sem permissão ou servidor fora: o painel só não mostra o andamento
      }
    };
    void tick();
    return () => { stop = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id, campaign.status, isis, busy]);

  if (!isis) return null;
  const strategy = isis.strategy || {};

  const run = async (path: string, ok: string) => {
    setBusy(true);
    try {
      await call(path, 'POST');
      toast.success(ok);
      onChanged();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 space-y-3 border-primary/30">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">Estratégia da {isis.by || 'Ísis'}</h2>
        <span className="text-xs text-muted-foreground">{draft ? 'rascunho: aprove para a Victoria escrever os roteiros' : 'aprovada'}</span>
      </div>
      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[160px_1fr] text-sm">
        {STRATEGY_LABELS.filter(([k]) => strategy[k]).map(([k, label]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="whitespace-pre-wrap">{strategy[k]}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {draft ? (
          <Button disabled={busy} onClick={() => run(`/campaigns/${campaign.id}/approve-strategy`, 'Estratégia aprovada: a Victoria começou os roteiros')}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
            Aprovar estratégia e mandar para a Victoria
          </Button>
        ) : victoria?.active ? (
          <span className="text-sm flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Victoria escrevendo: {victoria.done} de {victoria.total}
          </span>
        ) : (
          <Button variant="outline" disabled={busy || pending === 0} onClick={() => run(`/campaigns/${campaign.id}/victoria`, 'A Victoria começou os roteiros que faltam')}>
            <PenLine className="h-4 w-4 mr-1" />
            {pending === 0 ? 'Todos os vídeos têm roteiro' : `Victoria: escrever ${pending ?? ''} roteiro(s) que faltam`}
          </Button>
        )}
        {victoria && !victoria.active && victoria.failed > 0 && (
          <span className="text-xs text-destructive">{victoria.failed} falharam ({victoria.last_error}). Tente de novo.</span>
        )}
      </div>
    </Card>
  );
}
