import { supabase } from '@/lib/vpsDb';

type SyncFinancialContractInput = {
  id?: string | null;
  client_id: string;
  plan_id?: string | null;
  contract_value: number;
  contract_start_date?: string | null;
  due_day?: number;
  payment_method?: string | null;
  status?: string | null;
};

const OPEN_REVENUE_STATUSES = ['prevista', 'em_atraso', 'vencido'];

const normalizeDate = (value: string | null | undefined) => {
  if (!value) return '';
  return value.includes('T') ? value.split('T')[0] : value;
};

const buildDueDate = (referenceMonth: string, dueDay: number) => {
  const normalized = normalizeDate(referenceMonth);
  const [year, month] = normalized.split('-');
  return `${year}-${month}-${String(dueDay).padStart(2, '0')}`;
};

export async function syncFinancialContract(input: SyncFinancialContractInput) {
  const contractValue = Number.isFinite(Number(input.contract_value)) ? Number(input.contract_value) : 0;
  const dueDay = Math.min(28, Math.max(1, Number(input.due_day) || 10));
  const contractStartDate = normalizeDate(input.contract_start_date) || new Date().toISOString().split('T')[0];

  const payload = {
    client_id: input.client_id,
    plan_id: input.plan_id || null,
    contract_value: contractValue,
    contract_start_date: contractStartDate,
    due_day: dueDay,
    payment_method: input.payment_method || 'pix',
    status: input.status || 'ativo',
  };

  let existingContract: any = null;

  if (input.id) {
    const existingById = await supabase.from('financial_contracts').select('*').eq('id', input.id).maybeSingle();
    if (existingById.error) throw new Error(existingById.error.message || 'Erro ao localizar contrato financeiro');
    existingContract = existingById.data || null;
  }

  if (!existingContract) {
    const existingByClient = await supabase.from('financial_contracts').select('*').eq('client_id', input.client_id).maybeSingle();
    if (existingByClient.error) throw new Error(existingByClient.error.message || 'Erro ao localizar contrato financeiro do cliente');
    existingContract = existingByClient.data || null;
  }

  const saveResult = existingContract
    ? await supabase.from('financial_contracts').update(payload as any).eq('id', existingContract.id)
    : await supabase.from('financial_contracts').insert(payload as any);

  if (saveResult.error) {
    throw new Error(saveResult.error.message || 'Erro ao salvar contrato financeiro');
  }

  const savedContract = Array.isArray(saveResult.data) ? saveResult.data[0] : saveResult.data;
  const contractId = savedContract?.id || existingContract?.id || input.id || null;

  const shouldSyncOpenRevenues = Boolean(
    contractId && (
      !existingContract ||
      Number(existingContract.contract_value) !== contractValue ||
      Number(existingContract.due_day) !== dueDay
    )
  );

  let syncedRevenueCount = 0;

  if (shouldSyncOpenRevenues) {
    const openRevenuesResult = await supabase
      .from('revenues')
      .select('id, reference_month')
      .eq('client_id', input.client_id)
      .in('status', OPEN_REVENUE_STATUSES as any);

    if (openRevenuesResult.error) {
      throw new Error(openRevenuesResult.error.message || 'Erro ao sincronizar receitas em aberto');
    }

    const openRevenues = Array.isArray(openRevenuesResult.data) ? openRevenuesResult.data : [];

    if (openRevenues.length > 0) {
      const revenueUpdates = await Promise.all(
        openRevenues.map((revenue: any) =>
          supabase
            .from('revenues')
            .update({
              contract_id: contractId,
              amount: contractValue,
              due_date: buildDueDate(revenue.reference_month, dueDay),
            } as any)
            .eq('id', revenue.id)
        )
      );

      const revenueError = revenueUpdates.find(result => result.error);
      if (revenueError?.error) {
        throw new Error(revenueError.error.message || 'Erro ao atualizar receitas vinculadas ao contrato');
      }

      syncedRevenueCount = openRevenues.length;
    }
  }

  return {
    contractId,
    isNew: !existingContract,
    syncedRevenueCount,
  };
}