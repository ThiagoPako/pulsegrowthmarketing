import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Briefcase, Play, Square, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/vpsDb';
import { useApp } from '@/contexts/AppContext';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Toggle para Gestor de Projetos marcar que está trabalhando.
 * Grava `profiles.working_since` — o Escritório Virtual usa esse flag
 * para posicionar a gestora na sala "Gestão de Projetos".
 */
export default function GestorWorkingToggle() {
  const { currentUser } = useApp();
  const [workingSince, setWorkingSince] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    if (!currentUser) return;
    const { data } = await supabase.from('profiles').select('working_since').eq('id', currentUser.id).maybeSingle() as any;
    setWorkingSince(data?.working_since ?? null);
  }, [currentUser]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  if (currentUser?.role !== 'gestor_projetos') return null;

  const isWorking = Boolean(workingSince);
  const elapsedLabel = workingSince
    ? formatDistanceToNow(new Date(workingSince), { locale: ptBR, addSuffix: false })
    : null;

  const toggle = async () => {
    if (!currentUser) return;
    setLoading(true);
    const nextValue = isWorking ? null : new Date().toISOString();
    try {
      const { error } = await supabase.from('profiles').update({ working_since: nextValue } as any).eq('id', currentUser.id);
      if (error) {
        console.error('[GestorWorkingToggle] update error:', error);
        const msg = String(error?.message || error?.hint || '');
        if (/working_since/i.test(msg) || /column/i.test(msg)) {
          toast.error('Coluna working_since ausente no banco. Rode a migração na VPS.');
        } else {
          toast.error(`Falha ao atualizar: ${msg || 'erro desconhecido'}`);
        }
        return;
      }
      setWorkingSince(nextValue);
      toast.success(nextValue ? '💼 Expediente iniciado! Você está no escritório.' : '👋 Expediente encerrado.');
    } catch (e: any) {
      console.error('[GestorWorkingToggle] exception:', e);
      toast.error(`Erro: ${e?.message || 'falha ao conectar'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border p-4 flex items-center justify-between gap-4"
      style={{
        background: isWorking
          ? 'linear-gradient(135deg, hsl(280 60% 20% / 0.9), hsl(310 55% 25% / 0.9))'
          : 'linear-gradient(135deg, hsl(var(--card)), hsl(var(--muted)))',
        borderColor: isWorking ? 'hsl(280 70% 55%)' : 'hsl(var(--border))',
      }}
    >
      <div className="flex items-center gap-3">
        <div className="rounded-lg p-2" style={{ backgroundColor: isWorking ? 'hsl(280 70% 55% / 0.25)' : 'hsl(var(--muted))' }}>
          <Briefcase className="h-5 w-5" style={{ color: isWorking ? '#e9d5ff' : 'hsl(var(--muted-foreground))' }} />
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: isWorking ? '#f5e8ff' : 'hsl(var(--foreground))' }}>
            {isWorking ? 'Você está trabalhando' : 'Marcar que estou trabalhando'}
          </p>
          <p className="text-xs" style={{ color: isWorking ? '#d8b4fe' : 'hsl(var(--muted-foreground))' }}>
            {isWorking
              ? `Ativo há ${elapsedLabel} • aparecendo no Escritório Virtual`
              : 'Clique para entrar na sua sala de gestão de projetos'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-transform hover:scale-105 disabled:opacity-60"
        style={{
          backgroundColor: isWorking ? '#dc2626' : '#7c3aed',
          color: '#fff',
          boxShadow: `0 4px 12px ${isWorking ? '#dc262666' : '#7c3aed66'}`,
        }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : isWorking ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {isWorking ? 'Encerrar' : 'Começar'}
      </button>
    </motion.div>
  );
}
