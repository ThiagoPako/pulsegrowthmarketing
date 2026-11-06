// Fila de render do PC, ao vivo, no painel de Agentes (pedido do Thiago, 06/11/2026: "um painel no sistema para
// acompanhar, olhar a fila de renderização e poder trocar a fila apenas arrastando… lembre o da Ísis, siga aquele
// padrão"). Mesmo HUD da Ísis: fundo #05090f, grade e varredura ciano, cantoneiras, rótulos em mono.
// Dados: GET /api/agents/render-queue (a fila do PC publica a cada 4 s); arrastar → PUT /api/agents/render-queue/order.
import { useCallback, useEffect, useRef, useState } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import { Film, GripVertical, HardDrive, Loader2, AlertTriangle, CheckCircle2, Clock, Flame, Wrench } from 'lucide-react';
import { vpsAuthedFetch } from '@/lib/vpsDb';

interface Pedido {
  id: string;
  tipo: 'render' | 'transcrever';
  card: string | null;
  editor: string;
  prioridade: 'urgente' | 'alteracao' | 'normal';
  estado: string;
  etapa: string | null;
  progresso: number | null;
  cliente: string | null;
  nome: string;
  criado: string;
  inicio: string | null;
  renderInicio: string | null;
  fim: string | null;
  erro: string | null;
}
interface Estado {
  atualizado: string;
  maquina: string;
  rodando: Pedido | null;
  esperando: Pedido[];
  recentes: Pedido[];
  disco?: { F: number | null; C: number | null };
}
interface Resposta { state: Estado | null; updated_at: string | null; online: boolean; ordem_pendente: string[] | null }

const PRIORIDADE: Record<Pedido['prioridade'], { rotulo: string; cls: string; Icone: typeof Flame }> = {
  urgente: { rotulo: 'urgente', cls: 'border-rose-400/40 bg-rose-500/10 text-rose-200', Icone: Flame },
  alteracao: { rotulo: 'alteração', cls: 'border-amber-300/40 bg-amber-400/10 text-amber-100', Icone: Wrench },
  normal: { rotulo: 'normal', cls: 'border-cyan-300/30 bg-cyan-400/10 text-cyan-100', Icone: Clock },
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const cliente = (p: Pedido) => (p.cliente ? p.cliente.replace(/-/g, ' ') : 'sem cliente');

function restante(p: Pedido): string | null {
  if (!p.renderInicio || !p.progresso || p.progresso < 3 || p.progresso >= 100) return null;
  const passou = Date.now() - Date.parse(p.renderInicio);
  const falta = (passou / p.progresso) * (100 - p.progresso);
  const min = Math.round(falta / 60000);
  return min < 1 ? 'menos de 1 min' : `~${min} min`;
}
function haQuanto(iso: string | null): string {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `há ${s} s`;
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  return `há ${Math.round(s / 3600)} h`;
}

export function RenderQueueHud() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lista, setLista] = useState<Pedido[]>([]);
  const [salvando, setSalvando] = useState(false);
  const arrastando = useRef(false);
  const travadoAte = useRef(0);

  const carregar = useCallback(async () => {
    try {
      const r = await vpsAuthedFetch('/api/agents/render-queue');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setDados(j);
      setErro(null);
      // enquanto arrasta ou logo depois de soltar (a fila do PC ainda não aplicou), mantém a ordem da tela
      if (!arrastando.current && Date.now() > travadoAte.current) setLista(j.state?.esperando || []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void carregar();
    const t = setInterval(() => { if (!document.hidden) void carregar(); }, 3000);
    return () => clearInterval(t);
  }, [carregar]);

  const soltar = async (res: DropResult) => {
    arrastando.current = false;
    if (!res.destination || res.destination.index === res.source.index) return;
    const nova = [...lista];
    const [m] = nova.splice(res.source.index, 1);
    nova.splice(res.destination.index, 0, m);
    setLista(nova);
    travadoAte.current = Date.now() + 12000;
    setSalvando(true);
    try {
      const r = await vpsAuthedFetch('/api/agents/render-queue/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: nova.map((p) => p.id) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      toast.success('Ordem enviada ao PC. A fila troca em alguns segundos.');
    } catch (e) {
      travadoAte.current = 0;
      toast.error(`Não foi possível trocar a ordem: ${e instanceof Error ? e.message : e}`);
      void carregar();
    } finally {
      setSalvando(false);
    }
  };

  const st = dados?.state;
  const rodando = st?.rodando;
  const online = dados?.online;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-[#05090f] p-5 text-cyan-50 shadow-[0_0_40px_-12px_rgba(94,234,255,0.35)]">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{ backgroundImage: 'linear-gradient(rgba(94,234,255,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(94,234,255,.25) 1px, transparent 1px)', backgroundSize: '22px 22px', maskImage: 'radial-gradient(ellipse at 20% 30%, black 30%, transparent 75%)' }} />
      <div aria-hidden className="rq-scan pointer-events-none absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-cyan-300/[0.06] to-transparent" />
      {['left-2 top-2 border-l border-t', 'right-2 top-2 border-r border-t', 'left-2 bottom-2 border-l border-b', 'right-2 bottom-2 border-r border-b'].map((c) => (
        <span key={c} aria-hidden className={`pointer-events-none absolute h-4 w-4 border-cyan-300/60 ${c}`} />
      ))}
      <style>{`
        @keyframes rq-scan { 0% { top: -4rem } 100% { top: 100% } }
        .rq-scan { animation: rq-scan 6s linear infinite }
        @keyframes rq-brilho { 0% { transform: translateX(-100%) } 100% { transform: translateX(250%) } }
        .rq-brilho { animation: rq-brilho 1.8s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .rq-scan, .rq-brilho { animation: none; display: none } }
      `}</style>

      <div className="relative space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-[11px] tracking-wider text-cyan-300/80">
              FILA DE RENDER // {st?.maquina?.toUpperCase() || 'PC'}{' '}
              <span className={`ml-1 inline-flex items-center gap-1 ${online ? 'text-emerald-300' : 'text-rose-300'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                {dados ? (online ? 'ao vivo' : `sem sinal ${haQuanto(dados.updated_at)}`) : 'conectando'}
              </span>
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Render no PC</h2>
          </div>
          {st?.disco && (
            <div className="flex gap-2 font-mono text-[11px]">
              {(['F', 'C'] as const).map((d) => {
                const gb = st.disco?.[d];
                if (gb == null) return null;
                const baixo = gb < 15;
                return (
                  <span key={d} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${baixo ? 'border-rose-400/50 text-rose-200' : 'border-cyan-300/25 text-cyan-100/80'}`}>
                    <HardDrive size={12} /> {d}: {gb.toLocaleString('pt-BR')} GB
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {erro && !dados && (
          <p className="flex items-center gap-2 text-sm text-rose-200"><AlertTriangle size={14} /> {erro}</p>
        )}

        {/* o que está rodando agora */}
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.04] p-4">
          {rodando ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-cyan-300/70">{rodando.tipo === 'render' ? `RENDERIZANDO · ${(rodando.etapa || '').toUpperCase()}` : 'TRANSCREVENDO'}</p>
                  <p className="mt-1 truncate text-base font-medium text-white">{cap(cliente(rodando))} · {rodando.nome}</p>
                  <p className="text-xs text-cyan-100/60">{cap(rodando.editor)} · começou {haQuanto(rodando.inicio)}</p>
                </div>
                <span className="font-mono text-3xl font-semibold tabular-nums text-cyan-200">
                  {rodando.tipo === 'render' && rodando.progresso != null ? `${rodando.progresso}%` : <Loader2 className="animate-spin" size={26} />}
                </span>
              </div>
              <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-cyan-300/10">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300 transition-[width] duration-700"
                  style={{ width: `${rodando.tipo === 'render' ? Math.max(2, rodando.progresso ?? 0) : 100}%`, opacity: rodando.tipo === 'render' ? 1 : 0.35 }} />
                <div aria-hidden className="rq-brilho absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
              </div>
              {restante(rodando) && <p className="mt-1.5 text-right font-mono text-[11px] text-cyan-100/60">faltam {restante(rodando)}</p>}
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-cyan-100/70"><CheckCircle2 size={16} className="text-emerald-300" /> Nada renderizando agora.</p>
          )}
        </div>

        {/* esperando: arrastar troca a ordem */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mono text-[11px] tracking-wider text-cyan-300/80">NA FILA · {lista.length}</p>
            <p className="text-[11px] text-cyan-100/50">{salvando ? 'enviando a ordem…' : lista.length > 1 ? 'arraste para mudar a ordem' : ''}</p>
          </div>
          {lista.length === 0 ? (
            <p className="text-sm text-cyan-100/50">Ninguém esperando.</p>
          ) : (
            <DragDropContext onDragStart={() => { arrastando.current = true; }} onDragEnd={soltar}>
              <Droppable droppableId="fila">
                {(prov) => (
                  <ol ref={prov.innerRef} {...prov.droppableProps} className="space-y-2">
                    {lista.map((p, i) => {
                      const pr = PRIORIDADE[p.prioridade] || PRIORIDADE.normal;
                      return (
                        <Draggable key={p.id} draggableId={p.id} index={i}>
                          {(d, snap) => (
                            <li ref={d.innerRef} {...d.draggableProps} {...d.dragHandleProps}
                              className={`flex items-center gap-3 rounded-xl border bg-[#0a121c] px-3 py-2.5 ${snap.isDragging ? 'border-cyan-300/70 shadow-[0_0_24px_-6px_rgba(94,234,255,0.6)]' : 'border-cyan-300/15'}`}>
                              <GripVertical size={16} className="shrink-0 text-cyan-300/50" />
                              <span className="w-5 shrink-0 font-mono text-xs text-cyan-300/70">{i + 1}</span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-white">{cap(cliente(p))} · {p.nome}</p>
                                <p className="text-[11px] text-cyan-100/55">{cap(p.editor)} · {p.tipo === 'render' ? 'render' : 'transcrição'} · pediu {haQuanto(p.criado)}</p>
                              </div>
                              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${pr.cls}`}>
                                <pr.Icone size={11} /> {pr.rotulo}
                              </span>
                            </li>
                          )}
                        </Draggable>
                      );
                    })}
                    {prov.placeholder}
                  </ol>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>

        {/* últimos */}
        {!!st?.recentes?.length && (
          <div>
            <p className="mb-2 font-mono text-[11px] tracking-wider text-cyan-300/80">ÚLTIMOS</p>
            <ul className="space-y-1.5">
              {st.recentes.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-start gap-2 text-xs">
                  {p.estado === 'feito'
                    ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-300" />
                    : <AlertTriangle size={14} className="mt-0.5 shrink-0 text-rose-300" />}
                  <span className="min-w-0 flex-1">
                    <span className="text-cyan-50">{cap(cliente(p))} · {p.nome}</span>
                    <span className="text-cyan-100/50"> · {cap(p.editor)} · {haQuanto(p.fim)}</span>
                    {p.erro && <span className="block truncate text-rose-200/80" title={p.erro}>{p.erro}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="flex items-center gap-1.5 font-mono text-[10px] text-cyan-300/40"><Film size={11} /> atualiza a cada 3 s</p>
      </div>
    </section>
  );
}
