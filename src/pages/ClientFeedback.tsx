import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Star, Rocket, Send, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function ClientFeedback() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [valid, setValid] = useState<boolean | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState(5);

  useEffect(() => {
    if (!token) { setValid(false); return; }
    supabase
      .from('client_testimonials')
      .select('id, status')
      .eq('token', token)
      .maybeSingle()
      .then(({ data }) => {
        setValid(!!data && data.status === 'pending');
      });
  }, [token]);

  const handleSubmit = async () => {
    if (!name.trim() || !message.trim()) {
      toast.error('Preencha seu nome e depoimento');
      return;
    }
    setLoading(true);
    const { error } = await supabase
      .from('client_testimonials')
      .update({
        client_name: name.trim(),
        client_role: role.trim(),
        message: message.trim(),
        rating,
        status: 'submitted',
        updated_at: new Date().toISOString(),
      })
      .eq('token', token!);

    if (error) {
      toast.error('Erro ao enviar feedback');
    } else {
      setSubmitted(true);
    }
    setLoading(false);
  };

  if (valid === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center">
          <Rocket size={48} className="text-muted-foreground mx-auto mb-4" />
          <h1 className="text-xl font-bold text-foreground">Link inválido ou já utilizado</h1>
          <p className="text-sm text-muted-foreground mt-2">Este link de feedback não é mais válido.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
          <CheckCircle2 size={64} className="text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground">Obrigado pelo seu feedback!</h1>
          <p className="text-muted-foreground mt-2">Seu depoimento é muito importante para nós. 🚀</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
            <Rocket size={24} className="text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Pulse Growth Marketing</h1>
          <p className="text-muted-foreground mt-2">Conte como foi sua experiência conosco!</p>
        </div>

        <div className="space-y-4 p-6 rounded-2xl border border-border/60 bg-card">
          <div>
            <label className="text-sm font-medium text-foreground">Seu nome *</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Maria Clara" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Seu cargo/empresa</label>
            <Input value={role} onChange={e => setRole(e.target.value)} placeholder="Ex: Dona de restaurante" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Avaliação</label>
            <div className="flex gap-1 mt-2">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => setRating(s)} className="transition-transform hover:scale-110">
                  <Star size={28} className={s <= rating ? 'text-warning fill-warning' : 'text-muted-foreground/30'} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Seu depoimento *</label>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Conte como a Pulse ajudou sua empresa..."
              rows={4}
              className="mt-1"
            />
          </div>
          <Button onClick={handleSubmit} disabled={loading} className="w-full gap-2">
            <Send size={14} /> {loading ? 'Enviando...' : 'Enviar feedback'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
