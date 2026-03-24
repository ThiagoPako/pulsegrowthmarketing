import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/vpsDb';
import { format, addDays, getDay } from 'date-fns';

// ─── Legacy compatibility exports (used by Schedule.tsx, Scripts.tsx) ────
export interface EndoCliente { id: string; company_name: string; client_id?: string; color: string; active: boolean; stories_per_week: number; presence_days_per_week: number; selected_days: string[]; session_duration: number; execution_type: string; plan_type: string; total_contracted_hours: number; notes?: string; editorial?: string; created_at: string; updated_at: string; responsible_person?: string; phone?: string; }
export interface EndoAgendamento { id: string; cliente_id: string; profissional_id: string; videomaker_id?: string; date: string; start_time: string; duration: number; status: string; cancellation_reason?: string; checklist: any; notes?: string; created_at: string; }
export interface EndoProfissional { id: string; user_id: string; max_hours_per_day: number; available_days: string[]; start_time: string; end_time: string; active: boolean; }

export function useEndoClientes() {
  const [clientes, setClientes] = useState<EndoCliente[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from('endomarketing_clientes').select('*').order('company_name').then(({ data }) => {
      if (data) setClientes(data as any);
      setLoading(false);
    });
  }, []);
  return { clientes, loading, addCliente: async () => true, updateCliente: async () => {}, deleteCliente: async () => {}, refresh: () => {} };
}

export function useEndoAgendamentos() {
  const [agendamentos, setAgendamentos] = useState<EndoAgendamento[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from('endomarketing_agendamentos').select('*').order('date').then(({ data }) => {
      if (data) setAgendamentos(data as any);
      setLoading(false);
    });
  }, []);
  return { agendamentos, loading, addAgendamento: async () => true, updateAgendamento: async () => {}, cancelAgendamento: async () => {}, hasConflict: () => false, hasVideomakerConflict: () => false, getDailyOccupation: () => 0, suggestBestDays: () => [], refresh: () => {} };
}

export function useEndoProfissionais() {
  const [profissionais, setProfissionais] = useState<EndoProfissional[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from('endomarketing_profissionais').select('*').then(({ data }) => {
      if (data) setProfissionais(data as any);
      setLoading(false);
    });
  }, []);
  return { profissionais, loading, addProfissional: async () => true, updateProfissional: async () => {}, refresh: () => {} };
}

// ─── New Endomarketing types ────────────────

export interface EndoPackage {
  id: string;
  category: string;
  package_name: string;
  description: string;
  partner_cost: number;
  sessions_per_week: number;
  stories_per_day: number;
  duration_hours: number;
}

export interface EndoContract {
  id: string;
  client_id: string;
  package_id: string;
  partner_id: string | null;
  partner_cost: number;
  sale_price: number;
  start_date: string;
  status: string;
  created_at: string;
  updated_at: string;
  clients?: { company_name: string; color: string; logo_url: string | null };
  endomarketing_packages?: EndoPackage;
  partner_profile?: { name: string; display_name: string | null };
}

export interface EndoTask {
  id: string;
  contract_id: string;
  client_id: string;
  partner_id: string | null;
  date: string;
  start_time: string | null;
  duration_minutes: number;
  task_type: string;
  status: string;
  notes: string | null;
  attachment_url: string | null;
  completed_at: string | null;
  clients?: { company_name: string; color: string };
}

const TASK_TYPE_LABELS: Record<string, string> = {
  presenca: 'Presença',
  gravacao: 'Gravação',
  stories: 'Stories',
};

export const getTaskTypeLabel = (type: string) => TASK_TYPE_LABELS[type] || type;

const CATEGORY_LABELS: Record<string, string> = {
  presenca_completa: 'Presença Completa',
  gravacao_concentrada: 'Gravação Concentrada',
};
export const getCategoryLabel = (cat: string) => CATEGORY_LABELS[cat] || cat;

const normalizeDateOnly = (value: string | null | undefined) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value.includes('T')) return value.split('T')[0];

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, 'yyyy-MM-dd');
};

const normalizeTimeOnly = (value: string | null | undefined) => {
  if (!value) return null;
  return value.slice(0, 5);
};

// ─── Packages ───────────────────────────────
export function useEndoPackages() {
  const [packages, setPackages] = useState<EndoPackage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPkgs = useCallback(async () => {
    const { data } = await (supabase as any).from('endomarketing_packages').select('*').order('category');
    if (data) setPackages(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPkgs(); }, [fetchPkgs]);

  const updatePackage = async (id: string, updates: Partial<EndoPackage>) => {
    await (supabase as any).from('endomarketing_packages').update(updates).eq('id', id);
    fetchPkgs();
  };

  return { packages, loading, updatePackage, refresh: fetchPkgs };
}

// ─── Contracts ──────────────────────────────
export function useEndoContracts(includePartnerProfiles = true) {
  const [contracts, setContracts] = useState<EndoContract[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchContracts = useCallback(async () => {
    try {
      const { data } = await (supabase as any)
        .from('client_endomarketing_contracts')
        .select('*, clients(company_name, color, logo_url), endomarketing_packages(id, package_name, category, partner_cost, sessions_per_week, stories_per_day, duration_hours, description)')
        .order('created_at', { ascending: false });

      if (data) {
        const normalizedContracts = data.map((c: any) => ({
          ...c,
          start_date: normalizeDateOnly(c.start_date),
        }));

        let partnerMap: Record<string, any> = {};
        if (includePartnerProfiles) {
          const partnerIds = [...new Set(normalizedContracts.filter((c: any) => c.partner_id).map((c: any) => c.partner_id))];
          if (partnerIds.length > 0) {
            const { data: profiles } = await supabase.from('profiles').select('id, name, display_name').in('id', partnerIds as string[]);
            if (profiles) partnerMap = Object.fromEntries(profiles.map(p => [p.id, p]));
          }
        }

        setContracts(normalizedContracts.map((c: any) => ({
          ...c,
          partner_profile: includePartnerProfiles && c.partner_id ? partnerMap[c.partner_id] || null : null,
        })));
      }
    } finally {
      setLoading(false);
    }
  }, [includePartnerProfiles]);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  useEffect(() => {
    const ch = supabase.channel('endo-contracts-ch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_endomarketing_contracts' }, () => fetchContracts())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchContracts]);

  const addContract = async (contract: {
    client_id: string; package_id: string; partner_id: string | null;
    partner_cost: number; sale_price: number; start_date: string;
  }) => {
    const { error } = await (supabase as any).from('client_endomarketing_contracts').insert(contract);
    if (!error) {
      fetchContracts();
      await createEndoExpense(contract.partner_cost, contract.client_id, contract.start_date);
    }
    return !error;
  };

  const updateContract = async (id: string, updates: Partial<EndoContract>) => {
    await (supabase as any).from('client_endomarketing_contracts').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    fetchContracts();
  };

  const deactivateContract = async (id: string) => {
    await (supabase as any).from('client_endomarketing_contracts').update({ status: 'inativo', updated_at: new Date().toISOString() }).eq('id', id);
    fetchContracts();
  };

  return { contracts, loading, addContract, updateContract, deactivateContract, refresh: fetchContracts };
}

// Helper: create expense for partner cost
async function createEndoExpense(amount: number, clientId: string, date: string) {
  if (amount <= 0) return;
  // Find or create the "Custo Endomarketing" category
  let { data: cats } = await supabase.from('expense_categories').select('id').eq('name', 'Custo Endomarketing').limit(1);
  let catId = cats?.[0]?.id;
  if (!catId) {
    const { data: newCat } = await supabase.from('expense_categories').insert({ name: 'Custo Endomarketing' } as any).select('id').single();
    catId = newCat?.id;
  }
  if (!catId) return;
  // Fetch client name for description
  const { data: client } = await supabase.from('clients').select('company_name').eq('id', clientId).single();
  await supabase.from('expenses').insert({
    category_id: catId,
    amount,
    date,
    description: `Endomarketing - ${client?.company_name || 'Cliente'}`,
    expense_type: 'variavel',
    responsible: 'Parceiro',
  } as any);
}

// ─── Tasks ──────────────────────────────────
export function useEndoTasks(partnerId?: string) {
  const [tasks, setTasks] = useState<EndoTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    try {
      let query = (supabase as any).from('endomarketing_partner_tasks').select('*, clients(company_name, color)').order('date');
      if (partnerId) query = query.eq('partner_id', partnerId);
      const { data } = await query;
      if (data) {
        setTasks(data.map((task: any) => ({
          ...task,
          date: normalizeDateOnly(task.date),
          start_time: normalizeTimeOnly(task.start_time),
        })));
      }
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    const ch = supabase.channel('endo-tasks-ch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'endomarketing_partner_tasks' }, () => fetchTasks())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchTasks]);

  const completeTask = async (id: string, notes?: string) => {
    await (supabase as any).from('endomarketing_partner_tasks').update({
      status: 'concluida', completed_at: new Date().toISOString(),
      notes: notes || null, updated_at: new Date().toISOString(),
    }).eq('id', id);
    fetchTasks();
  };

  const updateTask = async (id: string, updates: Partial<EndoTask>) => {
    await (supabase as any).from('endomarketing_partner_tasks').update({
      ...updates, updated_at: new Date().toISOString(),
    }).eq('id', id);
    fetchTasks();
  };

  const cancelTask = async (id: string) => {
    await (supabase as any).from('endomarketing_partner_tasks').update({
      status: 'cancelada', updated_at: new Date().toISOString(),
    }).eq('id', id);
    fetchTasks();
  };

  const generateTasks = async (contractId: string, fromDate: string, toDate: string) => {
    try {
      // Fetch contract and package separately to avoid join issues
      const { data: contract, error: contractErr } = await (supabase as any)
        .from('client_endomarketing_contracts')
        .select('*')
        .eq('id', contractId).single();

      if (contractErr || !contract) {
        console.error('generateTasks: contract fetch error', contractErr);
        return false;
      }
      if (contract.status !== 'ativo') return false;

      const { data: pkg, error: pkgErr } = await (supabase as any)
        .from('endomarketing_packages')
        .select('*')
        .eq('id', contract.package_id).single();

      if (pkgErr || !pkg) {
        console.error('generateTasks: package fetch error', pkgErr);
        return false;
      }

      // Delete existing pending tasks in range
      await (supabase as any).from('endomarketing_partner_tasks')
        .delete().eq('contract_id', contractId).eq('status', 'pendente')
        .gte('date', fromDate).lte('date', toDate);

      // Fetch ALL existing tasks for this partner in the date range to avoid time conflicts
      const existingQuery = (supabase as any).from('endomarketing_partner_tasks')
        .select('date, start_time, duration_minutes')
        .gte('date', fromDate).lte('date', toDate)
        .neq('status', 'cancelada');
      if (contract.partner_id) {
        existingQuery.eq('partner_id', contract.partner_id);
      }
      const { data: existingTasks } = await existingQuery;

      // Build a map of occupied time slots per date
      const occupiedSlots = new Map<string, { start: number; end: number }[]>();
      if (existingTasks) {
        for (const t of existingTasks) {
          if (!t.start_time) continue;
          const [h, m] = t.start_time.split(':').map(Number);
          const startMin = h * 60 + m;
          const slots = occupiedSlots.get(t.date) || [];
          slots.push({ start: startMin, end: startMin + (t.duration_minutes || 60) });
          occupiedSlots.set(t.date, slots);
        }
      }

      // Find next available start time on a given date (08:00-18:00 window)
      const WORK_START = 8 * 60; // 08:00
      const WORK_END = 18 * 60;  // 18:00
      const BUFFER = 15; // 15 min buffer between tasks

      const findAvailableTime = (dateStr: string, durationMin: number): string => {
        const slots = occupiedSlots.get(dateStr) || [];
        slots.sort((a, b) => a.start - b.start);

        let candidate = WORK_START;
        for (const slot of slots) {
          if (candidate + durationMin <= slot.start) break;
          candidate = Math.max(candidate, slot.end + BUFFER);
        }
        if (candidate + durationMin > WORK_END) {
          candidate = WORK_START; // fallback if no slot fits
        }
        const hours = Math.floor(candidate / 60).toString().padStart(2, '0');
        const mins = (candidate % 60).toString().padStart(2, '0');
        return `${hours}:${mins}`;
      };

      const tasksToInsert: any[] = [];
      let current = new Date(fromDate + 'T12:00:00');
      const end = new Date(toDate + 'T12:00:00');

      // Define which weekdays to include based on sessions_per_week
      const getPresencaDays = (sessionsPerWeek: number): number[] => {
        switch (sessionsPerWeek) {
          case 1: return [0]; // Mon
          case 2: return [0, 2]; // Mon, Wed
          case 3: return [0, 2, 4]; // Mon, Wed, Fri
          case 4: return [0, 1, 2, 3]; // Mon-Thu
          case 5: return [0, 1, 2, 3, 4]; // Mon-Fri
          default: return sessionsPerWeek >= 5 ? [0, 1, 2, 3, 4] : [0];
        }
      };

      while (current <= end) {
        const dow = getDay(current); // 0=Sun
        const dateStr = format(current, 'yyyy-MM-dd');
        const isWeekday = dow >= 1 && dow <= 5;

        if (isWeekday) {
          const dayIdx = dow - 1; // 0=Mon..4=Fri

          if (pkg.category === 'presenca_completa') {
            const allowedDays = getPresencaDays(pkg.sessions_per_week);
            if (allowedDays.includes(dayIdx)) {
              const durationMin = Math.round((pkg.duration_hours || 2) * 60);
              const startTime = findAvailableTime(dateStr, durationMin);
              const task = {
                contract_id: contractId, client_id: contract.client_id,
                partner_id: contract.partner_id, date: dateStr,
                start_time: startTime,
                duration_minutes: durationMin,
                task_type: 'presenca', status: 'pendente',
              };
              tasksToInsert.push(task);
              // Register this slot as occupied for subsequent tasks on same date
              const [h, m] = startTime.split(':').map(Number);
              const startMin = h * 60 + m;
              const slots = occupiedSlots.get(dateStr) || [];
              slots.push({ start: startMin, end: startMin + durationMin });
              occupiedSlots.set(dateStr, slots);
            }
          } else if (pkg.category === 'gravacao_concentrada') {
            if (pkg.sessions_per_week > 0 && dow === 1) {
              const durationMin = Math.round((pkg.duration_hours || 2) * 60);
              const startTime = findAvailableTime(dateStr, durationMin);
              const task = {
                contract_id: contractId, client_id: contract.client_id,
                partner_id: contract.partner_id, date: dateStr,
                start_time: startTime,
                duration_minutes: durationMin,
                task_type: 'gravacao', status: 'pendente',
              };
              tasksToInsert.push(task);
              const [h, m] = startTime.split(':').map(Number);
              const startMin = h * 60 + m;
              const slots = occupiedSlots.get(dateStr) || [];
              slots.push({ start: startMin, end: startMin + durationMin });
              occupiedSlots.set(dateStr, slots);
            }
          }
        }
        current = addDays(current, 1);
      }

      if (tasksToInsert.length > 0) {
        // Insert in batches of 50
        for (let i = 0; i < tasksToInsert.length; i += 50) {
          const batch = tasksToInsert.slice(i, i + 50);
          const { error: insertErr } = await (supabase as any).from('endomarketing_partner_tasks').insert(batch);
          if (insertErr) {
            console.error('generateTasks: insert error', insertErr);
            return false;
          }
        }
        fetchTasks();
      }
      return true;
    } catch (err) {
      console.error('generateTasks: unexpected error', err);
      return false;
    }
  };

  return { tasks, loading, completeTask, updateTask, cancelTask, generateTasks, refresh: fetchTasks };
}

// ─── Metrics ────────────────────────────────
export function useEndoMetrics(contracts: EndoContract[], tasks: EndoTask[]) {
  const activeContracts = contracts.filter(c => c.status === 'ativo');
  const totalClients = activeContracts.length;
  const monthlyRevenue = activeContracts.reduce((s, c) => s + c.sale_price, 0);
  const monthlyCosts = activeContracts.reduce((s, c) => s + c.partner_cost, 0);
  const monthlyProfit = monthlyRevenue - monthlyCosts;
  const avgMargin = monthlyRevenue > 0 ? (monthlyProfit / monthlyRevenue) * 100 : 0;

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayTasks = tasks.filter(t => t.date === today);
  const completedTasks = tasks.filter(t => t.status === 'concluida');
  const pendingTasks = tasks.filter(t => t.status === 'pendente');

  return {
    totalClients, monthlyRevenue, monthlyCosts, monthlyProfit, avgMargin,
    todayTasks, completedTasks, pendingTasks, activeContracts,
  };
}
