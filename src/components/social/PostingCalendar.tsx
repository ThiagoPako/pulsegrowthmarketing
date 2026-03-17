import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, isToday, isWeekend } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Film, Megaphone, Image, Palette, Clock, CheckCircle2, CalendarClock, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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

/* ── Decorative cat SVGs ── */
function SleepyCat() {
  return (
    <motion.svg viewBox="0 0 64 48" className="w-16 h-12 opacity-60" animate={{ y: [0, -2, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
      <ellipse cx="32" cy="38" rx="22" ry="9" fill="hsl(30 30% 72%)" />
      <ellipse cx="32" cy="32" rx="14" ry="11" fill="hsl(30 30% 72%)" />
      <polygon points="22,24 18,14 28,22" fill="hsl(30 30% 68%)" />
      <polygon points="42,24 46,14 36,22" fill="hsl(30 30% 68%)" />
      <polygon points="23,23 20,16 27,22" fill="hsl(350 55% 78%)" />
      <polygon points="41,23 44,16 37,22" fill="hsl(350 55% 78%)" />
      <path d="M25,30 Q28,27 31,30" stroke="hsl(30 30% 45%)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M33,30 Q36,27 39,30" stroke="hsl(30 30% 45%)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <circle cx="24" cy="34" r="3" fill="hsl(350 55% 75%)" opacity="0.35" />
      <circle cx="40" cy="34" r="3" fill="hsl(350 55% 75%)" opacity="0.35" />
      <polygon points="32,33 30.5,35.5 33.5,35.5" fill="hsl(350 55% 60%)" />
      <motion.text x="42" y="20" fontSize="7" fill="hsl(var(--muted-foreground))" animate={{ opacity: [0, 0.7, 0], y: [20, 16, 12] }} transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 2 }}>
        zzz
      </motion.text>
      <motion.path d="M50,36 Q58,32 56,24" stroke="hsl(30 30% 65%)" strokeWidth="3" strokeLinecap="round" fill="none" animate={{ d: ['M50,36 Q58,32 56,24', 'M50,36 Q60,34 58,26', 'M50,36 Q58,32 56,24'] }} transition={{ duration: 3, repeat: Infinity }} />
    </motion.svg>
  );
}

function PlayfulCat() {
  return (
    <motion.svg viewBox="0 0 64 56" className="w-14 h-12 opacity-70" animate={{ rotate: [-4, 4, -4] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
      <ellipse cx="32" cy="40" rx="14" ry="12" fill="hsl(35 40% 75%)" />
      <ellipse cx="32" cy="28" rx="13" ry="11" fill="hsl(35 40% 75%)" />
      <polygon points="22,20 17,8 28,18" fill="hsl(35 40% 70%)" />
      <polygon points="42,20 47,8 36,18" fill="hsl(35 40% 70%)" />
      <polygon points="23,19 19,10 27,18" fill="hsl(350 60% 80%)" />
      <polygon points="41,19 45,10 37,18" fill="hsl(350 60% 80%)" />
      <motion.g animate={{ scaleY: [1, 0.1, 1] }} transition={{ duration: 3, repeat: Infinity, repeatDelay: 4 }}>
        <ellipse cx="27" cy="27" rx="2.5" ry="3" fill="hsl(160 50% 35%)" />
        <ellipse cx="37" cy="27" rx="2.5" ry="3" fill="hsl(160 50% 35%)" />
        <circle cx="28" cy="26" r="1" fill="white" />
        <circle cx="38" cy="26" r="1" fill="white" />
      </motion.g>
      <polygon points="32,31 30.5,33.5 33.5,33.5" fill="hsl(350 55% 60%)" />
      <path d="M28,35 Q32,39 36,35" stroke="hsl(30 30% 45%)" strokeWidth="1.2" fill="none" />
      {/* yarn ball */}
      <motion.circle cx="18" cy="48" r="5" fill="hsl(var(--primary))" opacity="0.5" animate={{ cx: [18, 22, 18] }} transition={{ duration: 1.5, repeat: Infinity }} />
      <motion.path d="M48,38 Q56,30 54,22" stroke="hsl(35 40% 65%)" strokeWidth="3" strokeLinecap="round" fill="none" animate={{ d: ['M48,38 Q56,30 54,22', 'M48,38 Q58,32 56,24', 'M48,38 Q56,30 54,22'] }} transition={{ duration: 1.5, repeat: Infinity }} />
    </motion.svg>
  );
}

export default function PostingCalendar({ deliveries, clients }: PostingCalendarProps) {
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

  // Stats for the month
  const monthStats = useMemo(() => {
    const total = filteredDeliveries.filter(d => {
      const dateKey = d.posted_at || d.delivered_at;
      if (!dateKey) return false;
      return dateKey >= format(monthStart, 'yyyy-MM-dd') && dateKey <= format(monthEnd, 'yyyy-MM-dd');
    });
    const posted = total.filter(d => d.status === 'postado').length;
    const scheduled = total.filter(d => d.status === 'agendado').length;
    return { total: total.length, posted, scheduled };
  }, [filteredDeliveries, monthStart, monthEnd]);

  return (
    <div className="space-y-5">
      {/* Header with glassmorphism */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-gradient-to-r from-primary/5 via-card to-accent/10 p-4 shadow-sm"
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-primary/10" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
                <ChevronLeft size={16} />
              </Button>
              <h2 className="text-xl font-bold text-foreground min-w-[200px] text-center capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
              </h2>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-primary/10" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
                <ChevronRight size={16} />
              </Button>
            </div>
            <PlayfulCat />
          </div>

          <div className="flex items-center gap-3">
            {/* Mini stats */}
            <div className="hidden sm:flex items-center gap-2">
              <motion.div whileHover={{ scale: 1.05 }} className="flex items-center gap-1.5 bg-card rounded-full px-3 py-1.5 border border-border shadow-sm">
                <Sparkles size={12} className="text-primary" />
                <span className="text-xs font-semibold text-foreground">{monthStats.total}</span>
                <span className="text-[10px] text-muted-foreground">total</span>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} className="flex items-center gap-1.5 bg-card rounded-full px-3 py-1.5 border border-border shadow-sm">
                <CheckCircle2 size={12} className="text-green-500" />
                <span className="text-xs font-semibold text-foreground">{monthStats.posted}</span>
                <span className="text-[10px] text-muted-foreground">postados</span>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} className="flex items-center gap-1.5 bg-card rounded-full px-3 py-1.5 border border-border shadow-sm">
                <CalendarClock size={12} className="text-blue-500" />
                <span className="text-xs font-semibold text-foreground">{monthStats.scheduled}</span>
                <span className="text-[10px] text-muted-foreground">agendados</span>
              </motion.div>
            </div>

            <Select value={selectedClientId} onValueChange={v => { setSelectedClientId(v); setSelectedDay(null); }}>
              <SelectTrigger className="w-[200px] rounded-full">
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
        </div>
      </motion.div>

      {/* Legend — colorful pills */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="flex items-center gap-2 flex-wrap">
        {Object.entries(TYPE_CONFIG).map(([key, conf]) => (
          <motion.div key={key} whileHover={{ scale: 1.08 }} className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border border-border/60 ${conf.color} cursor-default`}>
            <conf.icon size={11} />
            {conf.label}
          </motion.div>
        ))}
        <div className="border-l border-border pl-3 flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1 rounded-full">
            <CalendarClock size={11} /> Agendado
          </div>
          <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 dark:bg-green-900/20 px-2.5 py-1 rounded-full">
            <CheckCircle2 size={11} /> Postado
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calendar Grid */}
        <Card className="lg:col-span-2 border-border overflow-hidden">
          <CardContent className="p-3 sm:p-4">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {WEEKDAYS.map((d, i) => (
                <div key={d} className={`text-center text-[11px] font-bold py-2 rounded-lg uppercase tracking-wider ${i >= 5 ? 'text-muted-foreground/50 bg-muted/30' : 'text-muted-foreground bg-muted/50'}`}>
                  {d}
                </div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-1">
              {padBefore.map((_, i) => (
                <div key={`pad-${i}`} className="min-h-[95px]" />
              ))}
              {days.map((day, idx) => {
                const key = format(day, 'yyyy-MM-dd');
                const dayDeliveries = deliveriesByDate[key] || [];
                const isSelected = selectedDay && isSameDay(day, selectedDay);
                const todayFlag = isToday(day);
                const weekend = isWeekend(day);
                const postedCount = dayDeliveries.filter(d => d.status === 'postado').length;
                const totalCount = dayDeliveries.length;

                return (
                  <motion.button
                    key={key}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.008, duration: 0.25 }}
                    whileHover={{ scale: 1.04, zIndex: 10 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setSelectedDay(day)}
                    className={`
                      min-h-[95px] rounded-xl p-1.5 flex flex-col items-stretch transition-all text-sm border relative overflow-hidden
                      ${isSelected
                        ? 'bg-primary/8 border-primary shadow-lg ring-2 ring-primary/20'
                        : todayFlag
                          ? 'border-primary/40 bg-primary/3 shadow-sm'
                          : weekend
                            ? 'border-border/30 bg-muted/20'
                            : 'border-border/50 bg-card hover:border-primary/20 hover:shadow-sm'
                      }
                    `}
                  >
                    {/* Day number + indicator */}
                    <div className="flex items-center justify-between px-0.5 mb-1">
                      <span className={`
                        text-[11px] leading-none font-semibold
                        ${todayFlag
                          ? 'bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center text-[10px] shadow-sm'
                          : weekend ? 'text-muted-foreground/50' : 'text-muted-foreground'
                        }
                      `}>
                        {format(day, 'd')}
                      </span>
                      {totalCount > 0 && (
                        <div className="flex items-center gap-0.5">
                          {postedCount > 0 && (
                            <span className="h-4 min-w-[16px] flex items-center justify-center text-[8px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full px-1">
                              ✓{postedCount}
                            </span>
                          )}
                          {totalCount > postedCount && (
                            <span className="h-4 min-w-[16px] flex items-center justify-center text-[8px] font-bold bg-muted text-muted-foreground rounded-full px-1">
                              {totalCount - postedCount}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Content type dots summary */}
                    {totalCount > 0 && (
                      <div className="flex items-center gap-[3px] px-0.5 mb-0.5">
                        {Object.entries(TYPE_CONFIG).map(([type, conf]) => {
                          const count = dayDeliveries.filter(d => d.content_type === type).length;
                          if (count === 0) return null;
                          return (
                            <motion.div
                              key={type}
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className={`h-2 w-2 rounded-full ${conf.dotColor} shadow-sm`}
                              title={`${count} ${conf.label}`}
                            />
                          );
                        })}
                      </div>
                    )}

                    {/* Mini banners */}
                    <div className="flex flex-col gap-[3px] overflow-hidden flex-1">
                      {dayDeliveries.slice(0, 3).map(d => {
                        const client = clientMap[d.client_id];
                        const typeConf = TYPE_CONFIG[d.content_type] || TYPE_CONFIG.reels;
                        const clientColor = client?.color || '220 10% 50%';
                        const isPosted = d.status === 'postado';

                        return (
                          <motion.div
                            key={d.id}
                            initial={{ x: -8, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            className={`
                              flex items-center gap-1 rounded-md px-1 py-[3px] text-[9px] font-medium truncate border-l-2 transition-all
                              hover:shadow-sm
                              ${isPosted ? 'opacity-65' : ''}
                            `}
                            style={{
                              backgroundColor: `hsl(${clientColor} / 0.1)`,
                              borderLeftColor: `hsl(${clientColor})`,
                              color: `hsl(${clientColor})`,
                            }}
                            title={`${client?.companyName || ''} — ${typeConf.label}: ${d.title}`}
                          >
                            {client?.logoUrl ? (
                              <img src={client.logoUrl} alt="" className="h-3.5 w-3.5 rounded-full object-cover shrink-0 ring-1 ring-border/30" />
                            ) : (
                              <span
                                className="h-3.5 w-3.5 rounded-full flex items-center justify-center text-[6px] font-bold shrink-0"
                                style={{ backgroundColor: `hsl(${clientColor} / 0.25)`, color: `hsl(${clientColor})` }}
                              >
                                {(client?.companyName || '?').substring(0, 1).toUpperCase()}
                              </span>
                            )}
                            <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${typeConf.dotColor}`} />
                            <span className="truncate text-foreground/80">{d.title}</span>
                            {isPosted && <CheckCircle2 size={8} className="shrink-0 text-green-500 ml-auto" />}
                          </motion.div>
                        );
                      })}
                      {dayDeliveries.length > 3 && (
                        <span className="text-[8px] text-muted-foreground text-center mt-auto font-medium">
                          +{dayDeliveries.length - 3} mais
                        </span>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Day Detail Panel */}
        <Card className="border-border overflow-hidden">
          <CardContent className="p-0">
            <AnimatePresence mode="wait">
              {selectedDay ? (
                <motion.div
                  key={format(selectedDay, 'yyyy-MM-dd')}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                  className="p-4 space-y-3"
                >
                  {/* Day header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-foreground capitalize text-base">
                        {format(selectedDay, "EEEE", { locale: ptBR })}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {format(selectedDay, "dd 'de' MMMM", { locale: ptBR })}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs rounded-full px-3 gap-1">
                      <Sparkles size={10} />
                      {selectedDayDeliveries.length} {selectedDayDeliveries.length === 1 ? 'item' : 'itens'}
                    </Badge>
                  </div>

                  {selectedDayDeliveries.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="py-10 flex flex-col items-center text-muted-foreground"
                    >
                      <SleepyCat />
                      <p className="text-sm mt-3">Nenhum conteúdo neste dia</p>
                      <p className="text-[10px] mt-0.5 opacity-60">O gatinho está descansando... 😺</p>
                    </motion.div>
                  ) : (
                    <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                      {selectedDayDeliveries.map((d, i) => {
                        const typeConf = TYPE_CONFIG[d.content_type] || TYPE_CONFIG.reels;
                        const statusConf = STATUS_CONFIG[d.status];
                        const client = clientMap[d.client_id];
                        const TypeIcon = typeConf.icon;
                        const clientColor = client?.color || '220 10% 50%';

                        return (
                          <motion.div
                            key={d.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.06 }}
                            whileHover={{ y: -2, boxShadow: '0 8px 25px -5px rgba(0,0,0,0.1)' }}
                            className="rounded-xl border border-border overflow-hidden transition-all"
                          >
                            {/* Client banner */}
                            <div
                              className="flex items-center gap-2.5 px-3 py-2.5"
                              style={{
                                background: `linear-gradient(135deg, hsl(${clientColor} / 0.15), hsl(${clientColor} / 0.04))`,
                                borderBottom: `2px solid hsl(${clientColor} / 0.25)`,
                              }}
                            >
                              {client && <ClientLogo client={client} size="sm" />}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{d.title}</p>
                                {client && <p className="text-[11px] text-muted-foreground">{client.companyName}</p>}
                              </div>
                              {d.status === 'postado' && (
                                <motion.div
                                  animate={{ scale: [1, 1.15, 1] }}
                                  transition={{ duration: 1.5, repeat: Infinity }}
                                >
                                  <CheckCircle2 size={16} className="text-green-500" />
                                </motion.div>
                              )}
                            </div>

                            {/* Content area */}
                            <div className="px-3 py-2 bg-card space-y-1.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge className={`${typeConf.color} border-0 text-[10px] gap-1 px-2 py-0.5 rounded-full`}>
                                  <TypeIcon size={10} /> {typeConf.label}
                                </Badge>
                                {statusConf && (
                                  <Badge variant="outline" className={`text-[10px] px-2 py-0.5 gap-1 rounded-full ${statusConf.color}`}>
                                    <statusConf.icon size={10} /> {statusConf.label}
                                  </Badge>
                                )}
                                {d.scheduled_time && (
                                  <span className="text-[10px] text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">⏰ {d.scheduled_time}</span>
                                )}
                                {d.platform && (
                                  <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-full">{d.platform}</Badge>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-16 flex flex-col items-center text-muted-foreground"
                >
                  <SleepyCat />
                  <p className="text-sm mt-3 font-medium">Selecione um dia</p>
                  <p className="text-[10px] mt-0.5 opacity-60">para ver os conteúdos agendados 📅</p>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
