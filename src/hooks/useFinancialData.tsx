import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/vpsDb';

/** Normalize date strings like "2026-03-01T00:00:00.000Z" to "2026-03-01" */
export const normalizeDate = (d: string | null | undefined): string => {
  if (!d) return '';
  return d.includes('T') ? d.split('T')[0] : d;
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
    if (cRes.data) setContracts(cRes.data as any);
    if (eRes.data) setExpenses(eRes.data as any);
    if (catRes.data) setCategories(catRes.data as any);
    if (pRes.data?.[0]) setPaymentConfigState(pRes.data[0] as any);
    if (bRes.data) setBillingMessages(bRes.data as any);
    if (cashRes.data) setCashMovements(cashRes.data as any);
    if (logRes.data) setActivityLog(logRes.data as any);

    // Auto-mark overdue revenues: if due_date < today and status is still 'prevista', update to 'em_atraso'
    if (rRes.data) {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const overdueIds: string[] = [];
      const revenueData = rRes.data as any[];
      
      for (const r of revenueData) {
        if (r.status === 'prevista' && r.due_date && normalizeDate(r.due_date) < today && Number(r.amount) > 0) {
          overdueIds.push(r.id);
        }
      }

      if (overdueIds.length > 0) {
        // Batch update overdue revenues
        await Promise.all(
          overdueIds.map(id =>
            supabase.from('revenues').update({ status: 'em_atraso' } as any).eq('id', id)
          )
        );
        // Re-fetch revenues after update
        const updated = await supabase.from('revenues').select('*').order('due_date', { ascending: false });
        if (updated.data) setRevenues(updated.data as any);
      } else {
        setRevenues(revenueData);
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Activity logger
  const logActivity = async (actionType: string, entityType: string, description: string, entityId?: string, details?: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('financial_activity_log').insert({
      user_id: user?.id || null,
      action_type: actionType,
      entity_type: entityType,
      entity_id: entityId || null,
      description,
      details: details || null,
    } as any);
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
    const { error } = await supabase.from('revenues').insert(r as any);
    if (!error) {
      await logActivity('criação', 'receita', `Registrou receita - R$ ${Number(r.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, undefined, r);
      await fetchAll();
    }
    return !error;
  };

  const updateRevenue = async (id: string, updates: Partial<Revenue>) => {
    const { error } = await supabase.from('revenues').update(updates as any).eq('id', id);
    if (!error) {
      const action = updates.status === 'recebida' ? 'Marcou receita como paga' : updates.status === 'prevista' ? 'Reverteu receita para pendente' : 'Atualizou receita';
      await logActivity('edição', 'receita', `${action} - R$ ${Number(updates.amount || revenues.find(r => r.id === id)?.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, id, updates);
      await fetchAll();
    }
    return !error;
  };

  const generateMonthlyRevenues = async (monthStr: string) => {
    const [yearStr, monthNumStr] = monthStr.split('-');
    const year = parseInt(yearStr);
    const monthNum = parseInt(monthNumStr);
    const refMonth = `${year}-${String(monthNum).padStart(2, '0')}-01`;

    // Fetch fresh contracts and existing revenues from DB to avoid stale state
    const [freshContracts, freshExisting] = await Promise.all([
      supabase.from('financial_contracts').select('*').eq('status', 'ativo'),
      supabase.from('revenues').select('client_id').eq('reference_month', refMonth),
    ]);

    const activeContracts = (freshContracts.data as any[] || []).filter((c: any) => Number(c.contract_value) > 0);
    const existingClientIds = new Set((freshExisting.data as any[] || []).map((r: any) => r.client_id));

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
      await supabase.from('revenues').insert(newRevenues as any);
      await logActivity('geração', 'receita', `Gerou ${newRevenues.length} receita(s) recorrente(s) para ${monthStr}`, undefined, { month: monthStr, count: newRevenues.length });
      await fetchAll();
    }
    return newRevenues.length;
  };

  // Expense CRUD
  const addExpense = async (e: Partial<Expense>) => {
    const { error } = await supabase.from('expenses').insert(e as any);
    if (!error) {
      await logActivity('criação', 'despesa', `Registrou despesa - R$ ${Number(e.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - ${e.description}`, undefined, e);
      await fetchAll();
    }
    return !error;
  };

  const updateExpense = async (id: string, updates: Partial<Expense>) => {
    const { error } = await supabase.from('expenses').update(updates as any).eq('id', id);
    if (!error) {
      await logActivity('edição', 'despesa', `Editou despesa - R$ ${Number(updates.amount || expenses.find(ex => ex.id === id)?.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, id, updates);
      await fetchAll();
    }
    return !error;
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
    const { error } = await supabase.from('cash_reserve_movements').insert(m as any);
    if (!error) {
      await logActivity('criação', 'caixa', `${m.type === 'entrada' ? 'Depósito' : 'Retirada'} no caixa - R$ ${Number(m.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - ${m.description}`, undefined, m);
      await fetchAll();
    }
    return !error;
  };

  const updateCashMovement = async (id: string, updates: Partial<CashMovement>) => {
    const { error } = await supabase.from('cash_reserve_movements').update(updates as any).eq('id', id);
    if (!error) {
      await logActivity('edição', 'caixa', `Editou movimentação do caixa - R$ ${Number(updates.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, id, updates);
      await fetchAll();
    }
    return !error;
  };

  const deleteCashMovement = async (id: string) => {
    const mov = cashMovements.find(m => m.id === id);
    const { error } = await supabase.from('cash_reserve_movements').delete().eq('id', id);
    if (!error) {
      await logActivity('exclusão', 'caixa', `Excluiu movimentação do caixa - R$ ${Number(mov?.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - ${mov?.description}`, id);
      await fetchAll();
    }
    return !error;
  };

  return {
    contracts, revenues, expenses, categories, paymentConfig, billingMessages, cashMovements, activityLog, loading,
    upsertContract, deleteContract,
    addRevenue, updateRevenue, generateMonthlyRevenues,
    addExpense, updateExpense, deleteExpense,
    addCategory, updatePaymentConfig, addCashMovement, updateCashMovement, deleteCashMovement,
    refetch: fetchAll,
  };
}
