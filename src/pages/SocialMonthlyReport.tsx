import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Clock, Film, Image as ImageIcon, Loader2, Send, Undo2, Video } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  approveSocialReport, fetchSocialReport, fetchSocialReports, lastClosedMonth, saveSocialReportDraft, STATUS_LABEL,
  type SocialReport, type SocialReportStatus,
} from '@/lib/socialReport';

const STATUS_VARIANT: Record<SocialReportStatus, 'outline' | 'secondary' | 'default'> = {
  sem_rascunho: 'outline',
  rascunho: 'secondary',
  aprovado: 'default',
};

const num = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('pt-BR'));
const signed = (n: number | null | undefined) => (n === null || n === undefined ? null : `${n >= 0 ? '+' : ''}${n.toLocaleString('pt-BR')}`);

/**
 * Relatório mensal da rede social de cada cliente (Ísis, social media; pedido do usuário, 01/11/2026).
 * Ordem: nossas entregas e o tempo dedicado primeiro, depois a rede e as sugestões. A Ísis deixa o rascunho
 * (pulse relatorio rascunho); a equipe revisa e aprova aqui. O envio ao cliente (dia 1) é a função de cobranças.
 */
export default function SocialMonthlyReport() {
  const [month, setMonth] = useState(lastClosedMonth());
  const [clientId, setClientId] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['social-reports', month], queryFn: () => fetchSocialReports(month) });

  const counts = useMemo(() => {
    const c = { sem_rascunho: 0, rascunho: 0, aprovado: 0 } as Record<SocialReportStatus, number>;
    for (const item of list.data?.clients || []) c[item.status] += 1;
    return c;
  }, [list.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="mes-relatorio">Mês</Label>
          <Input id="mes-relatorio" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-44" />
        </div>
        <p className="text-sm text-muted-foreground pb-2">
          {list.data?.label ? `${list.data.label}: ` : ''}
          {counts.aprovado} aprovado(s) · {counts.rascunho} rascunho(s) da Ísis · {counts.sem_rascunho} sem rascunho
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded-lg border divide-y max-h-[70vh] overflow-y-auto">
          {list.isLoading && <div className="p-4"><Loader2 className="animate-spin text-muted-foreground" size={18} /></div>}
          {list.error && <p className="p-4 text-sm text-destructive">{(list.error as Error).message}</p>}
          {list.data?.clients.map((c) => (
            <button
              key={c.client_id}
              type="button"
              onClick={() => setClientId(c.client_id)}
              className={`w-full text-left px-3 py-2 hover:bg-muted/50 ${clientId === c.client_id ? 'bg-muted' : ''}`}
            >
              <div className="text-sm font-medium truncate">{c.client}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant={STATUS_VARIANT[c.status]} className="text-[10px]">{STATUS_LABEL[c.status]}</Badge>
                <span className="text-[11px] text-muted-foreground truncate">{c.niche || ''}</span>
              </div>
            </button>
          ))}
        </div>

        {clientId
          ? <ReportDetail clientId={clientId} month={month} />
          : <p className="text-sm text-muted-foreground p-6 rounded-lg border">Escolha um cliente para ver o relatório do mês.</p>}
      </div>
    </div>
  );
}

function ReportDetail({ clientId, month }: { clientId: string; month: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['social-report', clientId, month], queryFn: () => fetchSocialReport(clientId, month) });
  const [suggestions, setSuggestions] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSuggestions(query.data?.draft.suggestions || '');
    setNote(query.data?.draft.note || '');
  }, [query.data]);

  if (query.isLoading) return <div className="p-6"><Loader2 className="animate-spin text-muted-foreground" size={18} /></div>;
  if (query.error || !query.data) return <p className="p-6 text-sm text-destructive">{(query.error as Error)?.message || 'Erro'}</p>;
  const r: SocialReport = query.data;
  const d = r.numbers.deliveries;
  const approved = r.draft.status === 'aprovado';

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['social-report', clientId, month] }),
    queryClient.invalidateQueries({ queryKey: ['social-reports', month] }),
  ]);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      toast.success(ok);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{r.client.name}</h2>
        <Badge variant={STATUS_VARIANT[r.draft.status]}>{STATUS_LABEL[r.draft.status]}</Badge>
        <span className="text-xs text-muted-foreground">
          {r.numbers.label}
          {r.draft.drafted_by_name ? ` · rascunho de ${r.draft.drafted_by_name}` : ''}
          {r.draft.approved_by_name ? ` · aprovado por ${r.draft.approved_by_name}` : ''}
        </span>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">O que entregamos</h3>
        <div className="grid gap-2 sm:grid-cols-4">
          <Stat icon={Film} label="Vídeos" value={d.videos.total} hint={d.videos.by_type.map((t) => `${t.total} ${t.type}`).join(' · ')} />
          <Stat icon={ImageIcon} label="Artes" value={d.arts.total} />
          <Stat icon={Send} label="Posts" value={d.posts.total} />
          <Stat icon={Video} label="Gravações" value={d.recordings.done} hint={`${d.recordings.scheduled} marcadas · ${d.recordings.cancelled} canceladas`} />
        </div>
        <p className="text-xs text-muted-foreground">
          Média de vídeos por gravação: {d.recordings.avg_videos_per_recording === null ? 'sem registro de entrega' : num(d.recordings.avg_videos_per_recording)}
        </p>
      </section>

      <section className="space-y-1">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><Clock size={14} /> Tempo dedicado</h3>
        <p className="text-sm">
          <strong>{num(r.numbers.time.total_hours)} h</strong>
          <span className="text-muted-foreground"> · gravação {num(r.numbers.time.recording_hours)} h · edição {num(r.numbers.time.editing_hours)} h · design {num(r.numbers.time.design_hours)} h</span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          Gravação pela duração padrão ({r.numbers.time.recording_minutes_each} min), edição do início ao envio para revisão (sem pausas), design pelo cronômetro das artes.
        </p>
      </section>

      <section className="space-y-1">
        <h3 className="text-sm font-semibold">Rede social</h3>
        {r.network.connected && r.network.current ? (
          <>
            <div className="grid gap-2 sm:grid-cols-4">
              <Stat label="Alcance" value={r.network.current.reach} hint={signed(r.network.change?.reach)} />
              <Stat label="Seguidores ganhos" value={r.network.current.followers_gained} hint={r.network.current.followers_total !== null ? `${num(r.network.current.followers_total)} no total` : null} />
              <Stat label="Interações" value={r.network.current.interactions} hint={signed(r.network.change?.interactions)} />
              <Stat label="Visitas ao perfil" value={r.network.current.profile_views} hint={signed(r.network.change?.profile_views)} />
            </div>
            {!!r.network.top_posts?.length && (
              <ul className="text-xs text-muted-foreground list-disc pl-4">
                {r.network.top_posts.map((p, i) => (
                  <li key={i}>{p.date} · {p.caption || 'post'} · alcance {num(p.reach)}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Instagram não conectado para este cliente ({r.network.reason || 'sem dados'}). O relatório sai sem as métricas.</p>
        )}
      </section>

      <section className="space-y-2">
        <Label htmlFor="sugestoes">Sugestões para o próximo mês (uma por linha)</Label>
        <Textarea id="sugestoes" rows={5} value={suggestions} onChange={(e) => setSuggestions(e.target.value)} disabled={approved} placeholder="A Ísis escreve com pulse relatorio rascunho; a equipe pode ajustar aqui." />
        <Label htmlFor="nota">Observação interna</Label>
        <Textarea id="nota" rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={approved} />
        <div className="flex flex-wrap gap-2">
          {approved ? (
            <Button variant="outline" disabled={busy} onClick={() => run(() => approveSocialReport(clientId, month, false), 'Voltou para rascunho')}>
              <Undo2 size={14} className="mr-1" /> Voltar para rascunho
            </Button>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={() => run(() => saveSocialReportDraft(clientId, month, suggestions, note), 'Rascunho salvo')}>
                Salvar rascunho
              </Button>
              <Button
                disabled={busy || r.draft.status === 'sem_rascunho'}
                onClick={() => run(async () => {
                  await saveSocialReportDraft(clientId, month, suggestions, note);
                  await approveSocialReport(clientId, month, true);
                }, 'Relatório aprovado')}
              >
                <CheckCircle2 size={14} className="mr-1" /> Aprovar relatório
              </Button>
            </>
          )}
        </div>
      </section>

      <section className="space-y-1">
        <h3 className="text-sm font-semibold">Prévia da mensagem do dia 1</h3>
        <pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs font-sans">{r.message_preview}</pre>
        <p className="text-[11px] text-muted-foreground">Ainda não é enviada: o envio pelo Assistente PULSE entra com a função de cobranças.</p>
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint }: { icon?: typeof Film; label: string; value: number | null | undefined; hint?: string | null }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-[11px] text-muted-foreground flex items-center gap-1">{Icon && <Icon size={12} />}{label}</div>
      <div className="text-xl font-semibold">{num(value)}</div>
      {hint && <div className="text-[11px] text-muted-foreground truncate">{hint}</div>}
    </div>
  );
}
