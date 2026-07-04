import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/vpsDb';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Target, Film, Megaphone, Image as ImageIcon, Palette, DollarSign, Calculator, Check } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, differenceInCalendarMonths } from 'date-fns';

interface DeliveryRecord {
  client_id: string | null;
  videomaker_id?: string | null;
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
  edited_by?: string | null;
}
interface DesignTask {
  client_id: string | null;
  kanban_column: string;
  completed_at: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  attachment_url?: string | null;
  attachment_urls?: string[] | string | null;
  editable_file_url?: string | null;
  mockup_url?: string | null;
  assigned_to?: string | null;
}
interface SocialDelivery {
  client_id: string | null;
  content_type: string | null;
  delivered_at: string | null;
  posted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  status: string;
  created_by?: string | null;
}
interface ScriptRecord {
  client_id: string | null;
  content_format: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at?: string | null;
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

const ROLE_LABEL_TO_ROLE: Record<string, string> = {
  administrador: 'admin', videomaker: 'videomaker', 'social media': 'social_media',
  socialmedia: 'social_media', editor: 'editor', endomarketing: 'endomarketing',
  parceiro: 'parceiro', fotografia: 'fotografo', fotografo: 'fotografo',
  designer: 'designer', copywriter: 'copywriter',
};

// "Salário - Victor (Videomaker)" → 'videomaker'
const extractSalaryRoleHint = (expense: SalaryExpense): string | null => {
  const desc = expense.description || '';
  const m = desc.match(/\(([^)]+)\)\s*$/);
  if (!m) return null;
  const key = normalizeText(m[1]);
  return ROLE_LABEL_TO_ROLE[key] || ROLE_LABEL_TO_ROLE[key.replace(/\s+/g, '')] || null;
};

const buildSalaryByUser = (expenses: SalaryExpense[], users: ReturnType<typeof useApp>['users'], start: string, end: string, months: number) => {
  type Alias = { userId: string; role: string; key: string };
  const rawAliases: Alias[] = users.flatMap(user => [
    { userId: user.id, role: user.role, key: normalizePersonKey(user.displayName) },
    { userId: user.id, role: user.role, key: normalizePersonKey(user.name) },
    { userId: user.id, role: user.role, key: normalizePersonKey(user.email?.split('@')[0]) },
  ]).filter(alias => alias.key.length >= 3);

  const keyOwners = new Map<string, Set<string>>();
  rawAliases.forEach(a => {
    if (!keyOwners.has(a.key)) keyOwners.set(a.key, new Set());
    keyOwners.get(a.key)!.add(a.userId);
  });
  // aliases únicos (só 1 dono) — casáveis sem contexto
  const uniqueAliases = rawAliases
    .filter(a => (keyOwners.get(a.key)?.size || 0) === 1)
    .sort((a, b) => b.key.length - a.key.length);
  // aliases ambíguos ("victor") — só casam se houver dica de role (ex.: "(Videomaker)")
  const ambiguousAliases = rawAliases.filter(a => (keyOwners.get(a.key)?.size || 0) > 1);

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
      const roleHint = extractSalaryRoleHint(expense);

      let match: Alias | undefined =
        uniqueAliases.find(a => candidateKeys.includes(a.key)) ||
        uniqueAliases.find(a => a.key.length >= 4 && descriptionKey.includes(a.key));

      // Desempate por role quando o nome sozinho é ambíguo (ex.: 3 Victors).
      if (!match && roleHint) {
        match = ambiguousAliases.find(a => a.role === roleHint && candidateKeys.includes(a.key))
          || ambiguousAliases.find(a => a.role === roleHint && a.key.length >= 4 && descriptionKey.includes(a.key));
      }

      const isIn = inDateRange(expense.date, start, end);

      if (match) {
        if (isIn) {
          inPeriodByUser.set(match.userId, (inPeriodByUser.get(match.userId) || 0) + amount);
        } else {
          const prev = latestOutByUser.get(match.userId);
          const day = (expense.date || '').slice(0, 10);
          if (!prev || day > prev.date) {
            latestOutByUser.set(match.userId, { date: day, amount });
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

const getDesignAttachmentUrls = (task: DesignTask): string[] => {
  const rawUrls = Array.isArray(task.attachment_urls)
    ? task.attachment_urls
    : typeof task.attachment_urls === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(task.attachment_urls || '[]');
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return task.attachment_urls ? [task.attachment_urls] : [];
          }
        })()
      : [];

  return Array.from(new Set([
    ...rawUrls,
    task.attachment_url,
  ].filter((url): url is string => Boolean(url && url.trim()))));
};

const countDesignArts = (task: DesignTask): number => {
  return getDesignAttachmentUrls(task).length;
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
  status?: string | null;
}

export default function CostByContentType() {
  const { clients, users } = useApp();
  const [records, setRecords] = useState<DeliveryRecord[]>([]);
  const [editorTasks, setEditorTasks] = useState<EditorTask[]>([]);
  const [designTasks, setDesignTasks] = useState<DesignTask[]>([]);
  const [socialDeliveries, setSocialDeliveries] = useState<SocialDelivery[]>([]);
  const [scripts, setScripts] = useState<ScriptRecord[]>([]);
  const [salaryExpenses, setSalaryExpenses] = useState<SalaryExpense[]>([]);
  const [prolaboreExpenses, setProlaboreExpenses] = useState<SalaryExpense[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [selectedClient, setSelectedClient] = useState('all');
  const [periodType, setPeriodType] = useState<'current' | 'previous' | 'custom'>('current');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [includeProLabore, setIncludeProLabore] = useState(false);

  const fetchData = useCallback(async () => {
    const [rRes, sRes, edRes, dRes, scRes, catRes, expRes, plRes] = await Promise.all([
      supabase.from('delivery_records').select('client_id,videomaker_id,date,reels_produced,creatives_produced,stories_produced,arts_produced,delivery_status'),
      supabase.from('social_media_deliveries').select('client_id,content_type,delivered_at,posted_at,created_at,updated_at,status,created_by'),
      supabase.from('content_tasks').select('client_id,content_type,kanban_column,approved_at,updated_at,created_at,assigned_to,edited_by'),
      supabase.from('design_tasks').select('client_id,kanban_column,completed_at,updated_at,created_at,attachment_url,attachment_urls,editable_file_url,mockup_url,assigned_to'),
      supabase.from('scripts').select('client_id,content_format,created_by,created_at,updated_at'),
      supabase.from('expense_categories').select('id,name'),
      supabase.from('expenses').select('date,amount,description,responsible,category_id,expense_type'),
      supabase.from('plans').select('id,name,price,reels_qty,creatives_qty,stories_qty,arts_qty,recording_sessions,status'),
    ]);
    if (rRes.data) setRecords(rRes.data as DeliveryRecord[]);
    if (sRes.data) setSocialDeliveries(sRes.data as SocialDelivery[]);
    if (edRes.data) setEditorTasks(edRes.data as EditorTask[]);
    if (dRes.data) setDesignTasks(dRes.data as DesignTask[]);
    if (scRes.data) setScripts(scRes.data as ScriptRecord[]);
    if (plRes.data) setPlans(plRes.data as PlanRow[]);
    if (catRes.data && expRes.data) {
      const cats = catRes.data as ExpenseCategory[];
      const salaryCategoryIds = new Set(
        cats.filter(c => normalizeText(c.name).includes('salario')).map(c => c.id)
      );
      const prolaboreCategoryIds = new Set(
        cats.filter(c => /pr[oó][- ]?labore/i.test(c.name || '')).map(c => c.id)
      );
      const allExp = expRes.data as SalaryExpense[];
      setSalaryExpenses(allExp.filter(e => (
        salaryCategoryIds.has(e.category_id || '')
        || normalizeText(e.description).startsWith('salario -')
      )));
      setProlaboreExpenses(allExp.filter(e => prolaboreCategoryIds.has(e.category_id || '')));
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

    // Conta artes reais anexadas em cada card produzido pelo time de designer.
    // CAR = tarefa/card; Artes = arquivos/links anexados no card (sem mockup).
    const dtArts = designTasks
      .filter(t => clientOk(t.client_id) && PRODUCED_DESIGN_COLUMNS.has(normalizeText(t.kanban_column)) && inDateRange(t.completed_at || t.updated_at || t.created_at, dateRange.start, dateRange.end))
      .reduce((a, t) => a + countDesignArts(t), 0);

    // Total de Artes = exclusivamente produção do time de designer (anexos nos cards).
    // Não misturar com recArts (delivery_records dos videomakers) — times distintos,
    // senão o custo unitário do designer fica distorcido quando VM registra "artes".
    const artes = dtArts;


    // === SALÁRIOS por pool (sem sobreposição) ===
    const parseLocal = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
    const start = parseLocal(dateRange.start);
    const end = parseLocal(dateRange.end);
    const months = Math.max(1, differenceInCalendarMonths(end, start) + 1);

    const { salaryByUser, unmatchedTotal: unmatchedSalaryTotal } = buildSalaryByUser(salaryExpenses, users, dateRange.start, dateRange.end, months);

    // Pró-labore só vai para sócios (role = 'admin'). Não deve ser somado a colaboradores de produção
    // mesmo que compartilhem o primeiro nome (ex.: Victor sócio ≠ Victor Videomaker).
    if (includeProLabore) {
      // Aliases completos + primeiro nome (só entre admins — assim "Victor" bate no Victor Gabriel
      // sem risco de colidir com Victor Videomaker ou Victor Oliveira Editor).
      const admins = users.filter(u => u.role === 'admin');
      const socioAliases = admins.flatMap(u => {
        const full = [u.displayName, u.name, u.email?.split('@')[0]]
          .map(normalizePersonKey)
          .filter(k => k.length >= 3);
        const firstNames = [u.displayName, u.name]
          .map(v => normalizePersonKey((v || '').split(/\s+/)[0]))
          .filter(k => k.length >= 3);
        return [...full, ...firstNames].map(key => ({ userId: u.id, key }));
      });
      prolaboreExpenses
        .filter(e => inDateRange(e.date, dateRange.start, dateRange.end))
        .forEach(e => {
          const amount = toNumber(e.amount);
          if (amount <= 0) return;
          const keys = [normalizePersonKey(e.responsible), normalizePersonKey(extractSalaryPersonName(e))].filter(Boolean);
          const descKey = normalizePersonKey(e.description);
          const match = socioAliases.find(a => keys.includes(a.key))
            || socioAliases.find(a => a.key.length >= 4 && descKey.includes(a.key))
            || socioAliases.find(a => keys.some(k => k.startsWith(a.key + ' ') || k === a.key));
          if (match) salaryByUser.set(match.userId, (salaryByUser.get(match.userId) || 0) + amount);
        });
    }

    const editorPool = users
      .filter(u => EDITOR_ROLES.includes(u.role))
      .reduce((a, u) => a + (salaryByUser.get(u.id) || 0), 0);
    const socialPool = users
      .filter(u => SOCIAL_ROLES.includes(u.role))
      .reduce((a, u) => a + (salaryByUser.get(u.id) || 0), 0);
    const copyPool = users
      .filter(u => COPY_ROLES.includes(u.role))
      .reduce((a, u) => a + (salaryByUser.get(u.id) || 0), 0);
    const editorSocialPool = editorPool + socialPool;
    const vmPool = users
      .filter(u => VIDEOMAKER_ROLES.includes(u.role))
      .reduce((a, u) => a + (salaryByUser.get(u.id) || 0), 0);
    const designerPool = users
      .filter(u => DESIGNER_ROLES.includes(u.role))
      .reduce((a, u) => a + (salaryByUser.get(u.id) || 0), 0);
    const monthlyEditorPool = editorPool / months;
    const monthlySocialPool = socialPool / months;
    const monthlyCopyPool = copyPool / months;
    const monthlyVmPool = vmPool / months;
    const monthlyDesignerPool = designerPool / months;
    const monthlyVideoPool = monthlyEditorPool + monthlySocialPool + monthlyVmPool;
    const videoPool = editorSocialPool + vmPool;
    const monthlyTotalSalaries = monthlyVideoPool + monthlyDesignerPool + monthlyCopyPool;
    const totalSalaries = videoPool + designerPool + copyPool;

    // Mapa userId -> role para classificar quem editou cada card
    const roleOf = new Map(users.map(u => [u.id, u.role]));

    // Split das tasks produzidas pelo tipo de quem editou (edited_by/assigned_to)
    const vmCountsByUser = new Map<string, { reels: number; criativo: number; story: number }>();
    const edCountsByUser = new Map<string, { reels: number; criativo: number; story: number }>();
    let vmReels = 0, vmCri = 0, vmSto = 0;
    let edReels = 0, edCri = 0, edSto = 0;
    relevantTasks.forEach(t => {
      const type = normalizeContentType(t.content_type);
      const workerId = t.edited_by || t.assigned_to;
      const role = workerId ? roleOf.get(workerId) : undefined;
      const isVm = role && VIDEOMAKER_ROLES.includes(role);
      const isEd = role && EDITOR_ROLES.includes(role);
      if (isVm && workerId) {
        const current = vmCountsByUser.get(workerId) || { reels: 0, criativo: 0, story: 0 };
        if (type === 'reels') { current.reels++; vmReels++; }
        else if (type === 'criativo') { current.criativo++; vmCri++; }
        else if (type === 'story') { current.story++; vmSto++; }
        vmCountsByUser.set(workerId, current);
      } else {
        if (type === 'reels') edReels++;
        else if (type === 'criativo') edCri++;
        else if (type === 'story') edSto++;
        if (isEd && workerId) {
          const current = edCountsByUser.get(workerId) || { reels: 0, criativo: 0, story: 0 };
          if (type === 'reels') current.reels++;
          else if (type === 'criativo') current.criativo++;
          else if (type === 'story') current.story++;
          edCountsByUser.set(workerId, current);
        }
      }
    });

    // Produção individual dos videomakers vem das gravações realizadas.
    const vmProductionByUser = new Map<string, { reels: number; criativo: number; story: number; artes: number }>();
    realizadas.forEach(record => {
      const uid = record.videomaker_id;
      if (!uid || !VIDEOMAKER_ROLES.includes(roleOf.get(uid) || '')) return;
      const current = vmProductionByUser.get(uid) || { reels: 0, criativo: 0, story: 0, artes: 0 };
      current.reels += toNumber(record.reels_produced);
      current.criativo += toNumber(record.creatives_produced);
      current.story += toNumber(record.stories_produced);
      current.artes += toNumber(record.arts_produced);
      vmProductionByUser.set(uid, current);
    });

    // Produção individual do social vem das entregas/publicações criadas por cada social media.
    const socialProductionByUser = new Map<string, { reels: number; criativo: number; story: number; artes: number }>();
    socials.forEach(delivery => {
      const uid = delivery.created_by;
      if (!uid || !SOCIAL_ROLES.includes(roleOf.get(uid) || '')) return;
      const current = socialProductionByUser.get(uid) || { reels: 0, criativo: 0, story: 0, artes: 0 };
      const type = normalizeContentType(delivery.content_type);
      if (type === 'reels') current.reels++;
      else if (type === 'criativo') current.criativo++;
      else if (type === 'story') current.story++;
      else if (type === 'arte') current.artes++;
      socialProductionByUser.set(uid, current);
    });

    // Produção individual do copywriter vem dos roteiros criados no período.
    const copyProductionByUser = new Map<string, { reels: number; criativo: number; story: number; artes: number }>();
    scripts.forEach(script => {
      const uid = script.created_by;
      const referenceDate = script.created_at || script.updated_at;
      if (!uid || !COPY_ROLES.includes(roleOf.get(uid) || '')) return;
      if (!clientOk(script.client_id) || !inDateRange(referenceDate, dateRange.start, dateRange.end)) return;
      const current = copyProductionByUser.get(uid) || { reels: 0, criativo: 0, story: 0, artes: 0 };
      const type = normalizeContentType(script.content_format);
      if (type === 'reels') current.reels++;
      else if (type === 'criativo') current.criativo++;
      else if (type === 'story') current.story++;
      else if (type === 'arte') current.artes++;
      copyProductionByUser.set(uid, current);
    });

    // Designer: CAR = quantidade de tarefas/cards produzidos.
    // Artes = quantidade real de artes anexadas dentro desses cards.
    // As duas fontes ficam separadas para não repetir 82/82 quando um card possui várias artes.
    const designerCardsByUser = new Map<string, number>();
    const designCountsByUser = new Map<string, number>();
    designTasks.forEach(t => {
      if (!clientOk(t.client_id)) return;
      if (!PRODUCED_DESIGN_COLUMNS.has(normalizeText(t.kanban_column))) return;
      if (!inDateRange(t.completed_at || t.updated_at || t.created_at, dateRange.start, dateRange.end)) return;
      const uid = t.assigned_to;
      if (!uid) return;
      const role = roleOf.get(uid);
      if (!role || !DESIGNER_ROLES.includes(role)) return;
      designerCardsByUser.set(uid, (designerCardsByUser.get(uid) || 0) + 1);
      designCountsByUser.set(uid, (designCountsByUser.get(uid) || 0) + countDesignArts(t));
    });

    const editorDirect = new Map<string, { reels: number; criativo: number; story: number; artes: number }>();
    edCountsByUser.forEach((c, uid) => editorDirect.set(uid, { ...c, artes: 0 }));
    const designerDirect = new Map<string, { reels: number; criativo: number; story: number; artes: number }>();
    designCountsByUser.forEach((n, uid) => designerDirect.set(uid, { reels: 0, criativo: 0, story: 0, artes: n }));


    // Validação por colaborador deve ser individual: sem ratear sobra por função.
    const editorShare = editorDirect;
    const socialShare = socialProductionByUser;
    const copyShare = copyProductionByUser;
    const vmShare = vmProductionByUser;
    const designerShare = designerDirect;

    const contributorBreakdown = users
      .filter(u => [...EDITOR_ROLES, ...SOCIAL_ROLES, ...COPY_ROLES, ...VIDEOMAKER_ROLES, ...DESIGNER_ROLES].includes(u.role))
      .map(u => {
        const src = EDITOR_ROLES.includes(u.role) ? editorShare
          : SOCIAL_ROLES.includes(u.role) ? socialShare
          : COPY_ROLES.includes(u.role) ? copyShare
          : VIDEOMAKER_ROLES.includes(u.role) ? vmShare
          : designerShare;
        const s = src.get(u.id) || { reels: 0, criativo: 0, story: 0, artes: 0 };
        // Designer: "cards" (CAR) = nº de tarefas/cards produzidos (fonte: design_tasks).
        // "Artes" = soma total de artes entregues (rateada em s.artes). Fontes distintas.
        const cards = DESIGNER_ROLES.includes(u.role)
          ? (designerCardsByUser.get(u.id) || 0)
          : s.reels + s.criativo + s.story + s.artes;
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
      // Mostra todos os colaboradores dos times de produção, mesmo sem salário lançado
      // ou sem cards no período (ex.: Victor Videomaker recebe via Pró-labore).
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

    // Copywriting rateado por esforço no total produzido
    const copyReelsSal = wTotal > 0 ? (copyPool * wReels) / wTotal : 0;
    const copyCriSal = wTotal > 0 ? (copyPool * wCri) / wTotal : 0;
    const copyStoSal = wTotal > 0 ? (copyPool * wSto) / wTotal : 0;
    const copyPerReels = reels > 0 ? copyReelsSal / reels : 0;
    const copyPerCri = criativos > 0 ? copyCriSal / criativos : 0;
    const copyPerSto = stories > 0 ? copyStoSal / stories : 0;

    const totalPerReels = editorPerReels + socialPerReels + vmPerReels + copyPerReels;
    const totalPerCri = editorPerCri + socialPerCri + vmPerCri + copyPerCri;
    const totalPerSto = editorPerSto + socialPerSto + vmPerSto + copyPerSto;
    const totalPerArte = designerPerArte;

    // === ANÁLISE POR PACOTE ===
    const planAnalysis = plans
      .filter(p => (p.status || 'ativo').toLowerCase() === 'ativo')
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

    // === PRÓ-LABORE (sócios) — no período ===
    const prolaboreInPeriod = prolaboreExpenses.filter(e => inDateRange(e.date, dateRange.start, dateRange.end));
    const prolaboreTotal = prolaboreInPeriod.reduce((s, e) => s + toNumber(e.amount), 0);
    const prolaborePerSocioMap = new Map<string, number>();
    prolaboreInPeriod.forEach(e => {
      const name = (e.responsible || e.description || 'Sem nome').trim();
      prolaborePerSocioMap.set(name, (prolaborePerSocioMap.get(name) || 0) + toNumber(e.amount));
    });
    const prolaborePerSocio = Array.from(prolaborePerSocioMap.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);

    return {
      totalSalaries, monthlyTotalSalaries, months,
      videoPool, editorPool, socialPool, copyPool, editorSocialPool, vmPool, vmEditingPool, designerPool,
      monthlyVideoPool, monthlyEditorPool, monthlySocialPool, monthlyCopyPool, monthlyVmPool, monthlyDesignerPool,
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
      copyPerReels, copyPerCri, copyPerSto,
      vmPerReels, vmPerCri, vmPerSto,
      designerPerArte,
      totalPerReels, totalPerCri, totalPerSto, totalPerArte,
      contributorBreakdown,
      planAnalysis,
      prolaboreTotal,
      prolaborePerSocio,
    };
  }, [records, editorTasks, designTasks, socialDeliveries, scripts, salaryExpenses, prolaboreExpenses, users, selectedClient, dateRange, plans, includeProLabore]);

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
          <div className="ml-auto space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-500" />
              Sócios (Pró-labore)
            </Label>
            <button
              type="button"
              onClick={() => setIncludeProLabore(v => !v)}
              className={`group relative inline-flex items-center gap-2.5 px-4 h-10 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.98] ${
                includeProLabore
                  ? 'bg-gradient-to-r from-violet-600 to-violet-500 text-white hover:from-violet-500 hover:to-violet-400 shadow-violet-500/25'
                  : 'bg-background border border-violet-500/30 text-violet-700 dark:text-violet-300 hover:border-violet-500 hover:bg-violet-500/5'
              }`}
            >
              <span className={`flex items-center justify-center w-6 h-6 rounded-md transition-colors ${
                includeProLabore ? 'bg-white/20' : 'bg-violet-500/10'
              }`}>
                {includeProLabore ? <Check size={14} /> : <DollarSign size={14} />}
              </span>
              <span className="flex flex-col items-start leading-tight">
                <span className="text-[10px] uppercase tracking-wide opacity-80">
                  {includeProLabore ? 'Incluído no total' : 'Incluir pró-labore'}
                </span>
                <span className="text-sm font-bold tabular-nums">
                  {fmt(data.prolaboreTotal)}
                </span>
              </span>
            </button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-l-4" style={{ borderLeftColor: 'hsl(142,71%,45%)' }}>
          <CardContent className="p-4">
            <DollarSign size={18} className="text-emerald-600 mb-2" />
            <p className="text-xl font-bold">{fmt(data.editorPool)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Time Editor ({data.months} {data.months === 1 ? 'mês' : 'meses'})</p>
            <p className="text-[10px] text-muted-foreground mt-1">Mensal: {fmt(data.monthlyEditorPool)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: 'hsl(45,93%,47%)' }}>
          <CardContent className="p-4">
            <DollarSign size={18} className="text-amber-600 mb-2" />
            <p className="text-xl font-bold">{fmt(data.socialPool)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Time Social Media ({data.months} {data.months === 1 ? 'mês' : 'meses'})</p>
            <p className="text-[10px] text-muted-foreground mt-1">Mensal: {fmt(data.monthlySocialPool)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: 'hsl(174,72%,40%)' }}>
          <CardContent className="p-4">
            <DollarSign size={18} className="text-teal-600 mb-2" />
            <p className="text-xl font-bold">{fmt(data.copyPool)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Time Copywriting ({data.months} {data.months === 1 ? 'mês' : 'meses'})</p>
            <p className="text-[10px] text-muted-foreground mt-1">Mensal: {fmt(data.monthlyCopyPool)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: 'hsl(217,91%,60%)' }}>
          <CardContent className="p-4">
            <DollarSign size={18} className="text-blue-600 mb-2" />
            <p className="text-xl font-bold">{fmt(data.vmPool)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Time Videomaker ({data.months} {data.months === 1 ? 'mês' : 'meses'})</p>
            <p className="text-[10px] text-muted-foreground mt-1">Mensal: {fmt(data.monthlyVmPool)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: 'hsl(24,95%,53%)' }}>
          <CardContent className="p-4">
            <DollarSign size={18} className="text-orange-600 mb-2" />
            <p className="text-xl font-bold">{fmt(data.designerPool)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Time Designer ({data.months} {data.months === 1 ? 'mês' : 'meses'})</p>
            <p className="text-[10px] text-muted-foreground mt-1">Mensal: {fmt(data.monthlyDesignerPool)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <Calculator size={18} className="text-muted-foreground mb-2" />
            <p className="text-xl font-bold">{fmt(data.totalSalaries + (includeProLabore ? data.prolaboreTotal : 0))}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Total no Período {includeProLabore && <span className="text-violet-600">(+ pró-labore)</span>}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">{data.reels + data.criativos + data.stories + data.artes} conteúdos</p>
          </CardContent>
        </Card>
      </div>

      {/* Detalhamento pró-labore por sócio */}
      {data.prolaborePerSocio.length > 0 && (
        <Card className={`border-l-4 ${includeProLabore ? 'border-l-violet-500 bg-violet-500/5' : 'border-l-muted'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <p className="text-sm font-semibold flex items-center gap-2">
                  <DollarSign size={16} className="text-violet-600" /> Pró-labore dos sócios no período
                </p>
                <p className="text-xs text-muted-foreground">Fonte: Financeiro → Despesas → Pró-labore. {includeProLabore ? 'Somado ao Total no Período.' : 'Não está sendo somado — clique em "Incluir" acima.'}</p>
              </div>
              <p className="text-2xl font-bold text-violet-700">{fmt(data.prolaboreTotal)}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {data.prolaborePerSocio.map(s => (
                <div key={s.name} className="flex items-center justify-between p-2 rounded bg-background border">
                  <span className="text-xs font-medium truncate">{s.name}</span>
                  <span className="text-sm font-bold">{fmt(s.total)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
          Produção individual real por colaborador: gravações por videomaker, edições por editor, publicações por social media, roteiros por copywriter e artes por designer. Não há rateio entre pessoas.
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
                {data.contributorBreakdown.map(c => {
                  const roleColor: Record<string, string> = {
                    videomaker: 'bg-blue-500/5 hover:bg-blue-500/10 border-l-4 border-l-blue-500',
                    editor: 'bg-purple-500/5 hover:bg-purple-500/10 border-l-4 border-l-purple-500',
                    social_media: 'bg-pink-500/5 hover:bg-pink-500/10 border-l-4 border-l-pink-500',
                    copywriter: 'bg-amber-500/5 hover:bg-amber-500/10 border-l-4 border-l-amber-500',
                    designer: 'bg-emerald-500/5 hover:bg-emerald-500/10 border-l-4 border-l-emerald-500',
                  };
                  const roleBadge: Record<string, string> = {
                    videomaker: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
                    editor: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
                    social_media: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
                    copywriter: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                    designer: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                  };
                  return (
                  <tr key={c.id} className={`border-t border-border/50 transition-colors ${roleColor[c.role] || ''}`}>
                    <td className="px-3 py-2 font-medium">{c.name}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${roleBadge[c.role] || 'bg-muted text-muted-foreground'}`}>{c.role}</span>
                    </td>
                    <td className="px-3 py-2 text-right">{fmt(c.salary)}</td>
                    <td className="px-3 py-2 text-right">{c.reels.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right">{c.criativo.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right">{c.story.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right">{c.artes.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{c.cards.toFixed(1)}</td>
                  </tr>
                  );
                })}
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
                  <th className="text-right px-3 py-2">Copywriting</th>
                  <th className="text-right px-3 py-2">Designer</th>
                  <th className="text-right px-3 py-2 bg-primary/10">Custo total por unidade</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: '1 Reels', vm: data.vmPerReels, ed: data.editorPerReels, sc: data.socialPerReels, cp: data.copyPerReels, ds: 0, total: data.totalPerReels, color: 'bg-blue-500/5 hover:bg-blue-500/10 border-l-4 border-l-blue-500' },
                  { label: '1 Criativo', vm: data.vmPerCri, ed: data.editorPerCri, sc: data.socialPerCri, cp: data.copyPerCri, ds: 0, total: data.totalPerCri, color: 'bg-orange-500/5 hover:bg-orange-500/10 border-l-4 border-l-orange-500' },
                  { label: '1 Story', vm: data.vmPerSto, ed: data.editorPerSto, sc: data.socialPerSto, cp: data.copyPerSto, ds: 0, total: data.totalPerSto, color: 'bg-pink-500/5 hover:bg-pink-500/10 border-l-4 border-l-pink-500' },
                  { label: '1 Arte', vm: 0, ed: 0, sc: 0, cp: 0, ds: data.designerPerArte, total: data.totalPerArte, color: 'bg-emerald-500/5 hover:bg-emerald-500/10 border-l-4 border-l-emerald-500' },
                ].map((r, i) => (
                  <tr key={i} className={`border-t border-border/50 transition-colors ${r.color}`}>
                    <td className="px-3 py-2 font-medium">{r.label}</td>
                    <td className="px-3 py-2 text-right">{r.vm > 0 ? fmt(r.vm) : '—'}</td>
                    <td className="px-3 py-2 text-right">{r.ed > 0 ? fmt(r.ed) : '—'}</td>
                    <td className="px-3 py-2 text-right">{r.sc > 0 ? fmt(r.sc) : '—'}</td>
                    <td className="px-3 py-2 text-right">{r.cp > 0 ? fmt(r.cp) : '—'}</td>
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
                {data.planAnalysis.map((p, i) => (
                  <tr key={p.id} className={`border-t border-border/50 transition-colors ${i % 2 === 0 ? 'bg-muted/20' : ''} ${p.marginPct >= 50 ? 'border-l-4 border-l-emerald-500' : p.marginPct >= 20 ? 'border-l-4 border-l-amber-500' : 'border-l-4 border-l-red-500'} hover:bg-muted/40`}>
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
