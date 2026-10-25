import { supabase } from '@/lib/vpsDb';
import { PLACEHOLDER_CLIENT_ID } from '@/lib/financialCalc';

export interface BankImportItem {
  date: string;
  description: string;
  amount: number;
}

/** Resultado da importação: quantos gravaram, quantos falharam e quantos já existiam. */
export interface BankImportResult {
  imported: number;
  failed: number;
  skipped?: number;
  /** Lançamento gravado, mas sem o espelho no caixa (o "Sincronizar caixa" cria depois). */
  cashFailed?: number;
}

/** Descrição padrão das entradas do extrato sem texto (a mesma do espelho no caixa). */
export const BANK_IMPORT_DEFAULT_DESCRIPTION = 'Extrato bancário';

const lineKey = (date: unknown, amount: unknown, description: unknown) =>
  `${String(date || '').slice(0, 10)}|${(Math.round(Number(amount || 0) * 100) / 100).toFixed(2)}|${String(description || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()}`;

const countKeys = (keys: string[]) => {
  const counts = new Map<string, number>();
  keys.forEach(k => counts.set(k, (counts.get(k) || 0) + 1));
  return counts;
};

/**
 * Marca as linhas do extrato que já estão lançadas (mesma data, valor e descrição).
 * Saídas: despesas. Entradas: espelho '[Receita] <descrição> - ID' no caixa ou receita
 * avulsa com a mesma descrição (ou sem descrição, mesma data e valor). Linhas iguais
 * repetidas no arquivo só contam como duplicadas até a quantidade que já existe no
 * banco. Lança erro se a consulta falhar.
 */
export async function findImportedStatementLines(items: BankImportItem[], type: 'entrada' | 'saida'): Promise<boolean[]> {
  const dates = items.map(i => String(i.date || '').slice(0, 10)).filter(Boolean).sort();
  if (dates.length === 0) return items.map(() => false);
  const min = dates[0];
  const max = dates[dates.length - 1];

  let existing: Map<string, number>;
  // Receitas avulsas antigas do Start Financeiro não guardavam a descrição:
  // essas casam só por data e valor.
  let withoutDescription = new Map<string, number>();
  if (type === 'saida') {
    const { data, error } = await supabase
      .from('expenses')
      .select('date, amount, description')
      .gte('date', min)
      .lte('date', max);
    if (error || !Array.isArray(data)) throw new Error('Não foi possível conferir as despesas já lançadas');
    existing = countKeys((data as any[]).map(e => lineKey(e.date, e.amount, e.description)));
  } else {
    const [cashRes, revRes] = await Promise.all([
      supabase
        .from('cash_reserve_movements')
        .select('date, amount, description')
        .eq('type', 'entrada')
        .gte('date', min)
        .lte('date', max),
      supabase
        .from('revenues')
        .select('due_date, amount, description')
        .eq('client_id', PLACEHOLDER_CLIENT_ID)
        .gte('due_date', min)
        .lte('due_date', max),
    ]);
    if (cashRes.error || revRes.error || !Array.isArray(cashRes.data) || !Array.isArray(revRes.data)) {
      throw new Error('Não foi possível conferir as entradas já lançadas');
    }
    const fromCash = countKeys(
      (cashRes.data as any[])
        .map(m => {
          const match = /^\[Receita\]\s*(.*?)\s*-\s*ID:/i.exec(m.description || '');
          return match ? lineKey(m.date, m.amount, match[1]) : '';
        })
        .filter(Boolean)
    );
    const fromRevenues = countKeys(
      (revRes.data as any[])
        .filter(r => (r.description || '').trim())
        .map(r => lineKey(r.due_date, r.amount, r.description))
    );
    withoutDescription = countKeys(
      (revRes.data as any[])
        .filter(r => !(r.description || '').trim())
        .map(r => lineKey(r.due_date, r.amount, ''))
    );
    // A mesma entrada aparece na receita e no espelho: vale o maior dos dois, não a soma
    existing = new Map(fromCash);
    fromRevenues.forEach((n, k) => existing.set(k, Math.max(n, existing.get(k) || 0)));
  }

  return items.map(item => {
    const description = item.description || (type === 'entrada' ? BANK_IMPORT_DEFAULT_DESCRIPTION : '');
    const key = lineKey(item.date, item.amount, description);
    const left = existing.get(key) || 0;
    const looseKey = lineKey(item.date, item.amount, '');
    const loose = withoutDescription.get(looseKey) || 0;
    if (left > 0) {
      existing.set(key, left - 1);
      // Importações antigas: receita sem descrição + espelho no caixa são a mesma entrada
      if (loose > 0) withoutDescription.set(looseKey, loose - 1);
      return true;
    }
    if (loose > 0) {
      withoutDescription.set(looseKey, loose - 1);
      return true;
    }
    return false;
  });
}
