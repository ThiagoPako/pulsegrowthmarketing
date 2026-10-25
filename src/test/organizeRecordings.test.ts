import { describe, it, expect } from 'vitest';
import { organizeRecordingsForDate } from '@/lib/schedulingUtils';
import type { CompanySettings, Recording, RecordingStatus } from '@/types';

const settings = { recordingDuration: 90 } as CompanySettings;
// Status do portal para pedido especial em análise (fora do RecordingStatus do front)
const SOLICITADA = 'solicitada' as string as RecordingStatus;
const DATE = '2026-11-03';
const VM = 'vm-1';
const clientIds = new Set(['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);

let seq = 0;
function rec(partial: Partial<Recording>): Recording {
  seq += 1;
  return {
    id: `r${seq}`,
    clientId: 'c1',
    videomakerId: VM,
    date: DATE,
    startTime: '08:30',
    type: 'fixa',
    status: 'agendada',
    ...partial,
  };
}

function organize(recs: Recording[]) {
  return organizeRecordingsForDate(DATE, VM, recs, settings, clientIds, new Set(), []);
}

describe('Organizar Agenda (organizeRecordingsForDate)', () => {
  it('pedido especial em análise às 09:00 não faz apagar agendada num dia com 3 agendadas', () => {
    const recs = [
      rec({ clientId: 'c1', type: 'fixa', startTime: '08:30' }),
      rec({ clientId: 'c2', type: 'fixa', startTime: '14:30' }),
      rec({ clientId: 'c3', type: 'backup', startTime: '16:30' }),
      rec({ clientId: 'c4', type: 'extra', status: SOLICITADA, startTime: '09:00' }),
    ];
    const { toCancel, toUpdate } = organize(recs);
    expect(toCancel).toEqual([]);
    // O pedido não é mexido
    expect(toUpdate.find(r => r.status === SOLICITADA)).toBeUndefined();
  });

  it('gravação concluída fora do horário padrão ocupa só uma vaga', () => {
    const recs = [
      rec({ clientId: 'c1', type: 'avulso', status: 'concluida', startTime: '09:30' }),
      rec({ clientId: 'c2', type: 'fixa', startTime: '08:30' }),
      rec({ clientId: 'c3', type: 'fixa', startTime: '14:30' }),
      rec({ clientId: 'c4', type: 'backup', startTime: '16:30' }),
    ];
    const { toCancel, toUpdate } = organize(recs);
    expect(toCancel).toEqual([]);
    expect(toUpdate.find(r => r.status === 'concluida')).toBeUndefined();
    // Nenhuma agendada fica no mesmo horário de outra
    const finalTimes = recs
      .filter(r => r.status === 'agendada')
      .map(r => toUpdate.find(u => u.id === r.id)?.startTime ?? r.startTime);
    expect(new Set(finalTimes).size).toBe(finalTimes.length);
  });

  it('com mais de 4 no dia ainda apaga a de menor prioridade', () => {
    const recs = [
      rec({ clientId: 'c1', type: 'fixa', startTime: '08:30' }),
      rec({ clientId: 'c2', type: 'fixa', startTime: '10:30' }),
      rec({ clientId: 'c3', type: 'fixa', startTime: '14:30' }),
      rec({ clientId: 'c4', type: 'backup', startTime: '16:30' }),
      rec({ clientId: 'c5', type: 'extra', startTime: '16:30' }),
    ];
    const { toCancel } = organize(recs);
    expect(toCancel).toHaveLength(1);
    expect(toCancel[0].type).toBe('extra');
  });

  it('gravação concluída no horário padrão continua tomando a vaga dela', () => {
    const recs = [
      rec({ clientId: 'c1', type: 'fixa', status: 'concluida', startTime: '08:30' }),
      rec({ clientId: 'c2', type: 'extra', startTime: '08:30' }),
    ];
    const { toCancel, toUpdate } = organize(recs);
    expect(toCancel).toEqual([]);
    expect(toUpdate).toHaveLength(1);
    expect(toUpdate[0].startTime).toBe('10:30');
  });
});
