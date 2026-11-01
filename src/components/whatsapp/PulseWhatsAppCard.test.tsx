import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PulseWhatsAppCard from '@/components/whatsapp/PulseWhatsAppCard';

// /api/whatsapp/connections de mentira: o cartão só usa as rotas que a tela de Conexões já usa
type Conn = Record<string, unknown>;
let connections: Conn[] = [];
const calls: { path: string; method: string; body: unknown }[] = [];

vi.mock('@/lib/vpsDb', () => ({
  vpsAuthedFetch: async (path: string, init: RequestInit = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, method, body });
    let payload: unknown = { ok: true };
    if (path === '/whatsapp/connections' && method === 'GET') payload = { connections, engine_alive: true };
    if (path === '/whatsapp/connections' && method === 'POST') {
      const created = { id: 'nova', name: body.name, purposes: body.purposes, status: 'nova', qr_image: null, pairing_code: null, phone: null, push_name: null, last_error: null, connected_at: null, last_seen_at: null };
      connections = [...connections, created];
      payload = { connection: created };
    }
    if (/\/connect$/.test(path)) {
      connections = connections.map((c) => (path.includes(String(c.id)) ? { ...c, status: 'qr', qr_image: 'data:image/png;base64,AAAA' } : c));
    }
    if (method === 'PATCH') {
      connections = connections.map((c) => (path.endsWith(String(c.id)) ? { ...c, purposes: body.purposes } : c));
    }
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  },
}));

const base = { qr_image: null, pairing_code: null, phone: null, push_name: null, last_error: null, connected_at: null, last_seen_at: null };

describe('PulseWhatsAppCard', () => {
  beforeEach(() => {
    connections = [];
    calls.length = 0;
  });

  it('sem conexão: cria "PULSE" só com a função assistente e já mostra o QR com as instruções', async () => {
    connections = [{ ...base, id: 'aprov', name: 'Aprovações', purposes: ['aprovacao'], status: 'conectada' }];
    render(<PulseWhatsAppCard />);
    fireEvent.click(await screen.findByRole('button', { name: /Conectar WhatsApp da PULSE/ }));
    await screen.findByAltText('QR Code do WhatsApp da PULSE');
    const create = calls.find((c) => c.path === '/whatsapp/connections' && c.method === 'POST');
    expect(create?.body).toEqual({ name: 'PULSE', purposes: ['assistente'] });
    expect(calls.some((c) => c.path === '/whatsapp/connections/nova/connect' && c.method === 'POST')).toBe(true);
    expect(screen.getByText(/Aparelhos conectados → Conectar aparelho/)).toBeInTheDocument();
    expect(screen.getByText(/Aguardando leitura do QR/)).toBeInTheDocument();
  });

  it('adota a conexão "PULSE" sem funções, sem criar outra nem pedir QR', async () => {
    connections = [{ ...base, id: 'p1', name: 'Pulse', purposes: [], status: 'conectada', phone: '5562900000001' }];
    render(<PulseWhatsAppCard />);
    fireEvent.click(await screen.findByRole('button', { name: /Usar esta conexão para a PULSE/ }));
    await waitFor(() => expect(screen.getByText(/Conectado/)).toBeInTheDocument());
    expect(calls.find((c) => c.method === 'PATCH')).toEqual({ path: '/whatsapp/connections/p1', method: 'PATCH', body: { purposes: ['assistente'] } });
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('conectado: mostra número, perfil, último sinal e os botões Testar envio e Desconectar', async () => {
    connections = [{ ...base, id: 'p1', name: 'PULSE', purposes: ['assistente'], status: 'conectada', phone: '5562900000001', push_name: 'PULSE Agência', last_seen_at: new Date().toISOString() }];
    render(<PulseWhatsAppCard />);
    expect(await screen.findByText(/Conectado/)).toBeInTheDocument();
    expect(screen.getByText(/\+55 \(62\) 90000-0001 · PULSE Agência/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Testar envio/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Desconectar/ })).toBeInTheDocument();
    expect(screen.getByText(/pode ficar nos grupos dos clientes/i)).toBeInTheDocument();
    expect(screen.getByText(/só responde comando de números cadastrados/i)).toBeInTheDocument();
    expect(screen.queryByText(/não adicione este número/i)).not.toBeInTheDocument();
  });

  it('desconectado: mostra o erro e o botão Reconectar', async () => {
    connections = [{ ...base, id: 'p1', name: 'PULSE', purposes: ['assistente'], status: 'desconectada', last_error: 'O número saiu do sistema (desconectado no celular).' }];
    render(<PulseWhatsAppCard />);
    expect(await screen.findByText(/Desconectado/)).toBeInTheDocument();
    expect(screen.getByText(/O número saiu do sistema/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Reconectar/ }));
    await waitFor(() => expect(calls.some((c) => c.path === '/whatsapp/connections/p1/connect')).toBe(true));
  });
});
