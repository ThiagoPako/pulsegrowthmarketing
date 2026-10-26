import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import AgentWorkBadge from '@/components/kanban/AgentWorkBadge';
import AgentReviewBadge from '@/components/kanban/AgentReviewBadge';
import AgentReadinessBadge from '@/components/kanban/AgentReadinessBadge';

const BEA = 'agent-bea';
const ANA = 'human-ana';
const users = [{ id: BEA, name: 'Beatriz Agente' }, { id: ANA, name: 'Ana Editora' }, { id: 'uriel', name: 'Uriel Revisor' }];
const agents = new Set([BEA]);
const ago = (m: number) => new Date(Date.now() - m * 60000).toISOString();

describe('AgentWorkBadge', () => {
  it('mostra o agente editando, com a etapa', () => {
    render(<AgentWorkBadge task={{ kanban_column: 'edicao', assigned_to: BEA, agent_step: 'cortando', agent_heartbeat_at: ago(3) }} users={users} agentIds={agents} />);
    expect(screen.getByText(/Editando · Beatriz/)).toBeInTheDocument();
    expect(screen.getByText('cortando')).toBeInTheDocument();
  });

  it('na alteração vira "Em correção"', () => {
    render(<AgentWorkBadge task={{ kanban_column: 'alteracao', assigned_to: BEA, agent_step: 'iniciado', agent_heartbeat_at: ago(1) }} users={users} agentIds={agents} />);
    expect(screen.getByText(/Em correção · Beatriz/)).toBeInTheDocument();
    expect(screen.getByText('começando')).toBeInTheDocument();
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
