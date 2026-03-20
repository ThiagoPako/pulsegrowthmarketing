import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/vpsDb';
import { useAuth } from '@/hooks/useAuth';
import { Bell, Eye, Pencil, CheckCircle2, Film, FileText, BellRing, CheckCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  review: { icon: Eye, color: 'text-info', bg: 'bg-info/10' },
  alteration: { icon: Pencil, color: 'text-warning', bg: 'bg-warning/10' },
  approval: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
  video_ready: { icon: Film, color: 'text-primary', bg: 'bg-primary/10' },
  script_low: { icon: FileText, color: 'text-destructive', bg: 'bg-destructive/10' },
  default: { icon: BellRing, color: 'text-muted-foreground', bg: 'bg-muted' },
};

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (data) setNotifications(data as Notification[]);
  }, [user?.id]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('notifications_rt')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => fetchNotifications())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchNotifications]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleClick = (n: Notification) => {
    if (!n.read) {
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      supabase.from('notifications').update({ read: true } as any).eq('id', n.id).then();
    }
    setOpen(false);
    if (n.link) {
      setTimeout(() => navigate(n.link!), 100);
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read).map(n => n.id);
    if (unread.length === 0) return;
    await supabase.from('notifications').update({ read: true } as any).in('id', unread);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const getTypeConfig = (type: string) => TYPE_CONFIG[type] || TYPE_CONFIG.default;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-all duration-200">
          <Bell size={18} />
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] sm:w-[380px] p-0 rounded-xl shadow-xl border-border/60" align="end" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/30">
          <div className="flex items-center gap-2">
            <Bell size={15} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Notificações</h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-bold">
                {unreadCount}
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-[11px] h-7 gap-1 text-primary hover:text-primary" onClick={markAllRead}>
              <CheckCheck size={13} />
              Ler todas
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[420px]">
          {notifications.length === 0 ? (
            <div className="py-14 text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Bell size={20} className="text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhuma notificação</p>
            </div>
          ) : (
            <div>
              {notifications.map((n, i) => {
                const config = getTypeConfig(n.type);
                const Icon = config.icon;
                return (
                  <motion.button
                    key={n.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={() => handleClick(n)}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors duration-150 border-b border-border/30 last:border-b-0 ${
                      !n.read
                        ? 'bg-primary/[0.04] hover:bg-primary/[0.08]'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    {/* Icon */}
                    <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                      <Icon size={15} className={config.color} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-[13px] leading-tight truncate ${!n.read ? 'font-semibold text-foreground' : 'text-foreground/80'}`}>
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1 font-medium">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
