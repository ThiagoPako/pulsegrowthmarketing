import { describe, expect, it } from 'vitest';
import {
  agentReadiness,
  agentReviewOf,
  agentWorkState,
  cardOwnerKind,
  formatSince,
  matchesOwnerFilter,
  type AgentCardFields,
} from '@/lib/agentCardStatus';

const BEA = 'agent-bea';
const ANA = 'human-ana';
const agents = new Set([BEA]);
const NOW = new Date('2026-10-25T15:00:00Z').getTime();
const minutesAgo = (m: number) => new Date(NOW - m * 60000).toISOString();

const readyEdit: AgentCardFields = {
  kanban_column: 'edicao',
  content_type: 'reels',
  client_id: 'c1',
  assigned_to: null,
  drive_link: 'https://drive.google.com/x',
  script_id: 's1',
  editing_deadline: '2026-10-27T15:00:00Z',
};

describe('agentReadiness', () => {
  it('card de edição completo e livre está pronto para a IA', () => {
    const r = agentReadiness(readyEdit, { agentIds: agents });
    expect(r).toEqual({ inQueue: true, ready: true, blocked: false, missing: [] });
  });

  it('sem brutos ou sem cliente bloqueia (o pulse pegar recusa)', () => {
    const r = agentReadiness({ ...readyEdit, drive_link: '  ', client_id: null });
    expect(r.blocked).toBe(true);
    expect(r.ready).toBe(false);
    expect(r.missing.map((m) => m.key)).toEqual(['brutos', 'cliente']);
  });

  it('roteiro e prazo são recomendados, não bloqueiam', () => {
    const r = agentReadiness({ ...readyEdit, script_id: null, editing_deadline: null });
    expect(r.blocked).toBe(false);
    expect(r.ready).toBe(false);
    expect(r.missing.map((m) => [m.key, m.blocking])).toEqual([['roteiro', false], ['prazo', false]]);
  });

  it('story não exige roteiro', () => {
    const r = agentReadiness({ ...readyEdit, content_type: 'story', script_id: null });
    expect(r.ready).toBe(true);
  });

  it('otimização e arte não são editadas por agente', () => {
    const otim = agentReadiness({ ...readyEdit, content_type: 'otimizacao' });
    expect(otim.inQueue).toBe(false);
    expect(otim.missing.find((m) => m.key === 'tipo')?.blocking).toBe(true);
    const arte = agentReadiness({ ...readyEdit, content_type: 'arte' });
    expect(arte.blocked).toBe(true);
  });

  it('card com humano não está na fila dos agentes; atribuído a um agente (sem pegar) está', () => {
    expect(agentReadiness({ ...readyEdit, assigned_to: ANA }, { agentIds: agents }).inQueue).toBe(false);
    expect(agentReadiness({ ...readyEdit, assigned_to: BEA }, { agentIds: agents }).inQueue).toBe(true);
  });

  it('card já pego pelo agente sai da fila (o selo de trabalho assume)', () => {
    const r = agentReadiness({ ...readyEdit, assigned_to: BEA, agent_step: 'cortando' }, { agentIds: agents });
    expect(r.inQueue).toBe(false);
  });

  it('alteração entra na fila só se o vídeo foi feito por agente e exige o texto do ajuste', () => {
    const base: AgentCardFields = {
      ...readyEdit,
      kanban_column: 'alteracao',
      edited_by: BEA,
      editing_deadline: null,
      alteration_deadline: '2026-10-26T15:00:00Z',
      adjustment_notes: '00:12 trocar a música',
    };
    expect(agentReadiness(base, { agentIds: agents })).toMatchObject({ inQueue: true, ready: true });
    expect(agentReadiness({ ...base, edited_by: ANA }, { agentIds: agents }).inQueue).toBe(false);
    const semAjuste = agentReadiness({ ...base, adjustment_notes: '' }, { agentIds: agents });
    expect(semAjuste.blocked).toBe(true);
    expect(semAjuste.missing[0].key).toBe('ajustes');
  });

  it('alteração imediata não precisa de prazo', () => {
    const r = agentReadiness({
      ...readyEdit, kanban_column: 'alteracao', edited_by: BEA, adjustment_notes: 'x',
      alteration_deadline: null, immediate_alteration: true,
    }, { agentIds: agents });
    expect(r.missing).toEqual([]);
  });
});

describe('agentWorkState', () => {
  const working: AgentCardFields = { kanban_column: 'edicao', assigned_to: BEA, agent_step: 'renderizando', agent_heartbeat_at: minutesAgo(5) };

  it('agente com sinal recente está trabalhando', () => {
    expect(agentWorkState(working, { agentIds: agents, now: NOW })).toEqual({ state: 'working', column: 'edicao', step: 'renderizando', minutes: 5 });
  });

  it('sem sinal há 30 min ou mais fica parado', () => {
    const s = agentWorkState({ ...working, agent_heartbeat_at: minutesAgo(45) }, { now: NOW });
    expect(s?.state).toBe('stale');
    expect(s?.minutes).toBe(45);
    expect(agentWorkState({ ...working, agent_heartbeat_at: null }, { now: NOW })).toMatchObject({ state: 'stale', minutes: null });
  });

  it('"iniciado" aparece como "começando"; vale também na alteração', () => {
    expect(agentWorkState({ ...working, kanban_column: 'alteracao', agent_step: 'iniciado' }, { now: NOW })).toMatchObject({ column: 'alteracao', step: 'começando' });
  });

  it('fora de edição/alteração, sem etapa ou com dono humano não há selo', () => {
    expect(agentWorkState({ ...working, kanban_column: 'pre_revisao' }, { now: NOW })).toBeNull();
    expect(agentWorkState({ ...working, agent_step: null }, { now: NOW })).toBeNull();
    expect(agentWorkState({ ...working, assigned_to: ANA }, { agentIds: agents, now: NOW })).toBeNull();
    // ids dos agentes ainda não carregados: confia no agent_step
    expect(agentWorkState({ ...working, assigned_to: ANA }, { agentIds: new Set(), now: NOW })).not.toBeNull();
  });
});

describe('cardOwnerKind e filtro de responsável', () => {
  it('classifica pelo responsável ou por quem editou', () => {
    expect(cardOwnerKind({ assigned_to: BEA }, agents)).toBe('ia');
    expect(cardOwnerKind({ assigned_to: null, edited_by: BEA, kanban_column: 'pre_revisao' }, agents)).toBe('ia');
    expect(cardOwnerKind({ assigned_to: ANA, edited_by: BEA }, agents)).toBe('equipe');
    expect(cardOwnerKind({}, agents)).toBe('livre');
  });

  it('filtros "pronto para a IA" e "agente sem sinal"', () => {
    expect(matchesOwnerFilter(readyEdit, 'pronto_ia', agents, NOW)).toBe(true);
    expect(matchesOwnerFilter({ ...readyEdit, drive_link: null }, 'pronto_ia', agents, NOW)).toBe(false);
    const stale: AgentCardFields = { kanban_column: 'edicao', assigned_to: BEA, agent_step: 'cortando', agent_heartbeat_at: minutesAgo(90) };
    expect(matchesOwnerFilter(stale, 'ia_parada', agents, NOW)).toBe(true);
    expect(matchesOwnerFilter({ ...stale, agent_heartbeat_at: minutesAgo(2) }, 'ia_parada', agents, NOW)).toBe(false);
    expect(matchesOwnerFilter(stale, 'all', agents, NOW)).toBe(true);
  });
});

describe('agentReviewOf e formatSince', () => {
  it('lê só pareceres válidos', () => {
    expect(agentReviewOf({ agent_review_verdict: 'ok', agent_review_notes: '  ' })).toEqual({ verdict: 'ok', notes: null, at: null, by: null });
    expect(agentReviewOf({ agent_review_verdict: 'ajustes', agent_review_notes: '00:10 legenda' })?.notes).toBe('00:10 legenda');
    expect(agentReviewOf({ agent_review_verdict: 'talvez' })).toBeNull();
    expect(agentReviewOf({})).toBeNull();
  });

  it('formata o tempo sem sinal', () => {
    expect(formatSince(0)).toBe('1 min');
    expect(formatSince(45)).toBe('45 min');
    expect(formatSince(130)).toBe('2 h');
    expect(formatSince(3 * 1440)).toBe('3 d');
  });
});
