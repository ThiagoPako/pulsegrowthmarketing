import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Bot, Send, Sparkles, Trash2, Loader2, MessageSquare, TrendingUp, DollarSign, Users, BarChart3, Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

const SUGGESTED_QUESTIONS = [
  { icon: DollarSign, text: 'Qual o faturamento total deste mês?', color: 'text-emerald-500' },
  { icon: TrendingUp, text: 'Qual o lucro bruto acumulado no ano?', color: 'text-primary' },
  { icon: Users, text: 'Qual cliente gera mais receita?', color: 'text-cyan-500' },
  { icon: BarChart3, text: 'Quais as maiores categorias de despesa?', color: 'text-amber-500' },
  { icon: DollarSign, text: 'Qual o valor médio dos contratos ativos?', color: 'text-pink-500' },
  { icon: Users, text: 'Quantos clientes estão inadimplentes?', color: 'text-red-500' },
];

export default function FinancialChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
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

      // Fetch configured AI provider and model
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
    const text = messages.map(m => `[${m.role === 'user' ? 'Você' : 'Pulse AI'}]\n${m.content}\n`).join('\n---\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-financeiro-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Bot className="text-primary" size={24} /> Chat Financeiro IA
          </h1>
          <p className="text-sm text-muted-foreground">Pergunte sobre dados financeiros e operacionais da agência</p>
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
      <div className="flex-1 glass-card rounded-2xl flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {loadingHistory ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="animate-spin mr-2" size={16} /> Carregando histórico...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="text-primary" size={32} />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-lg">Assistente Financeiro Pulse</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  Faça perguntas em linguagem natural sobre receitas, despesas, clientes, contratos e dados operacionais da agência.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTED_QUESTIONS.map((sq, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(sq.text)}
                    className="flex items-center gap-2 p-3 rounded-xl border border-border bg-card hover:bg-accent transition-colors text-left text-sm"
                  >
                    <sq.icon size={16} className={sq.color} />
                    <span>{sq.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
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
                      <div className="flex items-center gap-1.5 mb-2 text-xs text-muted-foreground">
                        <Bot size={12} /> Pulse AI
                      </div>
                    )}
                    <div className={`prose prose-sm max-w-none ${msg.role === 'user' ? 'text-primary-foreground prose-invert' : ''}`}>
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted border border-border rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" />
                      Analisando dados financeiros...
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        <div className="p-3 border-t border-border">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex gap-2"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ex: Qual o faturamento do mês passado?"
              disabled={loading}
              className="flex-1"
              autoFocus
            />
            <Button type="submit" disabled={loading || !input.trim()} size="icon">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
