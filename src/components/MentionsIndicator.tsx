import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/vpsDb';
import { useAuth } from '@/hooks/useAuth';
import { AtSign, ArrowRight, CheckCheck, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MentionItem {
  id: string;
  title: string;
  message: string;
  link: string | null;
  created_at: string;
}

/**
 * Floating indicator (top-right) that lists unread mentions.
 * Complements the auto popup by giving the user a way to revisit pending mentions.
 */
export default function MentionsIndicator() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mentions, setMentions] = useState<MentionItem[]>([]);
  const [open, setOpen] = useState(false);

  const fetchMentions = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id,title,message,link,created_at')
        .eq('user_id', user.id)
        .eq('type', 'mention')
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!error && data) setMentions(data as MentionItem[]);
    } catch {}
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    fetchMentions();
    const interval = setInterval(fetchMentions, 8000);
    return () => clearInterval(interval);
  }, [user?.id, fetchMentions]);

  const markRead = async (id: string) => {
    setMentions((prev) => prev.filter((m) => m.id !== id));
    try {
      await supabase.from('notifications').update({ read: true } as any).eq('id', id);
    } catch {}
  };

  const markAllRead = async () => {
    const ids = mentions.map((m) => m.id);
    setMentions([]);
    setOpen(false);
    try {
      for (const id of ids) {
        await supabase.from('notifications').update({ read: true } as any).eq('id', id);
      }
    } catch {}
  };

  const handleGo = (m: MentionItem) => {
    setOpen(false);
    markRead(m.id);
    if (m.link) {
      if (m.link.startsWith('/')) navigate(m.link);
      else window.open(m.link, '_blank');
    }
  };

  if (!user?.id || mentions.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[60]">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="relative flex items-center gap-2 pl-3 pr-4 py-2 rounded-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/30 border border-primary/20 backdrop-blur-xl hover:shadow-primary/50 transition-shadow"
          >
            <motion.div
              animate={{ rotate: [0, -10, 10, -10, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
            >
              <AtSign size={16} />
            </motion.div>
            <span className="text-xs font-semibold">
              {mentions.length} {mentions.length === 1 ? 'menção' : 'menções'}
            </span>
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-destructive border-2 border-background animate-pulse" />
          </motion.button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[360px] p-0 border-primary/20 bg-card/95 backdrop-blur-xl shadow-2xl"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <AtSign size={14} className="text-primary" />
              <h3 className="text-sm font-semibold">Menções pendentes</h3>
            </div>
            {mentions.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllRead}
                className="h-7 text-[10px] gap-1"
              >
                <CheckCheck size={12} />
                Marcar todas
              </Button>
            )}
          </div>

          <ScrollArea className="max-h-[400px]">
            <div className="p-2">
              <AnimatePresence initial={false}>
                {mentions.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.18 }}
                    className="group relative rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/60 hover:border-primary/40 transition-colors mb-2 last:mb-0"
                  >
                    <button
                      onClick={() => handleGo(m)}
                      className="w-full text-left p-3 pr-9"
                    >
                      <div className="flex items-start gap-2">
                        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                          <AtSign size={13} className="text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground line-clamp-1">
                            {m.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-wrap">
                            {m.message}
                          </p>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[10px] text-muted-foreground/70">
                              {formatDistanceToNow(new Date(m.created_at), {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                            </span>
                            {m.link && (
                              <span className="flex items-center gap-1 text-[10px] font-medium text-primary">
                                Ver card
                                <ArrowRight size={10} />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markRead(m.id);
                      }}
                      className="absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Marcar como lida"
                    >
                      <X size={12} />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
