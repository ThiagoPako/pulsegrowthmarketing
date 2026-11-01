import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  attachmentKind as serverKind, sanitizeAttachments, absoluteUploadUrl, trainingNotice,
} from '../../vps-api-server/lib/agentTraining.mjs';
import { attachmentKind, formatBytes, trainingUploadFolder } from '@/lib/agentTraining';

const sendTrainingMessage = vi.fn();
const fetchTrainingMessages = vi.fn();
const uploadFileToVps = vi.fn();
vi.mock('@/lib/agentTraining', async (orig) => {
  const real = await orig<typeof import('@/lib/agentTraining')>();
  return {
    ...real,
    sendTrainingMessage: (...a: unknown[]) => sendTrainingMessage(...a),
    fetchTrainingMessages: (...a: unknown[]) => fetchTrainingMessages(...a),
  };
});
vi.mock('@/services/vpsApi', () => ({ uploadFileToVps: (...a: unknown[]) => uploadFileToVps(...a) }));
vi.mock('@/contexts/AppContext', () => ({
  useApp: () => ({ clients: [{ id: 'cli-1', companyName: 'Naraely', status: 'ativo' }] }),
}));

import { AgentTrainingDialog } from '@/components/agents/AgentTrainingDialog';

const BASE = 'https://agenciapulse.tech/uploads';

describe('Treino dos agentes: regras do servidor', () => {
  it('classifica os anexos por tipo (servidor e tela iguais)', () => {
    const casos: [string, string, string][] = [
      ['print.png', 'image/png', 'imagem'],
      ['aula.MOV', '', 'video'],
      ['guia.pdf', 'application/pdf', 'pdf'],
      ['nota.txt', 'text/plain', 'texto'],
      ['audio.m4a', '', 'audio'],
      ['planilha.xlsx', '', 'arquivo'],
    ];
    for (const [name, mime, kind] of casos) {
      expect(serverKind(name, mime)).toBe(kind);
      expect(attachmentKind(name, mime)).toBe(kind);
    }
  });

  it('só aceita arquivos do /uploads do sistema e no máximo 10', () => {
    const ok = sanitizeAttachments([{ url: `${BASE}/treino-agentes/x/a.pdf`, name: 'a.pdf', type: 'application/pdf', size: 1200 }], BASE);
    expect(ok).toEqual([{ url: `${BASE}/treino-agentes/x/a.pdf`, name: 'a.pdf', type: 'application/pdf', kind: 'pdf', size: 1200 }]);
    expect(sanitizeAttachments(undefined, BASE)).toEqual([]);
    expect(() => sanitizeAttachments([{ url: 'https://outro-site.com/a.pdf' }], BASE)).toThrow(/fora dos arquivos/);
    expect(() => sanitizeAttachments([{ url: '/uploads/../segredo' }], BASE)).toThrow(/fora dos arquivos/);
    expect(() => sanitizeAttachments(Array.from({ length: 11 }, () => ({ url: '/uploads/a.png' })), BASE)).toThrow(/No máximo 10/);
  });

  it('monta o endereço completo do anexo para o agente baixar', () => {
    expect(absoluteUploadUrl('/uploads/treino-agentes/x/v.mp4', BASE)).toBe(`${BASE}/treino-agentes/x/v.mp4`);
    expect(absoluteUploadUrl(`${BASE}/a.png`, BASE)).toBe(`${BASE}/a.png`);
  });

  it('o recado ao agente diz quem ensinou, o cliente, um trecho e os anexos', () => {
    const notice = trainingNotice({ authorName: 'Naraely Souza', clientName: 'Labovitta', body: 'Legenda sempre em caixa alta', attachments: [{}, {}] });
    expect(notice).toContain('Ensinamento novo de Naraely · cliente Labovitta');
    expect(notice).toContain('"Legenda sempre em caixa alta"');
    expect(notice).toContain('+2 anexos');
    expect(notice).toContain('pulse treino');
  });

  it('helpers da tela', () => {
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5,0 MB');
    expect(trainingUploadFolder('abc-123/../x')).toBe('treino-agentes/abc-123x');
  });
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('Treino dos agentes: conversa com o agente', () => {
  beforeEach(() => {
    sendTrainingMessage.mockReset();
    fetchTrainingMessages.mockReset();
    uploadFileToVps.mockReset();
  });

  it('mostra os ensinamentos e a resposta do agente', async () => {
    fetchTrainingMessages.mockResolvedValue({
      agent: { user_id: 'ag-1', name: 'Beatriz', roles: 'editor' },
      messages: [
        { id: 'm1', author_id: 'u1', author_name: 'Naraely', from_agent: false, client_id: null, client_name: null, body: 'Corte o respiro', attachments: [], created_at: new Date().toISOString(), read_at: null },
        { id: 'm2', author_id: 'ag-1', author_name: 'Beatriz', from_agent: true, client_id: null, client_name: null, body: 'Entendido, vou cortar', attachments: [], created_at: new Date().toISOString(), read_at: null },
      ],
    });
    render(<AgentTrainingDialog agentId="ag-1" agentName="Beatriz" open onOpenChange={vi.fn()} />, { wrapper });
    expect(await screen.findByText('Corte o respiro')).toBeInTheDocument();
    expect(screen.getByText('Entendido, vou cortar')).toBeInTheDocument();
    expect(screen.getByText(/ainda não lido/)).toBeInTheDocument();
  });

  it('envia texto com anexo: sobe o arquivo e manda o endereço junto', async () => {
    fetchTrainingMessages.mockResolvedValue({ agent: { user_id: 'ag-1', name: 'Beatriz', roles: 'editor' }, messages: [] });
    uploadFileToVps.mockResolvedValue(`${BASE}/treino-agentes/ag-1/exemplo.mp4`);
    sendTrainingMessage.mockResolvedValue({ id: 'novo' });
    const { container } = render(<AgentTrainingDialog agentId="ag-1" agentName="Beatriz" open onOpenChange={vi.fn()} />, { wrapper });
    await screen.findByText(/Nenhum ensinamento ainda/);

    fireEvent.change(screen.getByLabelText('Ensinamento'), { target: { value: 'Assim é o corte seco' } });
    const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'exemplo.mp4', { type: 'video/mp4' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText('exemplo.mp4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /ensinar/i }));
    await waitFor(() => expect(sendTrainingMessage).toHaveBeenCalled());
    expect(uploadFileToVps.mock.calls[0][1]).toMatchObject({ folder: 'treino-agentes/ag-1' });
    expect(sendTrainingMessage).toHaveBeenCalledWith('ag-1', {
      body: 'Assim é o corte seco',
      client_id: null,
      attachments: [{ url: `${BASE}/treino-agentes/ag-1/exemplo.mp4`, name: 'exemplo.mp4', type: 'video/mp4', size: 1 }],
    });
  });

  it('sem texto e sem anexo não deixa enviar', async () => {
    fetchTrainingMessages.mockResolvedValue({ agent: { user_id: 'ag-1', name: 'Beatriz', roles: 'editor' }, messages: [] });
    render(<AgentTrainingDialog agentId="ag-1" agentName="Beatriz" open onOpenChange={vi.fn()} />, { wrapper });
    await screen.findByText(/Nenhum ensinamento ainda/);
    expect(screen.getByRole('button', { name: /ensinar/i })).toBeDisabled();
  });
});
