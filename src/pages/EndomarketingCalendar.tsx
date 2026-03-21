import { useState, useMemo, useCallback } from 'react';
import { useEndoTasks, useEndoContracts, getTaskTypeLabel } from '@/hooks/useEndomarketing';
import EndoCapacityWidget from '@/components/endomarketing/EndoCapacityWidget';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, ChevronRight, CalendarDays, Columns3, Rocket, Check, Play } from 'lucide-react';
import { format, addMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';

const STATUS_COLORS: Record<string, string> = {
  pendente: 'bg-warning/15 text-warning border-warning/30',
  concluida: 'bg-success/15 text-success border-success/30',
  cancelada: 'bg-destructive/15 text-destructive border-destructive/30',
};

export default function EndomarketingCalendar() {
  const { tasks, loading: loadingT } = useEndoTasks();
  const { contracts, loading: loadingC } = useEndoContracts();
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

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

  const kanbanWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const kanbanDays = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => addDays(kanbanWeekStart, i));
  }, [kanbanWeekStart]);

  const today = new Date();
  const selectedDayTasks = selectedDay ? getTasksForDay(selectedDay) : [];

  if (loadingT || loadingC) return (
    <div className="flex items-center justify-center p-12">
      <motion.div animate={{ y: [0, -10, 0], rotate: [0, -15, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
        <Rocket size={32} className="text-primary -rotate-45" />
      </motion.div>
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6 px-1 sm:px-0">
      <div className="flex items-center gap-3">
        <motion.div
          animate={{ y: [0, -5, 0], rotate: [0, -10, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          className="relative"
        >
          <Rocket size={24} className="text-primary -rotate-45" />
          <motion.div
            animate={{ opacity: [0.5, 1, 0.3], scale: [0.8, 1.2, 0.6] }}
            transition={{ duration: 0.5, repeat: Infinity }}
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-3 rounded-full bg-gradient-to-t from-warning via-primary to-transparent blur-[2px] rotate-45"
          />
        </motion.div>
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold">Calendário Endomarketing</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Visualização de tarefas e capacidade</p>
        </div>
      </div>

      <EndoCapacityWidget contracts={contracts} tasks={tasks} />

      <Tabs defaultValue="calendar">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="calendar" className="flex-1 sm:flex-none gap-1">
            <CalendarDays size={14} /> Calendário
          </TabsTrigger>
          <TabsTrigger value="kanban" className="flex-1 sm:flex-none gap-1">
            <Columns3 size={14} /> Semana
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-3 sm:mt-4">
          <Card className="glass-card p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <Button variant="ghost" size="icon" onClick={() => setMonthOffset(o => o - 1)}>
                <ChevronLeft size={18} />
              </Button>
              <h2 className="text-sm sm:text-lg font-semibold capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
              </h2>
              <Button variant="ghost" size="icon" onClick={() => setMonthOffset(o => o + 1)}>
                <ChevronRight size={18} />
              </Button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-0.5 sm:mb-1">
              {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => (
                <div key={`${d}-${i}`} className="text-center text-[10px] sm:text-xs font-medium text-muted-foreground py-1">
                  <span className="sm:hidden">{d}</span>
                  <span className="hidden sm:inline">{['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][i]}</span>
                </div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
              {calendarDays.map(day => {
                const dayTasks = getTasksForDay(day);
                const isToday = isSameDay(day, today);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isWeekend = getDay(day) === 0 || getDay(day) === 6;
                const isSelected = selectedDay && isSameDay(day, selectedDay);
                const hasTasks = dayTasks.length > 0;
                const doneCount = dayTasks.filter(t => t.status === 'concluida').length;
                const pendingCount = dayTasks.filter(t => t.status === 'pendente').length;

                return (
                  <motion.div
                    key={day.toISOString()}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    className={`min-h-[48px] sm:min-h-[80px] rounded-lg border-2 p-1 transition-all cursor-pointer ${
                      isSelected ? 'border-primary bg-primary/10 ring-1 ring-primary/30' :
                      isToday ? 'border-primary/50 bg-primary/5' :
                      !isCurrentMonth ? 'opacity-30 border-transparent' :
                      isWeekend ? 'border-border/50 bg-muted/20' :
                      'border-border hover:bg-muted/30 hover:border-primary/20'
                    }`}
                  >
                    <div className={`text-[10px] sm:text-xs font-medium ${isToday ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                      {format(day, 'd')}
                    </div>
                    {/* Mobile: dots only */}
                    <div className="flex gap-0.5 mt-0.5 flex-wrap sm:hidden">
                      {dayTasks.slice(0, 4).map(t => (
                        <motion.div
                          key={t.id}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className={`w-1.5 h-1.5 rounded-full ${
                            t.status === 'concluida' ? 'bg-success' : t.status === 'cancelada' ? 'bg-destructive' : 'bg-warning'
                          }`}
                        />
                      ))}
                      {dayTasks.length > 4 && <span className="text-[8px] text-muted-foreground">+{dayTasks.length - 4}</span>}
                    </div>
                    {/* Desktop: task pills */}
                    <div className="hidden sm:block space-y-0.5 mt-0.5">
                      {dayTasks.slice(0, 3).map(t => (
                        <motion.div
                          key={t.id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className={`text-[9px] leading-tight px-1 py-0.5 rounded truncate border ${
                            STATUS_COLORS[t.status] || 'bg-muted text-muted-foreground border-border'
                          }`}
                          title={`${t.clients?.company_name} — ${getTaskTypeLabel(t.task_type)} (${t.duration_minutes}min)`}
                        >
                          <span className="font-medium">{t.clients?.company_name?.slice(0, 8)}</span>
                        </motion.div>
                      ))}
                      {dayTasks.length > 3 && (
                        <div className="text-[9px] text-muted-foreground text-center">+{dayTasks.length - 3}</div>
                      )}
                    </div>
                    {/* Today rocket indicator */}
                    {isToday && hasTasks && (
                      <motion.div
                        animate={{ y: [0, -2, 0] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="hidden sm:block mt-0.5"
                      >
                        <Rocket size={8} className="text-primary -rotate-45 mx-auto" />
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </Card>

          {/* Day detail panel */}
          <AnimatePresence>
            {selectedDay && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3"
              >
                <Card className="glass-card p-3 sm:p-4 border-2 border-primary/20">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}>
                        <Rocket size={14} className="text-primary -rotate-45" />
                      </motion.div>
                      <h3 className="text-sm font-semibold capitalize">
                        {format(selectedDay, "EEEE, d 'de' MMMM", { locale: ptBR })}
                      </h3>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedDay(null)} className="text-xs">Fechar</Button>
                  </div>
                  {selectedDayTasks.length === 0 ? (
                    <div className="text-center py-4">
                      <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 3, repeat: Infinity }}>
                        <Rocket size={20} className="text-muted-foreground/30 -rotate-45 mx-auto" />
                      </motion.div>
                      <p className="text-xs text-muted-foreground mt-2">Sem tarefas neste dia</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedDayTasks.map((t, i) => (
                        <motion.div
                          key={t.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex items-center justify-between p-2.5 rounded-xl border-2 border-border bg-muted/20"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-1.5 h-8 rounded-full shrink-0" style={{ backgroundColor: `hsl(${t.clients?.color || '292 84% 61%'})` }} />
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{t.clients?.company_name}</p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <Badge variant="outline" className="text-[9px] px-1">{getTaskTypeLabel(t.task_type)}</Badge>
                                <span className="text-[9px] text-muted-foreground">{t.duration_minutes}min</span>
                                {t.start_time && <span className="text-[9px] text-muted-foreground">· {t.start_time}</span>}
                              </div>
                            </div>
                          </div>
                          <Badge className={`text-[9px] shrink-0 border ${STATUS_COLORS[t.status] || ''}`}>
                            {t.status === 'concluida' ? '✅' : t.status === 'cancelada' ? '❌' : '⏳'} {t.status}
                          </Badge>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="kanban" className="mt-3 sm:mt-4">
          <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 sm:grid sm:grid-cols-5 sm:gap-3 sm:overflow-visible snap-x snap-mandatory -mx-1 px-1">
            {kanbanDays.map((day, dayIdx) => {
              const dayTasks = getTasksForDay(day);
              const isToday = isSameDay(day, today);
              const totalMinutes = dayTasks.filter(t => t.status !== 'cancelada').reduce((s, t) => s + t.duration_minutes, 0);
              const totalHours = totalMinutes / 60;
              const occupancy = (totalHours / 4) * 100;

              return (
                <motion.div
                  key={day.toISOString()}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: dayIdx * 0.05 }}
                  className="space-y-2 min-w-[160px] sm:min-w-0 snap-center shrink-0 sm:shrink"
                >
                  <div className={`text-center rounded-xl p-2.5 border-2 ${
                    isToday ? 'bg-primary/10 border-primary shadow-md shadow-primary/10' : 'bg-muted/30 border-border'
                  }`}>
                    <p className={`text-xs font-semibold capitalize ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                      {format(day, 'EEE', { locale: ptBR })}
                    </p>
                    <p className="text-lg font-bold">{format(day, 'dd')}</p>
                    <p className="text-[10px] text-muted-foreground">{totalHours.toFixed(1)}h / 4h</p>
                    <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(occupancy, 100)}%` }}
                        transition={{ duration: 0.5, delay: dayIdx * 0.1 }}
                        className={`h-full rounded-full ${
                          occupancy >= 95 ? 'bg-destructive' : occupancy >= 75 ? 'bg-warning' : 'bg-success'
                        }`}
                      />
                    </div>
                    {isToday && (
                      <motion.div
                        animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-1.5 h-1.5 rounded-full bg-primary mx-auto mt-1.5"
                      />
                    )}
                  </div>

                  <div className="space-y-1.5 sm:space-y-2">
                    {dayTasks.map((t, i) => (
                      <motion.div
                        key={t.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: dayIdx * 0.05 + i * 0.03 }}
                        whileTap={{ scale: 0.97 }}
                        className="rounded-xl border-2 border-border bg-card p-2 sm:p-2.5 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-start gap-1.5 sm:gap-2">
                          <div
                            className="w-1.5 min-h-[28px] rounded-full shrink-0 mt-0.5"
                            style={{ backgroundColor: `hsl(${t.clients?.color || '292 84% 61%'})` }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] sm:text-xs font-medium truncate">{t.clients?.company_name}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <Badge variant="outline" className="text-[8px] sm:text-[9px] px-1 py-0">{getTaskTypeLabel(t.task_type)}</Badge>
                              <span className="text-[8px] sm:text-[9px] text-muted-foreground">{t.duration_minutes}min</span>
                            </div>
                            {t.start_time && (
                              <p className="text-[8px] sm:text-[9px] text-muted-foreground mt-0.5">🕐 {t.start_time}</p>
                            )}
                          </div>
                        </div>
                        <div className="mt-1">
                          <Badge className={`text-[8px] sm:text-[9px] px-1 py-0 border ${STATUS_COLORS[t.status] || ''}`}>
                            {t.status === 'concluida' ? '✅' : t.status === 'cancelada' ? '❌' : '⏳'} {t.status}
                          </Badge>
                        </div>
                      </motion.div>
                    ))}
                    {dayTasks.length === 0 && (
                      <div className="text-center py-3 sm:py-4">
                        <motion.div
                          animate={{ y: [0, -3, 0], opacity: [0.15, 0.3, 0.15] }}
                          transition={{ duration: 3, repeat: Infinity }}
                        >
                          <Rocket size={12} className="text-muted-foreground/30 -rotate-45 mx-auto" />
                        </motion.div>
                        <p className="text-[10px] text-muted-foreground mt-1">Sem tarefas</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
