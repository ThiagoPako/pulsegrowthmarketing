import { describe, it, expect, vi, afterEach } from 'vitest';
import { deleteRecordingWithConfirm, type RecordingDeleteResult } from '@/lib/recordingDelete';

const rec = { id: 'r1', status: 'agendada' as const, startTime: '08:30' };
const admin = { role: 'admin' as const, roles: [] };
const videomaker = { role: 'videomaker' as const, roles: [] };
const refused: RecordingDeleteResult = {
  ok: false,
  error: 'Esta gravação já foi realizada e não pode ser apagada. Use Cancelar ou peça a um admin.',
  alreadyRecorded: true,
};

afterEach(() => vi.restoreAllMocks());

describe('apagar gravação com a recusa do servidor', () => {
  it('agendada com vídeos em produção: admin confirma de novo e apaga com force', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const tryDelete = vi.fn()
      .mockResolvedValueOnce(refused)
      .mockResolvedValueOnce({ ok: true });
    const result = await deleteRecordingWithConfirm(rec, 'Cliente', admin, tryDelete);
    expect(result).toEqual({ ok: true });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(tryDelete).toHaveBeenNthCalledWith(1, 'r1', { force: false });
    expect(tryDelete).toHaveBeenNthCalledWith(2, 'r1', { force: true });
  });

  it('admin desiste na segunda pergunta: nada é repetido', async () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true).mockReturnValueOnce(false);
    const tryDelete = vi.fn().mockResolvedValueOnce(refused);
    const result = await deleteRecordingWithConfirm(rec, 'Cliente', admin, tryDelete);
    expect(result).toBeNull();
    expect(tryDelete).toHaveBeenCalledTimes(1);
  });

  it('quem não é admin recebe a mensagem do servidor, sem nova tentativa', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const tryDelete = vi.fn().mockResolvedValueOnce(refused);
    const result = await deleteRecordingWithConfirm(rec, 'Cliente', videomaker, tryDelete);
    expect(result).toEqual(refused);
    expect(tryDelete).toHaveBeenCalledTimes(1);
  });
});
