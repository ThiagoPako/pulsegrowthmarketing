import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, RefreshCw, Send, XCircle, Zap, AlertTriangle, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchScheduledPosts,
  cancelScheduledPost,
  publishScheduledPostNow,
  SCHEDULED_POST_STATUS_LABELS,
  type ScheduledPost,
  type ScheduledPostStatus,
} from '@/services/socialPostsApi';

export interface AutoPostQueueProps {
  className?: string;
}

const STATUS_STYLES: Record<ScheduledPostStatus, string> = {
  agendado: 'bg-primary/10 text-primary border-primary/30',
  publicando: 'bg-warning/10 text-warning border-warning/30',
  publicado: 'bg-success/10 text-success border-success/30',
  erro: 'bg-destructive/10 text-destructive border-destructive/30',
  cancelado: 'bg-muted text-muted-foreground border-border',
};

const PLATFORM_LABEL: Record<ScheduledPost['platform'], string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  both: 'IG + FB',
};

/** Fila de postagens automáticas com ações de cancelar / publicar agora. */
export function AutoPostQueue({ className }: AutoPostQueueProps) {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ScheduledPostStatus | 'todos'>('todos');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPosts(await fetchScheduledPosts(filter === 'todos' ? undefined : { status: filter }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar fila');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  // Atualiza sozinho a cada minuto (acompanha o robô da VPS)
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const handleCancel = async (id: string) => {
    if (!confirm('Cancelar esta postagem automática?')) return;
    setBusyId(id);
    try { await cancelScheduledPost(id); toast.success('Postagem cancelada'); await load(); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Erro ao cancelar'); }
    finally { setBusyId(null); }
  };

  const handlePublishNow = async (id: string) => {
    if (!confirm('Publicar agora no perfil do cliente?')) return;
    setBusyId(id);
    try { await publishScheduledPostNow(id); toast.success('Publicado com sucesso'); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Falha ao publicar'); }
    finally { setBusyId(null); await load(); }
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2"><Zap size={16} className="text-primary" /> Fila de postagens automáticas</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={v => setFilter(v as ScheduledPostStatus | 'todos')}>
              <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {(Object.keys(SCHEDULED_POST_STATUS_LABELS) as ScheduledPostStatus[]).map(s => (
                  <SelectItem key={s} value={s}>{SCHEDULED_POST_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={load} disabled={loading} aria-label="Atualizar fila">
              <RefreshCw size={13} className={cn(loading && 'animate-spin')} /> Atualizar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && posts.length === 0 ? (
          <div className="py-8 flex justify-center text-muted-foreground"><Loader2 className="animate-spin" size={20} /></div>
        ) : posts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma postagem automática {filter !== 'todos' ? `com status "${SCHEDULED_POST_STATUS_LABELS[filter]}"` : 'na fila'}. Ative "Postar automaticamente" ao agendar um conteúdo.</p>
        ) : posts.map(p => (
          <div key={p.id} className="rounded-lg border border-border p-3 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn('text-[11px]', STATUS_STYLES[p.status])}>{SCHEDULED_POST_STATUS_LABELS[p.status]}</Badge>
                <span className="font-medium text-sm truncate">{p.client_name || 'Cliente'}</span>
                <span className="text-xs text-muted-foreground">{PLATFORM_LABEL[p.platform]} · {p.publish_type}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {format(new Date(p.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                {p.published_at && ` · publicado ${format(new Date(p.published_at), 'dd/MM HH:mm', { locale: ptBR })}`}
                {p.attempts > 0 && p.status !== 'publicado' && ` · tentativa ${p.attempts}`}
              </p>
              {p.caption && <p className="text-xs line-clamp-2 text-foreground/80">{p.caption}</p>}
              <a href={p.media_url} target="_blank" rel="noreferrer" className="text-[11px] text-primary inline-flex items-center gap-1 hover:underline">
                <ExternalLink size={10} /> ver mídia
              </a>
              {p.last_error && (
                <p className="text-xs text-destructive flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {p.last_error}</p>
              )}
            </div>
            {(p.status === 'agendado' || p.status === 'erro') && (
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={busyId === p.id} onClick={() => handlePublishNow(p.id)}>
                  {busyId === p.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Publicar agora
                </Button>
                <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-destructive" disabled={busyId === p.id} onClick={() => handleCancel(p.id)}>
                  <XCircle size={13} /> Cancelar
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default AutoPostQueue;
