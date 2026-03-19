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
export function useEndoContracts() {
  const [contracts, setContracts] = useState<EndoContract[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchContracts = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('client_endomarketing_contracts')
      .select('*, clients(company_name, color, logo_url), endomarketing_packages(*)')
      .order('created_at', { ascending: false });

    if (data) {
      // Fetch partner names separately
      const partnerIds = [...new Set(data.filter((c: any) => c.partner_id).map((c: any) => c.partner_id))];
      let partnerMap: Record<string, any> = {};
      if (partnerIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, name, display_name').in('id', partnerIds as string[]);
        if (profiles) partnerMap = Object.fromEntries(profiles.map(p => [p.id, p]));
      }
      setContracts(data.map((c: any) => ({
        ...c,
        partner_profile: c.partner_id ? partnerMap[c.partner_id] || null : null,
      })));
    }
    setLoading(false);
  }, []);

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
      // Create expense entry for partner cost
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
    let query = (supabase as any).from('endomarketing_partner_tasks').select('*, clients(company_name, color)').order('date');
    if (partnerId) query = query.eq('partner_id', partnerId);
    const { data } = await query;
    if (data) setTasks(data);
    setLoading(false);
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
    const { data: contract } = await (supabase as any)
      .from('client_endomarketing_contracts')
      .select('*, endomarketing_packages(*)')
      .eq('id', contractId).single();

    if (!contract || contract.status !== 'ativo') return false;
    const pkg = contract.endomarketing_packages;
    if (!pkg) return false;

    // Delete existing pending tasks in range
    await (supabase as any).from('endomarketing_partner_tasks')
      .delete().eq('contract_id', contractId).eq('status', 'pendente')
      .gte('date', fromDate).lte('date', toDate);

    const tasksToInsert: any[] = [];
    let current = new Date(fromDate + 'T12:00:00');
    const end = new Date(toDate + 'T12:00:00');

    while (current <= end) {
      const dow = getDay(current); // 0=Sun
      const dateStr = format(current, 'yyyy-MM-dd');
      const isWeekday = dow >= 1 && dow <= 5;

      if (isWeekday) {
        if (pkg.category === 'presenca_completa') {
          const dayIdx = dow - 1; // 0=Mon..4=Fri
          const include = pkg.sessions_per_week >= 5 || (pkg.sessions_per_week === 3 && [0, 2, 4].includes(dayIdx));
          if (include) {
            tasksToInsert.push({
              contract_id: contractId, client_id: contract.client_id,
              partner_id: contract.partner_id, date: dateStr,
              duration_minutes: Math.round(pkg.duration_hours * 60),
              task_type: 'presenca', status: 'pendente',
            });
          }
        } else if (pkg.category === 'gravacao_concentrada') {
          if (pkg.sessions_per_week > 0 && dow === 1) {
            tasksToInsert.push({
              contract_id: contractId, client_id: contract.client_id,
              partner_id: contract.partner_id, date: dateStr,
              duration_minutes: Math.round(pkg.duration_hours * 60),
              task_type: 'gravacao', status: 'pendente',
            });
          }
          if (pkg.stories_per_day > 0) {
            for (let i = 0; i < pkg.stories_per_day; i++) {
              tasksToInsert.push({
                contract_id: contractId, client_id: contract.client_id,
                partner_id: contract.partner_id, date: dateStr,
                duration_minutes: Math.round(pkg.duration_hours * 60),
                task_type: 'stories', status: 'pendente',
              });
            }
          }
        }
      }
      current = addDays(current, 1);
    }

    if (tasksToInsert.length > 0) {
      // Insert in batches of 100
      for (let i = 0; i < tasksToInsert.length; i += 100) {
        const batch = tasksToInsert.slice(i, i + 100);
        await (supabase as any).from('endomarketing_partner_tasks').insert(batch);
      }
      fetchTasks();
    }
    return true;
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
