import { describe, expect, it } from 'vitest';
import {
  continuationRule, listOccurrences, normalizeRule, normalizeWhatsAppNumber, occurrenceAt, ruleSummary, storySlug,
  weekdayIndex, whatsappLink,
} from '../../vps-api-server/lib/storyRecurrence.mjs';

const ms = (iso: string) => Date.parse(iso);
const dates = (list: { date: string }[]) => list.map((o) => o.date);

describe('regra da série de stories', () => {
  it('a cada 2 dias: começa no dia de início e pula um', () => {
    const rule = normalizeRule({ kind: 'interval', interval_days: 2, time: '08:00', start_date: '2026-11-02' });
    const list = listOccurrences(rule, { toMs: ms('2026-11-10T23:59:00Z') });
    expect(dates(list)).toEqual(['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-08', '2026-11-10']);
    expect(list.map((o) => o.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it('dias da semana: toda segunda às 8h de Brasília (11h UTC)', () => {
    const rule = normalizeRule({ kind: 'weekly', weekdays: [0], time: '08:00', start_date: '2026-10-28' });
    const list = listOccurrences(rule, { toMs: ms('2026-11-24T00:00:00Z') });
    expect(dates(list)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
    expect(list.every((o) => weekdayIndex(o.date) === 0)).toBe(true);
    expect(list[0].at).toBe('2026-11-02T11:00:00.000Z');
  });

  it('vários dias da semana, em ordem e sem repetir o dia escolhido duas vezes', () => {
    const rule = normalizeRule({ kind: 'weekly', weekdays: [4, 0, 2, 2], time: '19:30', start_date: '2026-11-02' });
    expect(rule.weekdays).toEqual([0, 2, 4]);
    const list = listOccurrences(rule, { toMs: ms('2026-11-09T00:00:00Z') });
    expect(dates(list)).toEqual(['2026-11-02', '2026-11-04', '2026-11-06']);
  });

  it('hora da noite cai no dia certo de Brasília (23h de Brasília é 02h UTC do dia seguinte)', () => {
    const rule = normalizeRule({ kind: 'interval', interval_days: 1, time: '23:00', start_date: '2026-11-30' });
    const [first, second] = listOccurrences(rule, { toMs: ms('2026-12-02T03:00:00Z') });
    expect(first).toMatchObject({ date: '2026-11-30', at: '2026-12-01T02:00:00.000Z' });
    expect(second).toMatchObject({ date: '2026-12-01', at: '2026-12-02T02:00:00.000Z' });
  });

  it('vira o mês e o ano', () => {
    const rule = normalizeRule({ kind: 'interval', interval_days: 3, time: '10:00', start_date: '2026-12-27' });
    const list = listOccurrences(rule, { toMs: ms('2027-01-10T00:00:00Z') });
    expect(dates(list)).toEqual(['2026-12-27', '2026-12-30', '2027-01-02', '2027-01-05', '2027-01-08']);
    const feb = normalizeRule({ kind: 'interval', interval_days: 1, time: '10:00', start_date: '2027-02-27' });
    expect(dates(listOccurrences(feb, { toMs: ms('2027-03-02T23:00:00Z') }))).toEqual(['2027-02-27', '2027-02-28', '2027-03-01', '2027-03-02']);
  });

  it('fim por data: a última é no dia do fim', () => {
    const rule = normalizeRule({ kind: 'interval', interval_days: 2, time: '08:00', start_date: '2026-11-02', end_kind: 'date', end_date: '2026-11-08' });
    expect(dates(listOccurrences(rule, { toMs: ms('2027-01-01T00:00:00Z') }))).toEqual(['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-08']);
  });

  it('fim por número de vezes conta desde o início, mesmo olhando só a janela', () => {
    const rule = normalizeRule({ kind: 'weekly', weekdays: [0, 3], time: '08:00', start_date: '2026-11-02', end_kind: 'count', max_count: 5 });
    const all = listOccurrences(rule, { toMs: ms('2027-06-01T00:00:00Z') });
    expect(dates(all)).toEqual(['2026-11-02', '2026-11-05', '2026-11-09', '2026-11-12', '2026-11-16']);
    const window = listOccurrences(rule, { fromMs: ms('2026-11-08T00:00:00Z'), toMs: ms('2027-06-01T00:00:00Z') });
    expect(window.map((o) => o.index)).toEqual([2, 3, 4]);
  });

  it('sem fim: a janela limita, e rodar duas vezes dá a mesma lista (o banco não duplica pela chave série + horário)', () => {
    const rule = normalizeRule({ kind: 'interval', interval_days: 1, time: '09:00', start_date: '2026-11-01' });
    const opts = { fromMs: ms('2026-11-05T00:00:00Z'), toMs: ms('2026-12-05T00:00:00Z') };
    const a = listOccurrences(rule, opts);
    const b = listOccurrences(rule, opts);
    expect(a).toHaveLength(30);
    expect(b).toEqual(a);
    expect(new Set(a.map((o) => o.at)).size).toBe(a.length);
  });

  it('ocorrência de um horário e continuação "este e os próximos"', () => {
    const rule = normalizeRule({ kind: 'interval', interval_days: 2, time: '08:00', start_date: '2026-11-02', end_kind: 'count', max_count: 6 });
    const third = occurrenceAt(rule, '2026-11-06T11:00:00.000Z');
    expect(third).toMatchObject({ index: 2, date: '2026-11-06' });
    expect(occurrenceAt(rule, '2026-11-07T11:00:00.000Z')).toBeNull();
    const next = continuationRule(rule, { fromDate: third!.date, fromIndex: third!.index }, { time: '18:00' });
    expect(next).toMatchObject({ start_date: '2026-11-06', time: '18:00', max_count: 4 });
    expect(dates(listOccurrences(next, { toMs: ms('2027-01-01T00:00:00Z') }))).toEqual(['2026-11-06', '2026-11-08', '2026-11-10', '2026-11-12']);
  });

  it('recusa regra inválida com a mensagem da tela', () => {
    expect(() => normalizeRule({ kind: 'weekly', weekdays: [], time: '08:00', start_date: '2026-11-02' })).toThrow('Escolha pelo menos um dia da semana');
    expect(() => normalizeRule({ kind: 'interval', interval_days: 0, time: '08:00', start_date: '2026-11-02' })).toThrow(/Repetir a cada/);
    expect(() => normalizeRule({ kind: 'interval', interval_days: 2, time: '8h', start_date: '2026-11-02' })).toThrow('Escolha a hora');
    expect(() => normalizeRule({ kind: 'interval', interval_days: 2, time: '08:00', start_date: '2026-02-31' })).toThrow('Escolha a data de início');
    expect(() => normalizeRule({ kind: 'interval', interval_days: 2, time: '08:00', start_date: '2026-11-02', end_kind: 'date', end_date: '2026-11-01' })).toThrow('O fim precisa ser depois do início');
  });

  it('resumo da regra', () => {
    expect(ruleSummary(normalizeRule({ kind: 'interval', interval_days: 2, time: '08:00', start_date: '2026-11-02' }))).toBe('A cada 2 dias às 08:00');
    expect(ruleSummary(normalizeRule({ kind: 'weekly', weekdays: [0], time: '08:00', start_date: '2026-11-02' }))).toBe('Toda segunda às 08:00');
    expect(ruleSummary(normalizeRule({ kind: 'weekly', weekdays: [6], time: '10:00', start_date: '2026-11-02' }))).toBe('Todo domingo às 10:00');
    expect(ruleSummary(normalizeRule({ kind: 'weekly', weekdays: [0, 2, 4], time: '08:00', start_date: '2026-11-02', end_kind: 'count', max_count: 10 })))
      .toBe('Seg, Qua e Sex às 08:00 · 10 vezes');
    expect(ruleSummary(normalizeRule({ kind: 'interval', interval_days: 1, time: '08:00', start_date: '2026-11-02', end_kind: 'date', end_date: '2026-11-30' })))
      .toBe('Todo dia às 08:00 · até 30/11/2026');
  });
});

describe('link do WhatsApp do cliente', () => {
  it('número com DDD ganha o 55 e a mensagem vai codificada', () => {
    expect(normalizeWhatsAppNumber('(62) 99999-1234')).toBe('5562999991234');
    expect(whatsappLink('62 99999-1234', 'Olá! Vi o story')).toBe('https://wa.me/5562999991234?text=Ol%C3%A1!%20Vi%20o%20story');
    expect(whatsappLink('5562999991234')).toBe('https://wa.me/5562999991234');
    expect(whatsappLink('123')).toBeNull();
  });

  it('endereço curto do cliente sem acento', () => {
    expect(storySlug('Clínica São José')).toBe('clinica-sao-jose-wa');
    expect(storySlug('Ótica & Cia', 2)).toBe('otica-cia-wa-2');
    expect(storySlug('')).toBe('cliente-wa');
  });
});
