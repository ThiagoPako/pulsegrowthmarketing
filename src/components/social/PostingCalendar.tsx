import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, isToday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Film, Megaphone, Image, Palette, Clock, CheckCircle2, CalendarClock } from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import type { Client } from '@/types';

interface SocialDelivery {
  id: string;
  client_id: string;
  content_type: string;
  title: string;
  posted_at: string | null;
  scheduled_time: string | null;
  platform: string | null;
  status: string;
  delivered_at: string;
}

interface PostingCalendarProps {
  deliveries: SocialDelivery[];
  clients: Client[];
}

const TYPE_CONFIG: Record<string, { icon: typeof Film; label: string; color: string; dotColor: string }> = {
  reels: { icon: Film, label: 'Reels', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', dotColor: 'bg-blue-500' },
  criativo: { icon: Megaphone, label: 'Criativo', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', dotColor: 'bg-purple-500' },
  story: { icon: Image, label: 'Story', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400', dotColor: 'bg-pink-500' },
  arte: { icon: Palette, label: 'Arte', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', dotColor: 'bg-amber-500' },
};

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  agendado: { label: 'Agendado', icon: CalendarClock, color: 'text-blue-600' },
  postado: { label: 'Postado', icon: CheckCircle2, color: 'text-green-600' },
  entregue: { label: 'Pronto', icon: Clock, color: 'text-yellow-600' },
};

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export default function PostingCalendar({ deliveries, clients }: PostingCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedClientId, setSelectedClientId] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const filteredDeliveries = useMemo(() => {
    let filtered = deliveries.filter(d => d.status === 'agendado' || d.status === 'postado' || d.status === 'entregue');
    if (selectedClientId !== 'all') {
      filtered = filtered.filter(d => d.client_id === selectedClientId);
    }
    return filtered;
  }, [deliveries, selectedClientId]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad start to Monday
  const startDow = (getDay(monthStart) + 6) % 7; // 0=Mon
  const padBefore = Array.from({ length: startDow }, (_, i) => null);

  const deliveriesByDate = useMemo(() => {
    const map: Record<string, SocialDelivery[]> = {};
    filteredDeliveries.forEach(d => {
      const dateKey = d.posted_at || d.delivered_at;
      if (!dateKey) return;
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(d);
    });
    return map;
  }, [filteredDeliveries]);

  const selectedDayDeliveries = useMemo(() => {
    if (!selectedDay) return [];
    const key = format(selectedDay, 'yyyy-MM-dd');
    return deliveriesByDate[key] || [];
  }, [selectedDay, deliveriesByDate]);

  // Clients that have deliveries
  const activeClients = useMemo(() => {
    const ids = new Set(deliveries.map(d => d.client_id));
    return clients.filter(c => ids.has(c.id)).sort((a, b) => a.companyName.localeCompare(b.companyName));
  }, [deliveries, clients]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
            <ChevronLeft size={16} />
          </Button>
          <h2 className="text-lg font-bold text-foreground min-w-[180px] text-center capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </h2>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
            <ChevronRight size={16} />
          </Button>
        </div>

        <Select value={selectedClientId} onValueChange={v => { setSelectedClientId(v); setSelectedDay(null); }}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Todos os clientes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            {activeClients.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap">
        {Object.entries(TYPE_CONFIG).map(([key, conf]) => (
          <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className={`h-2.5 w-2.5 rounded-full ${conf.dotColor}`} />
            {conf.label}
          </div>
        ))}
        <div className="border-l border-border pl-4 flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock size={12} className="text-blue-600" /> Agendado
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 size={12} className="text-green-600" /> Postado
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calendar Grid */}
        <Card className="lg:col-span-2 border-border">
          <CardContent className="p-3 sm:p-4">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map(d => (
                <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1.5">
                  {d}
                </div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-1">
              {padBefore.map((_, i) => (
                <div key={`pad-${i}`} className="aspect-square" />
              ))}
              {days.map(day => {
                const key = format(day, 'yyyy-MM-dd');
                const dayDeliveries = deliveriesByDate[key] || [];
                const isSelected = selectedDay && isSameDay(day, selectedDay);
                const today = isToday(day);

                // Group by type for dots
                const typeCounts: Record<string, number> = {};
                dayDeliveries.forEach(d => {
                  typeCounts[d.content_type] = (typeCounts[d.content_type] || 0) + 1;
                });

                const hasPosted = dayDeliveries.some(d => d.status === 'postado');
                const hasScheduled = dayDeliveries.some(d => d.status === 'agendado');

                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(day)}
                    className={`
                      aspect-square rounded-lg p-1 flex flex-col items-center justify-start gap-0.5 transition-all text-sm
                      hover:bg-accent/50 relative
                      ${isSelected ? 'bg-primary/10 ring-2 ring-primary shadow-sm' : ''}
                      ${today ? 'font-bold' : ''}
                      ${dayDeliveries.length > 0 ? 'cursor-pointer' : 'cursor-default'}
                    `}
                  >
                    <span className={`text-xs leading-none mt-0.5 ${today ? 'bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center' : 'text-foreground'}`}>
                      {format(day, 'd')}
                    </span>

                    {/* Content dots */}
                    {dayDeliveries.length > 0 && (
                      <div className="flex flex-wrap items-center justify-center gap-[2px] mt-auto">
                        {Object.entries(typeCounts).slice(0, 4).map(([type, count]) => {
                          const conf = TYPE_CONFIG[type];
                          if (!conf) return null;
                          return (
                            <div key={type} className="relative">
                              <div className={`h-2 w-2 rounded-full ${conf.dotColor} ${hasPosted && !hasScheduled ? 'opacity-60' : ''}`} />
                              {count > 1 && (
                                <span className="absolute -top-1 -right-1 text-[7px] font-bold text-foreground">{count}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Status indicator */}
                    {dayDeliveries.length > 0 && (
                      <div className={`absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full ${hasScheduled && !hasPosted ? 'bg-blue-500' : hasPosted ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Day Detail Panel */}
        <Card className="border-border">
          <CardContent className="p-4">
            {selectedDay ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground capitalize">
                    {format(selectedDay, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </h3>
                  <Badge variant="outline" className="text-[10px]">
                    {selectedDayDeliveries.length} {selectedDayDeliveries.length === 1 ? 'item' : 'itens'}
                  </Badge>
                </div>

                {selectedDayDeliveries.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    Nenhum conteúdo neste dia
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {selectedDayDeliveries.map(d => {
                      const typeConf = TYPE_CONFIG[d.content_type] || TYPE_CONFIG.reels;
                      const statusConf = STATUS_CONFIG[d.status];
                      const client = clients.find(c => c.id === d.client_id);
                      const TypeIcon = typeConf.icon;

                      return (
                        <div key={d.id} className="p-3 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors space-y-1.5">
                          <div className="flex items-start gap-2">
                            {client && <ClientLogo client={client} size="sm" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{d.title}</p>
                              {client && <p className="text-[11px] text-muted-foreground">{client.companyName}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge className={`${typeConf.color} border-0 text-[10px] gap-1 px-1.5 py-0`}>
                              <TypeIcon size={10} /> {typeConf.label}
                            </Badge>
                            {statusConf && (
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-1 ${statusConf.color}`}>
                                <statusConf.icon size={10} /> {statusConf.label}
                              </Badge>
                            )}
                            {d.scheduled_time && (
                              <span className="text-[10px] text-muted-foreground">⏰ {d.scheduled_time}</span>
                            )}
                            {d.platform && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{d.platform}</Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground text-sm">
                <CalendarClock size={32} className="mx-auto mb-2 opacity-30" />
                Selecione um dia no calendário para ver os conteúdos
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
