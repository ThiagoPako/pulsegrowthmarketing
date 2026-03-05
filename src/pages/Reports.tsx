import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { toast } from 'sonner';
import { FileText, Download, Eye, Film, Image, XCircle, CalendarCheck, TrendingUp, Percent } from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import pulseHeaderImg from '@/assets/pulse_header.png';

interface DeliveryRecord {
  id: string;
  recording_id: string | null;
  client_id: string;
  videomaker_id: string;
  date: string;
  reels_produced: number;
  creatives_produced: number;
  stories_produced: number;
  arts_produced: number;
  extras_produced: number;
  videos_recorded: number;
  observations: string | null;
  delivery_status: string;
}

interface Plan {
  id: string;
  name: string;
  reels_qty: number;
  creatives_qty: number;
  stories_qty: number;
  arts_qty: number;
  extra_content_allowed: number;
  recording_sessions: number;
}

const STATUS_LABELS: Record<string, string> = {
  realizada: 'Realizada',
  cancelada_cliente: 'Cancelada pelo cliente',
  cancelada_agencia: 'Cancelada pela agência',
  encaixe: 'Encaixe de agenda',
  extra: 'Conteúdo extra',
};

export default function Reports() {
  const { clients, users } = useApp();
  const [records, setRecords] = useState<DeliveryRecord[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [clientPlans, setClientPlans] = useState<Record<string, string | null>>({});
  const [selectedClient, setSelectedClient] = useState('all');
  const [periodType, setPeriodType] = useState<'current' | 'previous' | 'custom'>('current');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const fetchData = useCallback(async () => {
    const [rRes, pRes, cRes] = await Promise.all([
      supabase.from('delivery_records').select('*').order('date', { ascending: false }),
      supabase.from('plans').select('*'),
      supabase.from('clients').select('id, plan_id'),
    ]);
    if (rRes.data) setRecords(rRes.data as DeliveryRecord[]);
    if (pRes.data) setPlans(pRes.data as Plan[]);
    if (cRes.data) {
      const map: Record<string, string | null> = {};
      (cRes.data as any[]).forEach(c => { map[c.id] = c.plan_id; });
      setClientPlans(map);
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

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (selectedClient !== 'all' && r.client_id !== selectedClient) return false;
      return r.date >= dateRange.start && r.date <= dateRange.end;
    });
  }, [records, selectedClient, dateRange]);

  // Dashboard stats
  const stats = useMemo(() => {
    const realizadas = filteredRecords.filter(r => r.delivery_status === 'realizada' || r.delivery_status === 'encaixe' || r.delivery_status === 'extra');
    const canceladas = filteredRecords.filter(r => r.delivery_status === 'cancelada_cliente' || r.delivery_status === 'cancelada_agencia');
    const encaixes = filteredRecords.filter(r => r.delivery_status === 'encaixe');
    const extras = filteredRecords.filter(r => r.delivery_status === 'extra');
    const totalVideos = realizadas.reduce((a, r) => a + r.videos_recorded, 0);
    const totalReels = realizadas.reduce((a, r) => a + r.reels_produced, 0);
    const totalCreatives = realizadas.reduce((a, r) => a + r.creatives_produced, 0);
    const totalStories = realizadas.reduce((a, r) => a + r.stories_produced, 0);
    const totalArts = realizadas.reduce((a, r) => a + r.arts_produced, 0);
    const totalExtras = realizadas.reduce((a, r) => a + r.extras_produced, 0);
    const cancelRate = filteredRecords.length > 0 ? ((canceladas.length / filteredRecords.length) * 100).toFixed(1) : '0';
    return { realizadas: realizadas.length, canceladas: canceladas.length, encaixes: encaixes.length, extras: extras.length, totalVideos, totalReels, totalCreatives, totalStories, totalArts, totalExtras, cancelRate };
  }, [filteredRecords]);

  // Plan vs delivery comparison for selected client
  const comparison = useMemo(() => {
    if (selectedClient === 'all') return null;
    const planId = clientPlans[selectedClient];
    if (!planId) return null;
    const plan = plans.find(p => p.id === planId);
    if (!plan) return null;
    return {
      plan,
      delivered: {
        reels: stats.totalReels,
        creatives: stats.totalCreatives,
        stories: stats.totalStories,
        arts: stats.totalArts,
        extras: stats.totalExtras,
        sessions: stats.realizadas,
      },
    };
  }, [selectedClient, clientPlans, plans, stats]);

  const getVmName = (id: string) => users.find(u => u.id === id)?.name || '—';
  const getClientObj = (id: string) => clients.find(c => c.id === id);

  const periodLabel = useMemo(() => {
    if (periodType === 'current') return format(new Date(), 'MMMM yyyy', { locale: ptBR });
    if (periodType === 'previous') return format(subMonths(new Date(), 1), 'MMMM yyyy', { locale: ptBR });
    return `${customStart} a ${customEnd}`;
  }, [periodType, customStart, customEnd]);

  // PDF Generation
  const generatePDF = async () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageW = 210;
    let y = 10;

    // Header image
    try {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.src = pulseHeaderImg;
      await new Promise<void>((resolve) => { img.onload = () => resolve(); img.onerror = () => resolve(); });
      if (img.complete && img.naturalWidth > 0) {
        const ratio = img.naturalWidth / img.naturalHeight;
        const w = pageW - 20;
        const h = w / ratio;
        doc.addImage(img, 'PNG', 10, y, w, Math.min(h, 30));
        y += Math.min(h, 30) + 5;
      }
    } catch { y += 5; }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Relatório Mensal de Entregas', pageW / 2, y, { align: 'center' });
    y += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    doc.text(`Período: ${capitalize(periodLabel)}`, pageW / 2, y, { align: 'center' });
    y += 4;
    doc.text(`Emitido em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`, pageW / 2, y, { align: 'center' });
    y += 10;

    // Client info
    if (selectedClient !== 'all') {
      const client = getClientObj(selectedClient);
      if (client) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Dados do Cliente', 10, y);
        y += 6;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Empresa: ${client.companyName}`, 10, y); y += 5;
        doc.text(`Responsável: ${client.responsiblePerson}`, 10, y); y += 5;
        const planId = clientPlans[selectedClient];
        const plan = planId ? plans.find(p => p.id === planId) : null;
        if (plan) { doc.text(`Plano: ${plan.name}`, 10, y); y += 5; }
        y += 5;
      }
    }

    // Stats
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Indicadores do Período', 10, y); y += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const statLines = [
      `Gravações realizadas: ${stats.realizadas}`, `Gravações canceladas: ${stats.canceladas}`,
      `Encaixes de agenda: ${stats.encaixes}`, `Vídeos gravados: ${stats.totalVideos}`,
      `Conteúdos extras: ${stats.totalExtras}`, `Taxa de cancelamento: ${stats.cancelRate}%`,
    ];
    statLines.forEach(line => { doc.text(line, 10, y); y += 5; });
    y += 5;

    // Comparison table
    if (comparison) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Plano vs Entrega', 10, y); y += 6;

      const headers = ['Item', 'Contratado', 'Entregue', '%'];
      const rows = [
        ['Reels', String(comparison.plan.reels_qty), String(comparison.delivered.reels), comparison.plan.reels_qty > 0 ? ((comparison.delivered.reels / comparison.plan.reels_qty) * 100).toFixed(0) + '%' : '—'],
        ['Criativos', String(comparison.plan.creatives_qty), String(comparison.delivered.creatives), comparison.plan.creatives_qty > 0 ? ((comparison.delivered.creatives / comparison.plan.creatives_qty) * 100).toFixed(0) + '%' : '—'],
        ['Stories', String(comparison.plan.stories_qty), String(comparison.delivered.stories), comparison.plan.stories_qty > 0 ? ((comparison.delivered.stories / comparison.plan.stories_qty) * 100).toFixed(0) + '%' : '—'],
        ['Artes', String(comparison.plan.arts_qty), String(comparison.delivered.arts), comparison.plan.arts_qty > 0 ? ((comparison.delivered.arts / comparison.plan.arts_qty) * 100).toFixed(0) + '%' : '—'],
        ['Gravações', String(comparison.plan.recording_sessions), String(comparison.delivered.sessions), comparison.plan.recording_sessions > 0 ? ((comparison.delivered.sessions / comparison.plan.recording_sessions) * 100).toFixed(0) + '%' : '—'],
      ];

      doc.setFontSize(9);
      const colW = [50, 35, 35, 30];
      const startX = 10;
      // Header
      doc.setFont('helvetica', 'bold');
      headers.forEach((h, i) => {
        const x = startX + colW.slice(0, i).reduce((a, b) => a + b, 0);
        doc.text(h, x + 2, y);
      });
      y += 5;
      doc.setFont('helvetica', 'normal');
      rows.forEach(row => {
        row.forEach((cell, i) => {
          const x = startX + colW.slice(0, i).reduce((a, b) => a + b, 0);
          doc.text(cell, x + 2, y);
        });
        y += 5;
      });
      y += 5;
    }

    // Detailed list
    if (filteredRecords.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Histórico Detalhado', 10, y); y += 6;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      const dHeaders = ['Data', 'Cliente', 'Videomaker', 'Vídeos', 'Reels', 'Status'];
      const dColW = [25, 40, 35, 18, 18, 40];
      dHeaders.forEach((h, i) => {
        doc.text(h, 10 + dColW.slice(0, i).reduce((a, b) => a + b, 0) + 1, y);
      });
      y += 4;
      doc.setFont('helvetica', 'normal');
      filteredRecords.forEach(rec => {
        if (y > 270) { doc.addPage(); y = 15; }
        const row = [
          new Date(rec.date + 'T12:00:00').toLocaleDateString('pt-BR'),
          (getClientObj(rec.client_id)?.companyName || '?').substring(0, 16),
          getVmName(rec.videomaker_id).substring(0, 14),
          String(rec.videos_recorded),
          String(rec.reels_produced),
          (STATUS_LABELS[rec.delivery_status] || rec.delivery_status).substring(0, 18),
        ];
        row.forEach((cell, i) => {
          doc.text(cell, 10 + dColW.slice(0, i).reduce((a, b) => a + b, 0) + 1, y);
        });
        y += 4;
      });
    }

    // Footer
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'italic');
      doc.text('Relatório gerado automaticamente pelo sistema Pulse Growth Marketing', pageW / 2, 290, { align: 'center' });
      doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm:ss")}`, pageW / 2, 294, { align: 'center' });
    }

    doc.save(`relatorio-entregas-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast.success('PDF gerado com sucesso!');
  };

  const calcDeliveryPercent = () => {
    if (!comparison) return '—';
    const plan = comparison.plan;
    const del = comparison.delivered;
    const totalPlan = plan.reels_qty + plan.creatives_qty + plan.stories_qty + plan.arts_qty;
    if (totalPlan === 0) return '—';
    const totalDel = del.reels + del.creatives + del.stories + del.arts;
    return ((totalDel / totalPlan) * 100).toFixed(0) + '%';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Relatórios de Entrega</h1>
          <p className="text-sm text-muted-foreground">Gere relatórios comparativos de plano vs entrega</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowPreview(!showPreview)} className="gap-2">
            <Eye size={16} /> {showPreview ? 'Ocultar' : 'Visualizar'}
          </Button>
          <Button onClick={generatePDF} className="gap-2"><Download size={16} /> Exportar PDF</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Cliente</Label>
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Período</Label>
          <div className="flex gap-2">
            <Button variant={periodType === 'current' ? 'default' : 'outline'} size="sm" onClick={() => setPeriodType('current')}>Mês atual</Button>
            <Button variant={periodType === 'previous' ? 'default' : 'outline'} size="sm" onClick={() => setPeriodType('previous')}>Mês anterior</Button>
            <Button variant={periodType === 'custom' ? 'default' : 'outline'} size="sm" onClick={() => setPeriodType('custom')}>Personalizado</Button>
          </div>
        </div>
        {periodType === 'custom' && (
          <div className="flex gap-2">
            <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-36" />
            <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-36" />
          </div>
        )}
      </div>

      {/* Dashboard cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card><CardContent className="p-4 text-center"><CalendarCheck size={20} className="mx-auto text-primary mb-1" /><p className="text-2xl font-bold">{stats.realizadas}</p><p className="text-[10px] text-muted-foreground">Gravações</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><XCircle size={20} className="mx-auto text-destructive mb-1" /><p className="text-2xl font-bold">{stats.canceladas}</p><p className="text-[10px] text-muted-foreground">Cancelamentos</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><Film size={20} className="mx-auto text-primary mb-1" /><p className="text-2xl font-bold">{stats.totalReels + stats.totalCreatives + stats.totalStories}</p><p className="text-[10px] text-muted-foreground">Conteúdos</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><TrendingUp size={20} className="mx-auto text-primary mb-1" /><p className="text-2xl font-bold">{stats.totalExtras}</p><p className="text-[10px] text-muted-foreground">Extras</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><Percent size={20} className="mx-auto text-destructive mb-1" /><p className="text-2xl font-bold">{stats.cancelRate}%</p><p className="text-[10px] text-muted-foreground">Taxa Cancel.</p></CardContent></Card>
        {comparison && (
          <Card><CardContent className="p-4 text-center"><FileText size={20} className="mx-auto text-primary mb-1" /><p className="text-2xl font-bold">{calcDeliveryPercent()}</p><p className="text-[10px] text-muted-foreground">Entrega Plano</p></CardContent></Card>
        )}
      </div>

      {/* Comparison table */}
      {comparison && showPreview && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Comparativo: Plano vs Entrega</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-center">Contratado</TableHead>
                  <TableHead className="text-center">Entregue</TableHead>
                  <TableHead className="text-center">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { label: 'Reels', plan: comparison.plan.reels_qty, del: comparison.delivered.reels },
                  { label: 'Criativos', plan: comparison.plan.creatives_qty, del: comparison.delivered.creatives },
                  { label: 'Stories', plan: comparison.plan.stories_qty, del: comparison.delivered.stories },
                  { label: 'Artes', plan: comparison.plan.arts_qty, del: comparison.delivered.arts },
                  { label: 'Gravações', plan: comparison.plan.recording_sessions, del: comparison.delivered.sessions },
                  { label: 'Extras', plan: comparison.plan.extra_content_allowed, del: comparison.delivered.extras },
                ].map(row => (
                  <TableRow key={row.label}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-center">{row.plan}</TableCell>
                    <TableCell className="text-center">{row.del}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={row.plan > 0 && row.del >= row.plan ? 'default' : 'secondary'}>
                        {row.plan > 0 ? ((row.del / row.plan) * 100).toFixed(0) + '%' : '—'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Detailed history */}
      {showPreview && filteredRecords.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Histórico Detalhado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Videomaker</TableHead>
                    <TableHead className="text-center">Vídeos</TableHead>
                    <TableHead className="text-center">Reels</TableHead>
                    <TableHead className="text-center">Criativos</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Obs.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map(rec => (
                    <TableRow key={rec.id}>
                      <TableCell className="whitespace-nowrap text-xs">{new Date(rec.date + 'T12:00:00').toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell className="text-xs">{getClientObj(rec.client_id)?.companyName || '?'}</TableCell>
                      <TableCell className="text-xs">{getVmName(rec.videomaker_id)}</TableCell>
                      <TableCell className="text-center text-xs">{rec.videos_recorded}</TableCell>
                      <TableCell className="text-center text-xs">{rec.reels_produced}</TableCell>
                      <TableCell className="text-center text-xs">{rec.creatives_produced}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{STATUS_LABELS[rec.delivery_status] || rec.delivery_status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[100px] truncate">{rec.observations || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {showPreview && filteredRecords.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <FileText size={40} className="text-muted-foreground/40" />
            <p className="text-muted-foreground">Nenhuma entrega encontrada para o período selecionado</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
