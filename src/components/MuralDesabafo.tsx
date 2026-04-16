import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useApp } from '@/contexts/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Trash2, MessageSquareQuote } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MuralMessage {
  id: string;
  message: string;
  author_name: string;
  author_id: string | null;
  created_at: string;
}

const CHALK_COLORS = [
  'text-white',
  'text-yellow-200',
  'text-pink-300',
  'text-sky-300',
  'text-lime-300',
  'text-orange-200',
  'text-purple-300',
];

function getChalkColor(index: number) {
  return CHALK_COLORS[index % CHALK_COLORS.length];
}

export default function MuralDesabafo() {
  const { user } = useAuth();
  const { currentUser } = useApp();
  const [messages, setMessages] = useState<MuralMessage[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('mural_desabafo')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setMessages(data as MuralMessage[]);
  };

  useEffect(() => {
    fetchMessages();
    const channel = supabase
      .channel('mural-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mural_desabafo' }, () => {
        fetchMessages();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleSend = async () => {
    if (!newMsg.trim() || !user || !currentUser) return;
    setSending(true);
    const { error } = await supabase.from('mural_desabafo').insert({
      message: newMsg.trim(),
      author_name: currentUser.name || 'Anônimo',
      author_id: user.id,
    });
    if (error) {
      toast.error('Não foi possível postar');
    } else {
      setNewMsg('');
    }
    setSending(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('mural_desabafo').delete().eq('id', id);
  };

  return (
    <div className="relative rounded-xl overflow-hidden border border-border/30">
      {/* Blackboard background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(145deg, #1a3a2a 0%, #1e4d35 25%, #193d2b 50%, #163522 75%, #1a3a2a 100%)',
        }}
      />
      {/* Chalk dust texture */}
      <div className="absolute inset-0 opacity-[0.08]" style={{
        backgroundImage: `radial-gradient(circle at 20% 30%, rgba(255,255,255,0.3) 0%, transparent 2%),
          radial-gradient(circle at 80% 60%, rgba(255,255,255,0.2) 0%, transparent 1.5%),
          radial-gradient(circle at 50% 10%, rgba(255,255,255,0.25) 0%, transparent 2%),
          radial-gradient(circle at 70% 80%, rgba(255,255,255,0.15) 0%, transparent 1%)`,
      }} />
      {/* Wooden frame */}
      <div className="absolute inset-0 border-[6px] rounded-xl pointer-events-none" style={{
        borderColor: '#5c3a1e',
        boxShadow: 'inset 0 0 10px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3)',
      }} />

      <div className="relative z-10 p-4 sm:p-5">
        {/* Title */}
        <div className="flex items-center gap-2 mb-3">
          <MessageSquareQuote size={18} className="text-yellow-200" />
          <h3
            className="text-base sm:text-lg font-bold text-white tracking-wide"
            style={{ fontFamily: "'Caveat', 'Segoe Script', 'Comic Sans MS', cursive", textShadow: '0 0 8px rgba(255,255,255,0.15)' }}
          >
            Mural do Desabafo 📝
          </h3>
        </div>

        {/* Messages area */}
        <div
          ref={scrollRef}
          className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1 mb-3 scrollbar-thin"
          style={{ scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}
        >
          <AnimatePresence mode="popLayout">
            {messages.length === 0 && (
              <p className="text-white/40 text-center text-sm italic py-6" style={{ fontFamily: "'Caveat', cursive" }}>
                O quadro está vazio... escreva algo! ✍️
              </p>
            )}
            {messages.map((msg, i) => (
              <motion.div
                key={msg.id}
                layout
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.25 }}
                className="group relative"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm sm:text-base leading-relaxed break-words ${getChalkColor(i)}`}
                      style={{
                        fontFamily: "'Caveat', 'Segoe Script', 'Comic Sans MS', cursive",
                        textShadow: '0 0 4px rgba(255,255,255,0.1)',
                        transform: `rotate(${(Math.random() - 0.5) * 1.5}deg)`,
                      }}
                    >
                      "{msg.message}"
                    </p>
                    <span className="text-[10px] text-white/30 mt-0.5 block" style={{ fontFamily: "'Caveat', cursive" }}>
                      — {msg.author_name} · {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                  {user?.id === msg.author_id && (
                    <button
                      onClick={() => handleDelete(msg.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/10 rounded"
                      title="Apagar"
                    >
                      <Trash2 size={12} className="text-red-300/70" />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Input */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value.slice(0, 200))}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Escreva no quadro... ✍️"
            maxLength={200}
            className="flex-1 bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
            style={{ fontFamily: "'Caveat', 'Segoe Script', 'Comic Sans MS', cursive" }}
          />
          <button
            onClick={handleSend}
            disabled={!newMsg.trim() || sending}
            className="p-2 bg-white/15 hover:bg-white/25 disabled:opacity-30 rounded-lg transition-colors"
          >
            <Send size={16} className="text-white" />
          </button>
        </div>
        <p className="text-[9px] text-white/20 mt-1 text-right">{newMsg.length}/200</p>
      </div>
    </div>
  );
}
