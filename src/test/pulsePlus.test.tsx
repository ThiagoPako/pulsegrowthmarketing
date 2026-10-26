import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Pulse Plus na tela: o acesso vem só da lista do servidor (GET /api/me/module-access), nunca do papel.
 * Sem o acesso, nada que marque alguém como agente aparece e a tela nem pergunta ao servidor quem é agente.
 * O interruptor "Acesso Pulse Plus" da Equipe só aparece para quem é admin e tem Pulse Plus.
 */

const STATE = vi.hoisted(() => ({
  modules: [] as string[],
  user: { id: 'admin-1', name: 'Thiago Dono', role: 'admin', roles: ['admin'] } as Record<string, unknown>,
  plusMembers: ['admin-1'] as string[],
  postStatus: 200,
  postError: '',
}));

vi.mock('@/hooks/useModuleAccess', () => ({
  useModuleAccess: () => ({ modules: STATE.modules, has: (m: string) => STATE.modules.includes(m), loading: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn() } }));

vi.mock('@/lib/vpsDb', () => {
  const builder = (table: string) => {
    const b: any = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'or', 'not', 'order', 'limit', 'gte', 'lt', 'update', 'insert', 'delete', 'maybeSingle', 'single']) {
      b[m] = vi.fn(() => b);
    }
    const data = table === 'profiles'
      ? [
          { id: 'admin-1', name: 'Thiago Dono', email: 't@x', role: 'admin' },
          { id: 'ed-1', name: 'Edson Editor', email: 'e@x', role: 'editor' },
          { id: 'ag-1', name: 'Bia', email: 'b@x', role: 'editor' },
        ]
      : [];
    b.then = (resolve: any, reject: any) => Promise.resolve({ data, error: null }).then(resolve, reject);
    return b;
  };
  return {
    supabase: { from: vi.fn((table: string) => builder(table)), rpc: vi.fn(async () => ({ data: null, error: null })) },
    vpsAuthedFetch: vi.fn(async (path: string, init?: RequestInit) => {
      if (path.includes('agents/office')) {
        return { ok: true, status: 200, json: async () => ({ agents: [{ user_id: 'ag-1' }] }) } as any;
      }
      if (path === '/team/pulse-plus') {
        return { ok: true, status: 200, json: async () => ({ members: STATE.plusMembers.map((user_id) => ({ user_id })) }) } as any;
      }
      if (/^\/team\/[^/]+\/pulse-plus$/.test(path)) {
        const ok = STATE.postStatus < 400;
        return { ok, status: STATE.postStatus, json: async () => (ok ? { ok: true } : { error: STATE.postError }) } as any;
      }
      return { ok: true, status: 200, json: async () => ({}) } as any;
    }),
  };
});

vi.mock('@/contexts/AppContext', () => ({ useApp: () => ({ currentUser: STATE.user }) }));
vi.mock('@/hooks/useAuth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useAuth')>()),
  useAuth: () => ({ signUp: vi.fn(), session: null, user: { id: STATE.user.id } }),
}));
vi.mock('@/contexts/CityContext', () => {
  const value = { activeCity: 'minacu', availableCities: ['minacu'], isLoading: false };
  return { CITY_LABELS: { minacu: 'Minaçu', uruacu: 'Uruaçu' }, useCity: () => value };
});
vi.mock('@/hooks/useUserPermissions', () => ({
  AVAILABLE_MODULES: [],
  useUserPermissions: () => ({ permissionsQuery: { data: [] }, setPermissions: { mutateAsync: vi.fn(), isPending: false } }),
}));
vi.mock('@/components/TeamMemberStats', () => ({ default: () => null }));
vi.mock('@/components/BirthdayCountdown', () => ({ default: () => null }));

import { usePulsePlus, usePulsePlusKnown } from '@/hooks/usePulsePlus';
import { useAgentIds } from '@/hooks/useAgentIds';
import { ownerFilterOptions, OWNER_FILTER_OPTIONS } from '@/lib/agentCardStatus';
import PulsePlusAccessSwitch from '@/components/team/PulsePlusAccessSwitch';
import Team from '@/pages/Team';
import { vpsAuthedFetch } from '@/lib/vpsDb';
import { toast } from 'sonner';

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
};

beforeAll(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  (globalThis as any).fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));
});

afterEach(() => {
  STATE.modules = [];
  STATE.user = { id: 'admin-1', name: 'Thiago Dono', role: 'admin', roles: ['admin'] };
  STATE.plusMembers = ['admin-1'];
  STATE.postStatus = 200;
  STATE.postError = '';
  vi.mocked(vpsAuthedFetch).mockClear();
});

const officeCalls = () => vi.mocked(vpsAuthedFetch).mock.calls.filter(([path]) => String(path).includes('agents/office')).length;

describe('usePulsePlus', () => {
  it('vem só da lista do servidor; o valor fica disponível para os selos de cada card', async () => {
    const { result, rerender } = renderHook(() => ({ plus: usePulsePlus(), known: usePulsePlusKnown() }));
    expect(result.current).toEqual({ plus: false, known: false });
    STATE.modules = ['pulse_plus'];
    rerender();
    await waitFor(() => expect(result.current).toEqual({ plus: true, known: true }));
    STATE.modules = ['agendamentos'];
    rerender();
    await waitFor(() => expect(result.current).toEqual({ plus: false, known: false }));
  });
});

describe('useAgentIds', () => {
  it('sem Pulse Plus devolve vazio e não pergunta ao servidor quem é agente', async () => {
    const { result } = renderHook(() => useAgentIds());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.size).toBe(0);
    expect(officeCalls()).toBe(0);
  });

  it('com Pulse Plus busca os agentes', async () => {
    STATE.modules = ['pulse_plus'];
    const { result } = renderHook(() => useAgentIds());
    await waitFor(() => expect(result.current.has('ag-1')).toBe(true));
    expect(officeCalls()).toBe(1);
  });
});

describe('filtro de responsável', () => {
  it('sem Pulse Plus não tem opção de agente', () => {
    const labels = ownerFilterOptions(false).map((o) => o.label).join(' ');
    expect(ownerFilterOptions(false).map((o) => o.value)).toEqual(['all', 'equipe', 'livre']);
    expect(labels).not.toMatch(/agente|fila|sinal|IA/i);
    expect(ownerFilterOptions(true)).toBe(OWNER_FILTER_OPTIONS);
  });
});

describe('interruptor Acesso Pulse Plus', () => {
  it('marca e desmarca pela rota nova e mostra o erro do servidor', async () => {
    const { rerender } = render(<PulsePlusAccessSwitch userId="ed-1" name="Edson" members={new Set(['admin-1'])} />, { wrapper });
    fireEvent.click(screen.getByRole('switch', { name: 'Acesso Pulse Plus de Edson' }));
    await waitFor(() => expect(vi.mocked(vpsAuthedFetch)).toHaveBeenCalledWith('/team/ed-1/pulse-plus', { method: 'POST' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Edson agora tem acesso Pulse Plus'));

    STATE.postStatus = 409;
    STATE.postError = 'É a última pessoa com acesso. Marque outra pessoa antes de tirar.';
    rerender(<PulsePlusAccessSwitch userId="admin-1" name="Thiago" members={new Set(['admin-1'])} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Acesso Pulse Plus de Thiago' }));
    await waitFor(() => expect(vi.mocked(vpsAuthedFetch)).toHaveBeenCalledWith('/team/admin-1/pulse-plus', { method: 'DELETE' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(STATE.postError));
  });
});

describe('tela Equipe', () => {
  it('admin sem Pulse Plus: nem o interruptor nem a palavra aparecem', async () => {
    render(<Team />, { wrapper });
    await screen.findByText('Edson Editor');
    expect(screen.queryByText(/Pulse Plus/)).toBeNull();
    expect(vi.mocked(vpsAuthedFetch).mock.calls.some(([path]) => String(path).includes('pulse-plus'))).toBe(false);
  });

  it('admin com Pulse Plus: um interruptor por membro, ligado para quem tem', async () => {
    STATE.modules = ['pulse_plus'];
    render(<Team />, { wrapper });
    await screen.findByText('Edson Editor');
    const switches = await screen.findAllByRole('switch', { name: /Acesso Pulse Plus de/ });
    expect(switches).toHaveLength(3);
    expect(screen.getByRole('switch', { name: 'Acesso Pulse Plus de Thiago Dono' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Acesso Pulse Plus de Edson Editor' })).toHaveAttribute('aria-checked', 'false');
  });

  it('com Pulse Plus mas sem ser admin: sem interruptor', async () => {
    STATE.modules = ['pulse_plus'];
    STATE.user = { id: 'gp-1', name: 'Gestora', role: 'gestor_projetos', roles: ['gestor_projetos'] };
    render(<Team />, { wrapper });
    await screen.findByText('Edson Editor');
    expect(screen.queryByText(/Pulse Plus/)).toBeNull();
  });
});
