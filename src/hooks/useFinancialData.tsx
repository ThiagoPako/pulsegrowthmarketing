import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/vpsDb';

/** Normalize date strings like "2026-03-01T00:00:00.000Z" to "2026-03-01" */
export const normalizeDate = (d: string | null | undefined): string => {
  if (!d) return '';
  return d.includes('T') ? d.split('T')[0] : d;
};

const getRevenueStatusPriority = (status: string | null | undefined): number => {
  if (status === 'recebida' || status === 'pago') return 3;
  if (status === 'em_atraso' || status === 'vencido') return 2;
  if (status === 'prevista') return 1;
  return 0;
};

const getComparableTimestamp = (value: string | null | undefined): number => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const chooseCanonicalRevenue = (current: any, candidate: any) => {
  const currentPriority = getRevenueStatusPriority(current?.status);
  const candidatePriority = getRevenueStatusPriority(candidate?.status);

  if (candidatePriority !== currentPriority) {
    return candidatePriority > currentPriority ? candidate : current;
  }

  const candidatePaidAt = getComparableTimestamp(candidate?.paid_at);
  const currentPaidAt = getComparableTimestamp(current?.paid_at);
  if (candidatePaidAt !== currentPaidAt) {
    return candidatePaidAt > currentPaidAt ? candidate : current;
  }

  const candidateUpdatedAt = getComparableTimestamp(candidate?.updated_at);
  const currentUpdatedAt = getComparableTimestamp(current?.updated_at);
  if (candidateUpdatedAt !== currentUpdatedAt) {
    return candidateUpdatedAt > currentUpdatedAt ? candidate : current;
  }

  const candidateCreatedAt = getComparableTimestamp(candidate?.created_at);
  const currentCreatedAt = getComparableTimestamp(current?.created_at);
  if (candidateCreatedAt !== currentCreatedAt) {
    return candidateCreatedAt > currentCreatedAt ? candidate : current;
  }

  return String(candidate?.id || '') > String(current?.id || '') ? candidate : current;
};

const deduplicateRevenues = (items: any[]) => {
  const byKey = new Map<string, any>();

  for (const revenue of items) {
    const key = `${revenue.client_id}_${normalizeDate(revenue.reference_month)}`;
    const existing = byKey.get(key);
    byKey.set(key, existing ? chooseCanonicalRevenue(existing, revenue) : revenue);
  }

  return Array.from(byKey.values());
};

export interface FinancialContract {
  id: string;
  client_id: string;
  plan_id: string | null;
  contract_value: number;
  contract_start_date: string;
  due_day: number;
  payment_method: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Revenue {
  id: string;
  client_id: string;
  contract_id: string;
  reference_month: string;
  amount: number;
  due_date: string;
  status: string;
  paid_at: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Expense {
  id: string;
  date: string;
  amount: number;
  category_id: string;
  expense_type: string;
  description: string;
  responsible: string;
  created_at: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
}

export interface PaymentConfig {
  id: string;
  pix_key: string;
  receiver_name: string;
  bank: string;
  document: string;
  msg_billing_due: string;
  msg_billing_overdue: string;
  msg_payment_data: string;
  msg_delivery_report: string;
  include_delivery_report: boolean;
}

export interface BillingMessage {
  id: string;
  revenue_id: string | null;
  client_id: string;
  message_type: string;
  sent_at: string;
  status: string;
}

export interface CashMovement {
  id: string;
  amount: number;
  type: string;
  description: string;
  date: string;
  created_at: string;
}

export interface FinancialActivity {
  id: string;
  user_id: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  description: string;
  details: any;
  created_at: string;
}

export function useFinancialData() {
  const [contracts, setContracts] = useState<FinancialContract[]>([]);
  const [revenues, setRevenues] = useState<Revenue[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [paymentConfig, setPaymentConfigState] = useState<PaymentConfig | null>(null);
  const [billingMessages, setBillingMessages] = useState<BillingMessage[]>([]);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [activityLog, setActivityLog] = useState<FinancialActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [cRes, rRes, eRes, catRes, pRes, bRes, cashRes, logRes] = await Promise.all([
      supabase.from('financial_contracts').select('*').order('created_at', { ascending: false }),
      supabase.from('revenues').select('*').order('due_date', { ascending: false }),
      supabase.from('expenses').select('*').order('date', { ascending: false }),
      supabase.from('expense_categories').select('*').order('name'),
      supabase.from('payment_config').select('*').limit(1),
      supabase.from('billing_messages').select('*').order('sent_at', { ascending: false }),
      supabase.from('cash_reserve_movements').select('*').order('date', { ascending: false }),
      supabase.from('financial_activity_log').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    console.log('[useFinancialData] expenses result:', { data: eRes.data, error: eRes.error, count: eRes.data?.length });
    if (cRes.data) setContracts(cRes.data as any);
    if (eRes.data) setExpenses(eRes.data as any);
    else if (eRes.error) console.error('[useFinancialData] expenses fetch error:', eRes.error);
    if (catRes.data) setCategories(catRes.data as any);
    if (pRes.data?.[0]) setPaymentConfigState(pRes.data[0] as any);
    if (bRes.data) setBillingMessages(bRes.data as any);
    if (cashRes.data) setCashMovements(cashRes.data as any);
    if (logRes.data) setActivityLog(logRes.data as any);

    // Auto-mark overdue revenues: if due_date < today and status is still 'prevista', update to 'em_atraso'
    if (rRes.data) {
      const today = new Date().toISOString().split('T')[0];
      const revenueData = rRes.data as any[];

      const uniqueRevenues = deduplicateRevenues(revenueData);

      const overdueIds: string[] = [];
      for (const r of uniqueRevenues) {
        if (r.status === 'prevista' && r.due_date && normalizeDate(r.due_date) < today && Number(r.amount) > 0) {
          overdueIds.push(r.id);
        }
      }

      if (overdueIds.length > 0) {
        await Promise.all(
          overdueIds.map(id =>
            supabase.from('revenues').update({ status: 'em_atraso' } as any).eq('id', id)
          )
        );
        const updated = await supabase.from('revenues').select('*').order('due_date', { ascending: false });
        if (updated.data) {
          setRevenues(deduplicateRevenues(updated.data as any[]));
        }
      } else {
        setRevenues(uniqueRevenues);
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Activity logger
  const logActivity = async (actionType: string, entityType: string, description: string, entityId?: string, details?: any) => {
    try {
      const authResult = await supabase.auth.getUser();
      const user = authResult.data?.user ?? null;
      const { error } = await supabase.from('financial_activity_log').insert({
        user_id: user?.id || null,
        action_type: actionType,
        entity_type: entityType,
        entity_id: entityId || null,
        description,
        details: details || null,
      } as any);

      if (error) {
        console.error('[useFinancialData] Failed to log activity:', error);
      }
    } catch (error) {
      console.error('[useFinancialData] Unexpected activity log error:', error);
    }
  };

  // Contract CRUD
  const upsertContract = async (c: Partial<FinancialContract> & { client_id: string }) => {
    const isNew = !c.id;
    const { error } = await supabase.from('financial_contracts').upsert(c as any, { onConflict: 'client_id' });
    if (!error) {
      await logActivity(isNew ? 'criação' : 'edição', 'contrato', `${isNew ? 'Criou' : 'Editou'} contrato - R$ ${Number(c.contract_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, c.id, c);
      await fetchAll();
    }
    return !error;
  };

  const deleteContract = async (id: string) => {
    const contract = contracts.find(c => c.id === id);
    await supabase.from('financial_contracts').delete().eq('id', id);
    await logActivity('exclusão', 'contrato', `Excluiu contrato - R$ ${Number(contract?.contract_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, id);
    await fetchAll();
  };

  // Revenue CRUD
  const addRevenue = async (r: Partial<Revenue>) => {
    // Prevent duplicate only when client_id AND reference_month are provided
    if (r.client_id && r.reference_month) {
      const normalized = normalizeDate(r.reference_month);
      const { data: dupCheck } = await supabase
        .from('revenues')
        .select('id')
        .eq('client_id', r.client_id)
        .eq('reference_month', normalized);
      if ((dupCheck as any[] || []).length > 0) {
        return false; // Already exists
      }
    }
    const { error } = await supabase.from('revenues').insert(r as any);
    if (!error) {
      await logActivity('criação', 'receita', `Registrou receita - R$ ${Number(r.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, undefined, r);
      await fetchAll();
    }
    return !error;
  };

  const updateRevenue = async (id: string, updates: Partial<Revenue>) => {
    try {
      // Always update by ID only — never by client_id+month to avoid cross-contamination
      const { error } = await supabase.from('revenues').update(updates as any).eq('id', id);

      if (error) {
        console.error('[useFinancialData] Failed to update revenue:', error);
        return false;
      }

      const action = updates.status === 'recebida' ? 'Marcou receita como paga' : updates.status === 'prevista' ? 'Reverteu receita para pendente' : 'Atualizou receita';

      // Log first, then refresh data to ensure UI always shows latest state
      await logActivity('edição', 'receita', `${action} - R$ ${Number(updates.amount || revenues.find(r => r.id === id)?.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, id, updates);
      await fetchAll();

      return true;
    } catch (error) {
      console.error('[useFinancialData] Unexpected revenue update error:', error);
      return false;
    }
  };

  const generateMonthlyRevenues = async (monthStr: string) => {
    const [yearStr, monthNumStr] = monthStr.split('-');
    const year = parseInt(yearStr);
    const monthNum = parseInt(monthNumStr);
    const refMonth = `${year}-${String(monthNum).padStart(2, '0')}-01`;

    // Fetch fresh contracts and ALL existing revenues for this month to avoid duplicates
    const [freshContracts, freshExisting] = await Promise.all([
      supabase.from('financial_contracts').select('*').eq('status', 'ativo'),
      supabase.from('revenues').select('client_id, reference_month'),
    ]);

    const activeContracts = (freshContracts.data as any[] || []).filter((c: any) => Number(c.contract_value) > 0);
    // Normalize all existing revenue dates to match
    const existingClientIds = new Set(
      (freshExisting.data as any[] || [])
        .filter((r: any) => normalizeDate(r.reference_month) === refMonth)
        .map((r: any) => r.client_id)
    );

    const newRevenues = activeContracts
      .filter((c: any) => !existingClientIds.has(c.client_id))
      .map((c: any) => ({
        client_id: c.client_id,
        contract_id: c.id,
        reference_month: refMonth,
        amount: c.contract_value,
        due_date: `${year}-${String(monthNum).padStart(2, '0')}-${String(c.due_day).padStart(2, '0')}`,
        status: 'prevista',
      }));

    if (newRevenues.length > 0) {
      // Insert one by one to skip duplicates gracefully
      let inserted = 0;
      for (const rev of newRevenues) {
        const { error } = await supabase.from('revenues').insert(rev as any);
        if (!error) inserted++;
      }
      if (inserted > 0) {
        await logActivity('geração', 'receita', `Gerou ${inserted} receita(s) recorrente(s) para ${monthStr}`, undefined, { month: monthStr, count: inserted });
      }
      await fetchAll();
      return inserted;
    }
    return 0;
  };

  const deleteRevenue = async (id: string) => {
    try {
      const revenue = revenues.find(r => r.id === id);
      const { error } = await supabase.from('revenues').delete().eq('id', id);
      if (error) { console.error('[useFinancialData] deleteRevenue error:', error); return false; }
      await Promise.allSettled([
        logActivity('exclusão', 'receita', `Excluiu receita - R$ ${Number(revenue?.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, id),
        fetchAll(),
      ]);
      return true;
    } catch (err) { console.error('[useFinancialData] deleteRevenue unexpected:', err); return false; }
  };

  // Expense CRUD
  const addExpense = async (e: Partial<Expense>) => {
    try {
      console.log('[useFinancialData] addExpense payload:', JSON.stringify(e));
      const { data, error } = await supabase.from('expenses').insert(e as any);
      console.log('[useFinancialData] addExpense result:', { data, error });
      if (error) {
        console.error('[useFinancialData] addExpense error:', error);
        return false;
      }
      await Promise.allSettled([
        logActivity('criação', 'despesa', `Registrou despesa - R$ ${Number(e.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - ${e.description}`, undefined, e),
        fetchAll(),
      ]);
      return true;
    } catch (err) {
      console.error('[useFinancialData] addExpense unexpected error:', err);
      return false;
    }
  };

  const updateExpense = async (id: string, updates: Partial<Expense>) => {
    try {
      const { error } = await supabase.from('expenses').update(updates as any).eq('id', id);
      if (error) {
        console.error('[useFinancialData] updateExpense error:', error);
        return false;
      }
      await Promise.allSettled([
        logActivity('edição', 'despesa', `Editou despesa - R$ ${Number(updates.amount || expenses.find(ex => ex.id === id)?.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, id, updates),
        fetchAll(),
      ]);
      return true;
    } catch (err) {
      console.error('[useFinancialData] updateExpense unexpected error:', err);
      return false;
    }
  };

  const deleteExpense = async (id: string) => {
    const expense = expenses.find(e => e.id === id);
    await supabase.from('expenses').delete().eq('id', id);
    await logActivity('exclusão', 'despesa', `Excluiu despesa - R$ ${Number(expense?.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - ${expense?.description}`, id);
    await fetchAll();
  };

  // Categories
  const addCategory = async (name: string) => {
    const { error } = await supabase.from('expense_categories').insert({ name } as any);
    if (!error) {
      await logActivity('criação', 'categoria', `Criou categoria: ${name}`);
      await fetchAll();
    }
    return !error;
  };

  // Payment config
  const updatePaymentConfig = async (config: Partial<PaymentConfig>) => {
    if (paymentConfig) {
      await supabase.from('payment_config').update(config as any).eq('id', paymentConfig.id);
      await logActivity('edição', 'configuração', 'Atualizou configurações de pagamento');
    }
    await fetchAll();
  };

  // Cash reserve
  const addCashMovement = async (m: Partial<CashMovement>) => {
    try {
      console.log('[useFinancialData] addCashMovement payload:', JSON.stringify(m));
      const { error } = await supabase.from('cash_reserve_movements').insert(m as any);
      if (error) { console.error('[useFinancialData] addCashMovement error:', error); return false; }
      await Promise.allSettled([
        logActivity('criação', 'caixa', `${m.type === 'entrada' ? 'Depósito' : 'Retirada'} no caixa - R$ ${Number(m.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - ${m.description}`, undefined, m),
        fetchAll(),
      ]);
      return true;
    } catch (err) { console.error('[useFinancialData] addCashMovement unexpected:', err); return false; }
  };

  const updateCashMovement = async (id: string, updates: Partial<CashMovement>) => {
    try {
      const { error } = await supabase.from('cash_reserve_movements').update(updates as any).eq('id', id);
      if (error) { console.error('[useFinancialData] updateCashMovement error:', error); return false; }
      await Promise.allSettled([
        logActivity('edição', 'caixa', `Editou movimentação do caixa - R$ ${Number(updates.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, id, updates),
        fetchAll(),
      ]);
      return true;
    } catch (err) { console.error('[useFinancialData] updateCashMovement unexpected:', err); return false; }
  };

  const deleteCashMovement = async (id: string) => {
    try {
      const mov = cashMovements.find(m => m.id === id);
      const { error } = await supabase.from('cash_reserve_movements').delete().eq('id', id);
      if (error) { console.error('[useFinancialData] deleteCashMovement error:', error); return false; }
      await Promise.allSettled([
        logActivity('exclusão', 'caixa', `Excluiu movimentação do caixa - R$ ${Number(mov?.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - ${mov?.description}`, id),
        fetchAll(),
      ]);
      return true;
    } catch (err) { console.error('[useFinancialData] deleteCashMovement unexpected:', err); return false; }
  };

  return {
    contracts, revenues, expenses, categories, paymentConfig, billingMessages, cashMovements, activityLog, loading,
    upsertContract, deleteContract,
    addRevenue, updateRevenue, deleteRevenue, generateMonthlyRevenues,
    addExpense, updateExpense, deleteExpense,
    addCategory, updatePaymentConfig, addCashMovement, updateCashMovement, deleteCashMovement,
    refetch: fetchAll,
  };
}
