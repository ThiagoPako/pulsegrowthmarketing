import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinancialData, type FinancialContract } from '@/hooks/useFinancialData';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/vpsDb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, AlertTriangle, CheckCircle2, Clock, RefreshCw, Search, FileSignature } from 'lucide-react';
import { toast } from 'sonner';

type ContractExt = FinancialContract & {
  contract_end_date?: string | null;
  contract_duration_months?: number | null;
  renewed_at?: string | null;
  renewal_count?: number | null;
};

const daysBetween = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / 86400000);
const addMonths = (dateStr: string, months: number) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m - 1) + months, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
const fmtDate = (s?: string | null) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

export default function ContractsManagement() {
  const navigate = useNavigate();
  const { contracts, refetch } = useFinancialData();
  const { clients } = useApp();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'todos' | 'vencendo' | 'vencidos' | 'ativos'>('todos');
  const [renewOpen, setRenewOpen] = useState(false);
  const [selected, setSelected] = useState<ContractExt | null>(null);
  const [renewMonths, setRenewMonths] = useState(12);
  const [renewStart, setRenewStart] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const today = new Date();

  const enriched = useMemo(() => {
    return (contracts as ContractExt[])
      .filter(c => c.status === 'ativo')
      .map(c => {
        const client = clients.find(cl => cl.id === c.client_id);
        const durationMonths = c.contract_duration_months || 12;
        const endDate = c.contract_end_date || addMonths(c.contract_start_date, durationMonths);
        const start = new Date(c.contract_start_date);
        const end = new Date(endDate);
        const total = Math.max(1, daysBetween(start, end));
        const elapsed = Math.max(0, daysBetween(start, today));
        const remaining = daysBetween(today, end);
        const progress = Math.min(100, Math.max(0, (elapsed / total) * 100));
        let severity: 'ok' | 'warn' | 'danger' | 'expired' = 'ok';
        if (remaining < 0) severity = 'expired';
        else if (remaining <= 15) severity = 'danger';
        else if (remaining <= 45) severity = 'warn';
        return { c, client, endDate, durationMonths, progress, remaining, severity };
      })
      .sort((a, b) => a.remaining - b.remaining);
  }, [contracts, clients]);

  const filtered = enriched.filter(item => {
    if (search && !(item.client?.companyName || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'vencendo') return item.severity === 'warn' || item.severity === 'danger';
    if (filter === 'vencidos') return item.severity === 'expired';
    if (filter === 'ativos') return item.severity === 'ok';
    return true;
  });

  const stats = {
    total: enriched.length,
    vencendo: enriched.filter(e => e.severity === 'warn' || e.severity === 'danger').length,
    vencidos: enriched.filter(e => e.severity === 'expired').length,
    saudaveis: enriched.filter(e => e.severity === 'ok').length,
  };

  const openRenew = (item: typeof enriched[number]) => {
    setSelected(item.c);
    setRenewMonths(item.durationMonths);
    setRenewStart(item.endDate < new Date().toISOString().slice(0, 10) ? new Date().toISOString().slice(0, 10) : item.endDate);
    setRenewOpen(true);
  };

  const handleRenew = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const newEnd = addMonths(renewStart, renewMonths);
      const { error } = await supabase.from('financial_contracts').update({
        contract_start_date: renewStart,
        contract_end_date: newEnd,
        contract_duration_months: renewMonths,
        renewed_at: new Date().toISOString(),
        renewal_count: (selected.renewal_count || 0) + 1,
        status: 'ativo',
      } as any).eq('id', selected.id);
      if (error) throw error;
      toast.success(`Contrato renovado até ${fmtDate(newEnd)}`);
      setRenewOpen(false);
      setSelected(null);
      await refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao renovar contrato');
    } finally {
      setSaving(false);
    }
  };

  const severityStyle = (s: string) => {
    switch (s) {
      case 'expired': return { badge: 'destructive' as const, label: 'Vencido', icon: AlertTriangle, bar: 'bg-destructive', ring: 'ring-destructive/40' };
      case 'danger': return { badge: 'destructive' as const, label: 'Vence em breve', icon: AlertTriangle, bar: 'bg-destructive', ring: 'ring-destructive/30' };
      case 'warn': return { badge: 'secondary' as const, label: 'Atenção', icon: Clock, bar: 'bg-amber-500', ring: 'ring-amber-500/30' };
      default: return { badge: 'default' as const, label: 'Ativo', icon: CheckCircle2, bar: 'bg-primary', ring: 'ring-border' };
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft size={18} /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2"><FileSignature size={20} /> Contratos</h1>
          <p className="text-sm text-muted-foreground">Gestão de contratos ativos, vencimentos e renovações</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Contratos ativos</p><p className="text-2xl font-bold">{stats.total}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Saudáveis</p><p className="text-2xl font-bold text-primary">{stats.saudaveis}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Vencendo</p><p className="text-2xl font-bold text-amber-500">{stats.vencendo}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Vencidos</p><p className="text-2xl font-bold text-destructive">{stats.vencidos}</p></CardContent></Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ativos">Só saudáveis</SelectItem>
            <SelectItem value="vencendo">Vencendo (≤45 dias)</SelectItem>
            <SelectItem value="vencidos">Vencidos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">Nenhum contrato encontrado.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => {
            const style = severityStyle(item.severity);
            const Icon = style.icon;
            return (
              <Card
                key={item.c.id}
                className={`cursor-pointer transition-all hover:shadow-md ring-1 ${style.ring}`}
                onClick={() => openRenew(item)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{item.client?.companyName || 'Cliente removido'}</p>
                      <p className="text-xs text-muted-foreground">
                        Início {fmtDate(item.c.contract_start_date)} · Fim {fmtDate(item.endDate)}
                      </p>
                    </div>
                    <Badge variant={style.badge} className="shrink-0 gap-1"><Icon size={12} />{style.label}</Badge>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{item.durationMonths} meses</span>
                      <span className={item.severity === 'expired' ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                        {item.remaining < 0 ? `${Math.abs(item.remaining)}d vencido` : `${item.remaining}d restantes`}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full ${style.bar} transition-all`} style={{ width: `${item.progress}%` }} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                    <span className="text-muted-foreground">
                      R$ {Number(item.c.contract_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    {(item.c.renewal_count || 0) > 0 && (
                      <span className="text-muted-foreground">Renovado {item.c.renewal_count}x</span>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={(e) => { e.stopPropagation(); openRenew(item); }}>
                      <RefreshCw size={12} /> Renovar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={renewOpen} onOpenChange={setRenewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><RefreshCw size={18} /> Renovar contrato</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="p-3 rounded-md bg-muted/40">
                <p className="text-sm font-medium">
                  {clients.find(cl => cl.id === selected.client_id)?.companyName || '—'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Valor atual: R$ {Number(selected.contract_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Data de renovação</Label>
                  <Input type="date" value={renewStart} onChange={e => setRenewStart(e.target.value)} />
                </div>
                <div>
                  <Label>Duração (meses)</Label>
                  <Input type="number" min={1} max={60} value={renewMonths} onChange={e => setRenewMonths(Number(e.target.value) || 1)} />
                </div>
              </div>
              <div className="p-3 rounded-md bg-primary/10 text-sm">
                Novo vencimento: <strong>{fmtDate(addMonths(renewStart, renewMonths))}</strong>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRenewOpen(false)} disabled={saving}>Cancelar</Button>
                <Button onClick={handleRenew} disabled={saving}>
                  {saving ? 'Renovando...' : 'Confirmar renovação'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
