import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, isToday } from 'date-fns';
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
  media_url?: string | null;
  caption?: string | null;
}

interface PostingCalendarProps {
  deliveries: SocialDelivery[];
  clients: Client[];
  onDayClick: (date: Date) => void;
  onPostClick: (delivery: SocialDelivery) => void;
}

const TYPE_CONFIG: Record<string, { icon: typeof Film; label: string; color: string; dotColor: string; bgClass: string }> = {
  reels:    { icon: Film,      label: 'Reels',    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',     dotColor: 'bg-blue-500',   bgClass: 'border-l-blue-500' },
  criativo: { icon: Megaphone, label: 'Criativo', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', dotColor: 'bg-purple-500', bgClass: 'border-l-purple-500' },
  story:    { icon: Image,     label: 'Story',    color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',     dotColor: 'bg-pink-500',   bgClass: 'border-l-pink-500' },
  arte:     { icon: Palette,   label: 'Arte',     color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', dotColor: 'bg-amber-500',  bgClass: 'border-l-amber-500' },
};

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  agendado: { label: 'Agendado', icon: CalendarClock, color: 'text-blue-600' },
  postado:  { label: 'Postado',  icon: CheckCircle2,  color: 'text-green-600' },
  entregue: { label: 'Pronto',   icon: Clock,         color: 'text-yellow-600' },
};

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export default function PostingCalendar({ deliveries, clients, onDayClick, onPostClick }: PostingCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedClientId, setSelectedClientId] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const clientMap = useMemo(() => {
    const m: Record<string, Client> = {};
    clients.forEach(c => { m[c.id] = c; });
    return m;
  }, [clients]);

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
  const startDow = (getDay(monthStart) + 6) % 7;
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
                <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1.5 uppercase tracking-wider">
                  {d}
                </div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-1">
              {padBefore.map((_, i) => (
                <div key={`pad-${i}`} className="min-h-[90px]" />
              ))}
              {days.map(day => {
                const key = format(day, 'yyyy-MM-dd');
                const dayDeliveries = deliveriesByDate[key] || [];
                const isSelected = selectedDay && isSameDay(day, selectedDay);
                const today = isToday(day);

                return (
                  <button
                    key={key}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('.post-thumb')) return;
                      onDayClick(day);
                      setSelectedDay(day);
                    }}
                    className={`
                      min-h-[90px] rounded-lg p-1 flex flex-col items-stretch transition-all text-sm border
                      hover:shadow-md hover:border-primary/30 relative group
                      ${isSelected ? 'bg-primary/5 border-primary shadow-sm ring-1 ring-primary/30' : 'border-border/50 bg-card'}
                      ${today ? 'border-primary/50' : ''}
                    `}
                  >
                    {/* Day number */}
                    <div className="flex items-center justify-between px-0.5">
                      <span className={`text-[11px] leading-none font-medium ${today ? 'bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-[10px]' : 'text-muted-foreground'}`}>
                        {format(day, 'd')}
                      </span>
                      {dayDeliveries.length > 0 && (
                        <span className="text-[9px] text-muted-foreground font-medium bg-muted rounded-full px-1.5">
                          {dayDeliveries.length}
                        </span>
                      )}
                    </div>

                    {/* Mini banners */}
                    <div className="flex flex-col gap-[2px] mt-1 overflow-hidden flex-1">
                      {dayDeliveries.slice(0, 3).map(d => {
                        const client = clientMap[d.client_id];
                        const typeConf = TYPE_CONFIG[d.content_type] || TYPE_CONFIG.reels;
                        const clientColor = client?.color || '220 10% 50%';
                        const isPosted = d.status === 'postado';

                        return (
                          <div
                            key={d.id}
                            className={`
                              post-thumb flex items-center gap-1 rounded px-1 py-[2px] text-[9px] font-medium truncate border-l-2 transition-opacity hover:opacity-80 cursor-pointer
                              ${isPosted ? 'opacity-70' : ''}
                            `}
                            onClick={(e) => {
                              e.stopPropagation();
                              onPostClick(d);
                            }}
                            style={{
                              backgroundColor: `hsl(${clientColor} / 0.12)`,
                              borderLeftColor: `hsl(${clientColor})`,
                              color: `hsl(${clientColor})`,
                            }}
                            title={`${client?.companyName || ''} — ${typeConf.label}: ${d.title}`}
                          >
                            {client?.logoUrl ? (
                              <img src={client.logoUrl} alt="" className="h-3 w-3 rounded-sm object-cover shrink-0" />
                            ) : (
                              <span
                                className="h-3 w-3 rounded-sm flex items-center justify-center text-[6px] font-bold shrink-0"
                                style={{
                                  backgroundColor: `hsl(${clientColor} / 0.25)`,
                                  color: `hsl(${clientColor})`,
                                }}
                              >
                                {(client?.companyName || '?').substring(0, 1).toUpperCase()}
                              </span>
                            )}
                            {d.media_url ? (
                              <img src={d.media_url} alt="" className="h-4 w-4 rounded-sm object-cover shrink-0" />
                            ) : (
                              <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${typeConf.dotColor}`} />
                            )}
                            <span className="truncate text-foreground/80">{d.title}</span>
                            {isPosted && <CheckCircle2 size={8} className="shrink-0 text-green-500 ml-auto" />}
                          </div>
                        );
                      })}
                      {dayDeliveries.length > 3 && (
                        <span className="text-[8px] text-muted-foreground text-center mt-auto">
                          +{dayDeliveries.length - 3} mais
                        </span>
                      )}
                    </div>
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
                      const client = clientMap[d.client_id];
                      const TypeIcon = typeConf.icon;
                      const clientColor = client?.color || '220 10% 50%';

                      return (
                        <div
                          key={d.id}
                          className="rounded-xl border border-border overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                          onClick={() => onPostClick(d)}
                        >
                          {/* Client color banner header */}
                          <div
                            className="flex items-center gap-2.5 px-3 py-2"
                            style={{
                              background: `linear-gradient(135deg, hsl(${clientColor} / 0.15), hsl(${clientColor} / 0.05))`,
                              borderBottom: `2px solid hsl(${clientColor} / 0.3)`,
                            }}
                          >
                            {client && <ClientLogo client={client} size="sm" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">{d.title}</p>
                              {client && <p className="text-[11px] text-muted-foreground">{client.companyName}</p>}
                            </div>
                          </div>

                          {/* Content area */}
                          <div className="px-3 py-2 bg-card space-y-1.5">
                            {d.media_url && (
                              <div className="mb-2">
                                <img src={d.media_url} alt="Thumbnail" className="w-full h-24 object-cover rounded-md border border-border" />
                              </div>
                            )}
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
