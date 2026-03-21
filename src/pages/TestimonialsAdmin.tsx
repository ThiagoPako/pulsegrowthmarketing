import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Star, Copy, Check, Trash2, Plus, ExternalLink, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';

interface Testimonial {
  id: string;
  client_name: string;
  client_role: string;
  message: string;
  rating: number;
  token: string;
  status: string;
  created_at: string;
  approved_at: string | null;
}

export default function TestimonialsAdmin() {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchAll = useCallback(async () => {
    const { data } = await supabase
      .from('client_testimonials')
      .select('*')
      .order('created_at', { ascending: false });
    setItems((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const createLink = async () => {
    setCreating(true);
    const { error } = await supabase
      .from('client_testimonials')
      .insert({ client_name: '', client_role: '', message: '', status: 'pending' });
    if (error) toast.error('Erro ao criar link');
    else { toast.success('Link de feedback criado!'); fetchAll(); }
    setCreating(false);
  };

  const approve = async (id: string) => {
    await supabase
      .from('client_testimonials')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', id);
    toast.success('Depoimento aprovado e visível na landing page!');
    fetchAll();
  };

  const reject = async (id: string) => {
    await supabase
      .from('client_testimonials')
      .update({ status: 'rejected' })
      .eq('id', id);
    toast.info('Depoimento rejeitado');
    fetchAll();
  };

  const remove = async (id: string) => {
    await supabase.from('client_testimonials').delete().eq('id', id);
    toast.success('Removido');
    fetchAll();
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/feedback?token=${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copiado!');
  };

  const shareWhatsApp = (token: string) => {
    const url = `${window.location.origin}/feedback?token=${token}`;
    const msg = encodeURIComponent(`Olá! Gostaríamos muito do seu feedback sobre nosso trabalho. Clique no link para nos avaliar: ${url}`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending: { label: 'Aguardando', variant: 'outline' },
    submitted: { label: 'Recebido', variant: 'secondary' },
    approved: { label: 'Aprovado', variant: 'default' },
    rejected: { label: 'Rejeitado', variant: 'destructive' },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Depoimentos de Clientes</h1>
          <p className="text-sm text-muted-foreground">Gere links de feedback, aprove e exiba na landing page</p>
        </div>
        <Button onClick={createLink} disabled={creating} className="gap-2">
          <Plus size={14} /> Gerar link de feedback
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Star size={48} className="text-muted-foreground/30 mb-4" />
            <h3 className="font-semibold text-foreground">Nenhum depoimento ainda</h3>
            <p className="text-sm text-muted-foreground mt-1">Clique em "Gerar link de feedback" para enviar para seus clientes</p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="grid gap-4">
            <AnimatePresence>
              {items.map(t => {
                const cfg = statusConfig[t.status] || statusConfig.pending;
                return (
                  <motion.div key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <Card className="glass-card">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant={cfg.variant}>{cfg.label}</Badge>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(t.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                              </span>
                            </div>

                            {t.status === 'pending' ? (
                              <div className="space-y-3">
                                <p className="text-sm text-muted-foreground italic">Aguardando resposta do cliente...</p>
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline" onClick={() => copyLink(t.token)} className="gap-1.5">
                                    <Copy size={12} /> Copiar link
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => shareWhatsApp(t.token)} className="gap-1.5 text-emerald-600">
                                    <MessageCircle size={12} /> Enviar por WhatsApp
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                    <span className="text-xs font-bold text-primary">{t.client_name?.[0] || '?'}</span>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-sm text-foreground">{t.client_name || 'Sem nome'}</p>
                                    <p className="text-xs text-muted-foreground">{t.client_role || ''}</p>
                                  </div>
                                  <div className="flex gap-0.5 ml-2">
                                    {[1, 2, 3, 4, 5].map(s => (
                                      <Star key={s} size={12} className={s <= t.rating ? 'text-warning fill-warning' : 'text-muted-foreground/20'} />
                                    ))}
                                  </div>
                                </div>
                                <p className="text-sm text-muted-foreground italic leading-relaxed">"{t.message}"</p>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-1.5 shrink-0">
                            {t.status === 'submitted' && (
                              <>
                                <Button size="sm" onClick={() => approve(t.id)} className="gap-1.5">
                                  <Check size={12} /> Aprovar
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => reject(t.id)} className="gap-1.5 text-destructive">
                                  <Trash2 size={12} /> Rejeitar
                                </Button>
                              </>
                            )}
                            {(t.status === 'approved' || t.status === 'rejected') && (
                              <Button size="sm" variant="ghost" onClick={() => remove(t.id)} className="text-destructive">
                                <Trash2 size={12} />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
