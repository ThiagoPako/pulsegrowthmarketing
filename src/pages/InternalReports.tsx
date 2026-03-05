import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { toast } from 'sonner';
import { Download, Trophy, TrendingUp, Film, Users, BarChart3, Award, Target } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, subWeeks } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, Cell } from 'recharts';
import jsPDF from 'jspdf';
import pulseHeaderImg from '@/assets/pulse_header.png';

interface DeliveryRecord {
  id: string;
  client_id: string;
  videomaker_id: string;
  date: string;
  reels_produced: number;
  creatives_produced: number;
  stories_produced: number;
  arts_produced: number;
  extras_produced: number;
  videos_recorded: number;
  delivery_status: string;
}

const SCORE_WEIGHTS = { reel: 10, criativo: 5, story: 3, arte: 2, extra: 8 };

function calcScore(r: DeliveryRecord) {
  return r.reels_produced * SCORE_WEIGHTS.reel +
    r.creatives_produced * SCORE_WEIGHTS.criativo +
    r.stories_produced * SCORE_WEIGHTS.story +
    r.arts_produced * SCORE_WEIGHTS.arte +
    r.extras_produced * SCORE_WEIGHTS.extra;
}

const CHART_COLORS = [
  'hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
  'hsl(var(--chart-4))', 'hsl(var(--chart-5))',
];
const BAR_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

export default function InternalReports() {
  const { users, clients } = useApp();
  const [records, setRecords] = useState<DeliveryRecord[]>([]);
  const [periodType, setPeriodType] = useState<'week' | 'month' | 'previous_month'>('month');
  const [selectedVm, setSelectedVm] = useState('all');

  const videomakers = useMemo(() => users.filter(u => u.role === 'videomaker'), [users]);

  const fetchData = useCallback(async () => {
    const { data } = await supabase.from('delivery_records').select('*').order('date', { ascending: false });
    if (data) setRecords(data as DeliveryRecord[]);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const dateRange = useMemo(() => {
    const now = new Date();
    if (periodType === 'week') return { start: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'), end: format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd') };
    if (periodType === 'month') return { start: format(startOfMonth(now), 'yyyy-MM-dd'), end: format(endOfMonth(now), 'yyyy-MM-dd') };
    const prev = subMonths(now, 1);
    return { start: format(startOfMonth(prev), 'yyyy-MM-dd'), end: format(endOfMonth(prev), 'yyyy-MM-dd') };
  }, [periodType]);

  const filtered = useMemo(() => {
    return records.filter(r => {
      if (selectedVm !== 'all' && r.videomaker_id !== selectedVm) return false;
      return r.date >= dateRange.start && r.date <= dateRange.end;
    });
  }, [records, selectedVm, dateRange]);

  // ── Ranking ──
  const ranking = useMemo(() => {
    return videomakers.map(vm => {
      const vmRecs = filtered.filter(r => r.videomaker_id === vm.id && (r.delivery_status === 'realizada' || r.delivery_status === 'encaixe' || r.delivery_status === 'extra'));
      const score = vmRecs.reduce((a, r) => a + calcScore(r), 0);
      const reels = vmRecs.reduce((a, r) => a + r.reels_produced, 0);
      const creatives = vmRecs.reduce((a, r) => a + r.creatives_produced, 0);
      const stories = vmRecs.reduce((a, r) => a + r.stories_produced, 0);
      const arts = vmRecs.reduce((a, r) => a + r.arts_produced, 0);
      const extras = vmRecs.reduce((a, r) => a + r.extras_produced, 0);
      const videos = vmRecs.reduce((a, r) => a + r.videos_recorded, 0);
      const sessions = vmRecs.length;
      return { vm, score, reels, creatives, stories, arts, extras, videos, sessions };
    }).sort((a, b) => b.score - a.score);
  }, [videomakers, filtered]);

  // ── Score chart data ──
  const scoreChartData = useMemo(() => {
    return ranking.map(r => ({ name: r.vm.name.split(' ')[0], pontuação: r.score }));
  }, [ranking]);

  // ── Content breakdown per VM ──
  const contentChartData = useMemo(() => {
    return ranking.map(r => ({
      name: r.vm.name.split(' ')[0],
      Reels: r.reels,
      Criativos: r.creatives,
      Stories: r.stories,
      Artes: r.arts,
      Extras: r.extras,
    }));
  }, [ranking]);

  // ── Weekly comparison (last 4 weeks) ──
  const weeklyTrend = useMemo(() => {
    const weeks: { label: string; start: string; end: string }[] = [];
    for (let i = 3; i >= 0; i--) {
      const ws = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
      const we = endOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
      weeks.push({ label: `Sem ${format(ws, 'dd/MM')}`, start: format(ws, 'yyyy-MM-dd'), end: format(we, 'yyyy-MM-dd') });
    }
    return weeks.map(w => {
      const entry: any = { semana: w.label };
      videomakers.forEach(vm => {
        const vmRecs = records.filter(r => r.videomaker_id === vm.id && r.date >= w.start && r.date <= w.end &&
          (r.delivery_status === 'realizada' || r.delivery_status === 'encaixe' || r.delivery_status === 'extra'));
        entry[vm.name.split(' ')[0]] = vmRecs.reduce((a, r) => a + calcScore(r), 0);
      });
      return entry;
    });
  }, [records, videomakers]);

  // ── Detail by client ──
  const clientDetail = useMemo(() => {
    const vmFilter = selectedVm !== 'all' ? [selectedVm] : videomakers.map(v => v.id);
    const clientMap: Record<string, { reels: number; creatives: number; stories: number; arts: number; extras: number; sessions: number }> = {};
    filtered.filter(r => vmFilter.includes(r.videomaker_id) && (r.delivery_status === 'realizada' || r.delivery_status === 'encaixe' || r.delivery_status === 'extra'))
      .forEach(r => {
        if (!clientMap[r.client_id]) clientMap[r.client_id] = { reels: 0, creatives: 0, stories: 0, arts: 0, extras: 0, sessions: 0 };
        clientMap[r.client_id].reels += r.reels_produced;
        clientMap[r.client_id].creatives += r.creatives_produced;
        clientMap[r.client_id].stories += r.stories_produced;
        clientMap[r.client_id].arts += r.arts_produced;
        clientMap[r.client_id].extras += r.extras_produced;
        clientMap[r.client_id].sessions += 1;
      });
    return Object.entries(clientMap).map(([clientId, data]) => ({
      client: clients.find(c => c.id === clientId),
      ...data,
    })).filter(d => d.client).sort((a, b) => b.sessions - a.sessions);
  }, [filtered, selectedVm, videomakers, clients]);

  const periodLabel = useMemo(() => {
    if (periodType === 'week') return 'Semana atual';
    if (periodType === 'month') return format(new Date(), 'MMMM yyyy', { locale: ptBR });
    return format(subMonths(new Date(), 1), 'MMMM yyyy', { locale: ptBR });
  }, [periodType]);

  // ── PDF Export ──
  const generatePDF = async () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageW = 210;
    const margin = 15;
    const contentW = pageW - margin * 2;
    let y = 10;

    // Header image
    try {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.src = pulseHeaderImg;
      await new Promise<void>((resolve) => { img.onload = () => resolve(); img.onerror = () => resolve(); });
      if (img.complete && img.naturalWidth > 0) {
        const ratio = img.naturalWidth / img.naturalHeight;
        const h = Math.min(contentW / ratio, 28);
        doc.addImage(img, 'PNG', margin, y, contentW, h);
        y += h + 3;
      }
    } catch { y += 3; }

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Relatório Interno de Desempenho', pageW / 2, y, { align: 'center' });
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Período: ${periodLabel}`, pageW / 2, y, { align: 'center' });
    y += 4;
    doc.text(`Emitido em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`, pageW / 2, y, { align: 'center' });
    y += 10;

    // Scoring legend
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Pontuação: Reel=${SCORE_WEIGHTS.reel}pts | Criativo=${SCORE_WEIGHTS.criativo}pts | Story=${SCORE_WEIGHTS.story}pts | Arte=${SCORE_WEIGHTS.arte}pts | Extra=${SCORE_WEIGHTS.extra}pts`, margin, y);
    y += 8;

    // Ranking table
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Ranking de Videomakers', margin, y);
    y += 8;

    const headers = ['#', 'Videomaker', 'Pts', 'Reels', 'Criativos', 'Stories', 'Artes', 'Extras', 'Sessões'];
    const colW = [8, 35, 18, 18, 22, 18, 15, 18, 18];

    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y - 4, contentW, 7, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    let x = margin + 2;
    headers.forEach((h, i) => { doc.text(h, x, y); x += colW[i]; });
    y += 6;

    ranking.forEach((r, i) => {
      if (y > 270) { doc.addPage(); y = 15; }
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 3.5, contentW, 6, 'F');
      }
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      let rx = margin + 2;
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
      [medal, r.vm.name.substring(0, 18), String(r.score), String(r.reels), String(r.creatives), String(r.stories), String(r.arts), String(r.extras), String(r.sessions)]
        .forEach((cell, ci) => { doc.text(cell, rx, y); rx += colW[ci]; });
      y += 6;
    });

    y += 8;

    // Client detail
    if (clientDetail.length > 0) {
      if (y > 240) { doc.addPage(); y = 15; }
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Detalhamento por Cliente', margin, y);
      y += 8;

      const cHeaders = ['Cliente', 'Reels', 'Criativos', 'Stories', 'Artes', 'Extras', 'Sessões'];
      const cColW = [50, 20, 22, 20, 18, 18, 22];

      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y - 4, contentW, 7, 'F');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(71, 85, 105);
      let cx = margin + 2;
      cHeaders.forEach((h, i) => { doc.text(h, cx, y); cx += cColW[i]; });
      y += 6;

      clientDetail.forEach((d, i) => {
        if (y > 270) { doc.addPage(); y = 15; }
        if (i % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, y - 3.5, contentW, 6, 'F');
        }
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        let rx = margin + 2;
        [d.client!.companyName.substring(0, 25), String(d.reels), String(d.creatives), String(d.stories), String(d.arts), String(d.extras), String(d.sessions)]
          .forEach((cell, ci) => { doc.text(cell, rx, y); rx += cColW[ci]; });
        y += 6;
      });
    }

    // Footer
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, 285, pageW - margin, 285);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(148, 163, 184);
      doc.text('Relatório interno — Pulse Growth Marketing', pageW / 2, 289, { align: 'center' });
      doc.text(`${format(new Date(), 'dd/MM/yyyy HH:mm:ss')} — Página ${p} de ${totalPages}`, pageW / 2, 293, { align: 'center' });
    }

    doc.save(`desempenho-${periodType}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast.success('PDF gerado!');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy size={24} className="text-primary" /> Desempenho da Equipe
          </h1>
          <p className="text-sm text-muted-foreground">Relatórios internos, pontuação e ranking de videomakers</p>
        </div>
        <Button onClick={generatePDF} className="gap-2"><Download size={16} /> Exportar PDF</Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-4 items-end">
          <div className="space-y-1 min-w-[180px]">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Videomaker</Label>
            <Select value={selectedVm} onValueChange={setSelectedVm}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {videomakers.map(vm => <SelectItem key={vm.id} value={vm.id}>{vm.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Período</Label>
            <div className="flex gap-1.5">
              {([['week', 'Semanal'], ['month', 'Mensal'], ['previous_month', 'Mês anterior']] as const).map(([val, lbl]) => (
                <Button key={val} variant={periodType === val ? 'default' : 'outline'} size="sm" onClick={() => setPeriodType(val)}>
                  {lbl}
                </Button>
              ))}
            </div>
          </div>
          <div className="ml-auto">
            <Badge variant="outline" className="text-xs">
              Pontuação: Reel={SCORE_WEIGHTS.reel} · Criativo={SCORE_WEIGHTS.criativo} · Story={SCORE_WEIGHTS.story} · Arte={SCORE_WEIGHTS.arte} · Extra={SCORE_WEIGHTS.extra}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Ranking */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Award size={16} className="text-primary" /> Ranking de Pontuação
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ranking.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">Nenhum dado disponível</p>
            ) : (
              <div className="space-y-3">
                {ranking.map((r, i) => (
                  <div key={r.vm.id} className={`flex items-center gap-3 p-3 rounded-lg ${i < 3 ? 'bg-primary/5 border border-primary/20' : 'bg-secondary/50'}`}>
                    <span className="text-lg font-bold w-8 text-center">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}
                    </span>
                    <UserAvatar user={r.vm} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{r.vm.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {r.reels}R · {r.creatives}C · {r.stories}S · {r.arts}A · {r.extras}E · {r.sessions} sessões
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-primary">{r.score}</p>
                      <p className="text-[10px] text-muted-foreground">pontos</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Score bar chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 size={16} className="text-primary" /> Pontuação Comparativa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={scoreChartData} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="pontuação" name="Pontos" radius={[6, 6, 0, 0]}>
                  {scoreChartData.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Content breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Film size={16} className="text-primary" /> Conteúdos Produzidos por Videomaker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={contentChartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Reels" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={14} />
              <Bar dataKey="Criativos" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={14} />
              <Bar dataKey="Stories" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={14} />
              <Bar dataKey="Artes" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={14} />
              <Bar dataKey="Extras" fill="#06b6d4" radius={[4, 4, 0, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Weekly trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" /> Evolução Semanal de Pontuação
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={weeklyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {videomakers.map((vm, i) => (
                <Line key={vm.id} type="monotone" dataKey={vm.name.split(' ')[0]} stroke={BAR_COLORS[i % BAR_COLORS.length]} strokeWidth={2} dot={{ r: 4 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Client detail table */}
      {clientDetail.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users size={16} className="text-primary" /> Detalhamento por Cliente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-center">Reels</TableHead>
                  <TableHead className="text-center">Criativos</TableHead>
                  <TableHead className="text-center">Stories</TableHead>
                  <TableHead className="text-center">Artes</TableHead>
                  <TableHead className="text-center">Extras</TableHead>
                  <TableHead className="text-center">Sessões</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientDetail.map(d => (
                  <TableRow key={d.client!.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: `hsl(${d.client!.color})` }} />
                        <span className="font-medium text-sm">{d.client!.companyName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-semibold">{d.reels}</TableCell>
                    <TableCell className="text-center">{d.creatives}</TableCell>
                    <TableCell className="text-center">{d.stories}</TableCell>
                    <TableCell className="text-center">{d.arts}</TableCell>
                    <TableCell className="text-center">{d.extras}</TableCell>
                    <TableCell className="text-center">{d.sessions}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
