import { describe, expect, it } from 'vitest';
import {
  monthRange, previousMonthKey, buildMonthlyNumbers, editSeconds, summarizeNetwork, networkLine, monthlyMessage,
} from '../../vps-api-server/lib/socialReport.mjs';

describe('relatório mensal · período', () => {
  it('dá o mês, o anterior e o nome', () => {
    const r = monthRange('2026-03');
    expect(r).toMatchObject({ since: '2026-03-01', until: '2026-03-31', prevSince: '2026-02-01', prevUntil: '2026-02-28', label: 'março de 2026' });
    expect(monthRange('2026-01').prevMonth).toBe('2025-12');
    expect(() => monthRange('2026-13')).toThrow();
  });

  it('no dia 1 de novembro, o mês que fechou é outubro (Brasília)', () => {
    expect(previousMonthKey(new Date('2026-11-01T12:00:00Z'))).toBe('2026-10');
    // 1h da manhã do dia 1 em UTC ainda é dia 31 em Brasília
    expect(previousMonthKey(new Date('2026-11-01T01:00:00Z'))).toBe('2026-09');
  });
});

describe('relatório mensal · números', () => {
  const contentTasks = [
    { title: 'Reels dica', content_type: 'reels', kanban_column: 'aprovado', approved_at: '2026-10-10T15:00:00Z',
      editing_started_at: '2026-10-08T12:00:00Z', reviewing_at: '2026-10-08T14:00:00Z', editing_paused_seconds: 600 },
    { title: 'Criativo oferta', content_type: 'criativo', kanban_column: 'postado', approved_at: null, updated_at: '2026-10-20T15:00:00Z' },
    { title: 'Fora do mês', content_type: 'reels', kanban_column: 'aprovado', approved_at: '2026-09-30T12:00:00Z' },
    { title: 'Em edição', content_type: 'reels', kanban_column: 'edicao', approved_at: null, updated_at: '2026-10-20T15:00:00Z' },
  ];
  const designTasks = [
    { title: 'Feriado', kanban_column: 'concluida', completed_at: '2026-10-11T12:00:00Z', time_spent_seconds: 1800 },
    { title: 'Ainda fazendo', kanban_column: 'em_andamento', completed_at: null, time_spent_seconds: 900 },
  ];
  const posts = [{ status: 'postado', posted_at: '2026-10-05T12:00:00Z' }, { status: 'agendado', posted_at: null }];
  const recordings = [
    { date: '2026-10-03', status: 'concluida' }, { date: '2026-10-17', status: 'concluida' },
    { date: '2026-10-24', status: 'cancelada' }, { date: '2026-11-02', status: 'agendada' },
  ];
  const deliveryRecords = [{ date: '2026-10-03', videos_recorded: 5 }, { date: '2026-10-17', videos_recorded: 6 }];

  it('conta só o que foi entregue no mês e soma o tempo', () => {
    const n = buildMonthlyNumbers({ month: '2026-10', contentTasks, designTasks, posts, recordings, deliveryRecords, recordingMinutes: 90 });
    expect(n.deliveries.videos.total).toBe(2);
    expect(n.deliveries.videos.by_type.map((t) => t.type).sort()).toEqual(['Criativos', 'Reels']);
    expect(n.deliveries.arts.total).toBe(1);
    expect(n.deliveries.posts.total).toBe(1);
    expect(n.deliveries.recordings).toMatchObject({ scheduled: 2, done: 2, cancelled: 1, videos_recorded: 11, avg_videos_per_recording: 5.5 });
    // gravação 2 × 90 min = 3 h; edição 2 h − 10 min ≈ 1,8 h; design 0,5 h
    expect(n.time).toMatchObject({ recording_hours: 3, editing_hours: 1.8, design_hours: 0.5, total_hours: 5.3 });
  });

  it('edição esquecida aberta (mais de 8 h) não entra no tempo', () => {
    expect(editSeconds({ editing_started_at: '2026-10-01T10:00:00Z', approved_at: '2026-10-05T10:00:00Z' })).toBe(0);
    expect(editSeconds({ editing_started_at: null, approved_at: '2026-10-05T10:00:00Z' })).toBe(0);
  });
});

describe('relatório mensal · rede e mensagem', () => {
  const insights = { account_name: 'posto', followers_total: 1200, followers_gained: 35, reach: 8000, interactions: 640, profile_views: 300,
    posts: [{ caption: 'Promo\nlinha 2', reach: 3000, timestamp: '2026-10-05T12:00:00Z' }, { caption: 'Dica', reach: 5000 }] };
  const prev = { followers_gained: 20, reach: 6000, interactions: 700 };

  it('compara com o mês anterior e escolhe os posts que mais alcançaram', () => {
    const net = summarizeNetwork(insights, prev);
    expect(net.connected).toBe(true);
    expect(net.change?.reach).toBe(2000);
    expect(net.change?.interactions).toBe(-60);
    expect(net.top_posts?.[0].caption).toBe('Dica');
    expect(net.top_posts?.[1].caption).toBe('Promo');
    expect(networkLine(net)).toContain('8.000 contas alcançadas (+2.000)');
  });

  it('sem Instagram conectado, a rede sai como não conectada (nada inventado)', () => {
    const net = summarizeNetwork({ error: 'Cliente sem Instagram ou Facebook conectado.' }, null);
    expect(net.connected).toBe(false);
    expect(networkLine(net)).toBeNull();
  });

  it('a mensagem do dia 1 segue o rascunho aprovado', () => {
    const numbers = buildMonthlyNumbers({ month: '2026-10', recordings: [{ date: '2026-10-03', status: 'concluida' }], recordingMinutes: 60 });
    const msg = monthlyMessage({ clientName: 'Posto Naraely ', numbers, network: summarizeNetwork(insights, prev), suggestions: 'Story do café\n• Reels da troca de óleo', currentMonthName: 'novembro' });
    expect(msg).toContain('Bom dia, Posto Naraely! ☀️ Aqui é a Ísis, da Pulse.');
    expect(msg).toContain('Fechamos outubro');
    expect(msg).toContain('🎬 0 vídeos · 🎨 0 artes · 📲 0 posts · 🎥 1 gravações');
    expect(msg).toContain('⏱️ 1 h dedicadas');
    expect(msg).toContain('Para novembro, nossas sugestões:\n• Story do café\n• Reels da troca de óleo');
    expect(msg).not.toContain('relatório completo');
  });
});
