import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

export function useFinancialData() {
  const [contracts, setContracts] = useState<FinancialContract[]>([]);
  const [revenues, setRevenues] = useState<Revenue[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [paymentConfig, setPaymentConfigState] = useState<PaymentConfig | null>(null);
  const [billingMessages, setBillingMessages] = useState<BillingMessage[]>([]);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [cRes, rRes, eRes, catRes, pRes, bRes, cashRes] = await Promise.all([
      supabase.from('financial_contracts').select('*').order('created_at', { ascending: false }),
      supabase.from('revenues').select('*').order('due_date', { ascending: false }),
      supabase.from('expenses').select('*').order('date', { ascending: false }),
      supabase.from('expense_categories').select('*').order('name'),
      supabase.from('payment_config').select('*').limit(1),
      supabase.from('billing_messages').select('*').order('sent_at', { ascending: false }),
      supabase.from('cash_reserve_movements').select('*').order('date', { ascending: false }),
    ]);
    if (cRes.data) setContracts(cRes.data as any);
    if (rRes.data) setRevenues(rRes.data as any);
    if (eRes.data) setExpenses(eRes.data as any);
    if (catRes.data) setCategories(catRes.data as any);
    if (pRes.data?.[0]) setPaymentConfigState(pRes.data[0] as any);
    if (bRes.data) setBillingMessages(bRes.data as any);
    if (cashRes.data) setCashMovements(cashRes.data as any);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Contract CRUD
  const upsertContract = async (c: Partial<FinancialContract> & { client_id: string }) => {
    const { error } = await supabase.from('financial_contracts').upsert(c as any, { onConflict: 'client_id' });
    if (!error) await fetchAll();
    return !error;
  };

  const deleteContract = async (id: string) => {
    await supabase.from('financial_contracts').delete().eq('id', id);
    await fetchAll();
  };

  // Revenue CRUD
  const addRevenue = async (r: Partial<Revenue>) => {
    const { error } = await supabase.from('revenues').insert(r as any);
    if (!error) await fetchAll();
    return !error;
  };

  const updateRevenue = async (id: string, updates: Partial<Revenue>) => {
    const { error } = await supabase.from('revenues').update(updates as any).eq('id', id);
    if (!error) await fetchAll();
    return !error;
  };

  const generateMonthlyRevenues = async (monthStr: string) => {
    // monthStr format: "YYYY-MM"
    const [yearStr, monthNumStr] = monthStr.split('-');
    const year = parseInt(yearStr);
    const monthNum = parseInt(monthNumStr);
    const activeContracts = contracts.filter(c => c.status === 'ativo');
    const refMonth = `${year}-${String(monthNum).padStart(2, '0')}-01`;

    const existing = revenues.filter(r => r.reference_month === refMonth);
    const existingClientIds = new Set(existing.map(r => r.client_id));

    const newRevenues = activeContracts
      .filter(c => !existingClientIds.has(c.client_id))
      .map(c => ({
        client_id: c.client_id,
        contract_id: c.id,
        reference_month: refMonth,
        amount: c.contract_value,
        due_date: `${year}-${String(monthNum).padStart(2, '0')}-${String(c.due_day).padStart(2, '0')}`,
        status: 'prevista',
      }));

    if (newRevenues.length > 0) {
      await supabase.from('revenues').insert(newRevenues as any);
      await fetchAll();
    }
    return newRevenues.length;
  };

  // Expense CRUD
  const addExpense = async (e: Partial<Expense>) => {
    const { error } = await supabase.from('expenses').insert(e as any);
    if (!error) await fetchAll();
    return !error;
  };

  const updateExpense = async (id: string, updates: Partial<Expense>) => {
    const { error } = await supabase.from('expenses').update(updates as any).eq('id', id);
    if (!error) await fetchAll();
    return !error;
  };

  const deleteExpense = async (id: string) => {
    await supabase.from('expenses').delete().eq('id', id);
    await fetchAll();
  };

  // Categories
  const addCategory = async (name: string) => {
    const { error } = await supabase.from('expense_categories').insert({ name } as any);
    if (!error) await fetchAll();
    return !error;
  };

  // Payment config
  const updatePaymentConfig = async (config: Partial<PaymentConfig>) => {
    if (paymentConfig) {
      await supabase.from('payment_config').update(config as any).eq('id', paymentConfig.id);
    }
    await fetchAll();
  };

  // Cash reserve
  const addCashMovement = async (m: Partial<CashMovement>) => {
    const { error } = await supabase.from('cash_reserve_movements').insert(m as any);
    if (!error) await fetchAll();
    return !error;
  };

  return {
    contracts, revenues, expenses, categories, paymentConfig, billingMessages, cashMovements, loading,
    upsertContract, deleteContract,
    addRevenue, updateRevenue, generateMonthlyRevenues,
    addExpense, updateExpense, deleteExpense,
    addCategory, updatePaymentConfig, addCashMovement,
    refetch: fetchAll,
  };
}
