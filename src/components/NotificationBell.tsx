import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Bell } from 'lucide-react';
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

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

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

  // Realtime
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

  const handleClick = async (n: Notification) => {
    if (!n.read) {
      await supabase.from('notifications').update({ read: true } as any).eq('id', n.id);
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    }
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read).map(n => n.id);
    if (unread.length === 0) return;
    await supabase.from('notifications').update({ read: true } as any).in('id', unread);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'review': return '👁';
      case 'alteration': return '✏️';
      case 'approval': return '✅';
      case 'video_ready': return '🎬';
      case 'script_low': return '📝';
      default: return '🔔';
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1 animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Notificações</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllRead}>
              Marcar todas como lidas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[400px]">
          {notifications.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma notificação
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors ${
                    !n.read ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-base mt-0.5">{getTypeIcon(n.type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm truncate ${!n.read ? 'font-semibold text-foreground' : 'text-foreground/80'}`}>
                          {n.title}
                        </p>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
