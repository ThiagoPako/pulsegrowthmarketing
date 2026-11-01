import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CalendarDays, Loader2, PartyPopper, Sparkles, Store } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import ClientLogo from '@/components/ClientLogo';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/vpsDb';
import { dimensionsFromPreset } from '@/lib/designBrief';
import {
  artSuggestions, suggestionCardTitle, suggestionCopy, suggestionDueDate, suggestionFitsClient, type ArtSuggestion,
} from '@/lib/artSuggestions';

/**
 * Ísis, a social media da agência (01/11/2026): no Kanban de Design, sugere as artes que precisam ser feitas — avisos de
 * feriado e datas sazonais do nicho. Clicar numa sugestão abre os clientes (todos ou só os escolhidos); no feriado,
 * "Algum vai estar aberto?" troca o aviso de fechado para "estaremos abertos" só nos clientes marcados. Cria um card
 * por cliente e formato (feed e story) em Nova Tarefa, com copy, descrição e prazo 2 dias antes da data.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** cards de arte já existentes (para não sugerir de novo o que já virou card) */
  existing: { client_id: string | null; title: string }[];
}

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const quando = (n: number) => (n === 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias`);

export function pendingClientsFor(s: ArtSuggestion, clients: { id: string; niche?: string | null }[], existing: Props['existing']) {
  const titulo = suggestionCardTitle(s);
  const feitos = new Set(existing.filter((t) => t.title.startsWith(titulo)).map((t) => t.client_id));
  return clients.filter((c) => suggestionFitsClient(s, c.niche) && !feitos.has(c.id));
}

export default function IsisSuggestionsDialog({ open, onOpenChange, existing }: Props) {
  const { clients } = useApp();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const sugestoes = useMemo(() => artSuggestions(), []);
  const [atual, setAtual] = useState<ArtSuggestion | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [perguntarAbertos, setPerguntarAbertos] = useState(false);
  const [formatos, setFormatos] = useState<{ feed: boolean; story: boolean }>({ feed: true, story: true });
  const [salvando, setSalvando] = useState(false);

  const ativos = useMemo(() => clients.filter((c) => !!c.id).sort((a, b) => a.companyName.localeCompare(b.companyName)), [clients]);
  const titulo = atual ? suggestionCardTitle(atual) : '';
  const jaFeitos = useMemo(
    () => new Set(existing.filter((t) => titulo && t.title.startsWith(titulo)).map((t) => t.client_id)),
    [existing, titulo]
  );
  const candidatos = atual ? ativos.filter((c) => suggestionFitsClient(atual, c.niche)) : [];

  const escolher = (s: ArtSuggestion) => {
    setAtual(s);
    const t = suggestionCardTitle(s);
    const feitos = new Set(existing.filter((x) => x.title.startsWith(t)).map((x) => x.client_id));
    setMarcados(new Set(ativos.filter((c) => suggestionFitsClient(s, c.niche) && !feitos.has(c.id)).map((c) => c.id)));
    setAbertos(new Set());
    setPerguntarAbertos(false);
  };
  const voltar = () => setAtual(null);
  const alternar = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setter(n);
  };

  const criar = async () => {
    if (!atual) return;
    const ids = [...marcados].filter((id) => !jaFeitos.has(id));
    const fmts = (['feed', 'story'] as const).filter((k) => formatos[k]);
    if (!ids.length || !fmts.length) return;
    setSalvando(true);
    let criados = 0;
    try {
      for (const id of ids) {
        const aberto = atual.kind === 'feriado' && abertos.has(id);
        const copy = suggestionCopy(atual, { aberto });
        for (const k of fmts) {
          const dims = dimensionsFromPreset(k);
          const row = {
            client_id: id,
            title: fmts.length > 1 ? `${titulo} — ${k === 'feed' ? 'Feed' : 'Story'}` : titulo,
            format_type: k,
            dimensions: dims,
            copy_text: copy,
            description: [
              atual.kind === 'feriado' ? (aberto ? '🟢 Cliente vai ESTAR ABERTO no feriado.' : '🔴 Cliente vai estar FECHADO no feriado.') : `Data sazonal do nicho: ${atual.label}.`,
              atual.suggestion,
              'Sugestão da Ísis (social media). Na identidade do cliente; veja a pasta de referências de design do cliente (referência não é cópia).',
            ].join('\n'),
            priority: atual.daysUntil <= 3 ? 'urgente' : atual.daysUntil <= 7 ? 'alta' : 'media',
            due_date: suggestionDueDate(atual),
            created_by: user?.id || null,
            kanban_column: 'nova_tarefa',
            position: 0,
          };
          const { error } = await supabase.from('design_tasks').insert(row as any).select('id').single();
          if (error) throw new Error(error.message || 'Erro ao criar o card');
          criados++;
        }
      }
      try {
        await supabase.rpc('notify_role', {
          _role: 'designer', _title: 'Artes sugeridas pela Ísis', _message: `${criados} arte(s): ${atual.label}`, _type: 'design', _link: '/designer',
        });
      } catch { /* aviso não desfaz os cards */ }
      await queryClient.invalidateQueries({ queryKey: ['design-tasks'] });
      toast.success(`${criados} card(s) de arte criados: ${atual.label}`);
      setAtual(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar os cards');
    } finally {
      setSalvando(false);
    }
  };

  const selecionaveis = candidatos.filter((c) => !jaFeitos.has(c.id));
  const todosMarcados = selecionaveis.length > 0 && selecionaveis.every((c) => marcados.has(c.id));
  const totalCards = [...marcados].filter((id) => !jaFeitos.has(id)).length * ((formatos.feed ? 1 : 0) + (formatos.story ? 1 : 0));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!salvando) { onOpenChange(o); if (!o) setAtual(null); } }}>
      <DialogContent className="max-w-xl w-[calc(100vw-1rem)] max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6 [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {atual ? (
              <button type="button" onClick={voltar} className="rounded-md p-1 hover:bg-secondary" aria-label="Voltar"><ArrowLeft size={16} /></button>
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-400 text-white"><Sparkles size={14} /></span>
            )}
            {atual ? atual.label : 'Ísis · artes para fazer'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {atual
              ? `${dataBr(atual.date)} · ${quando(atual.daysUntil)} · escolha os clientes${atual.kind === 'feriado' ? ' e quem vai estar aberto' : ''}.`
              : 'Feriados (aviso de funcionamento) e datas do nicho de cada cliente. Toque numa sugestão para escolher os clientes.'}
          </DialogDescription>
        </DialogHeader>

        {!atual ? (
          <div className="space-y-2">
            {sugestoes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma data nos próximos dias.</p>}
            {sugestoes.map((s) => {
              const pendentes = pendingClientsFor(s, ativos, existing).length;
              return (
                <button key={s.id} type="button" onClick={() => escolher(s)} disabled={pendentes === 0}
                  className="w-full rounded-xl border border-border p-3 text-left transition hover:border-primary/40 hover:bg-secondary/40 disabled:opacity-50 disabled:hover:bg-transparent">
                  <div className="flex items-center gap-2">
                    {s.kind === 'feriado' ? <CalendarDays size={15} className="text-red-500 shrink-0" /> : <PartyPopper size={15} className="text-fuchsia-500 shrink-0" />}
                    <span className="font-semibold text-sm">{s.label}</span>
                    <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.daysUntil <= 3 ? 'bg-red-500/15 text-red-600' : s.daysUntil <= 7 ? 'bg-amber-500/15 text-amber-700' : 'bg-secondary text-muted-foreground'}`}>
                      {dataBr(s.date)} · {quando(s.daysUntil)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{s.suggestion}</p>
                  <p className="mt-1 text-[11px] font-medium text-foreground/70">
                    {s.kind === 'feriado' ? 'Aviso de feriado' : 'Data do nicho'} · {pendentes === 0 ? 'todos os clientes já têm card' : `${pendentes} cliente(s) sem card`}
                  </p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs"
                onClick={() => setMarcados(todosMarcados ? new Set() : new Set(selecionaveis.map((c) => c.id)))}>
                {todosMarcados ? 'Desmarcar todos' : 'Selecionar todos'}
              </Button>
              {atual.kind === 'feriado' && (
                <Button type="button" variant={perguntarAbertos ? 'default' : 'outline'} size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setPerguntarAbertos((v) => !v)}>
                  <Store size={13} /> Algum desses vai estar aberto?
                </Button>
              )}
              <div className="ml-auto flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5"><Checkbox checked={formatos.feed} onCheckedChange={(v) => setFormatos((f) => ({ ...f, feed: !!v }))} /> Feed</label>
                <label className="flex items-center gap-1.5"><Checkbox checked={formatos.story} onCheckedChange={(v) => setFormatos((f) => ({ ...f, story: !!v }))} /> Story</label>
              </div>
            </div>
            {perguntarAbertos && (
              <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-800 dark:text-emerald-300">
                Ligue "Aberto" nos clientes que vão funcionar: o aviso deles vira "estaremos abertos". Os demais continuam com o aviso de fechado.
              </p>
            )}
            <div className="divide-y divide-border rounded-xl border border-border">
              {candidatos.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum cliente do nicho desta data.</p>}
              {candidatos.map((c) => {
                const feito = jaFeitos.has(c.id);
                return (
                  <div key={c.id} className={`flex items-center gap-2.5 px-3 py-2 ${feito ? 'opacity-50' : ''}`}>
                    <Checkbox checked={feito || marcados.has(c.id)} disabled={feito} onCheckedChange={() => alternar(marcados, c.id, setMarcados)} aria-label={c.companyName} />
                    <ClientLogo client={{ companyName: c.companyName, color: c.color, logoUrl: c.logoUrl }} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm">{c.companyName}</span>
                    {feito ? (
                      <span className="text-[10px] text-muted-foreground">já tem card</span>
                    ) : perguntarAbertos && marcados.has(c.id) ? (
                      <label className="flex items-center gap-1.5 text-[11px]">
                        <Switch checked={abertos.has(c.id)} onCheckedChange={() => alternar(abertos, c.id, setAbertos)} aria-label={`${c.companyName} aberto`} />
                        <span className={abertos.has(c.id) ? 'font-semibold text-emerald-600' : 'text-muted-foreground'}>{abertos.has(c.id) ? 'Aberto' : 'Fechado'}</span>
                      </label>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={voltar} disabled={salvando}>Voltar</Button>
              <Button type="button" size="sm" onClick={criar} disabled={salvando || totalCards === 0} className="gap-1.5">
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Criar {totalCards} card(s)
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
