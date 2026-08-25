import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/vpsDb';
import { syncFinancialContract } from '@/lib/financialContracts';

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
  structure_investment?: boolean;
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
    // Fetch active clients first to filter related data
    const activeClientsRes = await supabase.from('clients').select('id').neq('status', 'cancelado');
    const activeClientIds = new Set((activeClientsRes.data || []).map((c: any) => c.id));

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
    // Debug logging removed for production
    if (cRes.data) {
      // Exclude contracts of canceled clients from main lists if they don't have recorded activity
      // But for financial accuracy, we usually keep them if they were active in the period.
      // However, the user asked to ELIMINATE activity for canceled clients.
      setContracts((cRes.data as any[]).filter(c => activeClientIds.has(c.client_id) || c.status === 'ativo'));
    }
    if (eRes.data) setExpenses(eRes.data as any);
    else if (eRes.error) console.error('[useFinancialData] expenses fetch error:', eRes.error);
    if (catRes.data) setCategories(catRes.data as any);
    if (pRes.data?.[0]) setPaymentConfigState(pRes.data[0] as any);
    if (bRes.data) {
      setBillingMessages((bRes.data as any[]).filter(m => activeClientIds.has(m.client_id)));
    }
    if (cashRes.data) setCashMovements(cashRes.data as any);
    if (logRes.data) setActivityLog(logRes.data as any);

    // Auto-mark overdue revenues: if due_date < today and status is still 'prevista', update to 'em_atraso'
    if (rRes.error) console.error('[useFinancialData] revenues fetch error:', rRes.error);
    if (rRes.data) {
      const today = new Date().toISOString().split('T')[0];
      const revenueData = rRes.data as any[];

      const uniqueRevenues = deduplicateRevenues(revenueData);

      const overdueIds: string[] = [];
      for (const r of uniqueRevenues) {
        if (r.status === 'prevista' && r.due_date && normalizeDate(r.due_date) < today) {
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
          const deduplicated = deduplicateRevenues(updated.data as any[]);
          setRevenues(deduplicated.filter(r => activeClientIds.has(r.client_id)));
        } else {
          setRevenues(
            uniqueRevenues
              .map(r => (overdueIds.includes(r.id) ? { ...r, status: 'em_atraso' } : r))
              .filter(r => activeClientIds.has(r.client_id))
          );
        }
      } else {
        setRevenues(uniqueRevenues.filter(r => activeClientIds.has(r.client_id)));
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
    let error: any = null;
    try {
      await syncFinancialContract({
        id: c.id,
        client_id: c.client_id,
        plan_id: c.plan_id,
        contract_value: Number(c.contract_value || 0),
        contract_start_date: c.contract_start_date,
        due_day: c.due_day,
        payment_method: c.payment_method,
        status: c.status,
      });
    } catch (err: any) {
      error = err;
      console.error('[useFinancialData] upsertContract error:', err);
    }

    if (!error) {
      await logActivity(isNew ? 'criação' : 'edição', 'contrato', `${isNew ? 'Criou' : 'Editou'} contrato - R$ ${Number(c.contract_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, c.id, c);
      await fetchAll();
    }
    return !error;
  };

  const deleteContract = async (id: string) => {
    const contract = contracts.find(c => c.id === id);
    const { error } = await supabase.from('financial_contracts').delete().eq('id', id);
    if (error) {
      console.error('[useFinancialData] deleteContract error:', error);
      return false;
    }
    await logActivity('exclusão', 'contrato', `Excluiu contrato - R$ ${Number(contract?.contract_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, id);
    await fetchAll();
    return true;
  };


  // Revenue CRUD
  const addRevenue = async (r: Partial<Revenue>) => {
    const { error } = await supabase.from('revenues').insert(r as any);
    if (error) {
      console.error('[useFinancialData] addRevenue error:', error);
      return false;
    }
    await logActivity('criação', 'receita', `Registrou receita - R$ ${Number(r.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, undefined, r);
    await fetchAll();
    return true;
  };

  const updateRevenue = async (id: string, updates: Partial<Revenue>, clientName?: string) => {
    try {
      const previousRevenue = revenues.find(r => r.id === id);
      const { error } = await supabase.from('revenues').update(updates as any).eq('id', id);

      if (error) {
        console.error('[useFinancialData] Failed to update revenue:', error);
        return false;
      }

      const action = updates.status === 'recebida' ? 'Marcou receita como paga' : updates.status === 'prevista' ? 'Reverteu receita para pendente' : 'Atualizou receita';
      const revenueAmount = Number(updates.amount || previousRevenue?.amount || 0);

      // Sync with account balance (cash_reserve_movements)
      if (updates.status === 'recebida' && previousRevenue?.status !== 'recebida') {
        // Resolve client name for description
        let companyLabel = clientName || '';
        if (!companyLabel && previousRevenue?.client_id) {
          const { data: cl } = await supabase.from('clients').select('company_name').eq('id', previousRevenue.client_id).maybeSingle();
          companyLabel = (cl as any)?.company_name || '';
        }
        const descLabel = companyLabel ? `${companyLabel} - ${revenueAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : `Receita avulsa - ${revenueAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
        // Revenue received → add entrada to account balance
        await supabase.from('cash_reserve_movements').insert({
          amount: revenueAmount,
          type: 'entrada',
          description: `[Receita] ${descLabel} - ID: ${id}`,
          date: updates.paid_at || new Date().toISOString().split('T')[0],
          is_reserve: false,
        } as any);
      } else if (updates.status === 'prevista' && previousRevenue?.status === 'recebida') {
        // Revenue reverted → remove the linked cash movement
        const { data: linked } = await supabase
          .from('cash_reserve_movements')
          .select('id')
          .ilike('description', `%[Receita]%ID: ${id}%`);
        if (linked && linked.length > 0) {
          for (const l of linked) {
            await supabase.from('cash_reserve_movements').delete().eq('id', l.id);
          }
        }
      }

      await logActivity('edição', 'receita', `${action} - R$ ${revenueAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, id, updates);
      await fetchAll();

      return true;
    } catch (error) {
      console.error('[useFinancialData] Unexpected revenue update error:', error);
      return false;
    }
  };

  /**
   * Gera as receitas recorrentes do mês a partir dos contratos financeiros ativos.
   * Retorna também um diagnóstico dos clientes ativos que ficaram de fora,
   * para que o cadastro possa ser corrigido.
   */
  const generateMonthlyRevenues = async (monthStr: string, options?: { reprocess?: boolean }) => {
    const reprocess = options?.reprocess === true;
    const [yearStr, monthNumStr] = monthStr.split('-');
    const year = parseInt(yearStr);
    const monthNum = parseInt(monthNumStr);
    const refMonth = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    const lastDay = new Date(year, monthNum, 0).getDate();

    // Fetch fresh contracts, active clients and ALL existing revenues for this month
    const [freshContracts, freshClients, freshExisting] = await Promise.all([
      supabase.from('financial_contracts').select('*'),
      supabase.from('clients').select('id, company_name, status'),
      supabase.from('revenues').select('*'),
    ]);

    const allContracts = (freshContracts.data as any[]) || [];
    const activeClients = ((freshClients.data as any[]) || []).filter(
      (c: any) => (c.status || 'ativo') === 'ativo'
    );
    const contractByClient = new Map<string, any>(allContracts.map((c: any) => [c.client_id, c]));

    const monthRevenues = ((freshExisting.data as any[]) || []).filter(
      (r: any) => normalizeDate(r.reference_month) === refMonth
    );
    // Duplicate protection: index existing revenues per client for this month
    const revenuesByClient = new Map<string, any[]>();
    for (const r of monthRevenues) {
      if (!r.client_id) continue;
      const list = revenuesByClient.get(r.client_id) || [];
      list.push(r);
      revenuesByClient.set(r.client_id, list);
    }

    const skipped: { client: string; reason: string }[] = [];
    const failed: { client: string; reason: string }[] = [];
    const newRevenues: any[] = [];
    let updated = 0;

    for (const client of activeClients) {
      const contract = contractByClient.get(client.id);
      const name = client.company_name || 'Cliente sem nome';
      const existing = revenuesByClient.get(client.id) || [];

      if (!contract) {
        if (existing.length === 0) skipped.push({ client: name, reason: 'sem contrato financeiro cadastrado' });
        continue;
      }
      if (contract.status !== 'ativo') {
        if (existing.length === 0) skipped.push({ client: name, reason: `contrato com status "${contract.status}"` });
        continue;
      }
      if (!(Number(contract.contract_value) > 0)) {
        if (existing.length === 0) skipped.push({ client: name, reason: 'valor do contrato zerado' });
        continue;
      }

      const dueDay = Math.min(Math.max(Number(contract.due_day) || 10, 1), lastDay);
      const dueDate = `${year}-${String(monthNum).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
      const amount = Number(contract.contract_value);

      // Duplicate protection: never insert when the client already has a revenue this month
      if (existing.length > 0) {
        if (!reprocess) continue;
        // Reprocess only pending entries — received revenues stay untouched
        const pending = existing.filter((r: any) => r.status === 'prevista');
        if (pending.length === 0) {
          skipped.push({ client: name, reason: 'receita já recebida — não reprocessada' });
          continue;
        }
        for (const rev of pending) {
          const needsUpdate =
            Number(rev.amount) !== amount ||
            normalizeDate(rev.due_date) !== dueDate ||
            rev.contract_id !== contract.id;
          if (!needsUpdate) continue;
          const { error } = await supabase
            .from('revenues')
            .update({ amount, due_date: dueDate, contract_id: contract.id } as any)
            .eq('id', rev.id);
          if (error) failed.push({ client: name, reason: error.message || 'erro ao atualizar receita' });
          else updated++;
        }
        continue;
      }

      newRevenues.push({
        client_id: client.id,
        contract_id: contract.id,
        reference_month: refMonth,
        amount,
        due_date: dueDate,
        status: 'prevista',
      });
    }

    let inserted = 0;

    for (const rev of newRevenues) {
      const { error } = await supabase.from('revenues').insert(rev as any);
      if (error) {
        const name = activeClients.find((c: any) => c.id === rev.client_id)?.company_name || 'Cliente';
        console.error('[useFinancialData] Falha ao gerar receita:', name, error);
        failed.push({ client: name, reason: error.message || 'erro ao inserir receita' });
      } else {
        inserted++;
      }
    }

    if (inserted > 0 || updated > 0) {
      await logActivity(
        reprocess ? 'reprocessamento' : 'geração',
        'receita',
        `${reprocess ? 'Reprocessou' : 'Gerou'} receitas de ${monthStr}: ${inserted} nova(s), ${updated} atualizada(s)`,
        undefined,
        { month: monthStr, inserted, updated }
      );
      await fetchAll();
    }

    return { inserted, updated, skipped, failed };
  };



  const deleteRevenue = async (id: string) => {
    try {
      const revenue = revenues.find(r => r.id === id);
      const { error } = await supabase.from('revenues').delete().eq('id', id);
      if (error) { console.error('[useFinancialData] deleteRevenue error:', error); return false; }

      // If revenue was received, remove the linked cash movement
      if (revenue?.status === 'recebida') {
        const { data: linked } = await supabase
          .from('cash_reserve_movements')
          .select('id')
          .ilike('description', `%[Receita]%ID: ${id}%`);
        if (linked && linked.length > 0) {
          for (const l of linked) {
            await supabase.from('cash_reserve_movements').delete().eq('id', l.id);
          }
        }
      }

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
      const payload = { ...e };
      if (payload.date) payload.date = normalizeDate(payload.date);
      const { data: inserted, error } = await supabase.from('expenses').insert(payload as any).select('id').single();
      if (error) {
        console.error('[useFinancialData] addExpense error:', error);
        return false;
      }

      // Create cash movement (saida) linked to this expense
      const expenseId = (inserted as any)?.id;
      if (expenseId) {
        await supabase.from('cash_reserve_movements').insert({
          amount: Number(e.amount || 0),
          type: 'saida',
          description: `[Despesa] ${e.description || 'Despesa'} - ID: ${expenseId}`,
          date: payload.date || new Date().toISOString().split('T')[0],
          is_reserve: false,
        } as any);
      }

      await fetchAll();
      await logActivity('criação', 'despesa', `Registrou despesa - R$ ${Number(e.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - ${e.description}`, expenseId, payload);
      return true;
    } catch (err) {
      console.error('[useFinancialData] addExpense unexpected error:', err);
      return false;
    }
  };

  const updateExpense = async (id: string, updates: Partial<Expense>) => {
    try {
      const payload = { ...updates };
      if (payload.date) payload.date = normalizeDate(payload.date);
      const { error } = await supabase.from('expenses').update(payload as any).eq('id', id);
      if (error) {
        console.error('[useFinancialData] updateExpense error:', error);
        return false;
      }

      // Update linked cash movement if amount or date changed
      const { data: linked } = await supabase
        .from('cash_reserve_movements')
        .select('id')
        .ilike('description', `%[Despesa]%ID: ${id}%`);
      if (linked && linked.length > 0) {
        const cashUpdates: any = {};
        if (updates.amount !== undefined) cashUpdates.amount = Number(updates.amount);
        if (updates.date) cashUpdates.date = normalizeDate(updates.date);
        if (updates.description) cashUpdates.description = `[Despesa] ${updates.description} - ID: ${id}`;
        if (Object.keys(cashUpdates).length > 0) {
          for (const l of linked) {
            await supabase.from('cash_reserve_movements').update(cashUpdates).eq('id', l.id);
          }
        }
      }

      await fetchAll();
      await logActivity('edição', 'despesa', `Editou despesa - R$ ${Number(updates.amount || expenses.find(ex => ex.id === id)?.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, id, payload);
      return true;
    } catch (err) {
      console.error('[useFinancialData] updateExpense unexpected error:', err);
      return false;
    }
  };

  const deleteExpense = async (id: string) => {
    const expense = expenses.find(e => e.id === id);
    await supabase.from('expenses').delete().eq('id', id);

    // Remove linked cash movement
    const { data: linked } = await supabase
      .from('cash_reserve_movements')
      .select('id')
      .ilike('description', `%[Despesa]%ID: ${id}%`);
    if (linked && linked.length > 0) {
      for (const l of linked) {
        await supabase.from('cash_reserve_movements').delete().eq('id', l.id);
      }
    }

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
