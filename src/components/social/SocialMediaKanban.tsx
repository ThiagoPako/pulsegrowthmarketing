import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Film, Palette, Image, Megaphone, CheckCircle2, Clock, CalendarClock,
  Send, Zap, Eye, MessageSquare, AlertTriangle, ExternalLink, Link2,
  Scissors, Flame, Rocket, Sparkles
} from 'lucide-react';
import DeadlineBadge from '@/components/DeadlineBadge';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';

// Drag-to-scroll container
function DragScrollContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    // Only drag from empty space (not buttons/cards)
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, [role="button"]')) return;
    isDragging.current = true;
    startX.current = e.pageX - el.offsetLeft;
    scrollLeft.current = el.scrollLeft;
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !ref.current) return;
    e.preventDefault();
    const x = e.pageX - ref.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    ref.current.scrollLeft = scrollLeft.current - walk;
  };

  const onMouseUp = () => {
    isDragging.current = false;
    if (ref.current) {
      ref.current.style.cursor = 'grab';
      ref.current.style.userSelect = '';
    }
  };

  return (
    <div
      ref={ref}
      className={`overflow-x-auto cursor-grab ${className || ''}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {children}
    </div>
  );
}

interface SocialDelivery {
  id: string;
  client_id: string;
  content_type: string;
  title: string;
  description: string | null;
  delivered_at: string;
  posted_at: string | null;
  scheduled_time: string | null;
  platform: string | null;
  status: string;
  script_id: string | null;
  recording_id: string | null;
  created_by: string | null;
  created_at: string;
  content_task_id: string | null;
}

interface KanbanColumn {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  items: SocialDelivery[];
}

interface SocialMediaKanbanProps {
  editingQueueTasks: any[];
  deliveries: {
    review: SocialDelivery[];
    alteration: SocialDelivery[];
    approval: SocialDelivery[];
    pending: SocialDelivery[];
    scheduled: SocialDelivery[];
    posted: SocialDelivery[];
  };
  taskDeadlines: Record<string, any>;
  onApproveReview: (d: SocialDelivery) => void;
  onOpenAlteration: (d: SocialDelivery) => void;
  onMarkPriority: (d: SocialDelivery) => void;
  onClientApproved: (d: SocialDelivery) => void;
  onSendWhatsApp: (d: SocialDelivery) => void;
  onOpenSchedule: (d: SocialDelivery) => void;
  onMarkPosted: (id: string) => void;
  onTogglePriority: (taskId: string, current: boolean) => void;
  sendingWhatsApp: boolean;
}

const CONTENT_TYPES = [
  { value: 'reels', label: 'Reels', icon: Film, color: 'bg-blue-100 text-blue-700' },
  { value: 'criativo', label: 'Criativo', icon: Megaphone, color: 'bg-purple-100 text-purple-700' },
  { value: 'story', label: 'Story', icon: Image, color: 'bg-pink-100 text-pink-700' },
  { value: 'arte', label: 'Arte', icon: Palette, color: 'bg-amber-100 text-amber-700' },
];

function getTypeConfig(type: string) {
  return CONTENT_TYPES.find(t => t.value === type) || CONTENT_TYPES[0];
}

// Rocket burst animation component
function RocketBurst({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const rockets = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    x: (Math.random() - 0.5) * 300,
    y: -(Math.random() * 400 + 100),
    rotate: Math.random() * 360,
    delay: Math.random() * 0.3,
    emoji: ['🚀', '✨', '🎉', '⭐', '💫', '🔥'][Math.floor(Math.random() * 6)],
  }));

  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
      {rockets.map(r => (
        <motion.div
          key={r.id}
          initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          animate={{ opacity: 0, x: r.x, y: r.y, scale: 0.5, rotate: r.rotate }}
          transition={{ duration: 1.5, delay: r.delay, ease: 'easeOut' }}
          className="absolute text-3xl"
        >
          {r.emoji}
        </motion.div>
      ))}
    </div>
  );
}

// Video link inline component
function ReviewVideoLink({ contentTaskId, clientId }: { contentTaskId: string | null; clientId: string }) {
  const [isAltered, setIsAltered] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    if (!contentTaskId) return;
    supabase.from('content_tasks').select('edited_video_link, drive_link, adjustment_notes').eq('id', contentTaskId).single()
      .then(({ data }) => {
        setHasVideo(!!(data?.edited_video_link || data?.drive_link));
        setIsAltered(!!data?.adjustment_notes);
      });
  }, [contentTaskId]);

  if (!hasVideo && !isAltered) return null;

  return (
    <div className="mt-2 space-y-1">
      {isAltered && (
        <Badge className="text-[9px] font-bold px-1.5 py-0 border-0 bg-amber-500 text-white">🔄 Alterado</Badge>
      )}
      {hasVideo && (
        <a href={`/portal/${clientId}`}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline bg-primary/5 border border-primary/15 rounded-md px-2 py-1.5 transition-colors hover:bg-primary/10">
          <Eye size={12} className="shrink-0" />
          <span className="truncate">Assistir no Portal</span>
          <ExternalLink size={10} className="shrink-0 ml-auto" />
        </a>
      )}
    </div>
  );
}

export default function SocialMediaKanban({
  editingQueueTasks,
  deliveries,
  taskDeadlines,
  onApproveReview,
  onOpenAlteration,
  onMarkPriority,
  onClientApproved,
  onSendWhatsApp,
  onOpenSchedule,
  onMarkPosted,
  onTogglePriority,
  sendingWhatsApp,
}: SocialMediaKanbanProps) {
  const [showRocket, setShowRocket] = useState(false);

  const triggerRocket = useCallback(() => {
    setShowRocket(true);
  }, []);

  const columns: KanbanColumn[] = [
    {
      id: 'edicao',
      title: 'Fila de Edição',
      icon: Scissors,
      color: 'text-sky-600',
      bgColor: 'bg-sky-50/80',
      borderColor: 'border-sky-200',
      items: [], // special handling
    },
    {
      id: 'revisao',
      title: 'Revisão',
      icon: Eye,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50/80',
      borderColor: 'border-orange-200',
      items: deliveries.review,
    },
    {
      id: 'alteracao',
      title: 'Alteração',
      icon: AlertTriangle,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50/80',
      borderColor: 'border-amber-200',
      items: deliveries.alteration,
    },
    {
      id: 'envio',
      title: 'Enviado',
      icon: Send,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-50/80',
      borderColor: 'border-cyan-200',
      items: deliveries.approval,
    },
    {
      id: 'agendar',
      title: 'Agendar',
      icon: CalendarClock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50/80',
      borderColor: 'border-yellow-200',
      items: deliveries.pending,
    },
    {
      id: 'agendado',
      title: 'Agendado',
      icon: Clock,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50/80',
      borderColor: 'border-blue-200',
      items: deliveries.scheduled,
    },
    {
      id: 'postado',
      title: 'Postado',
      icon: CheckCircle2,
      color: 'text-green-600',
      bgColor: 'bg-green-50/80',
      borderColor: 'border-green-200',
      items: deliveries.posted.slice(0, 20), // limit for performance
    },
  ];

  const handleActionWithRocket = (action: () => void) => {
    triggerRocket();
    action();
  };

  return (
    <>
      <AnimatePresence>
        {showRocket && <RocketBurst onComplete={() => setShowRocket(false)} />}
      </AnimatePresence>

      <DragScrollContainer className="w-full">
        <div className="flex gap-4 pb-4 min-w-max">
          {columns.map((col, colIdx) => {
            const isEditing = col.id === 'edicao';
            const items = isEditing ? editingQueueTasks : col.items;
            const count = items.length;

            return (
              <motion.div
                key={col.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: colIdx * 0.05, duration: 0.3 }}
                className="w-[280px] shrink-0 flex flex-col"
              >
                {/* Column Header */}
                <div className={`rounded-t-xl px-3 py-2.5 ${col.bgColor} border ${col.borderColor} border-b-0`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <col.icon size={15} className={col.color} />
                      <span className={`text-sm font-semibold ${col.color}`}>{col.title}</span>
                    </div>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-bold ${col.color} border-current/20`}>
                      {count}
                    </Badge>
                  </div>
                </div>

                {/* Column Body */}
                <div className={`flex-1 rounded-b-xl border ${col.borderColor} border-t-0 bg-card/50 min-h-[200px] max-h-[calc(100vh-380px)] overflow-y-auto p-2 space-y-2`}>
                  <AnimatePresence mode="popLayout">
                    {count === 0 ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center py-8 text-muted-foreground/50"
                      >
                        <col.icon size={24} className="mb-2 opacity-30" />
                        <span className="text-xs">Nenhum item</span>
                      </motion.div>
                    ) : (
                      items.map((item: any, i: number) => {
                        if (isEditing) {
                          return (
                            <EditingCard
                              key={item.id}
                              task={item}
                              index={i}
                              onTogglePriority={onTogglePriority}
                            />
                          );
                        }
                        return (
                          <DeliveryCard
                            key={item.id}
                            delivery={item}
                            index={i}
                            columnId={col.id}
                            taskDeadlines={taskDeadlines}
                            onApproveReview={() => handleActionWithRocket(() => onApproveReview(item))}
                            onOpenAlteration={() => onOpenAlteration(item)}
                            onMarkPriority={() => onMarkPriority(item)}
                            onClientApproved={() => handleActionWithRocket(() => onClientApproved(item))}
                            onSendWhatsApp={() => onSendWhatsApp(item)}
                            onOpenSchedule={() => onOpenSchedule(item)}
                            onMarkPosted={() => handleActionWithRocket(() => onMarkPosted(item.id))}
                            sendingWhatsApp={sendingWhatsApp}
                          />
                        );
                      })
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>
      </DragScrollContainer>
    </>
  );
}

// Editing Queue Card
function EditingCard({ task, index, onTogglePriority }: { task: any; index: number; onTogglePriority: (id: string, current: boolean) => void }) {
  const typeConf = getTypeConfig(task.content_type);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      whileHover={{ y: -2 }}
    >
      <Card className={`border shadow-sm hover:shadow-md transition-all hover:border-primary/30 ${task.editing_priority ? 'ring-1 ring-amber-400/60 border-amber-300' : 'border-border'}`}>
        <CardContent className="p-3 space-y-2">
          {task.editing_priority && (
            <div className="flex items-center gap-1 text-[9px] font-bold text-amber-600">
              <Flame size={10} /> PRIORIDADE
            </div>
          )}
          <p className="text-sm font-medium text-foreground leading-tight line-clamp-2">{task.title}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge className={`${typeConf.color} border-0 gap-1 text-[9px] px-1.5 py-0`}>
              <typeConf.icon size={9} /> {typeConf.label}
            </Badge>
          </div>
          <Button
            size="sm"
            variant={task.editing_priority ? 'default' : 'outline'}
            className={`w-full gap-1.5 h-7 text-xs ${task.editing_priority
              ? 'bg-amber-500 hover:bg-amber-600 text-white'
              : 'text-amber-600 border-amber-300 hover:bg-amber-50'
            }`}
            onClick={() => onTogglePriority(task.id, task.editing_priority)}
          >
            <Zap size={12} /> {task.editing_priority ? 'Prioritário' : 'Marcar Prioridade'}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Delivery Card
function DeliveryCard({
  delivery: d,
  index,
  columnId,
  taskDeadlines,
  onApproveReview,
  onOpenAlteration,
  onMarkPriority,
  onClientApproved,
  onSendWhatsApp,
  onOpenSchedule,
  onMarkPosted,
  sendingWhatsApp,
}: {
  delivery: SocialDelivery;
  index: number;
  columnId: string;
  taskDeadlines: Record<string, any>;
  onApproveReview: () => void;
  onOpenAlteration: () => void;
  onMarkPriority: () => void;
  onClientApproved: () => void;
  onSendWhatsApp: () => void;
  onOpenSchedule: () => void;
  onMarkPosted: () => void;
  sendingWhatsApp: boolean;
}) {
  const typeConf = getTypeConfig(d.content_type);
  const td = d.content_task_id ? taskDeadlines[d.content_task_id] : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, x: 50 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      whileHover={{ y: -2 }}
    >
      <Card className="border border-border shadow-sm hover:shadow-md transition-all group hover:border-primary/30">
        <CardContent className="p-3 space-y-2">
          {/* Title */}
          <p className="text-sm font-medium text-foreground leading-tight line-clamp-2">{d.title}</p>

          {/* Badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge className={`${typeConf.color} border-0 gap-1 text-[9px] px-1.5 py-0`}>
              <typeConf.icon size={9} /> {typeConf.label}
            </Badge>
            {/* Deadline badges */}
            {td && columnId === 'revisao' && td.review_deadline && (
              <DeadlineBadge deadline={td.review_deadline} label="Revisão" />
            )}
            {td && columnId === 'alteracao' && td.alteration_deadline && !td.immediate_alteration && (
              <DeadlineBadge deadline={td.alteration_deadline} label="Alteração" />
            )}
            {td && columnId === 'envio' && td.approval_deadline && (
              <DeadlineBadge deadline={td.approval_deadline} label="Aprovação" />
            )}
            {d.platform && columnId === 'agendado' && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0">{d.platform}</Badge>
            )}
          </div>

          {/* Scheduled info */}
          {columnId === 'agendado' && d.posted_at && (
            <div className="text-xs text-muted-foreground">
              📅 {new Date(d.posted_at + 'T12:00:00').toLocaleDateString('pt-BR')}
              {d.scheduled_time && ` às ${d.scheduled_time}`}
            </div>
          )}

          {/* Video link */}
          {(columnId === 'revisao' || columnId === 'envio') && (
            <ReviewVideoLink contentTaskId={d.content_task_id} clientId={d.client_id} />
          )}

          {/* Actions */}
          <div className="flex flex-col gap-1.5 pt-1">
            {columnId === 'revisao' && (
              <>
                <Button size="sm" className="w-full gap-1.5 h-7 text-xs bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-sm" onClick={onApproveReview}>
                  <Rocket size={12} /> Aprovar Revisão
                </Button>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1 gap-1 h-7 text-xs text-orange-600 border-orange-200 hover:bg-orange-50" onClick={onOpenAlteration}>
                    <AlertTriangle size={11} /> Alteração
                  </Button>
                  {d.content_task_id && (
                    <Button size="sm" variant="outline" className="gap-1 h-7 text-xs text-amber-600 border-amber-200 hover:bg-amber-50" onClick={onMarkPriority}>
                      <Zap size={11} />
                    </Button>
                  )}
                </div>
              </>
            )}
            {columnId === 'envio' && (
              <>
                <Button size="sm" className="w-full gap-1.5 h-7 text-xs bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white shadow-sm" onClick={onClientApproved}>
                  <Sparkles size={12} /> Cliente Aprovou
                </Button>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1 gap-1 h-7 text-xs" onClick={onSendWhatsApp} disabled={sendingWhatsApp}>
                    <MessageSquare size={11} /> WhatsApp
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs text-orange-600 border-orange-200 hover:bg-orange-50" onClick={onOpenAlteration}>
                    <AlertTriangle size={11} />
                  </Button>
                </div>
              </>
            )}
            {columnId === 'agendar' && (
              <Button size="sm" className="w-full gap-1.5 h-7 text-xs bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-sm" onClick={onOpenSchedule}>
                <CalendarClock size={12} /> Agendar Postagem
              </Button>
            )}
            {columnId === 'agendado' && (
              <div className="flex gap-1.5">
                <Button size="sm" className="flex-1 gap-1.5 h-7 text-xs bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white shadow-sm" onClick={onMarkPosted}>
                  <Rocket size={12} /> Postado!
                </Button>
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={onOpenSchedule}>
                  <CalendarClock size={11} />
                </Button>
              </div>
            )}
            {columnId === 'postado' && d.posted_at && (
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <CheckCircle2 size={10} className="text-green-500" />
                Postado em {new Date(d.posted_at + 'T12:00:00').toLocaleDateString('pt-BR')}
                {d.platform && ` · ${d.platform}`}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
