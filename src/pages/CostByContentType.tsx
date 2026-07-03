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
interface SalaryExpense {
  date: string;
  amount: number | string | null;
  description: string | null;
  responsible: string | null;
  category_id: string | null;
  expense_type?: string | null;
}
interface ExpenseCategory {
  id: string;
  name: string | null;
}

const EDITOR_ROLES = ['editor'];
const SOCIAL_ROLES = ['social_media'];
const COPY_ROLES = ['copywriter'];
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

const normalizePersonKey = (value?: string | null) => normalizeText(value).replace(/[^a-z0-9]/g, '');

const cleanSalaryDescription = (value?: string | null) => (value || '').replace(/\s+-\s+pago\s*$/i, '').trim();

const extractSalaryPersonName = (expense: SalaryExpense): string => {
  const cleaned = cleanSalaryDescription(expense.description);
  const match = cleaned.match(/^sal[aá]rio\s*-\s*(.+?)(?:\s*\([^)]+\))?$/i);
  return (match?.[1] || expense.responsible || '').trim();
};

const isFixedSalaryExpense = (expense: SalaryExpense): boolean => {
  const description = normalizeText(expense.description);
  return !description.startsWith('bonus -') && !description.startsWith('bonificacao -');
};

const buildSalaryByUser = (expenses: SalaryExpense[], users: ReturnType<typeof useApp>['users'], start: string, end: string, months: number) => {
  const aliases = users.flatMap(user => [
    { userId: user.id, key: normalizePersonKey(user.displayName) },
    { userId: user.id, key: normalizePersonKey(user.name) },
    { userId: user.id, key: normalizePersonKey(user.email?.split('@')[0]) },
  ]).filter(alias => alias.key.length >= 3);

  // Agrupa por usuário: soma paga dentro do período e valor mensal mais recente fora dele.
  const inPeriodByUser = new Map<string, number>();
  const latestOutByUser = new Map<string, { date: string; amount: number }>();
  let unmatchedTotal = 0;

  expenses
    .filter(isFixedSalaryExpense)
    .forEach(expense => {
      const amount = toNumber(expense.amount);
      if (amount <= 0) return;

      const candidateKeys = [
        normalizePersonKey(expense.responsible),
        normalizePersonKey(extractSalaryPersonName(expense)),
      ].filter(Boolean);
      const descriptionKey = normalizePersonKey(expense.description);
      const exactMatch = aliases.find(alias => candidateKeys.includes(alias.key));
      const fallbackMatch = exactMatch || aliases.find(alias => alias.key.length >= 4 && descriptionKey.includes(alias.key));

      const isIn = inDateRange(expense.date, start, end);

      if (fallbackMatch) {
        if (isIn) {
          inPeriodByUser.set(fallbackMatch.userId, (inPeriodByUser.get(fallbackMatch.userId) || 0) + amount);
        } else {
          const prev = latestOutByUser.get(fallbackMatch.userId);
          const day = (expense.date || '').slice(0, 10);
          if (!prev || day > prev.date) {
            latestOutByUser.set(fallbackMatch.userId, { date: day, amount });
          }
        }
      } else if (isIn) {
        unmatchedTotal += amount;
      }
    });

  const salaryByUser = new Map<string, number>();
  const userIds = new Set<string>([...inPeriodByUser.keys(), ...latestOutByUser.keys()]);
  userIds.forEach(userId => {
    const inSum = inPeriodByUser.get(userId) || 0;
    if (inSum > 0) {
      salaryByUser.set(userId, inSum);
    } else {
      const fallback = latestOutByUser.get(userId);
      if (fallback) salaryByUser.set(userId, fallback.amount * months);
    }
  });

  return { salaryByUser, unmatchedTotal };
};

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

interface PlanRow {
  id: string;
  name: string | null;
  price: number | string | null;
  reels_qty: number | string | null;
  creatives_qty: number | string | null;
  stories_qty: number | string | null;
  arts_qty: number | string | null;
  recording_sessions?: number | string | null;
  active?: boolean | null;
}

export default function CostByContentType() {
  const { clients, users } = useApp();
  const [records, setRecords] = useState<DeliveryRecord[]>([]);
  const [editorTasks, setEditorTasks] = useState<EditorTask[]>([]);
  const [designTasks, setDesignTasks] = useState<DesignTask[]>([]);
  const [socialDeliveries, setSocialDeliveries] = useState<SocialDelivery[]>([]);
  const [salaryExpenses, setSalaryExpenses] = useState<SalaryExpense[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [selectedClient, setSelectedClient] = useState('all');
  const [periodType, setPeriodType] = useState<'current' | 'previous' | 'custom'>('current');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const fetchData = useCallback(async () => {
    const [rRes, sRes, edRes, dRes, catRes, expRes, plRes] = await Promise.all([
      supabase.from('delivery_records').select('client_id,date,reels_produced,creatives_produced,stories_produced,arts_produced,delivery_status'),
      supabase.from('social_media_deliveries').select('client_id,content_type,delivered_at,posted_at,created_at,updated_at,status'),
      supabase.from('content_tasks').select('client_id,content_type,kanban_column,approved_at,updated_at,created_at,assigned_to'),
      supabase.from('design_tasks').select('client_id,kanban_column,completed_at,updated_at,created_at,attachment_url,attachment_urls,editable_file_url,mockup_url'),
      supabase.from('expense_categories').select('id,name'),
      supabase.from('expenses').select('date,amount,description,responsible,category_id,expense_type'),
      supabase.from('plans').select('id,name,price,reels_qty,creatives_qty,stories_qty,arts_qty,recording_sessions,active'),
    ]);
    if (rRes.data) setRecords(rRes.data as DeliveryRecord[]);
    if (sRes.data) setSocialDeliveries(sRes.data as SocialDelivery[]);
    if (edRes.data) setEditorTasks(edRes.data as EditorTask[]);
    if (dRes.data) setDesignTasks(dRes.data as DesignTask[]);
    if (plRes.data) setPlans(plRes.data as PlanRow[]);
    if (catRes.data && expRes.data) {
      const salaryCategoryIds = new Set(
        (catRes.data as ExpenseCategory[])
          .filter(category => normalizeText(category.name).includes('salario'))
          .map(category => category.id)
      );
      setSalaryExpenses((expRes.data as SalaryExpense[]).filter(expense => (
        salaryCategoryIds.has(expense.category_id || '')
        || normalizeText(expense.description).startsWith('salario -')
      )));
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
    const parseLocal = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
    const start = parseLocal(dateRange.start);
    const end = parseLocal(dateRange.end);
    const months = Math.max(1, differenceInCalendarMonths(end, start) + 1);

    const { salaryByUser, unmatchedTotal: unmatchedSalaryTotal } = buildSalaryByUser(salaryExpenses, users, dateRange.start, dateRange.end, months);

    const editorPool = users
      .filter(u => u.role === 'editor')
      .reduce((a, u) => a + (salaryByUser.get(u.id) || 0), 0);
    const socialPool = users
      .filter(u => u.role === 'social_media')
      .reduce((a, u) => a + (salaryByUser.get(u.id) || 0), 0);
    const editorSocialPool = editorPool + socialPool;
    const vmPool = users
      .filter(u => VIDEOMAKER_ROLES.includes(u.role))
      .reduce((a, u) => a + (salaryByUser.get(u.id) || 0), 0);
    const designerPool = users
      .filter(u => DESIGNER_ROLES.includes(u.role))
      .reduce((a, u) => a + (salaryByUser.get(u.id) || 0), 0);
    const monthlyEditorPool = editorSocialPool / months;
    const monthlyVmPool = vmPool / months;
    const monthlyDesignerPool = designerPool / months;
    const monthlyVideoPool = monthlyEditorPool + monthlyVmPool;
    const videoPool = editorSocialPool + vmPool;
    const monthlyTotalSalaries = monthlyVideoPool + monthlyDesignerPool;
    const totalSalaries = videoPool + designerPool;

    // Mapa userId -> role para classificar quem editou cada card
    const roleOf = new Map(users.map(u => [u.id, u.role]));

    // Split das tasks produzidas pelo tipo de quem editou (assigned_to)
    const vmCountsByUser = new Map<string, { reels: number; criativo: number; story: number }>();
    const edCountsByUser = new Map<string, { reels: number; criativo: number; story: number }>();
    let vmReels = 0, vmCri = 0, vmSto = 0;
    let edReels = 0, edCri = 0, edSto = 0;
    relevantTasks.forEach(t => {
      const type = normalizeContentType(t.content_type);
      const role = t.assigned_to ? roleOf.get(t.assigned_to) : undefined;
      const isVm = role && VIDEOMAKER_ROLES.includes(role);
      const isEd = role && EDITOR_ROLES.includes(role);
      if (isVm && t.assigned_to) {
        const current = vmCountsByUser.get(t.assigned_to) || { reels: 0, criativo: 0, story: 0 };
        if (type === 'reels') { current.reels++; vmReels++; }
        else if (type === 'criativo') { current.criativo++; vmCri++; }
        else if (type === 'story') { current.story++; vmSto++; }
        vmCountsByUser.set(t.assigned_to, current);
      } else {
        if (type === 'reels') edReels++;
        else if (type === 'criativo') edCri++;
        else if (type === 'story') edSto++;
        if (isEd && t.assigned_to) {
          const current = edCountsByUser.get(t.assigned_to) || { reels: 0, criativo: 0, story: 0 };
          if (type === 'reels') current.reels++;
          else if (type === 'criativo') current.criativo++;
          else if (type === 'story') current.story++;
          edCountsByUser.set(t.assigned_to, current);
        }
      }
    });

    // Artes por designer (assigned_to via design_tasks) — para validação
    const designCountsByUser = new Map<string, number>();
    designTasks.forEach((t: any) => {
      if (!clientOk(t.client_id)) return;
      if (!PRODUCED_DESIGN_COLUMNS.has(normalizeText(t.kanban_column))) return;
      if (!inDateRange(t.completed_at || t.updated_at || t.created_at, dateRange.start, dateRange.end)) return;
      const uid = t.assigned_to;
      if (!uid) return;
      const role = roleOf.get(uid);
      if (!role || !DESIGNER_ROLES.includes(role)) return;
      designCountsByUser.set(uid, (designCountsByUser.get(uid) || 0) + countDesignAttachments(t));
    });

    // Breakdown por colaborador — quando o card não tem assigned_to (comum),
    // rateamos o total real da função igualmente entre os colaboradores dela.
    // Rateio igualitário (não proporcional ao salário) mantém o custo/card distinto por pessoa.
    const distributeByRole = (roles: string[], totals: { reels: number; criativo: number; story: number; artes: number }, directCounts: Map<string, { reels: number; criativo: number; story: number; artes: number }>) => {
      const roleUsers = users.filter(u => roles.includes(u.role));
      const share = new Map<string, { reels: number; criativo: number; story: number; artes: number }>();
      const claimed = { reels: 0, criativo: 0, story: 0, artes: 0 };
      directCounts.forEach((c, uid) => {
        share.set(uid, { ...c });
        claimed.reels += c.reels; claimed.criativo += c.criativo; claimed.story += c.story; claimed.artes += c.artes;
      });
      const remaining = {
        reels: Math.max(0, totals.reels - claimed.reels),
        criativo: Math.max(0, totals.criativo - claimed.criativo),
        story: Math.max(0, totals.story - claimed.story),
        artes: Math.max(0, totals.artes - claimed.artes),
      };
      const n = Math.max(1, roleUsers.length);
      roleUsers.forEach(u => {
        const cur = share.get(u.id) || { reels: 0, criativo: 0, story: 0, artes: 0 };
        cur.reels += remaining.reels / n;
        cur.criativo += remaining.criativo / n;
        cur.story += remaining.story / n;
        cur.artes += remaining.artes / n;
        share.set(u.id, cur);
      });
      return share;
    };

    const editorDirect = new Map<string, { reels: number; criativo: number; story: number; artes: number }>();
    edCountsByUser.forEach((c, uid) => editorDirect.set(uid, { ...c, artes: 0 }));
    const vmDirect = new Map<string, { reels: number; criativo: number; story: number; artes: number }>();
    vmCountsByUser.forEach((c, uid) => vmDirect.set(uid, { ...c, artes: 0 }));
    const designerDirect = new Map<string, { reels: number; criativo: number; story: number; artes: number }>();
    designCountsByUser.forEach((n, uid) => designerDirect.set(uid, { reels: 0, criativo: 0, story: 0, artes: n }));

    const editorShare = distributeByRole(EDITOR_ROLES, { reels: edReels, criativo: edCri, story: edSto, artes: 0 }, editorDirect);
    const vmShare = distributeByRole(VIDEOMAKER_ROLES, { reels: vmReels, criativo: vmCri, story: vmSto, artes: 0 }, vmDirect);
    const designerShare = distributeByRole(DESIGNER_ROLES, { reels: 0, criativo: 0, story: 0, artes: dtArts }, designerDirect);

    const contributorBreakdown = users
      .filter(u => [...EDITOR_ROLES, ...VIDEOMAKER_ROLES, ...DESIGNER_ROLES].includes(u.role))
      .map(u => {
        const src = EDITOR_ROLES.includes(u.role) ? editorShare
          : VIDEOMAKER_ROLES.includes(u.role) ? vmShare
          : designerShare;
        const s = src.get(u.id) || { reels: 0, criativo: 0, story: 0, artes: 0 };
        const cards = s.reels + s.criativo + s.story + s.artes;
        const salary = salaryByUser.get(u.id) || 0;
        return {
          id: u.id,
          name: u.displayName || u.name || u.email,
          role: u.role,
          salary,
          cards,
          reels: s.reels,
          criativo: s.criativo,
          story: s.story,
          artes: s.artes,
          avgCost: cards > 0 && salary > 0 ? salary / cards : 0,
        };
      })
      .filter(c => c.salary > 0 || c.cards > 0)
      .sort((a, b) => b.salary - a.salary);

    // Aloca o salário financeiro de cada videomaker apenas nos cards que ele mesmo editou.
    let salVmReels = 0, salVmCri = 0, salVmSto = 0, vmEditingPool = 0;
    vmCountsByUser.forEach((counts, userId) => {
      const userSalary = salaryByUser.get(userId) || 0;
      const userWeight = counts.reels * VIDEO_EFFORT.reels + counts.criativo * VIDEO_EFFORT.criativo + counts.story * VIDEO_EFFORT.story;
      if (userWeight <= 0) return;
      vmEditingPool += userSalary;
      salVmReels += (userSalary * counts.reels * VIDEO_EFFORT.reels) / userWeight;
      salVmCri += (userSalary * counts.criativo * VIDEO_EFFORT.criativo) / userWeight;
      salVmSto += (userSalary * counts.story * VIDEO_EFFORT.story) / userWeight;
    });

    // Totais gerais (mantém compat com agenda/social se maior)
    const reels = Math.max(recReels, ctReels, sReels);
    const criativos = Math.max(recCri, ctCri, sCri);
    const stories = Math.max(recSto, ctSto, sSto);

    // Pool editor+social: distribuído pelo total geral (inclui o que não teve assigned_to)
    const wReels = reels * VIDEO_EFFORT.reels;
    const wCri = criativos * VIDEO_EFFORT.criativo;
    const wSto = stories * VIDEO_EFFORT.story;
    const wTotal = wReels + wCri + wSto;
    const salReels = wTotal > 0 ? (editorSocialPool * wReels) / wTotal : 0;
    const salCri = wTotal > 0 ? (editorSocialPool * wCri) / wTotal : 0;
    const salSto = wTotal > 0 ? (editorSocialPool * wSto) / wTotal : 0;

    // Pool designer: 100% para artes
    const salArt = designerPool;

    // Custo líquido por conteúdo = soma do que empresa gastou (Editor+Social + Videomaker) naquele tipo
    const netReels = salReels + salVmReels;
    const netCri = salCri + salVmCri;
    const netSto = salSto + salVmSto;
    const netArt = salArt;

    // === CUSTO UNITÁRIO POR FUNÇÃO (para análise de pacotes) ===
    // VM inteiro rateado por esforço no total produzido
    const vmFullReels = wTotal > 0 ? (vmPool * wReels) / wTotal : 0;
    const vmFullCri = wTotal > 0 ? (vmPool * wCri) / wTotal : 0;
    const vmFullSto = wTotal > 0 ? (vmPool * wSto) / wTotal : 0;

    // Editor puro (só role 'editor') e Social Media puro, rateados por esforço
    const editorOnlyReels = wTotal > 0 ? (editorPool * wReels) / wTotal : 0;
    const editorOnlyCri = wTotal > 0 ? (editorPool * wCri) / wTotal : 0;
    const editorOnlySto = wTotal > 0 ? (editorPool * wSto) / wTotal : 0;
    const socialOnlyReels = wTotal > 0 ? (socialPool * wReels) / wTotal : 0;
    const socialOnlyCri = wTotal > 0 ? (socialPool * wCri) / wTotal : 0;
    const socialOnlySto = wTotal > 0 ? (socialPool * wSto) / wTotal : 0;

    const editorPerReels = reels > 0 ? editorOnlyReels / reels : 0;
    const editorPerCri = criativos > 0 ? editorOnlyCri / criativos : 0;
    const editorPerSto = stories > 0 ? editorOnlySto / stories : 0;
    const socialPerReels = reels > 0 ? socialOnlyReels / reels : 0;
    const socialPerCri = criativos > 0 ? socialOnlyCri / criativos : 0;
    const socialPerSto = stories > 0 ? socialOnlySto / stories : 0;
    const vmPerReels = reels > 0 ? vmFullReels / reels : 0;
    const vmPerCri = criativos > 0 ? vmFullCri / criativos : 0;
    const vmPerSto = stories > 0 ? vmFullSto / stories : 0;
    const designerPerArte = artes > 0 ? designerPool / artes : 0;

    const totalPerReels = editorPerReels + socialPerReels + vmPerReels;
    const totalPerCri = editorPerCri + socialPerCri + vmPerCri;
    const totalPerSto = editorPerSto + socialPerSto + vmPerSto;
    const totalPerArte = designerPerArte;

    // === ANÁLISE POR PACOTE ===
    const planAnalysis = plans
      .filter(p => p.active !== false)
      .map(p => {
        const qReels = toNumber(p.reels_qty);
        const qCri = toNumber(p.creatives_qty);
        const qSto = toNumber(p.stories_qty);
        const qArt = toNumber(p.arts_qty);
        const price = toNumber(p.price);
        const costReels = qReels * totalPerReels;
        const costCri = qCri * totalPerCri;
        const costSto = qSto * totalPerSto;
        const costArt = qArt * totalPerArte;
        const cost = costReels + costCri + costSto + costArt;
        const margin = price - cost;
        const marginPct = price > 0 ? (margin / price) * 100 : 0;
        return {
          id: p.id,
          name: p.name || 'Sem nome',
          price,
          qReels, qCri, qSto, qArt,
          costReels, costCri, costSto, costArt,
          cost, margin, marginPct,
        };
      })
      .sort((a, b) => b.price - a.price);

    return {
      totalSalaries, monthlyTotalSalaries, months,
      videoPool, editorPool, socialPool, editorSocialPool, vmPool, vmEditingPool, designerPool,
      monthlyVideoPool, monthlyEditorPool, monthlyVmPool, monthlyDesignerPool,
      unmatchedSalaryTotal,
      reels, criativos, stories, artes,
      cReels: reels > 0 ? netReels / reels : 0,
      cCri: criativos > 0 ? netCri / criativos : 0,
      cArt: artes > 0 ? netArt / artes : 0,
      cSto: stories > 0 ? netSto / stories : 0,
      salReels: netReels, salCri: netCri, salArt: netArt, salSto: netSto,
      vmReels, vmCri, vmSto,
      salVmReels, salVmCri, salVmSto,
      cVmReels: vmReels > 0 ? salVmReels / vmReels : 0,
      cVmCri: vmCri > 0 ? salVmCri / vmCri : 0,
      cVmSto: vmSto > 0 ? salVmSto / vmSto : 0,
      editorPerReels, editorPerCri, editorPerSto,
      socialPerReels, socialPerCri, socialPerSto,
      vmPerReels, vmPerCri, vmPerSto,
      designerPerArte,
      totalPerReels, totalPerCri, totalPerSto, totalPerArte,
      contributorBreakdown,
      planAnalysis,
    };
  }, [records, editorTasks, designTasks, socialDeliveries, salaryExpenses, users, selectedClient, dateRange, plans]);

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
        <p className="text-sm text-muted-foreground">Custo líquido por conteúdo = soma dos salários (Editor/Social + Videomaker + Designer) alocados por esforço (Reels=1.0, Criativo=0.5, Story=0.2). Fonte: Financeiro &gt; Despesas &gt; Salários.</p>
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
            <p className="text-xl font-bold">{fmt(data.editorSocialPool)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pool Editor+Social ({data.months} {data.months === 1 ? 'mês' : 'meses'})</p>
            <p className="text-[10px] text-muted-foreground mt-1">Média mensal: {fmt(data.monthlyEditorPool)} · VM no financeiro: {fmt(data.vmPool)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: 'hsl(24,95%,53%)' }}>
          <CardContent className="p-4">
            <DollarSign size={18} className="text-orange-600 mb-2" />
            <p className="text-xl font-bold">{fmt(data.designerPool)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pool Designer ({data.months} {data.months === 1 ? 'mês' : 'meses'})</p>
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
            <p className="text-xs text-muted-foreground mt-1">Lance os salários em <b>Financeiro → Despesas → Salários</b>, selecionando o colaborador, para os custos aparecerem aqui.</p>
          </CardContent>
        </Card>
      )}

      {data.unmatchedSalaryTotal > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="p-4 text-sm">
            <p className="font-semibold text-amber-700 dark:text-amber-400">⚠ Salários sem colaborador reconhecido</p>
            <p className="text-xs text-muted-foreground mt-1">{fmt(data.unmatchedSalaryTotal)} em salários do período não foram vinculados porque o responsável/descrição não bate com nenhum colaborador cadastrado.</p>
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

      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2 mt-6">
          <Film size={18} className="text-cyan-600" /> Edições feitas por Videomakers
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Salário do financeiro de cada videomaker alocado apenas nos cards onde o responsável (assigned_to) é aquele videomaker. Pool usado nas edições: {fmt(data.vmEditingPool)} · total VM no período: {fmt(data.vmPool)}.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Reels', qty: data.vmReels, cost: data.cVmReels, total: data.salVmReels, border: 'hsl(190,90%,45%)', color: 'text-cyan-600' },
            { label: 'Criativos', qty: data.vmCri, cost: data.cVmCri, total: data.salVmCri, border: 'hsl(280,70%,55%)', color: 'text-fuchsia-600' },
            { label: 'Stories', qty: data.vmSto, cost: data.cVmSto, total: data.salVmSto, border: 'hsl(340,80%,60%)', color: 'text-rose-600' },
          ].map((it, i) => (
            <Card key={i} className="overflow-hidden border-l-4" style={{ borderLeftColor: it.border }}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Film size={18} className={it.color} />
                  <span className="text-[10px] text-muted-foreground">{it.qty} editados por VM</span>
                </div>
                <p className="text-2xl font-bold">{formatCost(it.cost, it.qty, data.vmEditingPool)}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Custo VM por {it.label}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Total alocado: {fmt(it.total)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2 mt-6">
          <Calculator size={18} className="text-emerald-600" /> Validação por Colaborador
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Total produzido pela função é rateado igualmente entre os colaboradores dela (cards com <code>assigned_to</code> entram integralmente; o restante é dividido em partes iguais). Assim o custo médio/card reflete o salário individual.
        </p>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Colaborador</th>
                  <th className="text-left px-3 py-2">Função</th>
                  <th className="text-right px-3 py-2">Salário ({data.months} {data.months === 1 ? 'mês' : 'meses'})</th>
                  <th className="text-right px-3 py-2">Reels</th>
                  <th className="text-right px-3 py-2">Criativos</th>
                  <th className="text-right px-3 py-2">Stories</th>
                  <th className="text-right px-3 py-2">Artes</th>
                  <th className="text-right px-3 py-2">Total cards</th>
                </tr>
              </thead>
              <tbody>
                {data.contributorBreakdown.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-muted-foreground py-6">Sem colaboradores com salário ou cards no período.</td></tr>
                )}
                {data.contributorBreakdown.map(c => (
                  <tr key={c.id} className="border-t border-border/50">
                    <td className="px-3 py-2 font-medium">{c.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.role}</td>
                    <td className="px-3 py-2 text-right">{fmt(c.salary)}</td>
                    <td className="px-3 py-2 text-right">{c.reels.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right">{c.criativo.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right">{c.story.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right">{c.artes.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{c.cards.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2 mt-6">
          <DollarSign size={18} className="text-blue-600" /> Custo unitário por função
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Quanto a empresa paga por cada entrega, separado por função. Base: salário total do período dividido pelo total produzido, distribuído por esforço (Reels 1.0 · Criativo 0.5 · Story 0.2).
        </p>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Conteúdo</th>
                  <th className="text-right px-3 py-2">Videomaker (captação)</th>
                  <th className="text-right px-3 py-2">Editor (edição)</th>
                  <th className="text-right px-3 py-2">Social Media</th>
                  <th className="text-right px-3 py-2">Designer</th>
                  <th className="text-right px-3 py-2 bg-primary/10">Custo total por unidade</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: '1 Reels', vm: data.vmPerReels, ed: data.editorPerReels, sc: data.socialPerReels, ds: 0, total: data.totalPerReels },
                  { label: '1 Criativo', vm: data.vmPerCri, ed: data.editorPerCri, sc: data.socialPerCri, ds: 0, total: data.totalPerCri },
                  { label: '1 Story', vm: data.vmPerSto, ed: data.editorPerSto, sc: data.socialPerSto, ds: 0, total: data.totalPerSto },
                  { label: '1 Arte', vm: 0, ed: 0, sc: 0, ds: data.designerPerArte, total: data.totalPerArte },
                ].map((r, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="px-3 py-2 font-medium">{r.label}</td>
                    <td className="px-3 py-2 text-right">{r.vm > 0 ? fmt(r.vm) : '—'}</td>
                    <td className="px-3 py-2 text-right">{r.ed > 0 ? fmt(r.ed) : '—'}</td>
                    <td className="px-3 py-2 text-right">{r.sc > 0 ? fmt(r.sc) : '—'}</td>
                    <td className="px-3 py-2 text-right">{r.ds > 0 ? fmt(r.ds) : '—'}</td>
                    <td className="px-3 py-2 text-right font-bold bg-primary/5">{r.total > 0 ? fmt(r.total) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2 mt-6">
          <Calculator size={18} className="text-emerald-600" /> Análise por Pacote (custo × margem)
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Para cada plano ativo: custo estimado de produção (quantidades do plano × custo unitário total) versus preço de venda. Margem = preço − custo.
        </p>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Pacote</th>
                  <th className="text-right px-3 py-2">Reels</th>
                  <th className="text-right px-3 py-2">Criat.</th>
                  <th className="text-right px-3 py-2">Stories</th>
                  <th className="text-right px-3 py-2">Artes</th>
                  <th className="text-right px-3 py-2">Preço</th>
                  <th className="text-right px-3 py-2">Custo produção</th>
                  <th className="text-right px-3 py-2">Margem R$</th>
                  <th className="text-right px-3 py-2">Margem %</th>
                </tr>
              </thead>
              <tbody>
                {data.planAnalysis.length === 0 && (
                  <tr><td colSpan={9} className="text-center text-muted-foreground py-6">Nenhum plano ativo cadastrado.</td></tr>
                )}
                {data.planAnalysis.map(p => (
                  <tr key={p.id} className="border-t border-border/50">
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="px-3 py-2 text-right">{p.qReels}</td>
                    <td className="px-3 py-2 text-right">{p.qCri}</td>
                    <td className="px-3 py-2 text-right">{p.qSto}</td>
                    <td className="px-3 py-2 text-right">{p.qArt}</td>
                    <td className="px-3 py-2 text-right">{fmt(p.price)}</td>
                    <td className="px-3 py-2 text-right">{fmt(p.cost)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${p.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(p.margin)}</td>
                    <td className={`px-3 py-2 text-right font-bold ${p.marginPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{p.marginPct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
