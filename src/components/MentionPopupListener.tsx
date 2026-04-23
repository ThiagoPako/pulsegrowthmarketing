import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/vpsDb';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AtSign, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface MentionNotification {
  id: string;
  title: string;
  message: string;
  link: string | null;
}

/**
 * Listens for `mention` type notifications addressed to the current user
 * and shows a centered popup with a CTA to jump to the source (Kanban card).
 */
export default function MentionPopupListener() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState<MentionNotification | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`mentions_rt_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          const n = payload.new;
          if (!n || n.type !== 'mention') return;
          if (seenIdsRef.current.has(n.id)) return;
          // Ignore mentions older than session start (avoid stale popups on reload)
          const ts = new Date(n.created_at).getTime();
          if (ts < startedAtRef.current - 5000) return;
          seenIdsRef.current.add(n.id);
          setPending({
            id: n.id,
            title: n.title || 'Você foi mencionado',
            message: n.message || 'Abra o Kanban para ver o card.',
            link: n.link || null,
          });
          // Soft sound
          try {
            const audio = new Audio(
              'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
            );
            audio.volume = 0.4;
            audio.play().catch(() => {});
          } catch {}
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const markRead = async (id: string) => {
    try {
      await supabase.from('notifications').update({ read: true } as any).eq('id', id);
    } catch {}
  };

  const handleGo = () => {
    if (!pending) return;
    const link = pending.link;
    markRead(pending.id);
    setPending(null);
    if (link) {
      // internal SPA link
      if (link.startsWith('/')) {
        navigate(link);
      } else {
        window.open(link, '_blank');
      }
    }
  };

  const handleDismiss = () => {
    if (pending) markRead(pending.id);
    setPending(null);
  };

  return (
    <Dialog open={!!pending} onOpenChange={(o) => { if (!o) handleDismiss(); }}>
      <DialogContent className="sm:max-w-md border-primary/20 bg-card/95 backdrop-blur-xl shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <motion.div
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/30"
            >
              <AtSign size={22} className="text-primary-foreground" />
            </motion.div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base">{pending?.title}</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Você foi mencionado em um card do Kanban
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-lg bg-muted/40 border border-border/60 px-4 py-3 text-sm text-foreground/90 whitespace-pre-wrap">
          {pending?.message}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={handleDismiss}>
            Mais tarde
          </Button>
          <Button onClick={handleGo} className="gap-2">
            Ver no Kanban
            <ArrowRight size={15} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
