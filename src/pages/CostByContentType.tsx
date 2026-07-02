import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/vpsDb';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Target, Film, Megaphone, Image as ImageIcon, DollarSign, Calculator } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

interface DeliveryRecord {
  client_id: string; date: string;
  reels_produced: number; creatives_produced: number; stories_produced: number;
  arts_produced: number; extras_produced: number; delivery_status: string;
}
interface EditorTask { client_id: string; content_type: string; kanban_column: string; approved_at: string | null; updated_at: string; }
interface SocialDelivery { client_id: string; content_type: string; delivered_at: string; status: string; }

export default function CostByContentType() {
  const { clients } = useApp();
  const [records, setRecords] = useState<DeliveryRecord[]>([]);
  const [editorTasks, setEditorTasks] = useState<EditorTask[]>([]);
  const [socialDeliveries, setSocialDeliveries] = useState<SocialDelivery[]>([]);
  const [salaryExpenses, setSalaryExpenses] = useState<{ amount: number; date: string }[]>([]);
  const [selectedClient, setSelectedClient] = useState('all');
  const [periodType, setPeriodType] = useState<'current' | 'previous' | 'custom'>('current');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const fetchData = useCallback(async () => {
    const [rRes, sRes, edRes, salCatRes] = await Promise.all([
      supabase.from('delivery_records').select('client_id,date,reels_produced,creatives_produced,stories_produced,arts_produced,extras_produced,delivery_status'),
      supabase.from('social_media_deliveries').select('client_id,content_type,delivered_at,status'),
      supabase.from('content_tasks').select('client_id,content_type,kanban_column,approved_at,updated_at'),
      supabase.from('expense_categories').select('id, name').or('name.ilike.%salário%,name.ilike.%salario%'),
    ]);
    if (rRes.data) setRecords(rRes.data as DeliveryRecord[]);
    if (sRes.data) setSocialDeliveries(sRes.data as SocialDelivery[]);
    if (edRes.data) setEditorTasks(edRes.data as EditorTask[]);
    const ids = (salCatRes.data || []).map((c: any) => c.id);
    if (ids.length > 0) {
      const expRes = await supabase.from('expenses').select('amount, date').in('category_id', ids);
      if (expRes.data) setSalaryExpenses(expRes.data as any[]);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const dateRange = useMemo(() => {
    const now = new Date();
    if (periodType === 'current') return { start: format(startOfMonth(now), 'yyyy-MM-dd'), end: format(endOfMonth(now), 'yyyy-MM-dd') };
    if (periodType === 'previous') {
      const prev = subMonths(now, 1);
      return { start: format(startOfMonth(prev), 'yyyy-MM-dd'), end: format(endOfMonth(prev), 'yyyy-MM-dd') };
    }
    return { start: customStart || format(startOfMonth(now), 'yyyy-MM-dd'), end: customEnd || format(endOfMonth(now), 'yyyy-MM-dd') };
  }, [periodType, customStart, customEnd]);

  const data = useMemo(() => {
    const norm = (t?: string) => (t || '').toLowerCase().trim();
    const inPeriod = (iso?: string | null) => { if (!iso) return false; const d = iso.slice(0, 10); return d >= dateRange.start && d <= dateRange.end; };
    const clientOk = (cid: string) => selectedClient === 'all' || cid === selectedClient;

    const realizadas = records.filter(r => clientOk(r.client_id) && r.date >= dateRange.start && r.date <= dateRange.end && ['realizada','encaixe','extra'].includes(r.delivery_status));
    const recReels = realizadas.reduce((a, r) => a + r.reels_produced, 0);
    const recCri = realizadas.reduce((a, r) => a + r.creatives_produced, 0);
    const recSto = realizadas.reduce((a, r) => a + r.stories_produced, 0);

    const relevantTasks = editorTasks.filter(t => clientOk(t.client_id) && inPeriod(t.approved_at || t.updated_at));
    const ctReels = relevantTasks.filter(t => ['reels','reel'].includes(norm(t.content_type))).length;
    const ctCri = relevantTasks.filter(t => ['criativo','creative'].includes(norm(t.content_type))).length;
    const ctSto = relevantTasks.filter(t => ['story','stories'].includes(norm(t.content_type))).length;

    const socials = socialDeliveries.filter(d => clientOk(d.client_id) && (d.delivered_at || '').slice(0, 10) >= dateRange.start && (d.delivered_at || '').slice(0, 10) <= dateRange.end);
    const sReels = socials.filter(d => norm(d.content_type) === 'reels' && d.status === 'postado').length;
    const sCri = socials.filter(d => norm(d.content_type) === 'criativo' && d.status === 'postado').length;
    const sSto = socials.filter(d => norm(d.content_type) === 'story' && d.status === 'postado').length;

    const reels = Math.max(recReels, ctReels, sReels);
    const criativos = Math.max(recCri, ctCri, sCri);
    const stories = Math.max(recSto, ctSto, sSto);

    const totalSalaries = salaryExpenses.filter(e => e.date >= dateRange.start && e.date <= dateRange.end).reduce((a, e) => a + Number(e.amount), 0);
    const wReels = reels * 10, wCri = criativos * 5, wSto = stories * 3;
    const wTotal = wReels + wCri + wSto;
    const salReels = wTotal > 0 ? (totalSalaries * wReels) / wTotal : 0;
    const salCri = wTotal > 0 ? (totalSalaries * wCri) / wTotal : 0;
    const salSto = wTotal > 0 ? (totalSalaries * wSto) / wTotal : 0;

    return {
      totalSalaries, reels, criativos, stories,
      cReels: reels > 0 ? salReels / reels : 0,
      cCri: criativos > 0 ? salCri / criativos : 0,
      cSto: stories > 0 ? salSto / stories : 0,
      salReels, salCri, salSto,
    };
  }, [records, editorTasks, socialDeliveries, salaryExpenses, selectedClient, dateRange]);

  const fmt = (n: number) => n > 0 ? `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

  const items = [
    { icon: Film, label: 'Reels', qty: data.reels, cost: data.cReels, total: data.salReels, color: 'text-blue-600', border: 'hsl(217,91%,60%)' },
    { icon: Megaphone, label: 'Criativos', qty: data.criativos, cost: data.cCri, total: data.salCri, color: 'text-purple-600', border: 'hsl(262,83%,58%)' },
    { icon: ImageIcon, label: 'Stories', qty: data.stories, cost: data.cSto, total: data.salSto, color: 'text-pink-600', border: 'hsl(330,81%,60%)' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Target size={24} className="text-primary" /> Custo por Tipo de Conteúdo
        </h1>
        <p className="text-sm text-muted-foreground">Alocação proporcional dos salários por peso de esforço (Reels=10, Criativo=5, Story=3)</p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Cliente</Label>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Período</Label>
            <div className="flex gap-1.5">
              {(['current', 'previous', 'custom'] as const).map(pt => (
                <Button key={pt} variant={periodType === pt ? 'default' : 'outline'} size="sm" onClick={() => setPeriodType(pt)}>
                  {pt === 'current' ? 'Mês atual' : pt === 'previous' ? 'Mês anterior' : 'Personalizado'}
                </Button>
              ))}
            </div>
          </div>
          {periodType === 'custom' && (
            <div className="flex gap-2 items-center">
              <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-36" />
              <span className="text-muted-foreground text-xs">até</span>
              <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-36" />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-l-4" style={{ borderLeftColor: 'hsl(var(--destructive))' }}>
          <CardContent className="p-4">
            <DollarSign size={18} className="text-destructive mb-2" />
            <p className="text-xl font-bold">{fmt(data.totalSalaries)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Salários (Período)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <Calculator size={18} className="text-amber-600 mb-2" />
            <p className="text-xl font-bold">{data.reels + data.criativos + data.stories}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Conteúdos Produzidos</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {items.map((it, i) => (
          <Card key={i} className="overflow-hidden border-l-4" style={{ borderLeftColor: it.border }}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <it.icon size={18} className={it.color} />
                <span className="text-[10px] text-muted-foreground">{it.qty} produzidos</span>
              </div>
              <p className="text-2xl font-bold">{fmt(it.cost)}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Custo por {it.label}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Total alocado: {fmt(it.total)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
