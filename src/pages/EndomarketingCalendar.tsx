import { useState, useMemo, useCallback } from 'react';
import { useEndoTasks, useEndoContracts, getTaskTypeLabel } from '@/hooks/useEndomarketing';
import EndoCapacityWidget from '@/components/endomarketing/EndoCapacityWidget';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, ChevronRight, CalendarDays, Columns3 } from 'lucide-react';
import { format, addMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';

const STATUS_COLORS: Record<string, string> = {
  pendente: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  concluida: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  cancelada: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function EndomarketingCalendar() {
  const { tasks, loading: loadingT } = useEndoTasks();
  const { contracts, loading: loadingC } = useEndoContracts();
  const [monthOffset, setMonthOffset] = useState(0);

  const currentMonth = addMonths(new Date(), monthOffset);
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    let d = calendarStart;
    while (d <= calendarEnd) { days.push(d); d = addDays(d, 1); }
    return days;
  }, [calendarStart, calendarEnd]);

  const getTasksForDay = useCallback((date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return tasks.filter(t => t.date === dateStr).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  }, [tasks]);

  // Kanban: current week
  const kanbanWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const kanbanDays = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => addDays(kanbanWeekStart, i));
  }, [kanbanWeekStart]);

  const today = new Date();

  if (loadingT || loadingC) return <div className="flex items-center justify-center p-12"><p className="text-muted-foreground">Carregando...</p></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Calendário Endomarketing</h1>
        <p className="text-sm text-muted-foreground">Visualização de tarefas e capacidade de entrega</p>
      </div>

      {/* Capacity Widget */}
      <EndoCapacityWidget contracts={contracts} tasks={tasks} />

      {/* Calendar/Kanban */}
      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar"><CalendarDays size={14} className="mr-1" /> Calendário</TabsTrigger>
          <TabsTrigger value="kanban"><Columns3 size={14} className="mr-1" /> Semana</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <Card className="glass-card p-4">
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={() => setMonthOffset(o => o - 1)}>
                <ChevronLeft size={18} />
              </Button>
              <h2 className="text-lg font-semibold capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
              </h2>
              <Button variant="ghost" size="icon" onClick={() => setMonthOffset(o => o + 1)}>
                <ChevronRight size={18} />
              </Button>
            </div>

            {/* Header */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map(day => {
                const dayTasks = getTasksForDay(day);
                const isToday = isSameDay(day, today);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isWeekend = getDay(day) === 0 || getDay(day) === 6;

                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-[80px] rounded-lg border p-1 transition-colors ${
                      isToday ? 'border-primary bg-primary/5' :
                      !isCurrentMonth ? 'opacity-40 border-transparent' :
                      isWeekend ? 'border-border/50 bg-muted/20' :
                      'border-border hover:bg-muted/30'
                    }`}
                  >
                    <div className={`text-xs font-medium mb-0.5 ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-0.5">
                      {dayTasks.slice(0, 3).map(t => (
                        <motion.div
                          key={t.id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className={`text-[9px] leading-tight px-1 py-0.5 rounded truncate cursor-default ${
                            STATUS_COLORS[t.status] || 'bg-muted text-muted-foreground'
                          }`}
                          title={`${t.clients?.company_name} — ${getTaskTypeLabel(t.task_type)} (${t.duration_minutes}min)`}
                        >
                          <span className="font-medium">{t.clients?.company_name?.slice(0, 8)}</span>
                          {' '}
                          <span className="opacity-70">{getTaskTypeLabel(t.task_type).slice(0, 4)}</span>
                        </motion.div>
                      ))}
                      {dayTasks.length > 3 && (
                        <div className="text-[9px] text-muted-foreground text-center">+{dayTasks.length - 3}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="kanban" className="mt-4">
          <div className="grid grid-cols-5 gap-3">
            {kanbanDays.map(day => {
              const dayTasks = getTasksForDay(day);
              const isToday = isSameDay(day, today);
              const totalMinutes = dayTasks.filter(t => t.status !== 'cancelada').reduce((s, t) => s + t.duration_minutes, 0);
              const totalHours = totalMinutes / 60;
              const occupancy = (totalHours / 4) * 100;

              return (
                <div key={day.toISOString()} className="space-y-2">
                  <div className={`text-center rounded-lg p-2 ${isToday ? 'bg-primary/10 border border-primary' : 'bg-muted/30 border border-border'}`}>
                    <p className={`text-xs font-semibold capitalize ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                      {format(day, 'EEE', { locale: ptBR })}
                    </p>
                    <p className="text-lg font-bold">{format(day, 'dd')}</p>
                    <p className="text-[10px] text-muted-foreground">{totalHours.toFixed(1)}h / 4h</p>
                    <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          occupancy >= 95 ? 'bg-red-500' : occupancy >= 75 ? 'bg-yellow-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(occupancy, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    {dayTasks.map(t => (
                      <motion.div
                        key={t.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-lg border border-border bg-card p-2.5 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className="w-1.5 h-full min-h-[32px] rounded-full shrink-0 mt-0.5"
                            style={{ backgroundColor: `hsl(${t.clients?.color || '292 84% 61%'})` }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{t.clients?.company_name}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <Badge variant="outline" className="text-[9px] px-1 py-0">{getTaskTypeLabel(t.task_type)}</Badge>
                              <span className="text-[9px] text-muted-foreground">{t.duration_minutes}min</span>
                            </div>
                            {t.start_time && (
                              <p className="text-[9px] text-muted-foreground mt-0.5">🕐 {t.start_time}</p>
                            )}
                          </div>
                        </div>
                        <div className="mt-1.5">
                          <Badge className={`text-[9px] px-1 py-0 ${STATUS_COLORS[t.status] || ''}`}>
                            {t.status === 'concluida' ? '✅' : t.status === 'cancelada' ? '❌' : '⏳'} {t.status}
                          </Badge>
                        </div>
                      </motion.div>
                    ))}
                    {dayTasks.length === 0 && (
                      <p className="text-[10px] text-muted-foreground text-center py-4">Sem tarefas</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
