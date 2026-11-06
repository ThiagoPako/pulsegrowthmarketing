// Equipe de agentes em cards, no padrão HUD da Ísis (pedido do Thiago, 06/11/2026: "atualizar o módulo Agentes para
// essa nova versão, onde a gente consiga vê-los em card, mostre as atividades deles e a barra de carregamento sobre o
// que cada um está fazendo"). Foto, função, card e etapa de cada agente; a barra anda pelas etapas do card e, quando
// o card dele está renderizando na fila do PC, mostra a porcentagem do render ao vivo.
import { AGENT_ROLE_LABELS } from '@/lib/agentRoles';
import { BarraViva, HudFrame, cap, haQuanto, restante, type RespostaFila } from './RenderQueueHud';

export interface HudTask {
  id: string;
  title: string;
  kanban_column: string;
  agent_step: string | null;
  agent_heartbeat_at: string | null;
  client_name: string | null;
}
export interface HudAgent {
  user_id: string;
  avatar_url: string | null;
  name: string | null;
  email: string | null;
  roles: string;
  last_used_at: string | null;
  paused: unknown | null;
  status: { status: string | null; updated_at: string } | null;
  current: HudTask[];
  delivered_today: number;
  delivered_week: number;
  alterations_week: number;
}

const ETAPAS: { nome: string; re: RegExp }[] = [
  { nome: 'brutos', re: /baix|brut|drive|download/i },
  { nome: 'cortes', re: /cort|transcr|prepar|sele/i },
  { nome: 'cor', re: /\bcor\b|color|look|pele/i },
  { nome: 'plano', re: /plano|legenda|anima|mont|motion|arte|cria/i },
  { nome: 'som', re: /\bsom\b|trilha|áudio|audio|voz/i },
  { nome: 'conferência', re: /confer|portão|quadros|revis|folha/i },
  { nome: 'render', re: /render/i },
  { nome: 'entrega', re: /entreg|subindo|envi/i },
];
function etapaDe(step: string | null): number {
  if (!step) return -1;
  for (let i = ETAPAS.length - 1; i >= 0; i--) if (ETAPAS[i].re.test(step)) return i;
  return -1;
}

type Tom = 'trabalhando' | 'aguardando' | 'atencao' | 'pausado' | 'livre';
const TOM: Record<Tom, { rotulo: string; anel: string; pill: string; card: string; barra: string }> = {
  trabalhando: { rotulo: 'Trabalhando', anel: 'ring-cyan-300', pill: 'border-emerald-300/40 bg-emerald-400/10 text-emerald-200', card: 'border-cyan-300/25', barra: 'from-cyan-400 to-emerald-300' },
  aguardando: { rotulo: 'Aguardando', anel: 'ring-amber-300', pill: 'border-amber-300/40 bg-amber-400/10 text-amber-100', card: 'border-amber-300/30', barra: 'from-amber-400 to-amber-200' },
  atencao: { rotulo: 'Precisa de atenção', anel: 'ring-rose-400', pill: 'border-rose-400/50 bg-rose-500/15 text-rose-200', card: 'border-rose-400/40 bg-rose-500/[0.06]', barra: 'from-rose-500 to-rose-300' },
  pausado: { rotulo: 'Pausado', anel: 'ring-slate-500', pill: 'border-slate-400/30 bg-slate-500/10 text-slate-300', card: 'border-cyan-300/10 opacity-70', barra: 'from-slate-500 to-slate-400' },
  livre: { rotulo: 'Livre', anel: 'ring-slate-600', pill: 'border-cyan-300/20 bg-cyan-400/5 text-cyan-100/70', card: 'border-cyan-300/10', barra: 'from-slate-600 to-slate-500' },
};

const STALE_MS = 30 * 60 * 1000;

interface Leitura {
  tom: Tom;
  task?: HudTask;
  atividade: string;
  detalhe: string;
  pct: number;
  indeterminada: boolean;
  legenda: string;
}

function ler(a: HudAgent, art: HudTask | undefined, pausadoGeral: boolean, fila: RespostaFila | null): Leitura {
  const task = a.current[0] || art;
  const ativo = !!a.status && Date.now() - Date.parse(a.status.updated_at) < 15 * 60 * 1000;
  const rodando = fila?.online ? fila.state?.rodando : null;
  if (task) {
    const step = task.agent_step || (task.kanban_column === 'alteracao' ? 'alteração' : 'edição');
    const atividade = `${task.client_name || 'Cliente'} · ${task.title}`;
    const renderDele = rodando && rodando.card === task.id && rodando.tipo === 'render';
    if (renderDele) {
      const falta = restante(rodando);
      return { tom: 'trabalhando', task, atividade, detalhe: `renderizando na fila do PC`, pct: rodando.progresso ?? 0, indeterminada: false,
        legenda: `render ${rodando.progresso ?? 0}%${falta ? ` · faltam ${falta}` : ''}` };
    }
    const idx = etapaDe(step);
    const pct = idx >= 0 ? ((idx + 1) / ETAPAS.length) * 100 : 8;
    const legenda = idx >= 0 ? `etapa ${idx + 1} de ${ETAPAS.length} · ${ETAPAS[idx].nome}` : 'começando';
    const semSinal = !task.agent_heartbeat_at || Date.now() - Date.parse(task.agent_heartbeat_at) > STALE_MS;
    if (a.paused || pausadoGeral) return { tom: 'pausado', task, atividade, detalhe: step, pct, indeterminada: false, legenda };
    if (/aguard/i.test(step)) return { tom: 'aguardando', task, atividade, detalhe: step, pct, indeterminada: false, legenda };
    if (semSinal && !ativo) return { tom: 'atencao', task, atividade, detalhe: `sem sinal ${haQuanto(task.agent_heartbeat_at) || 'há muito tempo'} · última etapa: ${step}`, pct, indeterminada: false, legenda };
    return { tom: 'trabalhando', task, atividade, detalhe: `${step} · ${haQuanto(task.agent_heartbeat_at)}`, pct, indeterminada: false, legenda };
  }
  if (a.paused || pausadoGeral) return { tom: 'pausado', atividade: 'Pausado', detalhe: 'não pega card novo', pct: 0, indeterminada: false, legenda: '' };
  if (ativo) return { tom: 'trabalhando', atividade: cap(a.status?.status || 'trabalhando'), detalhe: haQuanto(a.status!.updated_at), pct: 0, indeterminada: true, legenda: 'apoio a outro card' };
  return { tom: 'livre', atividade: 'Livre', detalhe: a.last_used_at ? `último sinal ${haQuanto(a.last_used_at)}` : 'sem sinal ainda', pct: 0, indeterminada: false, legenda: '' };
}

export function AgentsHud({ agents, artCurrent, pausedAll, fila, onOpen }: {
  agents: HudAgent[];
  artCurrent: (HudTask & { assigned_to: string })[];
  pausedAll: boolean;
  fila: RespostaFila | null;
  onOpen?: (agent: HudAgent) => void;
}) {
  const ordem: Record<Tom, number> = { atencao: 0, aguardando: 1, trabalhando: 2, pausado: 3, livre: 4 };
  const lidos = agents
    .map((a) => ({ a, l: ler(a, artCurrent.find((t) => t.assigned_to === a.user_id), pausedAll, fila) }))
    .sort((x, y) => ordem[x.l.tom] - ordem[y.l.tom] || String(x.a.name).localeCompare(String(y.a.name)));
  const conta = (t: Tom) => lidos.filter((x) => x.l.tom === t).length;

  return (
    <HudFrame>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] tracking-wider text-cyan-300/80">
              EQUIPE // AGENTES PULSE{' '}
              <span className="ml-1 inline-flex items-center gap-1 text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> ao vivo
              </span>
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Quem está fazendo o quê</h2>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className={`rounded-full border px-2.5 py-1 ${TOM.trabalhando.pill}`}>{conta('trabalhando')} trabalhando</span>
            <span className={`rounded-full border px-2.5 py-1 ${TOM.aguardando.pill}`}>{conta('aguardando')} aguardando</span>
            <span className={`rounded-full border px-2.5 py-1 ${TOM.atencao.pill}`}>{conta('atencao')} precisam de atenção</span>
            <span className={`rounded-full border px-2.5 py-1 ${TOM.livre.pill}`}>{conta('livre') + conta('pausado')} livres</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lidos.map(({ a, l }) => {
            const t = TOM[l.tom];
            const nome = a.name?.trim() || a.email || 'Agente';
            const funcoes = a.roles.split(',').map((r) => AGENT_ROLE_LABELS[r] || r).join(' · ');
            return (
              <button key={a.user_id} type="button" onClick={() => onOpen?.(a)}
                className={`group rounded-2xl border bg-[#0a121c]/90 p-4 text-left transition hover:border-cyan-300/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${t.card}`}>
                <div className="flex items-center gap-3">
                  <div className={`relative h-12 w-12 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-[#0a121c] ${t.anel} ${l.tom === 'trabalhando' ? 'rq-anel' : ''}`}>
                    {a.avatar_url
                      ? <img src={a.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                      : <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-400/10 text-base font-semibold text-cyan-100">{nome.slice(0, 2).toUpperCase()}</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-white">{nome.split(' ')[0]}</p>
                    <p className="truncate text-[11px] text-cyan-100/55">{funcoes}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] ${t.pill}`}>{t.rotulo}</span>
                </div>

                <p className="mt-3 truncate text-sm text-cyan-50" title={l.atividade}>{l.atividade}</p>
                <p className={`truncate text-[11.5px] ${l.tom === 'atencao' ? 'text-rose-200' : l.tom === 'aguardando' ? 'text-amber-100/90' : 'text-cyan-100/60'}`} title={l.detalhe}>{l.detalhe}</p>

                {(l.task || l.indeterminada) && (
                  <div className="mt-2.5">
                    <BarraViva pct={l.pct} indeterminada={l.indeterminada} cor={t.barra} />
                    {l.legenda && <p className="mt-1 font-mono text-[10.5px] text-cyan-300/60">{l.legenda}</p>}
                  </div>
                )}

                <div className="mt-3 flex gap-3 border-t border-cyan-300/10 pt-2 font-mono text-[10.5px] text-cyan-100/50">
                  <span><span className="text-cyan-100">{a.delivered_today}</span> hoje</span>
                  <span><span className="text-cyan-100">{a.delivered_week}</span> na semana</span>
                  <span><span className={a.alterations_week ? 'text-amber-200' : 'text-cyan-100'}>{a.alterations_week}</span> alterações</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </HudFrame>
  );
}
