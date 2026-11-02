import { describe, expect, it } from 'vitest';
import { repliesToMarcely, MARCELY_THREAD_HOURS } from '../../vps-api-server/assistant/marcelyInbox.mjs';
import { logEvent } from '../../vps-api-server/assistant/common.mjs';

/** assistant_log em memória: o INSERT do logEvent e o SELECT do repliesToMarcely. */
function fakePool(now = () => Date.now()) {
  const log: { number_id: string | null; kind: string; created_at: number }[] = [];
  return {
    log,
    async query(sql: string, params: unknown[]) {
      if (/INSERT INTO assistant_log/.test(sql)) {
        log.push({ number_id: params[0] as string, kind: params[2] as string, created_at: now() + log.length });
        return { rows: [] };
      }
      if (/SELECT kind FROM assistant_log/.test(sql)) {
        const [numberId, hours] = params as [string, number];
        const rows = log
          .filter((r) => r.number_id === numberId && r.created_at > now() - hours * 3600_000)
          .sort((a, b) => b.created_at - a.created_at)
          .slice(0, 1);
        return { rows };
      }
      throw new Error(`consulta inesperada: ${sql}`);
    },
  };
}

describe('PULSE: resposta a aviso da Marcely sem assinatura', () => {
  it('aviso → resposta vai para a caixa dela; a mensagem seguinte volta ao PULSE', async () => {
    const pool = fakePool();
    // aviso da Marcely (POST /api/agent/whatsapp/avisar grava aviso_marcely)
    await logEvent(pool as never, { numberId: 'thiago', phone: '5562985382981', kind: 'aviso_marcely', text: 'Posso subir o G4?' });
    expect(await repliesToMarcely(pool as never, 'thiago')).toBe(true);
    // a resposta foi para a caixa (engine.toMarcely grava kind "marcely"): a próxima conversa é com o PULSE
    await logEvent(pool as never, { numberId: 'thiago', phone: '5562985382981', kind: 'marcely', text: 'pode' });
    expect(await repliesToMarcely(pool as never, 'thiago')).toBe(false);
  });

  it('a resposta da Marcely na caixa também abre a conversa com ela', async () => {
    const pool = fakePool();
    await logEvent(pool as never, { numberId: 'naay', kind: 'resposta_marcely', text: 'Feito!' });
    expect(await repliesToMarcely(pool as never, 'naay')).toBe(true);
  });

  it('depois do aviso, se a pessoa já falou com o PULSE, não vai para a Marcely', async () => {
    const pool = fakePool();
    await logEvent(pool as never, { numberId: 'victor', kind: 'aviso_marcely', text: 'aviso' });
    await logEvent(pool as never, { numberId: 'victor', kind: 'comando', text: 'quantos vídeos hoje?' });
    expect(await repliesToMarcely(pool as never, 'victor')).toBe(false);
  });

  it('aviso de outra pessoa, aviso antigo ou sem número: não', async () => {
    let clock = Date.now();
    const pool = fakePool(() => clock);
    await logEvent(pool as never, { numberId: 'thiago', kind: 'aviso_marcely', text: 'aviso' });
    expect(await repliesToMarcely(pool as never, 'naay')).toBe(false);
    expect(await repliesToMarcely(pool as never, null as never)).toBe(false);
    clock += (MARCELY_THREAD_HOURS + 1) * 3600_000;
    expect(await repliesToMarcely(pool as never, 'thiago')).toBe(false);
  });
});
