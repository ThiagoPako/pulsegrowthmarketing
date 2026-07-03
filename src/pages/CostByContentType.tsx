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
  client_id: string | null;
  date: string;
  reels_produced: number | string | null;
  creatives_produced: number | string | null;
  stories_produced: number | string | null;
  arts_produced: number | string | null;
  delivery_status: string;
}
interface EditorTask {
  client_id: string | null;
  content_type: string | null;
  kanban_column: string;
  approved_at: string | null;
  updated_at: string | null;
  created_at?: string | null;
  assigned_to?: string | null;
}
interface DesignTask {
  client_id: string | null;
  kanban_column: string;
  completed_at: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  attachment_url?: string | null;
  attachment_urls?: string[] | null;
  editable_file_url?: string | null;
  mockup_url?: string | null;
}
interface SocialDelivery {
  client_id: string | null;
  content_type: string | null;
  delivered_at: string | null;
  posted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  status: string;
}

const EDITOR_ROLES = ['editor', 'social_media'];
const VIDEOMAKER_ROLES = ['videomaker'];
const DESIGNER_ROLES = ['designer'];
const VIDEO_EFFORT = { reels: 1, criativo: 0.5, story: 0.2 } as const;

// Colunas/estados que representam conteúdo produzido. Antes só "aprovado" era contado,
// por isso muitos períodos apareciam sem custo mesmo com cards em envio/agendamento/arquivados.
const PRODUCED_EDITOR_COLUMNS = new Set(['aprovado', 'envio', 'agendamentos', 'acompanhamento', 'arquivado', 'publicado', 'finalizado']);
const PRODUCED_DESIGN_COLUMNS = new Set(['aprovado', 'enviar_cliente', 'em_analise', 'concluida', 'aprovada_cliente']);
const PRODUCED_SOCIAL_STATUSES = new Set(['postado', 'publicado', 'posted', 'agendado', 'scheduled', 'entregue', 'delivered']);

const toNumber = (value: number | string | null | undefined): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const normalized = value.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeText = (value?: string | null) => (value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

const normalizeContentType = (value?: string | null): 'reels' | 'criativo' | 'story' | 'arte' | 'outro' => {
  const type = normalizeText(value);
  if (['reel', 'reels', 'video', 'videos'].includes(type)) return 'reels';
  if (['criativo', 'criativos', 'creative', 'creatives', 'ads', 'ad'].includes(type)) return 'criativo';
  if (['story', 'stories', 'storie'].includes(type)) return 'story';
  if (['arte', 'artes', 'feed', 'post', 'carrossel', 'carrossel feed'].includes(type)) return 'arte';
  return 'outro';
};

const inDateRange = (value: string | null | undefined, start: string, end: string) => {
  if (!value) return false;
  const day = value.slice(0, 10);
  return day >= start && day <= end;
};

const countDesignAttachments = (task: DesignTask): number => {
  const urls = Array.isArray(task.attachment_urls) ? task.attachment_urls.filter(Boolean) : [];
  const singleAttachment = task.attachment_url && !urls.includes(task.attachment_url) ? 1 : 0;
  const mockup = task.mockup_url ? 1 : 0;
  return urls.length + singleAttachment + mockup;
};

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
      supabase.from('social_media_deliveries').select('client_id,content_type,delivered_at,posted_at,created_at,updated_at,status'),
      supabase.from('content_tasks').select('client_id,content_type,kanban_column,approved_at,updated_at,created_at,assigned_to'),
      supabase.from('design_tasks').select('client_id,kanban_column,completed_at,updated_at,created_at,attachment_url,attachment_urls,editable_file_url,mockup_url'),
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
    const clientOk = (cid?: string | null) => selectedClient === 'all' || cid === selectedClient;

    // === QUANTIDADES ===
    const realizadas = records.filter(r => (
      clientOk(r.client_id)
      && inDateRange(r.date, dateRange.start, dateRange.end)
      && ['realizada', 'encaixe', 'extra'].includes(normalizeText(r.delivery_status))
    ));
    const recReels = realizadas.reduce((a, r) => a + toNumber(r.reels_produced), 0);
    const recCri = realizadas.reduce((a, r) => a + toNumber(r.creatives_produced), 0);
    const recSto = realizadas.reduce((a, r) => a + toNumber(r.stories_produced), 0);
    const recArts = realizadas.reduce((a, r) => a + toNumber(r.arts_produced), 0);

    const relevantTasks = editorTasks.filter(t => {
      const column = normalizeText(t.kanban_column);
      const referenceDate = t.approved_at || t.updated_at || t.created_at;
      return clientOk(t.client_id) && (PRODUCED_EDITOR_COLUMNS.has(column) || !!t.approved_at) && inDateRange(referenceDate, dateRange.start, dateRange.end);
    });
    const ctReels = relevantTasks.filter(t => normalizeContentType(t.content_type) === 'reels').length;
    const ctCri = relevantTasks.filter(t => normalizeContentType(t.content_type) === 'criativo').length;
    const ctSto = relevantTasks.filter(t => normalizeContentType(t.content_type) === 'story').length;

    const socials = socialDeliveries.filter(d => {
      const referenceDate = d.posted_at || d.delivered_at || d.updated_at || d.created_at;
      return clientOk(d.client_id) && inDateRange(referenceDate, dateRange.start, dateRange.end) && PRODUCED_SOCIAL_STATUSES.has(normalizeText(d.status));
    });
    const sReels = socials.filter(d => normalizeContentType(d.content_type) === 'reels').length;
    const sCri = socials.filter(d => normalizeContentType(d.content_type) === 'criativo').length;
    const sSto = socials.filter(d => normalizeContentType(d.content_type) === 'story').length;

    // Conta artes anexadas em cada card produzido (attachment_urls + attachment/mockup contam separadamente).
    const dtArts = designTasks
      .filter(t => clientOk(t.client_id) && PRODUCED_DESIGN_COLUMNS.has(normalizeText(t.kanban_column)) && inDateRange(t.completed_at || t.updated_at || t.created_at, dateRange.start, dateRange.end))
      .reduce((a, t) => a + countDesignAttachments(t), 0);

    // Total geral de artes (calculado aqui; reels/criativos/stories abaixo)
    const artes = Math.max(recArts, dtArts);

    // === SALÁRIOS por pool (sem sobreposição) ===
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    const months = Math.max(1, differenceInCalendarMonths(end, start) + 1);

    const monthlyEditorPool = users
      .filter(u => EDITOR_ROLES.includes(u.role))
      .reduce((a, u) => a + toNumber(u.monthlySalary), 0);
    const monthlyVmPool = users
      .filter(u => VIDEOMAKER_ROLES.includes(u.role))
      .reduce((a, u) => a + toNumber(u.monthlySalary), 0);
    const monthlyDesignerPool = users
      .filter(u => DESIGNER_ROLES.includes(u.role))
      .reduce((a, u) => a + toNumber(u.monthlySalary), 0);

    const editorPool = monthlyEditorPool * months;
    const vmPool = monthlyVmPool * months;
    const designerPool = monthlyDesignerPool * months;
    const monthlyVideoPool = monthlyEditorPool + monthlyVmPool;
    const videoPool = editorPool + vmPool;
    const monthlyTotalSalaries = monthlyVideoPool + monthlyDesignerPool;
    const totalSalaries = videoPool + designerPool;

    // Mapa userId -> role para classificar quem editou cada card
    const roleOf = new Map(users.map(u => [u.id, u.role]));

    // Split das tasks produzidas pelo tipo de quem editou (assigned_to)
    let vmReels = 0, vmCri = 0, vmSto = 0;
    let edReels = 0, edCri = 0, edSto = 0;
    relevantTasks.forEach(t => {
      const type = normalizeContentType(t.content_type);
      const role = t.assigned_to ? roleOf.get(t.assigned_to) : undefined;
      const isVm = role && VIDEOMAKER_ROLES.includes(role);
      if (type === 'reels') isVm ? vmReels++ : edReels++;
      else if (type === 'criativo') isVm ? vmCri++ : edCri++;
      else if (type === 'story') isVm ? vmSto++ : edSto++;
    });

    // Aloca pool do videomaker apenas nos cards editados por VMs
    const vmW = vmReels * VIDEO_EFFORT.reels + vmCri * VIDEO_EFFORT.criativo + vmSto * VIDEO_EFFORT.story;
    const salVmReels = vmW > 0 ? (vmPool * vmReels * VIDEO_EFFORT.reels) / vmW : 0;
    const salVmCri = vmW > 0 ? (vmPool * vmCri * VIDEO_EFFORT.criativo) / vmW : 0;
    const salVmSto = vmW > 0 ? (vmPool * vmSto * VIDEO_EFFORT.story) / vmW : 0;

    // Totais gerais (mantém compat com agenda/social se maior)
    const reels = Math.max(recReels, ctReels, sReels);
    const criativos = Math.max(recCri, ctCri, sCri);
    const stories = Math.max(recSto, ctSto, sSto);

    // Pool editor+social: distribuído pelo total geral (inclui o que não teve assigned_to)
    const wReels = reels * VIDEO_EFFORT.reels;
    const wCri = criativos * VIDEO_EFFORT.criativo;
    const wSto = stories * VIDEO_EFFORT.story;
    const wTotal = wReels + wCri + wSto;
    const salReels = wTotal > 0 ? (editorPool * wReels) / wTotal : 0;
    const salCri = wTotal > 0 ? (editorPool * wCri) / wTotal : 0;
    const salSto = wTotal > 0 ? (editorPool * wSto) / wTotal : 0;

    // Pool designer: 100% para artes
    const salArt = designerPool;

    return {
      totalSalaries, monthlyTotalSalaries, months,
      videoPool, editorPool, vmPool, designerPool,
      monthlyVideoPool, monthlyEditorPool, monthlyVmPool, monthlyDesignerPool,
      reels, criativos, stories, artes,
      cReels: reels > 0 ? salReels / reels : 0,
      cCri: criativos > 0 ? salCri / criativos : 0,
      cArt: artes > 0 ? salArt / artes : 0,
      cSto: stories > 0 ? salSto / stories : 0,
      salReels, salCri, salArt, salSto,
      vmReels, vmCri, vmSto,
      salVmReels, salVmCri, salVmSto,
      cVmReels: vmReels > 0 ? salVmReels / vmReels : 0,
      cVmCri: vmCri > 0 ? salVmCri / vmCri : 0,
      cVmSto: vmSto > 0 ? salVmSto / vmSto : 0,
    };

  }, [records, editorTasks, designTasks, socialDeliveries, users, selectedClient, dateRange]);

  const fmt = (n: number) => Number.isFinite(n) && n > 0 ? `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ 0,00';
  const formatCost = (cost: number, qty: number, pool: number) => {
    if (qty <= 0) return 'Sem produção';
    if (pool <= 0) return 'Sem salário';
    return fmt(cost);
  };

  const items = [
    { icon: Film, label: 'Reels', qty: data.reels, cost: data.cReels, total: data.salReels, pool: data.videoPool, color: 'text-blue-600', border: 'hsl(217,91%,60%)' },
    { icon: Megaphone, label: 'Criativos', qty: data.criativos, cost: data.cCri, total: data.salCri, pool: data.videoPool, color: 'text-purple-600', border: 'hsl(262,83%,58%)' },
    { icon: Palette, label: 'Artes', qty: data.artes, cost: data.cArt, total: data.salArt, pool: data.designerPool, color: 'text-orange-600', border: 'hsl(24,95%,53%)' },
    { icon: ImageIcon, label: 'Stories', qty: data.stories, cost: data.cSto, total: data.salSto, pool: data.videoPool, color: 'text-pink-600', border: 'hsl(330,81%,60%)' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Target size={24} className="text-primary" /> Custo por Tipo de Conteúdo
        </h1>
        <p className="text-sm text-muted-foreground">Pool Vídeo (Videomaker + Editor + Social Media) alocado por esforço: Reels=1.0, Criativo=0.5, Story=0.2. Pool Designer 100% dividido pelas artes anexadas nos cards produzidos.</p>
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
            <p className="text-xl font-bold">{fmt(data.editorPool)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pool Editor+Social ({data.months}m)</p>
            <p className="text-[10px] text-muted-foreground mt-1">Folha mensal: {fmt(data.monthlyEditorPool)} · VM: {fmt(data.monthlyVmPool)}</p>
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
              <p className="text-2xl font-bold">{formatCost(it.cost, it.qty, it.pool)}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Custo por {it.label}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Total alocado: {fmt(it.total)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
