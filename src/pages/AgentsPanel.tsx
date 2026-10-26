import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Bot, Pause, Play, Loader2, AlertTriangle, KeyRound, Clock, CheckCircle2, Inbox, Camera, Palette, GraduationCap } from 'lucide-react';
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

const ROLE_LABELS: Record<string, string> = { editor: 'Editor', revisor: 'Revisão', chefe: 'Chefe', designer: 'Designer', revisor_arte: 'Revisão de artes' };

// Agentes de design (GET /api/agents/design-overview, agentDesignRoutes.mjs)
interface DesignCurrent {
  id: string;
  title: string;
  kanban_column: string;
  assigned_to: string;
  agent_step: string | null;
  agent_heartbeat_at: string | null;
  client_name: string | null;
}
interface DesignOverview {
  queue: { waiting: number; analise_ia: number; agent_adjustments: number };
  designers: {
    user_id: string; name: string; role: string; current: DesignCurrent[];
    delivered_today: number; delivered_week: number; reviews_30d: number; approved_30d: number; errors_30d: number;
  }[];
  current: DesignCurrent[];
  learning: {
    days: number;
    reviews: number;
    approved: number;
    by_category: { category: string; label: string; count: number }[];
    by_designer: { designer_id: string; name: string; category: string; label: string; count: number }[];
    recent: { category: string; label: string; description: string; at: string; task: string | null; client: string | null; designer: string | null }[];
  };
}
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
  const [design, setDesign] = useState<DesignOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // Falha ao carregar: aviso fixo na página (antes saía um toast novo a cada 15 s)
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await vpsAuthedFetch('/agents/overview');
      const body = await response.json().catch(() => ({}));
      if (response.status === 403) {
        // Só admin vê o painel: para o polling em vez de repetir o erro
        setForbidden(true);
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        return;
      }
      if (!response.ok) throw new Error(body.error || 'Falha ao carregar os agentes');
      setData(body);
      setLoadError(null);
      // Artes: falha aqui não derruba o painel de vídeo
      try {
        const designResponse = await vpsAuthedFetch('/agents/design-overview');
        if (designResponse.ok) setDesign(await designResponse.json());
      } catch {
        /* sem o resumo de artes nesta rodada */
      }
    } catch (error) {
      const message = errorMessage(error);
      setLoadError(message);
      // id fixo: o sonner troca o toast em vez de empilhar um novo a cada tentativa
      toast.error(message, { id: 'agents-load' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 15000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
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

  if (forbidden) {
    return (
      <div className="max-w-5xl">
        <div className="glass-card flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <AlertTriangle size={16} /> Apenas administradores acessam o painel de agentes.
        </div>
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
          <h1 className="text-2xl font-display font-bold">Agentes de IA</h1>
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

      {loadError && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle size={16} className="text-warning" />
          Não foi possível atualizar o painel: {loadError}. Tentando de novo a cada 15 s{data ? ' (mostrando os últimos dados carregados)' : ''}.
        </div>
      )}

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
        {data && (data.agents || []).length === 0 && (
          <div className="glass-card p-6 text-sm text-muted-foreground">
            Nenhum agente com chave ativa. Gere as chaves em <Link className="underline" to="/configuracoes">Configurações</Link>.
          </div>
        )}
        {(data?.agents || []).map((agent) => {
          const label = agent.name?.trim() || agent.email || 'Agente';
          const paused = pausedAll || !!agent.paused;
          const designInfo = design?.designers.find((d) => d.user_id === agent.user_id);
          const art = design?.current.find((t) => t.assigned_to === agent.user_id);
          const task = agent.current[0] || (art ? { ...art, editing_started_at: null } : undefined);
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
                  {art && !agent.current[0]
                    ? (task.kanban_column === 'ajustes' ? 'Ajuste de arte' : 'Criando arte')
                    : task.kanban_column === 'alteracao' ? 'Alteração' : 'Editando'}: <strong>{task.title}</strong>
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

              {designInfo ? (
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {designInfo.role === 'designer' && (
                    <>
                      <span className="flex items-center gap-1"><Palette size={12} /> {designInfo.delivered_today} arte(s) entregue(s) hoje</span>
                      <span>{designInfo.delivered_week} nos últimos 7 dias</span>
                      <span>
                        Análise IA (30 dias): {designInfo.approved_30d} de {designInfo.reviews_30d} aprovadas · {designInfo.errors_30d} erro(s) apontado(s)
                      </span>
                    </>
                  )}
                  {designInfo.role === 'revisor_arte' && <span className="flex items-center gap-1"><Palette size={12} /> Revisa as artes na coluna Análise IA</span>}
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><CheckCircle2 size={12} /> {agent.delivered_today} entregue(s) hoje</span>
                  <span>{agent.delivered_week} nos últimos 7 dias</span>
                  <span>{agent.alterations_week} alteração(ões) refeita(s) em 7 dias</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {design && (
        <div className="glass-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Palette size={16} className="text-primary" />
            <h2 className="text-sm font-semibold">Artes (agentes de design)</h2>
            <Link to="/designer" className="ml-auto text-xs text-primary underline">Abrir o Kanban de Design</Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: 'Artes esperando (sem dono)', value: design.queue.waiting },
              { label: 'Na Análise IA', value: design.queue.analise_ia },
              { label: 'Ajustes de artes dos agentes', value: design.queue.agent_adjustments },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="mt-1 text-2xl font-bold">{Number(value || 0)}</div>
              </div>
            ))}
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <GraduationCap size={13} /> Aprendizado — erros apontados pelo revisor de artes ({design.learning.days} dias)
            </h3>
            {design.learning.by_category.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {design.learning.reviews ? `${design.learning.reviews} parecer(es), nenhum erro apontado.` : 'Nenhum parecer da Análise IA ainda.'}
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {design.learning.reviews} parecer(es) da Análise IA: {design.learning.approved} aprovado(s), {design.learning.reviews - design.learning.approved} com ajustes.
                </p>
                <div className="space-y-1.5">
                  {design.learning.by_category.map((c) => {
                    const max = Math.max(...design.learning.by_category.map((x) => x.count));
                    return (
                      <div key={c.category} className="flex items-center gap-2 text-xs">
                        <span className="w-48 shrink-0 truncate">{c.label}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${(c.count / max) * 100}%` }} />
                        </div>
                        <span className="w-8 text-right font-semibold">{c.count}</span>
                      </div>
                    );
                  })}
                </div>
                {design.learning.by_designer.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(design.learning.by_designer.map((d) => d.designer_id))).map((id) => {
                      const rows = design.learning.by_designer.filter((d) => d.designer_id === id);
                      return (
                        <div key={id} className="rounded-lg border border-border px-3 py-2 text-xs">
                          <div className="font-semibold">{rows[0].name || 'Designer'}</div>
                          <div className="text-muted-foreground">{rows.slice(0, 3).map((r) => `${r.label} (${r.count})`).join(' · ')}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <ul className="space-y-1 text-xs">
                  {design.learning.recent.slice(0, 8).map((e, i) => (
                    <li key={i} className="flex flex-wrap gap-x-2">
                      <span className="text-muted-foreground">{ago(e.at)}</span>
                      <Badge variant="outline" className="text-[10px]">{e.label}</Badge>
                      <span>{e.description}</span>
                      {(e.task || e.designer) && <span className="text-muted-foreground">· {[e.task, e.client, e.designer].filter(Boolean).join(' · ')}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

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
