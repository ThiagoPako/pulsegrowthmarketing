import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  buildVictoriaPrompt, buildVictoriaContext, parseVictoriaReply, normalizeLessons, scriptPlainText, searchResultUrls,
  scriptToHtml as serverHtml, partialScript as serverPartial, parseResearch,
} from '../../vps-api-server/lib/victoria.mjs';
import { conversationPayload, scriptToHtml, partialScript } from '@/lib/victoria';

const askVictoria = vi.fn();
const fetchVictoriaInfo = vi.fn();
const prepareVictoria = vi.fn();
const addScript = vi.fn();
vi.mock('@/lib/victoria', async (orig) => {
  const real = await orig<typeof import('@/lib/victoria')>();
  return {
    ...real,
    askVictoria: (...a: unknown[]) => askVictoria(...a),
    fetchVictoriaInfo: (...a: unknown[]) => fetchVictoriaInfo(...a),
    prepareVictoria: (...a: unknown[]) => prepareVictoria(...a),
  };
});
vi.mock('@/contexts/AppContext', () => ({
  useApp: () => ({
    clients: [
      { id: 'cli-1', companyName: 'Posto Naraely', niche: 'Posto de combustível', status: 'ativo', color: '0 72% 51%' },
      { id: 'cli-2', companyName: 'Clínica Sorriso', niche: 'Odontologia', status: 'ativo', color: '200 80% 55%' },
    ],
    addScript: (...a: unknown[]) => addScript(...a),
  }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-naraely' } }) }));

import VictoriaDialog from '@/components/copy/VictoriaDialog';

const client = { company_name: 'Posto Naraely', niche: 'Posto de combustível', city: 'Minaçu', editorial: 'Atendimento rápido e preço justo' };

describe('Victoria: pedido ao Claude', () => {
  it('leva nicho, editorial, roteiros do cliente, regras e a correção', () => {
    const prompt = buildVictoriaPrompt({
      client,
      format: 'reels',
      videoType: 'vendas',
      ownScripts: [{ title: 'Troca de óleo', content: '<p>"Seu carro merece"</p><p>[take da bomba]</p>', content_format: 'reels', video_type: 'vendas', recorded: true }],
      agencyScripts: [{ title: 'Outro', content: '<p>texto longo do roteiro de outra marca</p>', content_format: 'reels', client_name: 'A3P', recorded: true }],
      lessons: [{ scope: 'cliente', rule: 'Sempre citar o café grátis' }, { scope: 'geral', rule: 'Gancho em até 2 frases' }],
      conversation: [
        { role: 'pedido', text: 'promo de sexta' },
        { role: 'victoria', text: 'versão 1' },
        { role: 'correcao', text: 'tira o preço' },
      ],
      research: { text: '- gancho com pergunta', date: '01/11/2026' },
    });
    expect(prompt).toContain('Nicho: Posto de combustível');
    expect(prompt).toContain('Atendimento rápido e preço justo');
    expect(prompt).toContain('"Seu carro merece"\n[take da bomba]');
    expect(prompt).toContain('Aprendizados deste cliente (regras):\n- Sempre citar o café grátis');
    expect(prompt).toContain('Aprendizados gerais da agência (regras):\n- Gancho em até 2 frases');
    expect(prompt).toContain('· A3P');
    expect(prompt).toContain('O que está em alta no nicho agora (pesquisa de 01/11/2026)');
    expect(prompt).toContain('Correção da equipe:\n"""tira o preço"""');
    expect(prompt).toMatch(/Refaça o roteiro aplicando a correção/);
  });

  it('o contexto do cliente não muda com a conversa (fica em cache) e sem roteiros avisa', () => {
    const base = { client: { company_name: 'X' }, format: 'story', videoType: 'x' };
    expect(buildVictoriaContext(base)).toBe(buildVictoriaContext({ ...base, conversation: [{ role: 'pedido', text: 'outra' }] }));
    const prompt = buildVictoriaPrompt({ ...base, conversation: [{ role: 'pedido', text: 'ideia' }] });
    expect(prompt).toContain('Este cliente ainda não tem roteiro no sistema.');
    expect(prompt).not.toContain('em alta no nicho agora');
    expect(prompt).toContain('Story');
    expect(prompt.trim().endsWith('Escreva o roteiro a partir da ideia.')).toBe(true);
  });

  it('lê o JSON da resposta mesmo com texto em volta e filtra links e regras', () => {
    const reply = parseVictoriaReply(`Aqui está:\n\`\`\`json\n${JSON.stringify({
      titulo: 'Sexta do óleo',
      roteiro: '"Gancho"\n[take]',
      legenda: 'Passa aqui!',
      referencias: [{ titulo: 'ok', url: 'https://instagram.com/p/1', por_que: 'gancho' }, { titulo: 'ruim', url: 'javascript:alert(1)' }],
      observacoes: '',
      aprendizados: [{ escopo: 'geral', regra: 'Nunca prometer preço' }, { escopo: 'cliente', regra: 'nunca prometer  preço' }, 'curto'],
    })}\n\`\`\``);
    expect(reply.titulo).toBe('Sexta do óleo');
    expect(reply.roteiro).toBe('"Gancho"\n[take]');
    expect(reply.referencias).toEqual([{ titulo: 'ok', url: 'https://instagram.com/p/1', por_que: 'gancho' }]);
    expect(reply.aprendizados).toEqual([{ scope: 'geral', rule: 'Nunca prometer preço' }]);
  });

  it('lê a resposta em seções (o formato que chega por streaming)', () => {
    const text = 'TÍTULO: Sexta do óleo\nROTEIRO:\n"Gancho"\n[take]\nLEGENDA: Vem!\nOBSERVAÇÕES: preencher o preço\nAPRENDIZADOS:\n- [geral] Nunca prometer preço\n- citar o café';
    expect(parseVictoriaReply(text)).toMatchObject({
      titulo: 'Sexta do óleo', roteiro: '"Gancho"\n[take]', legenda: 'Vem!', observacoes: 'preencher o preço',
      aprendizados: [{ scope: 'geral', rule: 'Nunca prometer preço' }, { scope: 'cliente', rule: 'citar o café' }],
    });
    const parcial = 'TÍTULO: x\nROTEIRO:\n"Seu carro pede';
    expect(partialScript(parcial)).toBe('"Seu carro pede');
    expect(serverPartial(parcial)).toBe(partialScript(parcial));
    expect(partialScript(text)).toBe('"Gancho"\n[take]');
    expect(partialScript('TÍTULO: só o título')).toBe('');
  });

  it('pesquisa do nicho: tópicos e só links que vieram da busca', () => {
    const r = parseResearch('- gancho com pergunta\n- bastidor\nLINKS:\nA | https://a.com | bom\nB | https://inventado.com | x\nC | sem link', new Set(['https://a.com']));
    expect(r.text).toBe('- gancho com pergunta\n- bastidor');
    expect(r.refs).toEqual([{ titulo: 'A', url: 'https://a.com', por_que: 'bom' }]);
  });

  it('sem JSON, o texto inteiro vira o roteiro', () => {
    expect(parseVictoriaReply('roteiro solto')?.roteiro).toBe('roteiro solto');
    expect(parseVictoriaReply('')).toBeNull();
  });

  it('regras: escopo cliente por padrão e no máximo 6', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ regra: `Regra número ${i}` }));
    const out = normalizeLessons(many);
    expect(out).toHaveLength(6);
    expect(out[0]).toEqual({ scope: 'cliente', rule: 'Regra número 0' });
  });

  it('links das buscas e conversão de HTML', () => {
    const urls = searchResultUrls([
      { type: 'text', text: 'oi' },
      { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://a.com' }] },
      { type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } },
    ]);
    expect([...urls]).toEqual(['https://a.com']);
    expect(scriptPlainText('<p>a &amp; b</p><p>c<br/>d</p>')).toBe('a & b\nc\nd');
    expect(scriptToHtml('a <b>\n\n**c**')).toBe('<p>a &lt;b&gt;</p><p><strong>c</strong></p>');
    expect(serverHtml('a <b>\n\n**c**')).toBe(scriptToHtml('a <b>\n\n**c**'));
  });

  it('a versão da Victoria vai para o servidor como o roteiro dela', () => {
    const payload = conversationPayload([
      { role: 'pedido', text: 'ideia' },
      { role: 'victoria', text: 'r', reply: { titulo: 'T', roteiro: 'R', legenda: 'L', referencias: [], observacoes: '', aprendizados: [], usados: { roteiros_cliente: 0, roteiros_agencia: 0, regras: 0, pesquisou: false } } },
    ]);
    expect(payload[1]).toEqual({ role: 'victoria', text: 'T\n\nR\n\nLEGENDA: L' });
  });
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const reply = (extra = {}) => ({
  titulo: 'Sexta do óleo', roteiro: '"Sexta tem troca de óleo"\n[take da bomba]', legenda: 'Vem pro posto!', referencias: [],
  observacoes: '', aprendizados: [], usados: { roteiros_cliente: 3, roteiros_agencia: 2, regras: 1, pesquisou: true }, ...extra,
});

describe('Victoria: tela no Copy', () => {
  beforeEach(() => {
    askVictoria.mockReset();
    addScript.mockReset();
    fetchVictoriaInfo.mockReset();
    prepareVictoria.mockReset();
    prepareVictoria.mockResolvedValue({ ready: true, research: 'pronta', research_date: '01/11/2026', usados: { roteiros_cliente: 3, roteiros_agencia: 2, regras: 1 } });
    fetchVictoriaInfo.mockResolvedValue({
      victoria: { registered: true, user_id: 'vic', name: 'Victoria', avatar_url: null },
      client: { id: 'cli-1', company_name: 'Posto Naraely', niche: 'Posto', city: null, editorial: 'Preço justo' },
      scripts: { total: 5, recorded: 3 },
      lessons: [],
    });
  });

  it('cliente → tipo → ideia → correção → salva no cliente', async () => {
    askVictoria.mockImplementationOnce(async (_payload: unknown, onText?: (t: string) => void) => {
      onText?.('TÍTULO: Sexta\nROTEIRO:\n"Sexta tem');
      return reply();
    }).mockResolvedValueOnce(reply({
      roteiro: '"Sexta tem óleo e café grátis"', aprendizados: [{ id: 'l1', client_id: 'cli-1', scope: 'cliente', rule: 'Citar o café grátis', created_by_name: 'Naraely', created_at: '' }],
    }));
    addScript.mockResolvedValue(true);
    const onOpenChange = vi.fn();
    render(<VictoriaDialog open onOpenChange={onOpenChange} />, { wrapper });

    fireEvent.click(screen.getByRole('button', { name: /Posto Naraely/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Criativo/ }));
    fireEvent.click(screen.getByRole('button', { name: /Abrir a Victoria/ }));
    expect(prepareVictoria).toHaveBeenCalledWith({ client_id: 'cli-1', content_format: 'criativo', video_type: 'vendas' });
    expect(await screen.findByText('(pesquisa de 01/11/2026)')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Ideia do roteiro'), { target: { value: 'promo de troca de óleo na sexta' } });
    fireEvent.click(screen.getByRole('button', { name: /Escrever roteiro/ }));
    expect(await screen.findByText(/Sexta tem troca de óleo/)).toBeInTheDocument();
    expect(askVictoria.mock.calls[0][0]).toEqual({
      client_id: 'cli-1', content_format: 'criativo', video_type: 'vendas', search: true,
      conversation: [{ role: 'pedido', text: 'promo de troca de óleo na sexta' }],
    });
    expect(typeof askVictoria.mock.calls[0][1]).toBe('function');

    fireEvent.change(screen.getByLabelText('Correção para a Victoria'), { target: { value: 'fala do café grátis' } });
    fireEvent.click(screen.getByRole('button', { name: /Refazer com a correção/ }));
    expect(await screen.findByText(/café grátis"/)).toBeInTheDocument();
    const second = askVictoria.mock.calls[1][0];
    expect(second.search).toBe(true); // a pesquisa já está guardada: não atrasa a correção
    expect(second.conversation.map((t: { role: string }) => t.role)).toEqual(['pedido', 'victoria', 'correcao']);
    expect(screen.getByText(/Aprendi: Citar o café grátis/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Usar este roteiro/ }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar roteiro/ }));
    await waitFor(() => expect(addScript).toHaveBeenCalled());
    const script = addScript.mock.calls[0][0];
    expect(script).toMatchObject({ clientId: 'cli-1', contentFormat: 'criativo', videoType: 'vendas', title: 'Sexta do óleo', caption: 'Vem pro posto!', createdBy: 'u-naraely' });
    expect(script.content).toBe('<p>"Sexta tem óleo e café grátis"</p>');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('erro da Victoria devolve o texto para a caixa', async () => {
    askVictoria.mockRejectedValue(new Error('A Victoria demorou demais.'));
    render(<VictoriaDialog open onOpenChange={vi.fn()} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /Clínica Sorriso/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Abrir a Victoria/ }));
    fireEvent.change(screen.getByLabelText('Ideia do roteiro'), { target: { value: 'clareamento' } });
    fireEvent.click(screen.getByRole('button', { name: /Escrever roteiro/ }));
    await waitFor(() => expect((screen.getByLabelText('Ideia do roteiro') as HTMLTextAreaElement).value).toBe('clareamento'));
  });
});
