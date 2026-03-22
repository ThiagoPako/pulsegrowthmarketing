import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/vpsDb';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Send, Trash2, Loader2, TrendingUp, DollarSign, Users, BarChart3, Download, Calendar, Video, FileText, Palette } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

const SUGGESTED_QUESTIONS = [
  { icon: DollarSign, text: 'Qual o faturamento total deste mês?', color: 'text-emerald-500', category: '💰' },
  { icon: TrendingUp, text: 'Qual o lucro bruto acumulado no ano?', color: 'text-primary', category: '📊' },
  { icon: Users, text: 'Quantos clientes estão inadimplentes?', color: 'text-red-500', category: '👥' },
  { icon: Calendar, text: 'Quais gravações estão agendadas esta semana?', color: 'text-cyan-500', category: '🎬' },
  { icon: Video, text: 'Quantos vídeos foram entregues este mês?', color: 'text-amber-500', category: '📦' },
  { icon: FileText, text: 'Quantos roteiros estão pendentes?', color: 'text-pink-500', category: '📝' },
  { icon: Palette, text: 'Quais tarefas de design estão em andamento?', color: 'text-purple-500', category: '🎨' },
  { icon: BarChart3, text: 'Qual cliente tem mais entregas este mês?', color: 'text-orange-500', category: '🏆' },
];

const RocketMascot = ({ isThinking }: { isThinking: boolean }) => (
  <motion.div
    className="relative"
    animate={isThinking ? { y: [0, -6, 0] } : { y: 0 }}
    transition={isThinking ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : {}}
  >
    <div className="text-4xl select-none">🚀</div>
    {isThinking && (
      <motion.div
        className="absolute -bottom-2 left-1/2 -translate-x-1/2"
        animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.1, 0.8] }}
        transition={{ duration: 0.8, repeat: Infinity }}
      >
        <span className="text-lg">🔥</span>
      </motion.div>
    )}
  </motion.div>
);

export default function FinancialChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadHistory(); }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const loadHistory = async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from('financial_chat_messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(100);
    if (data) setMessages(data as ChatMessage[]);
    setLoadingHistory(false);
  };

  const handleSend = async (questionText?: string) => {
    const q = questionText || input.trim();
    if (!q || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: q,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      const { data: aiIntegration } = await supabase
        .from('api_integrations')
        .select('config')
        .in('provider', ['ai_gemini', 'ai_openai', 'ai_claude'])
        .eq('status', 'ativo')
        .limit(1)
        .single();
      const aiModel = (aiIntegration as any)?.config?.ai_model || undefined;
      const aiProvider = (aiIntegration as any)?.config?.ai_provider || undefined;

      const response = await supabase.functions.invoke('financial-chat', {
        body: {
          question: q,
          conversationHistory: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
          aiModel,
          aiProvider,
        },
      });

      if (response.error) throw new Error(response.error.message);

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.data.answer,
        created_at: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('Chat error:', err);
      toast.error('Erro ao processar pergunta');
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '❌ Desculpe, ocorreu um erro ao processar sua pergunta. Tente novamente.',
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleClear = async () => {
    if (!user) return;
    await supabase.from('financial_chat_messages').delete().eq('user_id', user.id);
    setMessages([]);
    toast.success('Histórico limpo');
  };

  const handleExport = () => {
    const text = messages.map(m => `[${m.role === 'user' ? 'Você' : 'Foguetinho 🚀'}]\n${m.content}\n`).join('\n---\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-pulse-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <RocketMascot isThinking={loading} />
          <div>
            <h1 className="text-2xl font-display font-bold bg-gradient-to-r from-primary to-orange-400 bg-clip-text text-transparent">
              Foguetinho IA
            </h1>
            <p className="text-sm text-muted-foreground">Pergunte qualquer coisa sobre a agência</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={messages.length === 0}>
            <Download size={14} className="mr-1" /> Exportar
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear} disabled={messages.length === 0}>
            <Trash2 size={14} className="mr-1" /> Limpar
          </Button>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 glass-card rounded-2xl flex flex-col overflow-hidden border border-primary/10">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {loadingHistory ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="animate-spin mr-2" size={16} /> Carregando histórico...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', bounce: 0.5 }}
                className="text-6xl"
              >
                🚀
              </motion.div>
              <div className="text-center">
                <h3 className="font-display font-bold text-xl bg-gradient-to-r from-primary to-orange-400 bg-clip-text text-transparent">
                  Fala comigo! Sou o Foguetinho 🔥
                </h3>
                <p className="text-sm text-muted-foreground mt-2 max-w-md">
                  Pergunte sobre finanças, clientes, gravações, entregas, roteiros, design, equipe — qualquer dado do sistema Pulse!
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
                {SUGGESTED_QUESTIONS.map((sq, i) => (
                  <motion.button
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => handleSend(sq.text)}
                    className="flex items-center gap-2 p-3 rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/30 transition-all text-left text-sm group"
                  >
                    <span className="text-base">{sq.category}</span>
                    <span className="group-hover:text-foreground text-muted-foreground transition-colors">{sq.text}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-muted border border-border rounded-bl-md'
                      }`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="flex items-center gap-1.5 mb-2 text-xs text-muted-foreground font-medium">
                          <span>🚀</span> Foguetinho
                        </div>
                      )}
                      <div className={`prose prose-sm max-w-none ${msg.role === 'user' ? 'text-primary-foreground prose-invert' : ''}`}>
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="bg-muted border border-border rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <motion.span
                        animate={{ rotate: [0, 15, -15, 0] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      >
                        🚀
                      </motion.span>
                      <span>Analisando dados do sistema...</span>
                      <Loader2 size={14} className="animate-spin" />
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        <div className="p-3 border-t border-border bg-card/50">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex gap-2"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte qualquer coisa sobre a agência..."
              disabled={loading}
              className="flex-1"
              autoFocus
            />
            <Button type="submit" disabled={loading || !input.trim()} size="icon" className="bg-gradient-to-r from-primary to-orange-500 hover:from-primary/90 hover:to-orange-500/90">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
