// Assistente PULSE — conversa com o Claude (SDK oficial @anthropic-ai/sdk).
//
// Chave: ANTHROPIC_API_KEY ou a integração "Claude" da tela de APIs (resolveAiConfig do server.mjs).
// Modelo: o escolhido na tela de APIs (resolveAiModel), padrão claude-opus-5-5. Sem temperature; o pensamento é
// adaptativo (campo omitido); o esforço vai em output_config.effort. tool_choice só "auto" (os modelos atuais
// recusam forçar ferramenta) e ferramentas com strict: true. Opus/Sonnet com o modelo de reserva do servidor.
// O texto é lido pelos blocos "text"; os blocos de pensamento e de ferramenta voltam inteiros, sem mudança, no
// histórico do laço (laço manual de tool use, como na documentação do SDK).
// Cache do prompt: ferramentas + instruções (iguais em todo pedido do mesmo número) e o histórico até a última
// mensagem ficam em cache entre as rodadas do laço e entre mensagens seguidas — a resposta sai bem mais rápido.
// Ferramentas pedidas juntas na mesma rodada rodam em paralelo.

import Anthropic from '@anthropic-ai/sdk';

const MAX_TOOL_ROUNDS = 8;

export function createClaude({ pool, resolveAiConfig, resolveAiModel }) {
  const clients = new Map();

  /** { client, model } ou null quando não há chave do Claude cadastrada. */
  async function connection() {
    const ai = await resolveAiConfig('claude').catch(() => null);
    if (!ai || ai.provider !== 'claude' || !ai.key) return null;
    let client = clients.get(ai.key);
    if (!client) {
      // laço em segundo plano (não segura pedido HTTP): espera mais e tenta de novo em falha de rede/429/5xx
      client = new Anthropic({ apiKey: ai.key, timeout: 120_000, maxRetries: 2 });
      clients.set(ai.key, client);
    }
    // modelo da tela de APIs: o da configuração de IA ativa mais recente, se for do Claude (como o chat financeiro)
    const { rows } = await pool.query(
      `SELECT provider, config FROM api_integrations WHERE provider = ANY($1) AND status = 'ativo' ORDER BY updated_at DESC LIMIT 1`,
      [['ai_claude', 'ai_gemini', 'ai_openai']]
    ).catch(() => ({ rows: [] }));
    const cfg = rows[0]?.config || {};
    const configured = (!cfg.ai_provider || cfg.ai_provider === 'claude') ? cfg.ai_model : null;
    return { client, model: resolveAiModel(configured || 'claude-opus-5-5', 'claude') };
  }

  function create(client, model, params) {
    const withFallback = /^claude-(opus|sonnet)-/i.test(model);
    return client.beta.messages.create({
      model,
      ...params,
      ...(withFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    });
  }

  /** Marca o fim das instruções e a última mensagem como pontos de cache (no máximo 2 dos 4 permitidos). */
  function withCache(system, messages) {
    const sys = typeof system === 'string' ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] : system;
    const last = messages.at(-1);
    if (!last) return { system: sys, messages };
    const blocks = typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : [...last.content];
    const end = blocks.length - 1;
    // blocos de pensamento não aceitam cache_control; só a mensagem do usuário (texto ou tool_result) é marcada
    if (last.role === 'user' && end >= 0 && ['text', 'tool_result'].includes(blocks[end].type)) {
      blocks[end] = { ...blocks[end], cache_control: { type: 'ephemeral' } };
    }
    return { system: sys, messages: [...messages.slice(0, -1), { ...last, content: blocks }] };
  }

  const textOf = (message) => message.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();

  /**
   * Laço manual de ferramentas. `execute(toolUse)` → { content, is_error }. Devolve
   * { text } ao terminar, { refusal: true } se o classificador de segurança recusar, ou lança erro da API.
   */
  async function runToolLoop({ system, tools, messages, effort = 'medium', execute }) {
    const conn = await connection();
    if (!conn) return { unavailable: true };
    const history = [...messages];
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await create(conn.client, conn.model, {
        max_tokens: 16000,
        ...withCache(system, history),
        tools,
        tool_choice: { type: 'auto' },
        output_config: { effort },
      });
      if (response.stop_reason === 'refusal') return { refusal: true, category: response.stop_details?.category || null, model: conn.model };
      if (response.stop_reason === 'pause_turn') {
        history.push({ role: 'assistant', content: response.content });
        continue;
      }
      const toolUses = response.content.filter((b) => b.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || !toolUses.length) {
        return { text: textOf(response), stop: response.stop_reason, model: conn.model, rounds: round + 1 };
      }
      // blocos devolvidos inteiros (thinking, texto e tool_use), sem mexer
      history.push({ role: 'assistant', content: response.content });
      const results = await Promise.all(toolUses.map(async (toolUse) => {
        const { content, is_error } = await execute(toolUse);
        return { type: 'tool_result', tool_use_id: toolUse.id, content, ...(is_error ? { is_error: true } : {}) };
      }));
      history.push({ role: 'user', content: results });
    }
    return { text: '', exhausted: true, model: conn.model };
  }

  /** Uma chamada com saída JSON garantida pelo esquema (sem ferramentas). null se recusar ou não vier JSON. */
  async function classify({ system, content, schema, effort = 'low' }) {
    const conn = await connection();
    if (!conn) return { unavailable: true };
    const response = await create(conn.client, conn.model, {
      max_tokens: 8000,
      system,
      messages: [{ role: 'user', content }],
      output_config: { effort, format: { type: 'json_schema', schema } },
    });
    if (response.stop_reason === 'refusal') return { refusal: true };
    try {
      return { data: JSON.parse(textOf(response)) };
    } catch {
      return { invalid: true, stop: response.stop_reason };
    }
  }

  return { connection, runToolLoop, classify };
}
