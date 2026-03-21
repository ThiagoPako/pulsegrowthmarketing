import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/vpsDb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, X, Calendar, Clock, User, Building2, Film, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';

interface SpecialRequest {
  id: string;
  client_id: string;
  company_name: string;
  videomaker_name: string;
  date: string;
  start_time: string;
  status: string;
  created_at: string;
}

export default function ClientRelationship() {
  const [requests, setRequests] = useState<SpecialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectDialog, setRejectDialog] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'solicitada' | 'agendada' | 'cancelada'>('all');

  const fetchRequests = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('recordings')
        .select('id, client_id, date, start_time, status, created_at, videomaker_id')
        .eq('type', 'extra')
        .order('created_at', { ascending: false });

      if (!data) { setRequests([]); setLoading(false); return; }

      // Fetch client names and videomaker names
      const clientIds = [...new Set((data as any[]).map((r: any) => r.client_id))];
      const vmIds = [...new Set((data as any[]).map((r: any) => r.videomaker_id).filter(Boolean))];

      const [clientsRes, vmsRes] = await Promise.all([
        clientIds.length > 0 ? supabase.from('clients').select('id, company_name').in('id', clientIds) : { data: [] },
        vmIds.length > 0 ? supabase.from('profiles').select('id, name').in('id', vmIds) : { data: [] },
      ]);

      const clientMap: Record<string, string> = {};
      (clientsRes.data || []).forEach((c: any) => { clientMap[c.id] = c.company_name; });
      const vmMap: Record<string, string> = {};
      (vmsRes.data || []).forEach((v: any) => { vmMap[v.id] = v.name; });

      setRequests((data as any[]).map((r: any) => ({
        id: r.id,
        client_id: r.client_id,
        company_name: clientMap[r.client_id] || 'Cliente',
        videomaker_name: vmMap[r.videomaker_id] || '—',
        date: r.date,
        start_time: r.start_time || '09:00',
        status: r.status,
        created_at: r.created_at,
      })));
    } catch (err) {
      console.error('Error fetching requests:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Poll every 15s
  useEffect(() => {
    const interval = setInterval(fetchRequests, 15000);
    return () => clearInterval(interval);
  }, [fetchRequests]);

  const handleApprove = async (req: SpecialRequest) => {
    setProcessing(req.id);
    try {
      const res = await fetch('https://agenciapulse.tech/api/portal-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_special', client_id: req.client_id, recording_id: req.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao aprovar');
      toast.success(`Gravação aprovada para ${req.company_name}!`);
      fetchRequests();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!rejectDialog || !rejectReason.trim()) {
      toast.error('Informe o motivo da rejeição');
      return;
    }
    const req = requests.find(r => r.id === rejectDialog);
    if (!req) return;
    setProcessing(req.id);
    try {
      const res = await fetch('https://agenciapulse.tech/api/portal-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject_special', client_id: req.client_id, recording_id: req.id, rejection_reason: rejectReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao rejeitar');
      toast.success('Solicitação rejeitada');
      setRejectDialog(null);
      setRejectReason('');
      fetchRequests();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(null);
    }
  };

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);
  const pendingCount = requests.filter(r => r.status === 'solicitada').length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'solicitada': return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Aguardando</Badge>;
      case 'agendada': return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Aprovada</Badge>;
      case 'cancelada': return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Rejeitada</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relacionamento com Cliente</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie solicitações de gravação especial dos clientes
          </p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle size={16} className="text-amber-400" />
            <span className="text-sm font-medium text-amber-400">{pendingCount} aguardando aprovação</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: 'all', label: 'Todas' },
          { key: 'solicitada', label: 'Pendentes' },
          { key: 'agendada', label: 'Aprovadas' },
          { key: 'cancelada', label: 'Rejeitadas' },
        ] as const).map(f => (
          <Button
            key={f.key}
            variant={filter === f.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f.key)}
            className="text-xs"
          >
            {f.label}
            {f.key === 'solicitada' && pendingCount > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {pendingCount}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Film size={40} className="mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">Nenhuma solicitação encontrada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          <AnimatePresence>
            {filtered.map((req, i) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ delay: i * 0.03 }}
              >
                <Card className={`transition-all ${req.status === 'solicitada' ? 'border-amber-500/30 bg-amber-500/[0.02]' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      {/* Info */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <Building2 size={14} className="text-primary" />
                            <span className="font-semibold text-sm">{req.company_name}</span>
                          </div>
                          {getStatusBadge(req.status)}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            {(() => {
                              try { return format(new Date(req.date + 'T12:00:00'), "dd 'de' MMM, yyyy", { locale: ptBR }); }
                              catch { return req.date; }
                            })()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {req.start_time}
                          </span>
                          <span className="flex items-center gap-1">
                            <User size={12} />
                            {req.videomaker_name}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      {req.status === 'solicitada' && (
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                            disabled={processing === req.id}
                            onClick={() => handleApprove(req)}
                          >
                            <Check size={14} />
                            Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10"
                            disabled={processing === req.id}
                            onClick={() => { setRejectDialog(req.id); setRejectReason(''); }}
                          >
                            <X size={14} />
                            Rejeitar
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={() => { setRejectDialog(null); setRejectReason(''); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Motivo da rejeição</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Explique ao cliente por que a gravação não pode ser atendida nesta data.
            </p>
            <Textarea
              placeholder="Ex: Infelizmente não temos disponibilidade de equipe para essa data. Sugerimos reagendar para..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRejectDialog(null); setRejectReason(''); }}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectReason.trim() || !!processing}
            >
              Confirmar rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
