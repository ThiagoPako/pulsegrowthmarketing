import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AgentWorkBadge from '@/components/kanban/AgentWorkBadge';
import AgentReviewBadge from '@/components/kanban/AgentReviewBadge';
import AgentReadinessBadge from '@/components/kanban/AgentReadinessBadge';

// Pulse Plus: os selos só aparecem para quem tem o acesso (lista do servidor)
const PLUS = vi.hoisted(() => ({ value: true }));
vi.mock('@/hooks/usePulsePlus', () => ({
  PULSE_PLUS_MODULE: 'pulse_plus',
  usePulsePlus: () => PLUS.value,
  usePulsePlusKnown: () => PLUS.value,
}));
afterEach(() => { PLUS.value = true; });

const BEA = 'agent-bea';
const ANA = 'human-ana';
const users = [{ id: BEA, name: 'Beatriz Agente' }, { id: ANA, name: 'Ana Editora' }, { id: 'uriel', name: 'Uriel Revisor' }];
const agents = new Set([BEA]);
const ago = (m: number) => new Date(Date.now() - m * 60000).toISOString();

describe('AgentWorkBadge', () => {
  it('mostra o agente editando, com a etapa', () => {
    render(<AgentWorkBadge task={{ kanban_column: 'edicao', assigned_to: BEA, agent_step: 'cortando', agent_heartbeat_at: ago(3) }} users={users} agentIds={agents} />);
    expect(screen.getByText(/Editando · Beatriz/)).toBeInTheDocument();
    expect(screen.getByText('cortando · há 3 min')).toBeInTheDocument();
  });

  it('na alteração vira "Em correção"', () => {
    render(<AgentWorkBadge task={{ kanban_column: 'alteracao', assigned_to: BEA, agent_step: 'iniciado', agent_heartbeat_at: ago(1) }} users={users} agentIds={agents} />);
    expect(screen.getByText(/Em correção · Beatriz/)).toBeInTheDocument();
    expect(screen.getByText('começando · há 1 min')).toBeInTheDocument();
  });

  it('etapa recente de outro agente mostra o nome de quem está mexendo', () => {
    const MARC = 'agent-marc';
    render(<AgentWorkBadge task={{ kanban_column: 'alteracao', assigned_to: BEA, agent_step: 'cor com a Íris', agent_step_by: MARC, agent_heartbeat_at: ago(0) }}
      users={[...users, { id: MARC, name: 'Marcely Chefe' }]} agentIds={new Set([BEA, MARC])} />);
    expect(screen.getByText(/Em correção · Marcely/)).toBeInTheDocument();
    expect(screen.getByText('cor com a Íris · agora')).toBeInTheDocument();
  });

  it('alteração sem dono com agente mexendo agora aparece; sinal velho não', () => {
    const live = render(<AgentWorkBadge task={{ kanban_column: 'alteracao', assigned_to: null, agent_step: 'traduzindo o pedido', agent_step_by: BEA, agent_heartbeat_at: ago(2) }} users={users} agentIds={agents} />);
    expect(screen.getByText(/Em correção · Beatriz/)).toBeInTheDocument();
    live.unmount();
    const old = render(<AgentWorkBadge task={{ kanban_column: 'alteracao', assigned_to: null, agent_step: 'traduzindo o pedido', agent_step_by: BEA, agent_heartbeat_at: ago(50) }} users={users} agentIds={agents} />);
    expect(old.container).toBeEmptyDOMElement();
  });

  it('sem sinal há 30 min ou mais aparece como parado', () => {
    render(<AgentWorkBadge task={{ kanban_column: 'edicao', assigned_to: BEA, agent_step: 'renderizando', agent_heartbeat_at: ago(45) }} users={users} agentIds={agents} />);
    expect(screen.getByText(/Edição parada · Beatriz/)).toBeInTheDocument();
    expect(screen.getByText('sem sinal há 45 min')).toBeInTheDocument();
  });

  it('card de humano não tem selo', () => {
    const { container } = render(<AgentWorkBadge task={{ kanban_column: 'edicao', assigned_to: ANA, agent_step: 'velho', agent_heartbeat_at: ago(2) }} users={users} agentIds={agents} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('AgentReviewBadge', () => {
  it('Análise com a revisão conferindo agora mostra a etapa ao vivo', () => {
    render(<AgentReviewBadge task={{ kanban_column: 'pre_revisao', edited_by: BEA, agent_step: 'folha a 30 qps nas trocas', agent_step_by: 'uriel', agent_heartbeat_at: ago(4) }} users={users} />);
    expect(screen.getByText(/Análise · Uriel/)).toBeInTheDocument();
    expect(screen.getByText('folha a 30 qps nas trocas · há 4 min')).toBeInTheDocument();
  });

  it('a etapa da entrega (pré-revisão do editor) não conta como conferência', () => {
    render(<AgentReviewBadge task={{ kanban_column: 'pre_revisao', edited_by: BEA, agent_step: 'pré-revisão', agent_step_by: BEA, agent_heartbeat_at: ago(1) }} users={users} />);
    expect(screen.getByText(/aguardando parecer/)).toBeInTheDocument();
  });

  it('Análise sem parecer: aguardando', () => {
    render(<AgentReviewBadge task={{ kanban_column: 'pre_revisao' }} users={users} />);
    expect(screen.getByText(/aguardando parecer/)).toBeInTheDocument();
  });

  it('parecer de ajustes mostra o que mudar e quem revisou', () => {
    render(<AgentReviewBadge task={{ kanban_column: 'pre_revisao', agent_review_verdict: 'ajustes', agent_review_notes: '00:08 título antes da fala', agent_review_by: 'uriel' }} users={users} />);
    expect(screen.getByText(/Parecer: ajustes · Uriel/)).toBeInTheDocument();
    expect(screen.getByText('00:08 título antes da fala')).toBeInTheDocument();
  });

  it('fora da Análise não mostra parecer (seria de versão antiga)', () => {
    const { container } = render(<AgentReviewBadge task={{ kanban_column: 'revisao', agent_review_verdict: 'ok' }} users={users} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('AgentReadinessBadge', () => {
  const base = { kanban_column: 'edicao', content_type: 'reels', client_id: 'c', drive_link: 'https://d', script_id: 's', editing_deadline: '2026-11-01T00:00:00Z' };

  it('pronto para a fila', () => {
    render(<AgentReadinessBadge task={base} agentIds={agents} />);
    expect(screen.getByText('Pronto p/ fila')).toBeInTheDocument();
  });

  it('bloqueado mostra só o obrigatório', () => {
    render(<AgentReadinessBadge task={{ ...base, drive_link: null, script_id: null }} agentIds={agents} />);
    expect(screen.getByText('Fila: falta brutos')).toBeInTheDocument();
  });

  it('detalhado lista cada item', () => {
    render(<AgentReadinessBadge task={{ ...base, script_id: null }} agentIds={agents} detailed />);
    expect(screen.getByText('O agente consegue pegar, mas falta informação.')).toBeInTheDocument();
    expect(screen.getByText(/Falta roteiro/)).toBeInTheDocument();
  });

  it('card fora da fila dos agentes não mostra nada', () => {
    const { container } = render(<AgentReadinessBadge task={{ ...base, assigned_to: ANA }} agentIds={agents} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('sem Pulse Plus', () => {
  it('nenhum selo de agente aparece, nem com os dados de agente no card', () => {
    PLUS.value = false;
    const base = { kanban_column: 'edicao', content_type: 'reels', client_id: 'c', drive_link: 'https://d', script_id: 's', editing_deadline: '2026-11-01T00:00:00Z' };
    const work = render(<AgentWorkBadge task={{ kanban_column: 'edicao', assigned_to: BEA, agent_step: 'cortando', agent_heartbeat_at: ago(3) }} users={users} agentIds={agents} />);
    expect(work.container).toBeEmptyDOMElement();
    const review = render(<AgentReviewBadge task={{ kanban_column: 'pre_revisao', agent_review_verdict: 'ajustes', agent_review_notes: 'x', agent_review_by: 'uriel' }} users={users} />);
    expect(review.container).toBeEmptyDOMElement();
    const waiting = render(<AgentReviewBadge task={{ kanban_column: 'pre_revisao' }} users={users} />);
    expect(waiting.container).toBeEmptyDOMElement();
    const ready = render(<AgentReadinessBadge task={base} agentIds={agents} detailed />);
    expect(ready.container).toBeEmptyDOMElement();
  });
});

describe('UrgentBadge', () => {
  it('aparece em Edição, Análise e Alteração com a urgência ligada', async () => {
    const { default: UrgentBadge } = await import('@/components/kanban/UrgentBadge');
    for (const col of ['edicao', 'pre_revisao', 'alteracao']) {
      const r = render(<UrgentBadge task={{ kanban_column: col, urgent_at: ago(1) }} />);
      expect(screen.getByText(/Urgente · prioridade total/)).toBeInTheDocument();
      r.unmount();
    }
  });

  it('some fora do fluxo de edição ou sem a marca', async () => {
    const { default: UrgentBadge } = await import('@/components/kanban/UrgentBadge');
    expect(render(<UrgentBadge task={{ kanban_column: 'revisao', urgent_at: ago(1) }} />).container).toBeEmptyDOMElement();
    expect(render(<UrgentBadge task={{ kanban_column: 'edicao', urgent_at: null }} />).container).toBeEmptyDOMElement();
  });
});
