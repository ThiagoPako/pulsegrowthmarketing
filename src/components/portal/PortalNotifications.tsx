import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/vpsDb';
import { Bell, X, Film, FileText, Sparkles } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';

interface PortalNotification {
  id: string;
  client_id: string;
  title: string;
  message: string;
  type: string;
  link_content_id: string | null;
  link_script_id: string | null;
  read: boolean;
  created_at: string;
}

interface Props {
  clientId: string;
  clientColor: string;
  onSelectContent?: (contentId: string) => void;
  onOpenScript?: (scriptId: string) => void;
}

export default function PortalNotifications({ clientId, clientColor, onSelectContent, onOpenScript }: Props) {
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    const { data } = await supabase
      .from('client_portal_notifications')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(30);
    if (data) setNotifications(data as PortalNotification[]);
  }, [clientId]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('portal_notifs_rt')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'client_portal_notifications',
        filter: `client_id=eq.${clientId}`,
      }, () => fetchNotifications())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId, fetchNotifications]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleClick = async (n: PortalNotification) => {
    if (!n.read) {
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      await supabase.from('client_portal_notifications').update({ read: true } as any).eq('id', n.id);
    }
    setOpen(false);
    if (n.link_content_id && onSelectContent) {
      onSelectContent(n.link_content_id);
    }
    if (n.link_script_id && onOpenScript) {
      onOpenScript(n.link_script_id);
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read).map(n => n.id);
    if (unread.length === 0) return;
    await supabase.from('client_portal_notifications').update({ read: true } as any).in('id', unread);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'video_approval': return <Film size={14} className="text-amber-400" />;
      case 'new_script': return <FileText size={14} className="text-violet-400" />;
      default: return <Sparkles size={14} className="text-white/40" />;
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-full hover:bg-white/10 transition-colors relative"
      >
        <Bell size={16} className="text-white/60" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white animate-pulse"
            style={{ background: `hsl(${clientColor})` }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 z-[70] w-80 bg-[#14141f] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <h3 className="text-sm font-semibold">Notificações</h3>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="text-[10px] text-white/40 hover:text-white/70 transition-colors">
                      Marcar todas como lidas
                    </button>
                  )}
                  <button onClick={() => setOpen(false)} className="p-1 rounded-full hover:bg-white/10 transition-colors">
                    <X size={12} className="text-white/40" />
                  </button>
                </div>
              </div>

              <div className="max-h-[360px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-12 text-center">
                    <Bell size={24} className="mx-auto mb-2 text-white/10" />
                    <p className="text-xs text-white/30">Nenhuma notificação</p>
                  </div>
                ) : (
                  notifications.map(n => (
                    <button
                      key={n.id}
                      onClick={() => handleClick(n)}
                      className={`w-full text-left px-4 py-3 hover:bg-white/[0.04] transition-colors border-b border-white/[0.04] last:border-0 ${
                        !n.read ? 'bg-white/[0.02]' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 p-1.5 rounded-lg bg-white/[0.06]">
                          {getIcon(n.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={`text-xs truncate ${!n.read ? 'font-semibold text-white' : 'text-white/70'}`}>
                              {n.title}
                            </p>
                            {!n.read && (
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: `hsl(${clientColor})` }} />
                            )}
                          </div>
                          <p className="text-[11px] text-white/40 mt-0.5 line-clamp-2">{n.message}</p>
                          <p className="text-[10px] text-white/20 mt-1">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
