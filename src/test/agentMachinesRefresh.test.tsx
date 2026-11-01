import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { AGENT_KEYS_CHANGED_EVENT } from '@/lib/agentRoles';

const responses: unknown[] = [];
const vpsAuthedFetch = vi.fn(async () => new Response(JSON.stringify(responses.shift() ?? responses[0]), { status: 200 }));
vi.mock('@/lib/vpsDb', () => ({ vpsAuthedFetch: (...a: unknown[]) => vpsAuthedFetch(...(a as [])) }));

import AgentMachinesCard from '@/components/settings/AgentMachinesCard';

const agent = (user_id: string, name: string, role: string) => ({ user_id, name, role, email: `${user_id}@pulse`, active: true, machine_id: null, last_used_at: null, avatar_url: null });
const semVictoria = { machines: [], agents: [agent('davi', 'Davi', 'editor')], clients_bundle: null };
const comVictoria = { ...semVictoria, agents: [...semVictoria.agents, agent('vic', 'Victoria', 'roteirista')] };

describe('Computadores dos agentes: lista de agentes atualizada', () => {
  beforeEach(() => {
    responses.length = 0;
    vpsAuthedFetch.mockClear();
  });

  it('chave gerada ou revogada no quadro "Agentes de edição" relê a lista na hora', async () => {
    responses.push(semVictoria, comVictoria);
    render(<AgentMachinesCard />);
    await waitFor(() => expect(vpsAuthedFetch).toHaveBeenCalledTimes(1));
    await act(async () => { window.dispatchEvent(new Event(AGENT_KEYS_CHANGED_EVENT)); });
    await waitFor(() => expect(vpsAuthedFetch).toHaveBeenCalledTimes(2));
  });

  it('abrir "Conectar outro computador" mostra o agente que ganhou chave depois que a página abriu', async () => {
    responses.push(semVictoria, comVictoria);
    render(<AgentMachinesCard />);
    await waitFor(() => expect(vpsAuthedFetch).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole('button', { name: /Conectar outro computador/ }));
    expect(await screen.findByText('Victoria')).toBeInTheDocument();
    expect(screen.getByText('Roteirista (Copy)')).toBeInTheDocument();
  });
});
