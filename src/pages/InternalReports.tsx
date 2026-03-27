import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/vpsDb';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { toast } from 'sonner';
import { Download, Trophy, TrendingUp, Film, Users, BarChart3, Award, Target, Scissors } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import UserAvatar from '@/components/UserAvatar';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, subWeeks, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, Cell } from 'recharts';
import jsPDF from 'jspdf';
import pulseHeaderImg from '@/assets/pulse_header.png';
import { VM_SCORE, EDITOR_SCORE, calcVmDeliveryScore, calcWaitPoints, EDITOR_APPROVED_COLUMNS } from '@/lib/scoringSystem';

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

function calcScore(r: DeliveryRecord) {
  return calcVmDeliveryScore(r);
}

// Aliases for display and editor scoring
const SCORE_WEIGHTS = { reel: VM_SCORE.REEL, criativo: VM_SCORE.CRIATIVO, story: VM_SCORE.STORY, arte: VM_SCORE.ARTE, extra: VM_SCORE.EXTRA };
// Use centralized EDITOR_SCORE from scoringSystem.ts

interface EditorTask {
  id: string;
  content_type: string;
  kanban_column: string;
  assigned_to: string | null;
  edited_by: string | null;
  editing_started_at: string | null;
  editing_priority: boolean;
  approved_at: string | null;
  updated_at: string;
  client_id: string;
}

const CHART_COLORS = [
  'hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
  'hsl(var(--chart-4))', 'hsl(var(--chart-5))',
];
const BAR_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

export default function InternalReports() {
  const { users, clients, recordings } = useApp();
  const [records, setRecords] = useState<DeliveryRecord[]>([]);
  const [periodType, setPeriodType] = useState<'week' | 'month' | 'previous_month'>('month');
  const [selectedVm, setSelectedVm] = useState('all');
  const [waitLogs, setWaitLogs] = useState<any[]>([]);

  const videomakers = useMemo(() => users.filter(u => u.role === 'videomaker'), [users]);
  const editors = useMemo(() => users.filter(u => u.role === 'editor'), [users]);

  const [editorTasks, setEditorTasks] = useState<EditorTask[]>([]);

  const fetchData = useCallback(async () => {
    const [deliveries, tasks, wl] = await Promise.all([
      supabase.from('delivery_records').select('*').order('date', { ascending: false }),
      supabase.from('content_tasks').select('id, content_type, kanban_column, assigned_to, edited_by, editing_started_at, editing_priority, approved_at, updated_at, client_id'),
      supabase.from('recording_wait_logs').select('*'),
    ]);
    if (deliveries.data) setRecords(deliveries.data as DeliveryRecord[]);
    if (tasks.data) setEditorTasks(tasks.data as EditorTask[]);
    if (wl.data) setWaitLogs(wl.data);
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
      const deliveryScore = vmRecs.reduce((a, r) => a + calcScore(r), 0);
      const reels = vmRecs.reduce((a, r) => a + r.reels_produced, 0);
      const creatives = vmRecs.reduce((a, r) => a + r.creatives_produced, 0);
      const stories = vmRecs.reduce((a, r) => a + r.stories_produced, 0);
      const arts = vmRecs.reduce((a, r) => a + r.arts_produced, 0);
      const extras = vmRecs.reduce((a, r) => a + r.extras_produced, 0);
      const videos = vmRecs.reduce((a, r) => a + r.videos_recorded, 0);
      const sessions = vmRecs.length;

      // Gravações concluídas no período
      const periodRecs = recordings.filter(r =>
        r.videomakerId === vm.id && r.date >= dateRange.start && r.date <= dateRange.end && r.status === 'concluida'
      );
      const recsDone = periodRecs.filter(r => r.type !== 'endomarketing').length;
      const endoDone = periodRecs.filter(r => r.type === 'endomarketing').length;

      // Wait points no período
      const vmWaitLogs = waitLogs.filter(l => {
        if (l.videomaker_id !== vm.id) return false;
        const d = l.created_at?.slice(0, 10);
        return d >= dateRange.start && d <= dateRange.end;
      });
      const totalWaitSec = vmWaitLogs.reduce((a: number, l: any) => a + (l.wait_duration_seconds || 0), 0);
      const waitPts = calcWaitPoints(totalWaitSec);

      const score = deliveryScore + recsDone * VM_SCORE.GRAVACAO + endoDone * VM_SCORE.ENDO + waitPts;

      return { vm, score, reels, creatives, stories, arts, extras, videos, sessions, recsDone, endoDone, waitPts };
    }).sort((a, b) => b.score - a.score);
  }, [videomakers, filtered, recordings, dateRange, waitLogs]);

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

  // ── Editor data ──
  const editorFiltered = useMemo(() => {
    return editorTasks.filter(t => {
      if (!t.updated_at) return false;
      const d = format(new Date(t.updated_at), 'yyyy-MM-dd');
      return d >= dateRange.start && d <= dateRange.end;
    });
  }, [editorTasks, dateRange]);

  const editorRanking = useMemo(() => {
    return editors.map(ed => {
      const edTasks = editorFiltered.filter(t => t.assigned_to === ed.id || t.edited_by === ed.id);
      const approved = edTasks.filter(t => !!t.approved_at || EDITOR_APPROVED_COLUMNS.includes(t.kanban_column as any)).length;
      const inEditing = edTasks.filter(t => t.kanban_column === 'edicao').length;
      const inRevision = edTasks.filter(t => t.kanban_column === 'revisao').length;
      const alterations = edTasks.filter(t => t.kanban_column === 'alteracao').length;
      const priorityTasks = edTasks.filter(t => t.editing_priority === true).length;
      const score = approved * EDITOR_SCORE.APROVADO + inEditing * EDITOR_SCORE.EM_EDICAO +
        inRevision * EDITOR_SCORE.REVISAO + alterations * EDITOR_SCORE.ALTERACAO +
        priorityTasks * EDITOR_SCORE.PRIORIDADE;
      const reels = edTasks.filter(t => t.content_type === 'reels').length;
      const criativos = edTasks.filter(t => t.content_type === 'criativo').length;
      const stories = edTasks.filter(t => t.content_type === 'story').length;
      const artes = 0;
      const total = edTasks.length;

      // Average editing time
      const times = edTasks.filter(t => t.editing_started_at).map(t => {
        const h = (new Date(t.updated_at).getTime() - new Date(t.editing_started_at!).getTime()) / (1000 * 60 * 60);
        return h > 0 && h < 200 ? h : null;
      }).filter(Boolean) as number[];
      const avgTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;

      return { editor: ed, score, reels, criativos, stories, artes, total, avgTime, approved, inEditing, alterations, priorityTasks };
    }).sort((a, b) => b.score - a.score);
  }, [editors, editorFiltered]);

  const editorScoreChartData = useMemo(() => {
    return editorRanking.map(r => ({ name: r.editor.name.split(' ')[0], pontuação: r.score }));
  }, [editorRanking]);

  const editorContentChartData = useMemo(() => {
    return editorRanking.map(r => ({
      name: r.editor.name.split(' ')[0],
      Reels: r.reels, Criativos: r.criativos, Stories: r.stories,
    }));
  }, [editorRanking]);

  const editorWeeklyTrend = useMemo(() => {
    const weeks: { label: string; start: string; end: string }[] = [];
    for (let i = 3; i >= 0; i--) {
      const ws = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
      const we = endOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
      weeks.push({ label: `Sem ${format(ws, 'dd/MM')}`, start: format(ws, 'yyyy-MM-dd'), end: format(we, 'yyyy-MM-dd') });
    }
    return weeks.map(w => {
      const entry: any = { semana: w.label };
      editors.forEach(ed => {
        const edTasks = editorTasks.filter(t => (t.assigned_to === ed.id || t.edited_by === ed.id) && (() => {
          const d = format(new Date(t.updated_at), 'yyyy-MM-dd');
          return d >= w.start && d <= w.end;
        })());
        const approved = edTasks.filter(t => !!t.approved_at || EDITOR_APPROVED_COLUMNS.includes(t.kanban_column as any)).length;
        const inEditing = edTasks.filter(t => t.kanban_column === 'edicao').length;
        const inRevision = edTasks.filter(t => t.kanban_column === 'revisao').length;
        const alterations = edTasks.filter(t => t.kanban_column === 'alteracao').length;
        const priorityTasks = edTasks.filter(t => t.editing_priority === true).length;
        entry[ed.name.split(' ')[0]] = approved * EDITOR_SCORE.APROVADO + inEditing * EDITOR_SCORE.EM_EDICAO +
          inRevision * EDITOR_SCORE.REVISAO + alterations * EDITOR_SCORE.ALTERACAO + priorityTasks * EDITOR_SCORE.PRIORIDADE;
      });
      return entry;
    });
  }, [editorTasks, editors]);

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

  const tooltipStyle = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy size={24} className="text-primary" /> Desempenho da Equipe
          </h1>
          <p className="text-sm text-muted-foreground">Ranking e produtividade de videomakers e editores</p>
        </div>
        <Button onClick={generatePDF} className="gap-2"><Download size={16} /> Exportar PDF</Button>
      </div>

      {/* Period filter */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-4 items-end">
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
        </CardContent>
      </Card>

      <Tabs defaultValue="videomakers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="videomakers" className="gap-1.5"><Film size={14} /> Videomakers</TabsTrigger>
          <TabsTrigger value="editors" className="gap-1.5"><Scissors size={14} /> Editores</TabsTrigger>
        </TabsList>

        {/* ════════ VIDEOMAKERS TAB ════════ */}
        <TabsContent value="videomakers" className="space-y-4">
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
              <div className="ml-auto">
                <Badge variant="outline" className="text-xs">
                  Pontuação: Reel={SCORE_WEIGHTS.reel} · Criativo={SCORE_WEIGHTS.criativo} · Story={SCORE_WEIGHTS.story} · Arte={SCORE_WEIGHTS.arte} · Extra={SCORE_WEIGHTS.extra}
                </Badge>
              </div>
            </CardContent>
          </Card>

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
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="pontuação" name="Pontos" radius={[6, 6, 0, 0]}>
                      {scoreChartData.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

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
                  <Tooltip contentStyle={tooltipStyle} />
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp size={16} className="text-primary" /> Evolução Semanal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {videomakers.map((vm, i) => (
                    <Line key={vm.id} type="monotone" dataKey={vm.name.split(' ')[0]} stroke={BAR_COLORS[i % BAR_COLORS.length]} strokeWidth={2} dot={{ r: 4 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

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
        </TabsContent>

        {/* ════════ EDITORS TAB ════════ */}
        <TabsContent value="editors" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <Badge variant="outline" className="text-xs">
                Pontuação: Aprovado={EDITOR_SCORE.APROVADO} · Editando={EDITOR_SCORE.EM_EDICAO} · Revisão={EDITOR_SCORE.REVISAO} · Alteração={EDITOR_SCORE.ALTERACAO} · Prioridade=+{EDITOR_SCORE.PRIORIDADE}
              </Badge>
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Editor Ranking */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Award size={16} className="text-primary" /> Ranking de Editores
                </CardTitle>
              </CardHeader>
              <CardContent>
                {editorRanking.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">Nenhum editor cadastrado</p>
                ) : (
                  <div className="space-y-3">
                    {editorRanking.map((r, i) => {
                      const hours = Math.floor(r.avgTime);
                      const mins = Math.round((r.avgTime - hours) * 60);
                      return (
                        <div key={r.editor.id} className={`flex items-center gap-3 p-3 rounded-lg ${i < 3 ? 'bg-primary/5 border border-primary/20' : 'bg-secondary/50'}`}>
                          <span className="text-lg font-bold w-8 text-center">
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}
                          </span>
                          <UserAvatar user={r.editor} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{r.editor.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {r.approved}✅ · {r.inEditing}🎬 · {r.alterations}🔄 · {r.priorityTasks}⚡ · {r.total} total
                              {r.avgTime > 0 && ` · ~${hours > 0 ? `${hours}h` : ''}${mins}min`}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-primary">{r.score}</p>
                            <p className="text-[10px] text-muted-foreground">pontos</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Editor Score Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 size={16} className="text-primary" /> Pontuação Comparativa
                </CardTitle>
              </CardHeader>
              <CardContent>
                {editorScoreChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={editorScoreChartData} barSize={32}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="pontuação" name="Pontos" radius={[6, 6, 0, 0]}>
                        {editorScoreChartData.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-muted-foreground text-sm text-center py-6">Sem dados para exibir</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Editor content breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Scissors size={16} className="text-primary" /> Conteúdos Editados por Editor
              </CardTitle>
            </CardHeader>
            <CardContent>
              {editorContentChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={editorContentChartData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Reels" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={14} />
                    <Bar dataKey="Criativos" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={14} />
                    <Bar dataKey="Stories" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-sm text-center py-6">Sem dados para exibir</p>
              )}
            </CardContent>
          </Card>

          {/* Editor weekly trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp size={16} className="text-primary" /> Evolução Semanal dos Editores
              </CardTitle>
            </CardHeader>
            <CardContent>
              {editors.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={editorWeeklyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {editors.map((ed, i) => (
                      <Line key={ed.id} type="monotone" dataKey={ed.name.split(' ')[0]} stroke={BAR_COLORS[i % BAR_COLORS.length]} strokeWidth={2} dot={{ r: 4 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-sm text-center py-6">Nenhum editor cadastrado</p>
              )}
            </CardContent>
          </Card>

          {/* Editor detail table */}
          {editorRanking.some(r => r.total > 0) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Users size={16} className="text-primary" /> Detalhamento por Editor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Editor</TableHead>
                      <TableHead className="text-center">Reels</TableHead>
                      <TableHead className="text-center">Criativos</TableHead>
                      <TableHead className="text-center">Stories</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead className="text-center">Pontos</TableHead>
                      <TableHead className="text-center">Tempo Médio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editorRanking.filter(r => r.total > 0).map(r => {
                      const hours = Math.floor(r.avgTime);
                      const mins = Math.round((r.avgTime - hours) * 60);
                      return (
                        <TableRow key={r.editor.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <UserAvatar user={r.editor} size="sm" />
                              <span className="font-medium text-sm">{r.editor.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-semibold">{r.reels}</TableCell>
                          <TableCell className="text-center">{r.criativos}</TableCell>
                          <TableCell className="text-center">{r.stories}</TableCell>
                          
                          <TableCell className="text-center font-semibold">{r.total}</TableCell>
                          <TableCell className="text-center font-bold text-primary">{r.score}</TableCell>
                          <TableCell className="text-center text-muted-foreground">
                            {r.avgTime > 0 ? `${hours > 0 ? `${hours}h ` : ''}${mins}min` : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
