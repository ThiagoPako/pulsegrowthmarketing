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
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { FileText, Download, Eye, Film, XCircle, CalendarCheck, TrendingUp, Percent, Heart, CheckCircle2, BarChart3, Users } from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
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

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];
const PIE_COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6'];

export default function Reports() {
  const { clients, users } = useApp();
  const [records, setRecords] = useState<DeliveryRecord[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [clientPlans, setClientPlans] = useState<Record<string, string | null>>({});
  const [selectedClient, setSelectedClient] = useState('all');
  const [periodType, setPeriodType] = useState<'current' | 'previous' | 'custom'>('current');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showPreview, setShowPreview] = useState(true);

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

  const comparison = useMemo(() => {
    if (selectedClient === 'all') return null;
    const planId = clientPlans[selectedClient];
    if (!planId) return null;
    const plan = plans.find(p => p.id === planId);
    if (!plan) return null;
    return {
      plan,
      delivered: { reels: stats.totalReels, creatives: stats.totalCreatives, stories: stats.totalStories, arts: stats.totalArts, extras: stats.totalExtras, sessions: stats.realizadas },
    };
  }, [selectedClient, clientPlans, plans, stats]);

  // Chart data
  const comparisonChartData = useMemo(() => {
    if (!comparison) return [];
    return [
      { name: 'Reels', contratado: comparison.plan.reels_qty, entregue: comparison.delivered.reels },
      { name: 'Criativos', contratado: comparison.plan.creatives_qty, entregue: comparison.delivered.creatives },
      { name: 'Stories', contratado: comparison.plan.stories_qty, entregue: comparison.delivered.stories },
      { name: 'Artes', contratado: comparison.plan.arts_qty, entregue: comparison.delivered.arts },
      { name: 'Gravações', contratado: comparison.plan.recording_sessions, entregue: comparison.delivered.sessions },
    ];
  }, [comparison]);

  const statusPieData = useMemo(() => {
    const data = [
      { name: 'Realizadas', value: stats.realizadas, color: PIE_COLORS[0] },
      { name: 'Canceladas', value: stats.canceladas, color: PIE_COLORS[1] },
      { name: 'Encaixes', value: stats.encaixes, color: PIE_COLORS[2] },
      { name: 'Extras', value: stats.extras, color: PIE_COLORS[3] },
    ].filter(d => d.value > 0);
    return data;
  }, [stats]);

  const contentBreakdownData = useMemo(() => {
    return [
      { name: 'Reels', value: stats.totalReels },
      { name: 'Criativos', value: stats.totalCreatives },
      { name: 'Stories', value: stats.totalStories },
      { name: 'Artes', value: stats.totalArts },
      { name: 'Extras', value: stats.totalExtras },
    ].filter(d => d.value > 0);
  }, [stats]);

  const getVmName = (id: string) => users.find(u => u.id === id)?.name || '—';
  const getClientObj = (id: string) => clients.find(c => c.id === id);
  const selectedClientObj = selectedClient !== 'all' ? getClientObj(selectedClient) : null;

  const periodLabel = useMemo(() => {
    if (periodType === 'current') return format(new Date(), 'MMMM yyyy', { locale: ptBR });
    if (periodType === 'previous') return format(subMonths(new Date(), 1), 'MMMM yyyy', { locale: ptBR });
    return `${customStart} a ${customEnd}`;
  }, [periodType, customStart, customEnd]);

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const calcDeliveryPercent = () => {
    if (!comparison) return 0;
    const plan = comparison.plan;
    const del = comparison.delivered;
    const totalPlan = plan.reels_qty + plan.creatives_qty + plan.stories_qty + plan.arts_qty;
    if (totalPlan === 0) return 0;
    const totalDel = del.reels + del.creatives + del.stories + del.arts;
    return Math.round((totalDel / totalPlan) * 100);
  };

  // Professional PDF
  const generatePDF = async () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageW = 210;
    const margin = 15;
    const contentW = pageW - margin * 2;
    let y = 10;

    const drawLine = (yPos: number) => {
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, yPos, pageW - margin, yPos);
    };

    const drawSectionTitle = (title: string, yPos: number) => {
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(title, margin, yPos);
      return yPos + 2;
    };

    const drawTableHeader = (headers: string[], colWidths: number[], yPos: number) => {
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, yPos - 4, contentW, 7, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(71, 85, 105);
      let x = margin + 3;
      headers.forEach((h, i) => {
        doc.text(h, x, yPos);
        x += colWidths[i];
      });
      return yPos + 6;
    };

    const drawTableRow = (cells: string[], colWidths: number[], yPos: number, highlight = false) => {
      if (highlight) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, yPos - 3.5, contentW, 6, 'F');
      }
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      let x = margin + 3;
      cells.forEach((cell, i) => {
        doc.text(cell, x, yPos);
        x += colWidths[i];
      });
      return yPos + 6;
    };

    // ── Header ──
    try {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.src = pulseHeaderImg;
      await new Promise<void>((resolve) => { img.onload = () => resolve(); img.onerror = () => resolve(); });
      if (img.complete && img.naturalWidth > 0) {
        const ratio = img.naturalWidth / img.naturalHeight;
        const w = contentW;
        const h = Math.min(w / ratio, 35);
        doc.addImage(img, 'PNG', margin, y, w, h);
        y += h + 8;
      }
    } catch { y += 3; }

    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Relatório de Entregas', pageW / 2, y, { align: 'center' });
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Período: ${capitalize(periodLabel)}`, pageW / 2, y, { align: 'center' });
    y += 4;
    doc.text(`Emitido em ${format(new Date(), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}`, pageW / 2, y, { align: 'center' });
    y += 8;
    drawLine(y); y += 8;

    // ── Client info ──
    if (selectedClientObj) {
      y = drawSectionTitle('Dados do Cliente', y); y += 6;

      // Client logo
      if (selectedClientObj.logoUrl) {
        try {
          const cImg = new window.Image();
          cImg.crossOrigin = 'anonymous';
          cImg.src = selectedClientObj.logoUrl;
          await new Promise<void>((resolve) => { cImg.onload = () => resolve(); cImg.onerror = () => resolve(); });
          if (cImg.complete && cImg.naturalWidth > 0) {
            doc.addImage(cImg, 'PNG', margin, y - 2, 15, 15);
          }
        } catch {}
      }

      const infoX = selectedClientObj.logoUrl ? margin + 20 : margin;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(selectedClientObj.companyName, infoX, y + 2);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`Responsável: ${selectedClientObj.responsiblePerson}`, infoX, y + 7);
      const planId = clientPlans[selectedClient];
      const plan = planId ? plans.find(p => p.id === planId) : null;
      if (plan) doc.text(`Plano: ${plan.name}`, infoX, y + 12);
      y += 20;
      drawLine(y); y += 8;
    }

    // ── KPIs ──
    y = drawSectionTitle('Indicadores do Período', y); y += 8;

    const kpis = [
      { label: 'Gravações Realizadas', value: String(stats.realizadas) },
      { label: 'Cancelamentos', value: String(stats.canceladas) },
      { label: 'Encaixes', value: String(stats.encaixes) },
      { label: 'Vídeos Gravados', value: String(stats.totalVideos) },
      { label: 'Conteúdos Extras', value: String(stats.totalExtras) },
      { label: 'Taxa Cancelamento', value: `${stats.cancelRate}%` },
    ];

    const kpiW = contentW / 3;
    kpis.forEach((kpi, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const kx = margin + col * kpiW;
      const ky = y + row * 14;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(kx, ky - 4, kpiW - 3, 12, 2, 2, 'F');
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(kpi.value, kx + 4, ky + 3);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(kpi.label, kx + 4, ky + 7);
    });
    y += Math.ceil(kpis.length / 3) * 14 + 5;
    drawLine(y); y += 8;

    // ── Comparison Table ──
    if (comparison) {
      y = drawSectionTitle('Comparativo: Plano vs Entrega', y); y += 8;

      const compHeaders = ['Item', 'Contratado', 'Entregue', 'Progresso'];
      const compColW = [40, 30, 30, 40];
      y = drawTableHeader(compHeaders, compColW, y);

      const compRows = [
        { label: 'Reels', plan: comparison.plan.reels_qty, del: comparison.delivered.reels },
        { label: 'Criativos', plan: comparison.plan.creatives_qty, del: comparison.delivered.creatives },
        { label: 'Stories', plan: comparison.plan.stories_qty, del: comparison.delivered.stories },
        { label: 'Artes', plan: comparison.plan.arts_qty, del: comparison.delivered.arts },
        { label: 'Gravações', plan: comparison.plan.recording_sessions, del: comparison.delivered.sessions },
        { label: 'Extras', plan: comparison.plan.extra_content_allowed, del: comparison.delivered.extras },
      ];

      compRows.forEach((row, i) => {
        const pct = row.plan > 0 ? Math.min(Math.round((row.del / row.plan) * 100), 100) : 0;
        const pctStr = row.plan > 0 ? `${pct}%` : '—';
        y = drawTableRow([row.label, String(row.plan), String(row.del), pctStr], compColW, y, i % 2 === 0);

        // Draw mini progress bar
        if (row.plan > 0) {
          const barX = margin + 3 + compColW[0] + compColW[1] + compColW[2] + 20;
          const barW = 25;
          doc.setFillColor(226, 232, 240);
          doc.roundedRect(barX, y - 8, barW, 3, 1, 1, 'F');
          const fillW = Math.min((pct / 100) * barW, barW);
          if (pct >= 100) doc.setFillColor(34, 197, 94);
          else if (pct >= 70) doc.setFillColor(59, 130, 246);
          else doc.setFillColor(245, 158, 11);
          doc.roundedRect(barX, y - 8, fillW, 3, 1, 1, 'F');
        }
      });

      // Overall delivery percentage
      const overallPct = calcDeliveryPercent();
      y += 4;
      doc.setFillColor(overallPct >= 100 ? 220 : overallPct >= 70 ? 219 : 254, overallPct >= 100 ? 252 : overallPct >= 70 ? 234 : 243, overallPct >= 100 ? 231 : overallPct >= 70 ? 254 : 228);
      doc.roundedRect(margin, y - 3, contentW, 10, 2, 2, 'F');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`Entrega Total do Plano: ${overallPct}%`, margin + 4, y + 3);
      y += 14;
      drawLine(y); y += 8;
    }

    // ── Detailed History ──
    if (filteredRecords.length > 0) {
      y = drawSectionTitle('Histórico de Gravações', y); y += 8;

      const dHeaders = ['Data', 'Videomaker', 'Vídeos', 'Reels', 'Criativos', 'Status'];
      const dColW = [25, 35, 18, 18, 22, 42];
      y = drawTableHeader(dHeaders, dColW, y);

      filteredRecords.forEach((rec, i) => {
        if (y > 255) {
          doc.addPage(); y = 15;
          y = drawTableHeader(dHeaders, dColW, y);
        }
        y = drawTableRow([
          new Date(rec.date + 'T12:00:00').toLocaleDateString('pt-BR'),
          getVmName(rec.videomaker_id).substring(0, 16),
          String(rec.videos_recorded),
          String(rec.reels_produced),
          String(rec.creatives_produced),
          (STATUS_LABELS[rec.delivery_status] || rec.delivery_status).substring(0, 20),
        ], dColW, y, i % 2 === 0);
      });
      y += 5;
    }

    // ── Thank you message ──
    if (y > 240) { doc.addPage(); y = 20; }
    y += 10;
    drawLine(y); y += 10;

    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y - 3, contentW, 30, 3, 3, 'F');

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Obrigado pela confiança!', pageW / 2, y + 5, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const thankLines = [
      'Agradecemos por fazer parte da família Pulse Growth Marketing.',
      'Nosso compromisso é entregar resultados que impulsionem o seu negócio.',
      'Conte conosco para transformar sua presença digital! 🚀',
    ];
    thankLines.forEach((line, i) => {
      doc.text(line, pageW / 2, y + 11 + i * 5, { align: 'center' });
    });

    // Footer on all pages
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, 285, pageW - margin, 285);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(148, 163, 184);
      doc.text('Relatório gerado automaticamente pelo sistema Pulse Growth Marketing', pageW / 2, 289, { align: 'center' });
      doc.text(`${format(new Date(), "dd/MM/yyyy HH:mm:ss")} — Página ${p} de ${totalPages}`, pageW / 2, 293, { align: 'center' });
    }

    const clientName = selectedClientObj ? `-${selectedClientObj.companyName.replace(/\s+/g, '-')}` : '';
    doc.save(`relatorio-entregas${clientName}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast.success('PDF gerado com sucesso!');
  };

  const deliveryPct = calcDeliveryPercent();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 size={24} className="text-primary" /> Relatórios de Entrega
          </h1>
          <p className="text-sm text-muted-foreground">Relatórios profissionais com comparativo plano vs entrega</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowPreview(!showPreview)} className="gap-2">
            <Eye size={16} /> {showPreview ? 'Ocultar Preview' : 'Visualizar'}
          </Button>
          <Button onClick={generatePDF} className="gap-2"><Download size={16} /> Exportar PDF</Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1 min-w-[200px]">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cliente</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os clientes</SelectItem>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: `hsl(${c.color})` }} />
                        {c.companyName}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Período</Label>
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
          </div>
        </CardContent>
      </Card>

      {/* Client header when selected */}
      {selectedClientObj && (
        <Card className="border-l-4" style={{ borderLeftColor: `hsl(${selectedClientObj.color})` }}>
          <CardContent className="p-4 flex items-center gap-4">
            <ClientLogo client={selectedClientObj} size="lg" />
            <div className="flex-1">
              <h2 className="text-lg font-bold">{selectedClientObj.companyName}</h2>
              <p className="text-sm text-muted-foreground">Responsável: {selectedClientObj.responsiblePerson}</p>
              {comparison && <Badge className="mt-1">{comparison.plan.name}</Badge>}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Período</p>
              <p className="text-sm font-semibold">{capitalize(periodLabel)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: CalendarCheck, label: 'Gravações', value: stats.realizadas, color: 'text-primary' },
          { icon: XCircle, label: 'Canceladas', value: stats.canceladas, color: 'text-destructive' },
          { icon: Film, label: 'Conteúdos', value: stats.totalReels + stats.totalCreatives + stats.totalStories + stats.totalArts, color: 'text-primary' },
          { icon: TrendingUp, label: 'Extras', value: stats.totalExtras, color: 'text-primary' },
          { icon: Percent, label: 'Cancel.', value: `${stats.cancelRate}%`, color: 'text-destructive' },
          { icon: CheckCircle2, label: 'Entrega', value: comparison ? `${deliveryPct}%` : '—', color: 'text-primary' },
        ].map((kpi, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <kpi.icon size={18} className={kpi.color} />
                {comparison && i === 5 && <Progress value={deliveryPct} className="w-12 h-1.5" />}
              </div>
              <p className="text-2xl font-bold">{kpi.value}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {showPreview && (
        <>
          {/* Charts row */}
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Comparison bar chart */}
            {comparison && comparisonChartData.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 size={16} className="text-primary" /> Plano vs Entrega
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={comparisonChartData} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                      />
                      <Bar dataKey="contratado" name="Contratado" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} barSize={20} />
                      <Bar dataKey="entregue" name="Entregue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={20} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Status pie chart */}
            {statusPieData.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Users size={16} className="text-primary" /> Status das Gravações
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                        {statusPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Content breakdown */}
          {contentBreakdownData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Produção por Tipo de Conteúdo</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={contentBreakdownData} layout="vertical" barSize={18}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={65} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="value" name="Produzidos" radius={[0, 4, 4, 0]}>
                      {contentBreakdownData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Comparison table */}
          {comparison && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Detalhamento: Plano vs Entrega</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-center">Contratado</TableHead>
                      <TableHead className="text-center">Entregue</TableHead>
                      <TableHead className="text-center">Progresso</TableHead>
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
                    ].map(row => {
                      const pct = row.plan > 0 ? Math.min(Math.round((row.del / row.plan) * 100), 999) : 0;
                      return (
                        <TableRow key={row.label}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="text-center">{row.plan}</TableCell>
                          <TableCell className="text-center font-semibold">{row.del}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 justify-center">
                              <Progress value={Math.min(pct, 100)} className="w-16 h-2" />
                              <Badge variant={pct >= 100 ? 'default' : pct >= 70 ? 'secondary' : 'outline'} className="text-[10px] min-w-[38px] justify-center">
                                {row.plan > 0 ? `${pct}%` : '—'}
                              </Badge>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Detailed history */}
          {filteredRecords.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Histórico de Gravações</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        {selectedClient === 'all' && <TableHead>Cliente</TableHead>}
                        <TableHead>Videomaker</TableHead>
                        <TableHead className="text-center">Vídeos</TableHead>
                        <TableHead className="text-center">Reels</TableHead>
                        <TableHead className="text-center">Criativos</TableHead>
                        <TableHead className="text-center">Stories</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRecords.map(rec => (
                        <TableRow key={rec.id}>
                          <TableCell className="whitespace-nowrap text-xs">{new Date(rec.date + 'T12:00:00').toLocaleDateString('pt-BR')}</TableCell>
                          {selectedClient === 'all' && <TableCell className="text-xs">{getClientObj(rec.client_id)?.companyName || '?'}</TableCell>}
                          <TableCell className="text-xs">{getVmName(rec.videomaker_id)}</TableCell>
                          <TableCell className="text-center text-xs font-medium">{rec.videos_recorded}</TableCell>
                          <TableCell className="text-center text-xs">{rec.reels_produced}</TableCell>
                          <TableCell className="text-center text-xs">{rec.creatives_produced}</TableCell>
                          <TableCell className="text-center text-xs">{rec.stories_produced}</TableCell>
                          <TableCell>
                            <Badge
                              variant={rec.delivery_status === 'realizada' ? 'default' : rec.delivery_status.startsWith('cancelada') ? 'destructive' : 'secondary'}
                              className="text-[10px]"
                            >
                              {STATUS_LABELS[rec.delivery_status] || rec.delivery_status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Thank you message */}
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardContent className="p-6 text-center space-y-2">
              <Heart size={28} className="mx-auto text-primary" />
              <h3 className="text-lg font-bold">Obrigado pela confiança!</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Agradecemos por fazer parte da família Pulse Growth Marketing. Nosso compromisso é entregar resultados que impulsionem o seu negócio.
              </p>
              <p className="text-sm font-medium text-primary">Conte conosco para transformar sua presença digital! 🚀</p>
            </CardContent>
          </Card>

          {filteredRecords.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <FileText size={40} className="text-muted-foreground/40" />
                <p className="text-muted-foreground">Nenhuma entrega encontrada para o período selecionado</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
