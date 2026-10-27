import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import {
  AlertTriangle, BellRing, CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Facebook, Hourglass,
  Instagram, LayoutGrid, Link2, Loader2, RefreshCw, Repeat2, Rows3, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import ClientLogo from '@/components/ClientLogo';
import ConfirmActionDialog, { type ConfirmAction } from '@/components/kanban/ConfirmActionDialog';
import SchedulingCalendar from '@/components/scheduling/SchedulingCalendar';
import UnscheduledPanel from '@/components/scheduling/UnscheduledPanel';
import ScheduleDialog from '@/components/scheduling/ScheduleDialog';
import ClientStoryLinkDialog from '@/components/scheduling/ClientStoryLinkDialog';
import UnscheduledStrip from '@/components/scheduling/UnscheduledStrip';
import SchedulingClientPicker, { AccountIcons } from '@/components/scheduling/SchedulingClientPicker';
import { TYPE_STYLES, clientLogoProps } from '@/components/scheduling/schedulingStyles';
import { useCity } from '@/contexts/CityContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  addDaysKey, addMonthsKey, canDrag, formatDayLabel, formatMonthLabel, monthCounts, monthGridKeys, todayKey,
  weekKeys, withMovedDate, type SchedulingItem, type SchedulingMaterials, type SchedulingType,
} from '@/lib/postingSchedule';
import {
  fetchSchedulingClients, fetchSchedulingMaterials, rescheduleMaterial, type SchedulingApiError,
} from '@/services/schedulingApi';
import { lastUsedTime } from '@/lib/storySeries';

type View = 'month' | 'week';

function Stat({ icon: Icon, label, value, tone }: { icon: typeof CalendarClock; label: string; value: number; tone: string }) {
  return (
    <div className="flex min-w-[118px] flex-1 items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
      <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', tone)}>
        <Icon size={16} aria-hidden="true" />
      </span>
      <div className="leading-tight">
        <div className="text-lg font-bold tabular-nums text-foreground">{value}</div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function weekLabel(anchor: string): string {
  const days = weekKeys(anchor);
  const [, m1, d1] = days[0].split('-');
  const [y2, m2, d2] = days[6].split('-');
  return `${d1}/${m1} – ${d2}/${m2}/${y2}`;
}

export default function Scheduling() {
  const { activeCity } = useCity();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const clientId = searchParams.get('cliente');
  const today = todayKey();
  const [view, setView] = useState<View>(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'week' : 'month'));
  const [anchor, setAnchor] = useState(today);
  const [selectedDay, setSelectedDay] = useState<string | null>(today);
  const [dialog, setDialog] = useState<{ item: SchedulingItem; presetDate?: string | null; presetTime?: string | null } | null>(null);
  const [linkDialog, setLinkDialog] = useState(false);
  // Material da lista: abre o agendamento com a hora padrão (a última usada)
  const pickMaterial = (item: SchedulingItem, day?: string) => setDialog({ item, presetDate: day || null, presetTime: lastUsedTime() });
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [mobileTab, setMobileTab] = useState<'calendario' | 'pendentes'>('calendario');
  const [clientSearch, setClientSearch] = useState('');

  const clientsQuery = useQuery({
    queryKey: ['scheduling-clients', activeCity],
    queryFn: fetchSchedulingClients,
    staleTime: 60_000,
  });
  const clients = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data]);
  const client = clients.find((c) => c.id === clientId) || null;

  // O mês inteiro (semanas completas) vem de uma vez: a semana mostrada está sempre dentro dele
  const monthKey = `${anchor.slice(0, 7)}-01`;
  const grid = useMemo(() => monthGridKeys(monthKey), [monthKey]);
  const range = { from: grid[0], to: grid[grid.length - 1] };
  const materialsKey = useMemo(
    () => ['scheduling-materials', clientId, range.from, range.to, activeCity] as const,
    [clientId, range.from, range.to, activeCity],
  );
  const materialsQuery = useQuery({
    queryKey: materialsKey,
    queryFn: () => fetchSchedulingMaterials(clientId as string, range.from, range.to),
    enabled: !!client,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const data = materialsQuery.data && materialsQuery.data.client.id === clientId ? materialsQuery.data : null;
  const scheduled = useMemo(() => data?.scheduled ?? [], [data]);
  const unscheduled = useMemo(() => data?.unscheduled ?? [], [data]);
  const counts = monthCounts(scheduled, monthKey, unscheduled.length);
  const legendTypes = useMemo(() => {
    const present = new Set<SchedulingType>([...scheduled, ...unscheduled].map((i) => i.type));
    return (Object.keys(TYPE_STYLES) as SchedulingType[]).filter((t) => present.has(t) || ['reels', 'story', 'carrossel', 'arte'].includes(t));
  }, [scheduled, unscheduled]);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['scheduling-materials', clientId] });
    queryClient.invalidateQueries({ queryKey: ['scheduling-clients'] });
  }, [queryClient, clientId]);

  const selectClient = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('cliente', id);
    setSearchParams(next, { replace: true });
    setDialog(null);
  };

  const step = (direction: 1 | -1) => {
    if (view === 'month') {
      const next = addMonthsKey(anchor, direction);
      setAnchor(next);
      setSelectedDay(today.slice(0, 7) === next.slice(0, 7) ? today : next);
    } else {
      setAnchor(addDaysKey(anchor, 7 * direction));
    }
  };
  const goToday = () => { setAnchor(today); setSelectedDay(today); };

  const move = async (item: SchedulingItem, day: string, allowPast: boolean) => {
    const previous = queryClient.getQueryData<SchedulingMaterials>(materialsKey);
    queryClient.setQueryData<SchedulingMaterials>(materialsKey, (old) => old && ({
      ...old,
      scheduled: old.scheduled.map((i) => (i.key === item.key ? withMovedDate(i, day) : i)),
    }));
    try {
      await rescheduleMaterial({ client_id: clientId as string, kind: item.kind, id: item.id, date: day, allow_past: allowPast || undefined });
      toast.success(`${formatDayLabel(day)} às ${item.when?.time}`);
    } catch (err) {
      queryClient.setQueryData(materialsKey, previous);
      const e = err as SchedulingApiError;
      if (e.code === 'time_required') setDialog({ item, presetDate: day });
      else toast.error(e.message || 'Não foi possível remarcar');
    } finally {
      refresh();
    }
  };

  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination || !destination.droppableId.startsWith('day:')) return;
    const day = destination.droppableId.slice(4);
    if (source.droppableId === 'unscheduled') {
      // Soltar um material num dia abre o agendamento (legenda, tipo e rede) com o dia e a hora padrão
      const item = unscheduled.find((i) => i.key === draggableId);
      if (item) pickMaterial(item, day);
      return;
    }
    if (source.droppableId === destination.droppableId) return;
    const item = scheduled.find((i) => i.key === draggableId);
    if (!item || !canDrag(item)) return;
    if (!item.when?.time) { setDialog({ item, presetDate: day }); return; }
    const moved = withMovedDate(item, day);
    const past = !!moved.when?.at && Date.parse(moved.when.at) < Date.now() - 60_000;
    if (past && item.mode === 'auto') { toast.error('O horário escolhido já passou. Escolha um horário futuro.'); return; }
    if (past) {
      setConfirm({
        title: 'Data no passado',
        description: `${item.title} · ${formatDayLabel(day)} às ${item.when.time}`,
        confirmLabel: 'Mover mesmo assim',
        onConfirm: () => move(item, day, true),
      });
      return;
    }
    void move(item, day, false);
  };

  const openItem = (item: SchedulingItem) => {
    if (item.ghost && item.kind !== 'post') {
      const material = unscheduled.find((u) => u.kind === item.kind && u.id === item.id);
      if (material) { setDialog({ item: material, presetDate: item.when?.date || null }); return; }
    }
    setDialog({ item });
  };

  const onSaved = (message: string) => {
    toast.success(message);
    setDialog(null);
    refresh();
  };

  // ── Sem cliente escolhido: grade de clientes ──
  const normalize = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const filteredClients = clients.filter((c) => !clientSearch.trim() || normalize(c.company_name).includes(normalize(clientSearch.trim())));

  const header = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="mr-auto flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-blue-600 text-primary-foreground shadow-lg shadow-primary/20">
          <CalendarClock size={20} />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Agendamentos</h1>
      </div>
      {clients.length > 0 && <SchedulingClientPicker clients={clients} value={client?.id || null} onChange={selectClient} />}
    </div>
  );

  if (!client) {
    return (
      <div className="space-y-4">
        {header}
        {clientsQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[72px] rounded-xl" />)}
          </div>
        ) : clientsQuery.error ? (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertTriangle size={16} /> {(clientsQuery.error as Error).message}
          </div>
        ) : (
          <>
            <div className="relative max-w-sm">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Buscar cliente" className="pl-8" aria-label="Buscar cliente" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredClients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectClient(c.id)}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ borderLeft: `4px solid hsl(${c.color || '220 10% 50%'})` }}
                >
                  <ClientLogo client={clientLogoProps(c)} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{c.company_name}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><CalendarClock size={11} className="text-blue-500" />{c.scheduled}</span>
                      <span className={cn('inline-flex items-center gap-1', c.pending > 0 && 'font-semibold text-amber-600 dark:text-amber-400')}>
                        <Hourglass size={11} />{c.pending}
                      </span>
                      <AccountIcons accounts={c.accounts} className="ml-auto" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  const accounts = data?.accounts ?? [];
  const calendar = (
    <div className="min-w-0 space-y-2">
      {materialsQuery.isLoading && !data ? (
        <Skeleton className="h-[560px] rounded-xl" />
      ) : materialsQuery.error && !data ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <span className="flex items-center gap-2"><AlertTriangle size={16} /> {(materialsQuery.error as Error).message}</span>
          <Button size="sm" variant="outline" onClick={() => materialsQuery.refetch()}>Tentar de novo</Button>
        </div>
      ) : (
        <SchedulingCalendar
          view={view}
          anchor={view === 'month' ? monthKey : anchor}
          today={today}
          items={scheduled}
          compact={isMobile}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          onItemClick={openItem}
          onShowWeek={(day) => { setAnchor(day); setView('week'); }}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {header}

      {/* Cliente, contadores e navegação */}
      <div className="space-y-3 rounded-2xl border border-border bg-gradient-to-r from-primary/5 via-card to-accent/10 p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto flex min-w-0 items-center gap-3">
            <ClientLogo client={clientLogoProps(client)} size="lg" />
            <div className="min-w-0">
              <div className="truncate text-lg font-bold text-foreground">{client.company_name}</div>
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {accounts.length === 0 ? (
                  <span className="rounded-full border border-border px-2 py-px text-[10px] text-muted-foreground">Manual</span>
                ) : accounts.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-px text-[10px] text-muted-foreground">
                    {a.platform === 'instagram' ? <Instagram size={10} /> : <Facebook size={10} />}
                    {a.username || a.account_name}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setLinkDialog(true)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-px text-[10px] font-semibold transition-colors',
                    data?.story_link?.saved
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300'
                      : 'border-dashed border-emerald-500/50 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300',
                  )}
                >
                  <Link2 size={10} /> Link do story
                </button>
              </div>
            </div>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Stat icon={CalendarClock} label="Agendados" value={counts.scheduled} tone="bg-blue-500/10 text-blue-600 dark:text-blue-400" />
            <Stat icon={CheckCircle2} label="Publicados" value={counts.published} tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" />
            <Stat icon={Hourglass} label="Não agendados" value={counts.unscheduled} tone="bg-amber-500/10 text-amber-600 dark:text-amber-400" />
            {counts.failed > 0 && <Stat icon={AlertTriangle} label="Com erro" value={counts.failed} tone="bg-destructive/10 text-destructive" />}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => step(-1)} aria-label="Anterior">
              <ChevronLeft size={16} />
            </Button>
            <h2 className="min-w-[150px] text-center text-base font-bold text-foreground sm:min-w-[190px]">
              {view === 'month' ? formatMonthLabel(monthKey) : weekLabel(anchor)}
            </h2>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => step(1)} aria-label="Próximo">
              <ChevronRight size={16} />
            </Button>
          </div>
          <Button variant="outline" size="sm" className="h-8 rounded-full" onClick={goToday}>Hoje</Button>
          <div className="flex rounded-full border border-border bg-card p-0.5" role="radiogroup" aria-label="Visão">
            {([
              { value: 'month', label: 'Mês', icon: LayoutGrid },
              { value: 'week', label: 'Semana', icon: Rows3 },
            ] as const).map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={view === o.value}
                onClick={() => setView(o.value)}
                className={cn(
                  'flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  view === o.value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <o.icon size={12} /> {o.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={refresh} aria-label="Atualizar">
            {materialsQuery.isFetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </Button>
          <div className="ml-auto hidden flex-wrap items-center gap-2 md:flex">
            {legendTypes.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className={cn('h-2 w-2 rounded-full', TYPE_STYLES[t].dot)} /> {TYPE_STYLES[t].label}
              </span>
            ))}
            {scheduled.some((i) => i.post?.story_mode === 'lembrete') && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <BellRing size={11} className="text-amber-500" /> Lembrete
              </span>
            )}
            {scheduled.some((i) => i.series) && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Repeat2 size={11} className="text-pink-500" /> Repetição
              </span>
            )}
          </div>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        {isMobile ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 rounded-xl border border-border bg-card p-1" role="tablist">
              {([
                { value: 'calendario', label: 'Calendário', icon: CalendarDays },
                { value: 'pendentes', label: `Não agendados (${unscheduled.length})`, icon: Hourglass },
              ] as const).map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={mobileTab === t.value}
                  onClick={() => setMobileTab(t.value)}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors',
                    mobileTab === t.value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  <t.icon size={13} /> {t.label}
                </button>
              ))}
            </div>
            {mobileTab === 'calendario' ? (
              <>
                {/* toque longo num material e arraste até o dia */}
                <UnscheduledStrip items={unscheduled} onPick={(item) => pickMaterial(item)} />
                {calendar}
              </>
            ) : (
              <UnscheduledPanel items={unscheduled} onPick={(item) => pickMaterial(item)} draggable={false} />
            )}
          </div>
        ) : (
          // lista dos não agendados à esquerda: arraste um material até o dia do calendário
          <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
            <UnscheduledPanel
              items={unscheduled}
              onPick={(item) => pickMaterial(item)}
              draggable
              className="self-start"
            />
            {calendar}
          </div>
        )}
      </DragDropContext>

      {dialog && (
        <ScheduleDialog
          item={dialog.item}
          presetDate={dialog.presetDate}
          presetTime={dialog.presetTime}
          clientId={client.id}
          accounts={accounts}
          storyLink={data?.story_link}
          onEditClientLink={() => setLinkDialog(true)}
          onClose={() => setDialog(null)}
          onSaved={onSaved}
        />
      )}
      {linkDialog && (
        <ClientStoryLinkDialog
          clientId={client.id}
          clientName={client.company_name}
          onClose={() => setLinkDialog(false)}
          onSaved={refresh}
        />
      )}
      <ConfirmActionDialog action={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
