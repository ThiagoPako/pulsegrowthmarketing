import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Bot, Pause, Play, Loader2, AlertTriangle, KeyRound, Clock, CheckCircle2, Inbox, Camera } from 'lucide-react';
import { vpsAuthedFetch } from '@/lib/vpsDb';
import { uploadFileToVps } from '@/services/vpsApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface PauseRow {
  scope: string;
  paused_at: string;
  reason: string | null;
}

interface CurrentTask {
  id: string;
  title: string;
  kanban_column: string;
  agent_step: string | null;
  agent_heartbeat_at: string | null;
  editing_started_at: string | null;
  client_name: string | null;
}

interface AgentRow {
  user_id: string;
  avatar_url: string | null;
  name: string | null;
  email: string | null;
  roles: string;
  last_used_at: string | null;
  paused: PauseRow | null;
  status: { status: string | null; updated_at: string } | null;
  current: CurrentTask[];
  delivered_today: number;
  delivered_week: number;
  alterations_week: number;
}

interface Overview {
  paused_all: PauseRow | null;
  queue: { waiting: string; without_footage: string; agent_alterations: string; overdue: string };
  agents: AgentRow[];
  activity: { created_at: string; action: string; details: string | null; agent_name: string; title: string | null }[];
}

const ROLE_LABELS: Record<string, string> = { editor: 'Editor', revisor: 'Revisão', chefe: 'Chefe' };
const STALE_MINUTES = 30;

function ago(value: string | null) {
  if (!value) return 'nunca';
  return formatDistanceToNow(new Date(value), { addSuffix: true, locale: ptBR });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Módulo de Agentes: situação da equipe que trabalha pelo Claude (editores, revisão, chefe),
 * com pausa geral e por agente. A pausa é aplicada no servidor: agente pausado não consegue
 * assumir card novo (o que já está em andamento pode ser terminado e entregue).
 */
export default function AgentsPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await vpsAuthedFetch('/agents/overview');
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Falha ao carregar os agentes');
      setData(body);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  const changePhoto = async (agent: AgentRow, file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      toast.error('Use uma imagem PNG, JPG ou WEBP');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('A foto precisa ter até 5 MB');
      return;
    }
    setBusy(`foto-${agent.user_id}`);
    try {
      const url = await uploadFileToVps(file, { folder: `avatars/agentes/${agent.user_id}`, retries: 2 });
      const response = await vpsAuthedFetch(`/agents/${agent.user_id}/avatar`, {
        method: 'POST',
        body: JSON.stringify({ avatar_url: url }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Falha ao salvar a foto');
      toast.success('Foto atualizada');
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const setPause = async (scope: string, pause: boolean, label: string) => {
    if (pause && !window.confirm(`Pausar ${label}? Nenhum card novo será assumido até você retomar. O que já está em andamento pode terminar.`)) return;
    setBusy(scope);
    try {
      const response = await vpsAuthedFetch(pause ? '/agents/pause' : '/agents/resume', {
        method: 'POST',
        body: JSON.stringify({ scope }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Falha ao alterar a pausa');
      toast.success(pause ? `${label} pausado(s)` : `${label} retomado(s)`);
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pausedAll = !!data?.paused_all;
  const queue = data?.queue;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bot className="text-primary" />
          <h1 className="text-2xl font-display font-bold">Agentes de edição</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/configuracoes"><KeyRound size={14} className="mr-1" /> Chaves</Link>
          </Button>
          {pausedAll ? (
            <Button onClick={() => setPause('all', false, 'Todos os agentes')} disabled={busy === 'all'}>
              {busy === 'all' ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Play size={14} className="mr-1" />}
              Retomar agentes
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => setPause('all', true, 'Todos os agentes')} disabled={busy === 'all'}>
              {busy === 'all' ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Pause size={14} className="mr-1" />}
              Pausar agentes
            </Button>
          )}
        </div>
      </div>

      {pausedAll && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <Pause size={16} />
          Todos os agentes estão pausados desde {ago(data?.paused_all?.paused_at || null)}. Nenhum card novo será assumido.
        </div>
      )}

      {queue && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Esperando edição', value: queue.waiting, icon: Inbox },
            { label: 'Prazo vencido', value: queue.overdue, icon: AlertTriangle },
            { label: 'Sem link dos brutos', value: queue.without_footage, icon: AlertTriangle },
            { label: 'Alterações dos agentes', value: queue.agent_alterations, icon: Clock },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="glass-card p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon size={12} /> {label}</div>
              <div className="mt-1 text-2xl font-bold">{Number(value || 0)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {(data?.agents || []).length === 0 && (
          <div className="glass-card p-6 text-sm text-muted-foreground">
            Nenhum agente com chave ativa. Gere as chaves em <Link className="underline" to="/configuracoes">Configurações</Link>.
          </div>
        )}
        {(data?.agents || []).map((agent) => {
          const label = agent.name?.trim() || agent.email || 'Agente';
          const paused = pausedAll || !!agent.paused;
          const task = agent.current[0];
          const stale = task && (!task.agent_heartbeat_at
            || Date.now() - new Date(task.agent_heartbeat_at).getTime() > STALE_MINUTES * 60 * 1000);
          return (
            <div key={agent.user_id} className="glass-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className="relative cursor-pointer"
                  title="Trocar foto"
                >
                  {agent.avatar_url ? (
                    <img src={agent.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                      {label.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background">
                    {busy === `foto-${agent.user_id}` ? <Loader2 size={10} className="animate-spin" /> : <Camera size={10} />}
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={busy === `foto-${agent.user_id}`}
                    onChange={(event) => {
                      void changePhoto(agent, event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                </label>
                <span className="text-base font-semibold">{label}</span>
                {agent.roles.split(',').map((role) => (
                  <Badge key={role} variant="outline">{ROLE_LABELS[role] || role}</Badge>
                ))}
                {paused ? (
                  <Badge variant="destructive">Pausado</Badge>
                ) : task || agent.status ? (
                  stale ? <Badge variant="destructive">Sem sinal há +{STALE_MINUTES} min</Badge>
                    : <Badge className="bg-success/15 text-success border-success/30" variant="outline">Trabalhando</Badge>
                ) : (
                  <Badge variant="secondary">Livre</Badge>
                )}
                <span className="text-xs text-muted-foreground">último contato {ago(agent.last_used_at)}</span>
                <div className="ml-auto">
                  {agent.paused ? (
                    <Button size="sm" variant="outline" onClick={() => setPause(agent.user_id, false, label)} disabled={busy === agent.user_id}>
                      <Play size={14} className="mr-1" /> Retomar
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setPause(agent.user_id, true, label)} disabled={busy === agent.user_id || pausedAll}>
                      <Pause size={14} className="mr-1" /> Pausar
                    </Button>
                  )}
                </div>
              </div>

              {task ? (
                <p className="mt-2 text-sm">
                  {task.kanban_column === 'alteracao' ? 'Alteração' : 'Editando'}: <strong>{task.title}</strong>
                  {task.client_name ? ` · ${task.client_name.trim()}` : ''}
                  <span className="text-muted-foreground"> — etapa: {task.agent_step || '—'}, sinal {ago(task.agent_heartbeat_at)}</span>
                </p>
              ) : agent.status ? (
                <p className="mt-2 text-sm">
                  {agent.status.status || 'Trabalhando'}
                  <span className="text-muted-foreground"> — sinal {ago(agent.status.updated_at)}</span>
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Sem tarefa no momento.</p>
              )}

              <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><CheckCircle2 size={12} /> {agent.delivered_today} entregue(s) hoje</span>
                <span>{agent.delivered_week} nos últimos 7 dias</span>
                <span>{agent.alterations_week} alteração(ões) refeita(s) em 7 dias</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="glass-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Atividade recente</h2>
        {(data?.activity || []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma atividade dos agentes ainda.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {data!.activity.map((item, index) => (
              <li key={index} className="flex flex-wrap gap-x-2">
                <span className="text-xs text-muted-foreground">{ago(item.created_at)}</span>
                <span className="font-medium">{item.agent_name?.trim()}</span>
                <span>{item.action}</span>
                {item.title && <span className="text-muted-foreground">· {item.title}</span>}
                {item.details && !item.details.startsWith('http') && <span className="text-muted-foreground">· {item.details}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
