import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { OfficeMember } from './types';
import type { QuickMessage } from '@/lib/virtualOfficeRealtime';

interface Props {
  member: OfficeMember;
  currentUserId: string;
  messages: QuickMessage[];
  onSend: (text: string) => Promise<boolean>;
  onClose: () => void;
}

export default function QuickChatDialog({ member, currentUserId, messages, onSend, onClose }: Props) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    const ok = await onSend(message.trim());
    if (ok) setMessage('');
    else toast.error('Erro ao enviar mensagem rápida.');
    setSending(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <motion.div initial={{ y: 16, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 16, scale: 0.96 }}
        transition={{ duration: 0.18 }} onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border/60 bg-secondary/40 px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-card text-lg">
            {member.role === 'admin' ? '🧑‍💼' : member.role === 'videomaker' ? '🧑‍🎤' : member.role === 'editor' ? '🧑‍💻' : member.role === 'designer' ? '🧑‍🎨' : '🧑‍💻'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{member.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {member.isOnline ? '🟢 Online ao vivo' : '⚫ Offline'}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X size={16} /></Button>
        </div>
        <div ref={scrollRef} className="h-72 space-y-2 overflow-y-auto bg-background/50 px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <MessageCircle size={18} className="opacity-60" />
              <p className="text-xs">Envie uma mensagem rápida ao vivo.</p>
            </div>
          ) : messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.fromUserId === currentUserId ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-xs ${msg.fromUserId === currentUserId ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
                <p>{msg.message}</p>
                <p className={`mt-1 text-[10px] ${msg.fromUserId === currentUserId ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 border-t border-border/60 px-4 py-3">
          <Input value={message} onChange={e => setMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void handleSend()}
            placeholder={member.isOnline ? 'Mensagem rápida...' : 'Pessoa offline'}
            className="h-10 text-sm" disabled={!member.isOnline || sending} />
          <Button size="icon" className="h-10 w-10 shrink-0" onClick={() => void handleSend()}
            disabled={!member.isOnline || sending || !message.trim()}>
            <Send size={14} />
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
