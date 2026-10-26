import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ContentKanban from '@/pages/ContentKanban';

// A página é grande: com os outros testes rodando juntos, a primeira renderização passa de 5 s
const SLOW = 30_000;

/**
 * Teste de fumaça do Kanban de Conteúdo com o servidor simulado: ações por coluna (setas pelo
 * fluxo), Análise com parecer e Liberar/Devolver, selos de agente e o pedido de ajuste ao devolver.
 */

// vi.mock sobe para o topo do arquivo: os dados que os mocks usam também (vi.hoisted)
const { CLIENT, BEA, ADMIN, TASKS } = vi.hoisted(() => {
  const CLIENT = 'client-1';
  const BEA = 'agent-bea';
  const ADMIN = 'admin-1';
  const now = () => new Date().toISOString();
  const base = {
    client_id: CLIENT, description: null, recording_id: null, script_id: 'script-1', created_by: null, edited_by: null,
    scheduled_recording_date: null, scheduled_recording_time: null, drive_link: 'https://drive.google.com/brutos',
    edited_video_link: null, adjustment_notes: null, approved_at: null, approval_sent_at: null, editing_priority: false,
    immediate_alteration: false, review_deadline: null, alteration_deadline: null, approval_deadline: null,
    editing_deadline: '2099-01-01T12:00:00Z', position: 0, editing_started_at: null, created_at: now(), updated_at: now(),
    reviewing_by: null, reviewing_by_name: null, reviewing_at: null, prospect_name: null, assigned_to: null, city: 'minacu',
    content_type: 'reels',
  };
  const TASKS = [
    { ...base, id: 't-free', title: 'Fila livre', kanban_column: 'edicao' },
    { ...base, id: 't-agent', title: 'Com agente', kanban_column: 'edicao', assigned_to: BEA, edited_by: BEA, agent_step: 'renderizando', agent_heartbeat_at: now(), editing_started_at: now() },
    { ...base, id: 't-analise', title: 'Na analise', kanban_column: 'pre_revisao', edited_by: BEA, edited_video_link: 'https://agenciapulse.tech/uploads/v.mp4',
      agent_review_verdict: 'ajustes', agent_review_notes: '00:08 titulo antes da fala', agent_review_by: 'uriel' },
    { ...base, id: 't-revisao', title: 'Em revisao', kanban_column: 'revisao', edited_by: BEA, edited_video_link: 'https://x/v.mp4' },
    { ...base, id: 't-alt', title: 'Alteracao', kanban_column: 'alteracao', edited_by: BEA, edited_video_link: 'https://x/v.mp4', adjustment_notes: 'trocar musica', alteration_deadline: '2099-01-01T12:00:00Z' },
    { ...base, id: 't-envio', title: 'Enviado', kanban_column: 'envio', edited_by: BEA, edited_video_link: 'https://x/v.mp4' },
  ];
  return { CLIENT, BEA, ADMIN, TASKS };
});

vi.mock('@/lib/vpsDb', () => {
  const builder = () => {
    const b: any = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'or', 'not', 'order', 'limit', 'gte', 'lt', 'update', 'insert', 'delete', 'maybeSingle', 'single']) {
      b[m] = vi.fn(() => b);
    }
    b.then = (resolve: any, reject: any) => Promise.resolve({ data: [{ id: 'x' }], error: null }).then(resolve, reject);
    return b;
  };
  return {
    supabase: { from: vi.fn(() => builder()), rpc: vi.fn(async () => ({ data: null, error: null })) },
    vpsAuthedFetch: vi.fn(async (path: string, init?: RequestInit) => {
      if (path.includes('agents/office')) {
        return { ok: true, status: 200, json: async () => ({ agents: [{ user_id: BEA, working: true }] }) } as any;
      }
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const data = body.table === 'content_tasks' ? TASKS : [];
      return { ok: true, status: 200, json: async () => ({ data }) } as any;
    }),
  };
});

// Os contextos de verdade devolvem referências estáveis: os mocks também (senão os efeitos
// que dependem delas rodam a cada render, sem fim)
vi.mock('@/contexts/AppContext', () => {
  const value = {
    clients: [{ id: CLIENT, companyName: 'Clinica Teste', color: '200 50% 50%', whatsapp: '' }],
    recordings: [],
    scripts: [{ id: 'script-1', title: 'Roteiro', content: 'Fala', clientId: CLIENT, recorded: true, priority: 'normal' }],
    users: [{ id: BEA, name: 'Beatriz Agente' }, { id: ADMIN, name: 'Thiago Dono' }, { id: 'uriel', name: 'Uriel Revisor' }],
  };
  return { useApp: () => value };
});

vi.mock('@/hooks/useAuth', async (importOriginal) => {
  const value = { user: { id: ADMIN }, profile: { id: ADMIN, name: 'Thiago Dono', role: 'admin', roles: ['admin'] } };
  return { ...(await importOriginal<typeof import('@/hooks/useAuth')>()), useAuth: () => value };
});

vi.mock('@/contexts/CityContext', () => {
  const value = { activeCity: 'minacu', availableCities: ['minacu'], isLoading: false };
  return { CITY_LABELS: { minacu: 'Minaçu', uruacu: 'Uruaçu' }, useCity: () => value };
});

beforeAll(() => {
  // framer-motion e Radix usam estas APIs do navegador
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  (globalThis as any).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView = vi.fn();
});

const cardOf = (title: string) => document.getElementById(`task-card-t-${title}`) as HTMLElement;

describe('Kanban de Conteúdo — ações por coluna e agentes', () => {
  it('mostra selos de agente, Análise e setas que seguem o fluxo', async () => {
    render(<MemoryRouter><ContentKanban /></MemoryRouter>);
    await screen.findByText('Criação de Conteúdo', undefined, { timeout: 10_000 });
    await screen.findByText('Na analise', undefined, { timeout: 10_000 });

    // Edição: livre e pronta para a IA; com agente trabalhando sem setas
    expect(within(cardOf('free')).getByText('🤖 Pronto p/ IA')).toBeInTheDocument();
    expect(await within(cardOf('agent')).findByText(/Editando · Beatriz/)).toBeInTheDocument();
    expect(within(cardOf('agent')).queryByTitle(/Mover para/)).toBeNull();
    expect(within(cardOf('free')).getByTitle('Mover para Revisão')).toBeInTheDocument();

    // Análise: parecer e Liberar/Devolver (admin)
    const analise = cardOf('analise');
    expect(within(analise).getByText(/Parecer IA: ajustes · Uriel/)).toBeInTheDocument();
    expect(within(analise).getByText('Liberar p/ Revisão')).toBeInTheDocument();
    expect(within(analise).getByText(/Editado por · 🤖 IA/)).toBeInTheDocument();

    // Revisão: Aprovar e enviar / Ajustes, sem setas (a seta antiga ia para Alteração sem ajuste)
    const revisao = cardOf('revisao');
    expect(within(revisao).getByText('Aprovar e enviar')).toBeInTheDocument();
    expect(within(revisao).queryByTitle(/Mover para/)).toBeNull();

    // Alteração (admin): Reenviar Revisão e nenhuma seta para "Enviado p/ Cliente"
    const alt = cardOf('alt');
    expect(within(alt).getByText('Reenviar Revisão')).toBeInTheDocument();
    expect(within(alt).queryByTitle('Mover para Enviar ao cliente')).toBeNull();
    expect(within(alt).queryByTitle('Mover para Enviado p/ Cliente')).toBeNull();

    // Enviado p/ Cliente: a seta de volta pede o ajuste
    fireEvent.click(within(cardOf('envio')).getByTitle('Mover para Pedir ajuste'));
    expect(await screen.findByText('Solicitar Ajustes')).toBeInTheDocument();
  }, SLOW);

  it('Devolver da Análise abre o pedido de ajuste já com o parecer do revisor', async () => {
    render(<MemoryRouter><ContentKanban /></MemoryRouter>);
    await screen.findByText('Na analise', undefined, { timeout: 10_000 });
    fireEvent.click(within(cardOf('analise')).getByText('Devolver'));
    expect(await screen.findByText('Devolver da Análise para Alteração')).toBeInTheDocument();
    expect(screen.getByDisplayValue('00:08 titulo antes da fala')).toBeInTheDocument();
  }, SLOW);
});
