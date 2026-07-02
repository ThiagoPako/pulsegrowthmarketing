import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/vpsDb';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Target, Film, Megaphone, Image as ImageIcon, Palette, DollarSign, Calculator } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, differenceInCalendarMonths } from 'date-fns';

interface DeliveryRecord {
  client_id: string; date: string;
  reels_produced: number; creatives_produced: number; stories_produced: number;
  arts_produced: number; delivery_status: string;
}
interface EditorTask { client_id: string; content_type: string; kanban_column: string; approved_at: string | null; updated_at: string; }
interface DesignTask { client_id: string; kanban_column: string; completed_at: string | null; updated_at?: string; attachment_url?: string | null; editable_file_url?: string | null; mockup_url?: string | null; }
interface SocialDelivery { client_id: string; content_type: string; delivered_at: string; status: string; }

const VIDEO_ROLES = ['videomaker', 'editor', 'social_media'];
const DESIGNER_ROLES = ['designer'];



export default function CostByContentType() {
  const { clients, users } = useApp();
  const [records, setRecords] = useState<DeliveryRecord[]>([]);
  const [editorTasks, setEditorTasks] = useState<EditorTask[]>([]);
  const [designTasks, setDesignTasks] = useState<DesignTask[]>([]);
  const [socialDeliveries, setSocialDeliveries] = useState<SocialDelivery[]>([]);
  const [selectedClient, setSelectedClient] = useState('all');
  const [periodType, setPeriodType] = useState<'current' | 'previous' | 'custom'>('current');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const fetchData = useCallback(async () => {
    const [rRes, sRes, edRes, dRes] = await Promise.all([
      supabase.from('delivery_records').select('client_id,date,reels_produced,creatives_produced,stories_produced,arts_produced,delivery_status'),
      supabase.from('social_media_deliveries').select('client_id,content_type,delivered_at,status'),
      supabase.from('content_tasks').select('client_id,content_type,kanban_column,approved_at,updated_at'),
      supabase.from('design_tasks').select('client_id,kanban_column,completed_at,updated_at,attachment_url,editable_file_url,mockup_url'),
    ]);
    if (rRes.data) setRecords(rRes.data as DeliveryRecord[]);
    if (sRes.data) setSocialDeliveries(sRes.data as SocialDelivery[]);
    if (edRes.data) setEditorTasks(edRes.data as EditorTask[]);
    if (dRes.data) setDesignTasks(dRes.data as DesignTask[]);
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

    // === QUANTIDADES ===
    const realizadas = records.filter(r => clientOk(r.client_id) && r.date >= dateRange.start && r.date <= dateRange.end && ['realizada','encaixe','extra'].includes(r.delivery_status));
    const recReels = realizadas.reduce((a, r) => a + (r.reels_produced || 0), 0);
    const recCri = realizadas.reduce((a, r) => a + (r.creatives_produced || 0), 0);
    const recSto = realizadas.reduce((a, r) => a + (r.stories_produced || 0), 0);
    const recArts = realizadas.reduce((a, r) => a + (r.arts_produced || 0), 0);

    const relevantTasks = editorTasks.filter(t => clientOk(t.client_id) && t.kanban_column === 'aprovado' && inPeriod(t.approved_at || t.updated_at));
    const ctReels = relevantTasks.filter(t => ['reels','reel'].includes(norm(t.content_type))).length;
    const ctCri = relevantTasks.filter(t => ['criativo','creative'].includes(norm(t.content_type))).length;
    const ctSto = relevantTasks.filter(t => ['story','stories'].includes(norm(t.content_type))).length;

    const socials = socialDeliveries.filter(d => clientOk(d.client_id) && (d.delivered_at || '').slice(0, 10) >= dateRange.start && (d.delivered_at || '').slice(0, 10) <= dateRange.end && d.status === 'postado');
    const sReels = socials.filter(d => norm(d.content_type) === 'reels').length;
    const sCri = socials.filter(d => norm(d.content_type) === 'criativo').length;
    const sSto = socials.filter(d => norm(d.content_type) === 'story').length;

    // Conta artes anexadas em cada card aprovado (attachment + mockup contam separadamente)
    const dtArts = designTasks
      .filter(t => clientOk(t.client_id) && t.kanban_column === 'aprovado' && inPeriod(t.completed_at || t.updated_at || null))
      .reduce((a, t) => a + (t.attachment_url ? 1 : 0) + (t.mockup_url ? 1 : 0) + (t.editable_file_url ? 1 : 0), 0);


    const reels = Math.max(recReels, ctReels, sReels);
    const criativos = Math.max(recCri, ctCri, sCri);
    const stories = Math.max(recSto, ctSto, sSto);
    const artes = Math.max(recArts, dtArts);

    // === SALÁRIOS por pool (sem sobreposição) ===
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    const months = Math.max(1, differenceInCalendarMonths(end, start) + 1);

    const monthlyVideoPool = users
      .filter(u => VIDEO_ROLES.includes(u.role))
      .reduce((a, u) => a + (u.monthlySalary || 0), 0);
    const monthlyDesignerPool = users
      .filter(u => DESIGNER_ROLES.includes(u.role))
      .reduce((a, u) => a + (u.monthlySalary || 0), 0);

    const videoPool = monthlyVideoPool * months;
    const designerPool = monthlyDesignerPool * months;
    const monthlyTotalSalaries = monthlyVideoPool + monthlyDesignerPool;
    const totalSalaries = videoPool + designerPool;

    // Pool vídeo: Reels=1.0, Criativo=0.5, Story=0.2
    const wReels = reels * 1.0, wCri = criativos * 0.5, wSto = stories * 0.2;
    const wTotal = wReels + wCri + wSto;
    const salReels = wTotal > 0 ? (videoPool * wReels) / wTotal : 0;
    const salCri = wTotal > 0 ? (videoPool * wCri) / wTotal : 0;
    const salSto = wTotal > 0 ? (videoPool * wSto) / wTotal : 0;

    // Pool designer: 100% para artes
    const salArt = designerPool;

    return {
      totalSalaries, monthlyTotalSalaries, months,
      videoPool, designerPool, monthlyVideoPool, monthlyDesignerPool,
      reels, criativos, stories, artes,
      cReels: reels > 0 ? salReels / reels : 0,
      cCri: criativos > 0 ? salCri / criativos : 0,
      cArt: artes > 0 ? salArt / artes : 0,
      cSto: stories > 0 ? salSto / stories : 0,
      salReels, salCri, salArt, salSto,
    };

  }, [records, editorTasks, designTasks, socialDeliveries, users, selectedClient, dateRange]);

  const fmt = (n: number) => n > 0 ? `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

  const items = [
    { icon: Film, label: 'Reels', qty: data.reels, cost: data.cReels, total: data.salReels, color: 'text-blue-600', border: 'hsl(217,91%,60%)' },
    { icon: Megaphone, label: 'Criativos', qty: data.criativos, cost: data.cCri, total: data.salCri, color: 'text-purple-600', border: 'hsl(262,83%,58%)' },
    { icon: Palette, label: 'Artes', qty: data.artes, cost: data.cArt, total: data.salArt, color: 'text-orange-600', border: 'hsl(24,95%,53%)' },
    { icon: ImageIcon, label: 'Stories', qty: data.stories, cost: data.cSto, total: data.salSto, color: 'text-pink-600', border: 'hsl(330,81%,60%)' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Target size={24} className="text-primary" /> Custo por Tipo de Conteúdo
        </h1>
        <p className="text-sm text-muted-foreground">Alocação proporcional dos salários da equipe de produção por peso de esforço (Reels=10, Criativo=5, Arte=4, Story=3)</p>
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
        <Card className="border-l-4" style={{ borderLeftColor: 'hsl(217,91%,60%)' }}>
          <CardContent className="p-4">
            <DollarSign size={18} className="text-blue-600 mb-2" />
            <p className="text-xl font-bold">{fmt(data.videoPool)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pool Vídeo ({data.months}m) — Videomaker + Editor + Social</p>
            <p className="text-[10px] text-muted-foreground mt-1">Folha mensal: {fmt(data.monthlyVideoPool)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: 'hsl(24,95%,53%)' }}>
          <CardContent className="p-4">
            <DollarSign size={18} className="text-orange-600 mb-2" />
            <p className="text-xl font-bold">{fmt(data.designerPool)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pool Designer ({data.months}m)</p>
            <p className="text-[10px] text-muted-foreground mt-1">Folha mensal: {fmt(data.monthlyDesignerPool)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <DollarSign size={18} className="text-muted-foreground mb-2" />
            <p className="text-xl font-bold">{fmt(data.totalSalaries)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total no Período</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <Calculator size={18} className="text-amber-600 mb-2" />
            <p className="text-xl font-bold">{data.reels + data.criativos + data.stories + data.artes}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Conteúdos Produzidos</p>
          </CardContent>
        </Card>
      </div>


      {data.monthlyTotalSalaries === 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="p-4 text-sm">
            <p className="font-semibold text-amber-700 dark:text-amber-400">⚠ Nenhum salário cadastrado</p>
            <p className="text-xs text-muted-foreground mt-1">Cadastre o salário mensal dos colaboradores em <b>Equipe</b> (campo "Salário Mensal") para os custos aparecerem aqui.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
