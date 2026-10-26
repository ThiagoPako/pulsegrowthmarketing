import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EditorKanban from '@/pages/EditorKanban';

/**
 * Teste de fumaça do Kanban de Edição com o servidor simulado: nomes iguais ao Kanban de Conteúdo,
 * quem editou na Análise, selos de agente, detalhe em qualquer card e confirmação ao mandar ao cliente.
 */

// vi.mock sobe para o topo do arquivo: os dados que os mocks usam também (vi.hoisted)
const { CLIENT, BEA, ADMIN, TASKS } = vi.hoisted(() => {
  const CLIENT = 'client-1';
  const BEA = 'agent-bea';
  const ADMIN = 'admin-1';
  const now = () => new Date().toISOString();
  const base = {
    client_id: CLIENT, description: null, recording_id: null, script_id: null, created_by: null, edited_by: null,
    drive_link: 'https://drive.google.com/brutos', edited_video_link: null, adjustment_notes: null, approved_at: null,
    approval_sent_at: null, editing_priority: false, immediate_alteration: false, review_deadline: null,
    alteration_deadline: null, approval_deadline: null, editing_deadline: '2099-01-01T12:00:00Z', position: 0,
    editing_started_at: null, created_at: now(), updated_at: now(), assigned_to: null, content_type: 'story',
    edited_video_type: null, editing_paused_at: null, editing_paused_seconds: 0,
  };
  const TASKS = [
    { ...base, id: 't-agent', title: 'Com agente', kanban_column: 'edicao', assigned_to: BEA, edited_by: BEA, agent_step: 'cortando', agent_heartbeat_at: now(), editing_started_at: now() },
    { ...base, id: 't-analise', title: 'Na analise', kanban_column: 'pre_revisao', edited_by: BEA, edited_video_link: 'https://agenciapulse.tech/uploads/v.mp4' },
    { ...base, id: 't-revisao', title: 'Em revisao', kanban_column: 'revisao', edited_by: BEA, edited_video_link: 'https://x/v.mp4' },
  ];
  return { CLIENT, BEA, ADMIN, TASKS };
});

// Pulse Plus (lista do servidor): o primeiro teste é de quem tem o acesso; o último, de quem não tem
const PLUS = vi.hoisted(() => ({ value: true }));
vi.mock('@/hooks/usePulsePlus', () => ({
  PULSE_PLUS_MODULE: 'pulse_plus',
  usePulsePlus: () => PLUS.value,
  usePulsePlusKnown: () => PLUS.value,
}));

vi.mock('@/lib/vpsDb', () => {
  // como o servidor: sem Pulse Plus, as colunas internas dos agentes saem nulas
  const strip = (t: Record<string, unknown>) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, k.startsWith('agent_') ? null : v]));
  const builder = (table: string) => {
    let write = false;
    const b: any = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'or', 'not', 'order', 'limit', 'gte', 'lt', 'maybeSingle', 'single']) {
      b[m] = vi.fn(() => b);
    }
    for (const m of ['update', 'insert', 'delete']) b[m] = vi.fn(() => { write = true; return b; });
    b.then = (resolve: any, reject: any) => Promise.resolve({
      data: write ? [{ id: 'x' }] : table === 'content_tasks' ? (PLUS.value ? TASKS : TASKS.map(strip)) : [],
      error: null,
    }).then(resolve, reject);
    return b;
  };
  const channel: any = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      from: vi.fn((table: string) => builder(table)),
      rpc: vi.fn(async () => ({ data: null, error: null })),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
    vpsAuthedFetch: vi.fn(async (path: string) => ({
      ok: true, status: 200,
      json: async () => (path.includes('agents/office') ? { agents: [{ user_id: BEA }] } : { data: [] }),
    })),
  };
});

vi.mock('@/contexts/AppContext', () => {
  const value = {
    clients: [{ id: CLIENT, companyName: 'Clinica Teste', color: '200 50% 50%', whatsapp: '' }],
    recordings: [],
    scripts: [],
    users: [{ id: BEA, name: 'Beatriz Agente' }, { id: ADMIN, name: 'Thiago Dono' }],
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
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  (globalThis as any).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView = vi.fn();
});

describe('Kanban de Edição — consistência e agentes', () => {
  it('mostra nomes do fluxo, quem editou, selos de agente e abre o detalhe de qualquer card', async () => {
    render(<MemoryRouter><EditorKanban /></MemoryRouter>);
    await screen.findByText('Kanban de Edição', undefined, { timeout: 10_000 });
    await screen.findByText('Na analise', undefined, { timeout: 10_000 });

    // Coluna com o mesmo nome do Kanban de Conteúdo (antes "Concluído")
    expect(screen.getAllByText('Enviado p/ Cliente').length).toBeGreaterThan(0);
    expect(screen.queryByText('Concluído')).toBeNull();

    // Agente editando e Análise com quem editou e aguardando parecer
    expect(await screen.findByText(/Editando · Beatriz/)).toBeInTheDocument();
    expect(screen.getByText(/aguardando parecer/)).toBeInTheDocument();
    expect(screen.getAllByText(/Editado por/).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryAllByText(/🤖|\bIA\b/)).toHaveLength(0);

    // Clique no card de revisão abre o detalhe; "Aprovar e enviar" pede confirmação
    fireEvent.click(screen.getByText('Em revisao'));
    const approve = await screen.findByText('Aprovar e enviar ao cliente');
    fireEvent.click(approve);
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Aprovar e enviar ao cliente?')).toBeInTheDocument();
  }, 30_000);

  it('sem Pulse Plus: sem selo nem texto de agente; o card mostra o responsável como qualquer outro', async () => {
    PLUS.value = false;
    try {
      render(<MemoryRouter><EditorKanban /></MemoryRouter>);
      await screen.findByText('Na analise', undefined, { timeout: 10_000 });
      expect(screen.queryByText(/Editando ·/)).toBeNull();
      expect(screen.queryByText(/aguardando parecer/)).toBeNull();
      expect(screen.queryByText(/Pronto p\/ fila/)).toBeNull();
      expect(screen.getAllByText(/Beatriz/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Editado por/).length).toBeGreaterThanOrEqual(2);
      // ("Beatriz Agente" e "Com agente" são o nome e o título dados pelo teste)
      expect((document.body.textContent || '').replace(/Beatriz Agente|Com agente/g, '')).not.toMatch(/agente|Agente|\bIA\b|🤖/);
    } finally {
      PLUS.value = true;
    }
  }, 30_000);
});
