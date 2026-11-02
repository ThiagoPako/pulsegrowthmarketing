// Assistente PULSE: as ferramentas mandadas ao Claude cabem nos limites do strict tool use. Em 01/11/2026 a API
// recusou cinco pedidos do Thiago com 400 "The compiled grammar is too large" (18 ferramentas strict, 12 campos com
// anyOf). Limites publicados: 20 ferramentas strict, 24 opcionais e 16 unions por pedido, mais um limite interno do
// tamanho da gramática; aqui a régua é a nossa (STRICT_LIMITS), bem abaixo. A nova tentativa sem strict depois de um
// 400 (claude.mjs) fica no teste em Node, porque o SDK só existe no node_modules do vps-api-server.
import { describe, expect, it } from 'vitest';
import { createTools, STRICT_LIMITS, STRICT_TOOLS, unionCount } from '../../vps-api-server/assistant/tools.mjs';
import { PERMISSIONS } from '../../vps-api-server/assistant/common.mjs';

type Def = { name: string; strict?: boolean; input_schema: Record<string, unknown> };

const tools = createTools({ pool: { query: async () => ({ rows: [] }) } });
const everything = { permissions: Object.keys(PERMISSIONS), cities: ['minacu', 'uruacu'] };

function optionalCount(schema: Record<string, unknown> | undefined): number {
  if (!schema || typeof schema !== 'object') return 0;
  const props = (schema.properties || {}) as Record<string, Record<string, unknown>>;
  const required = new Set((schema.required as string[]) || []);
  let n = 0;
  for (const [key, value] of Object.entries(props)) {
    if (!required.has(key)) n++;
    n += optionalCount(value);
    for (const alt of (value.anyOf as Record<string, unknown>[]) || []) n += optionalCount(alt);
  }
  return n + optionalCount(schema.items as Record<string, unknown>);
}

describe('ferramentas strict do Assistente PULSE', () => {
  it('número com todas as permissões: dentro dos limites da API e da nossa régua', () => {
    const defs = tools.definitionsFor(everything) as Def[];
    const strict = defs.filter((d) => d.strict);
    const unions = strict.reduce((s, d) => s + unionCount(d.input_schema), 0);
    const optional = strict.reduce((s, d) => s + optionalCount(d.input_schema), 0);
    expect(defs.length).toBeGreaterThan(20); // as consultas continuam todas lá
    expect(strict.length).toBeLessThanOrEqual(STRICT_LIMITS.tools);
    expect(unions).toBeLessThanOrEqual(STRICT_LIMITS.unions);
    expect(strict.length).toBeLessThanOrEqual(20);
    expect(unions).toBeLessThanOrEqual(16);
    expect(optional).toBeLessThanOrEqual(24);
    // tamanho das strict somadas: a gramática cresce com o esquema (as 18 de antes davam ~13 mil caracteres)
    expect(JSON.stringify(strict.map((d) => d.input_schema)).length).toBeLessThan(9000);
  });

  it('strict só nas ferramentas de ação da lista; consultas vão sem strict', () => {
    const defs = tools.definitionsFor(everything) as Def[];
    for (const d of defs) if (d.strict) expect(STRICT_TOOLS.has(d.name)).toBe(true);
    for (const name of ['buscar_cliente', 'resumo_financeiro', 'andamento_producao', 'agenda_gravacoes', 'enviar_enquete']) {
      expect(defs.find((d) => d.name === name)?.strict).toBeUndefined();
    }
    expect(defs.find((d) => d.name === 'lancar_despesa')?.strict).toBe(true);
  });

  it('cada número (permissões sozinhas) também fica dentro da régua', () => {
    for (const p of Object.keys(PERMISSIONS)) {
      const strict = (tools.definitionsFor({ permissions: [p], cities: ['minacu'] }) as Def[]).filter((d) => d.strict);
      expect(strict.length).toBeLessThanOrEqual(STRICT_LIMITS.tools);
      expect(strict.reduce((s, d) => s + unionCount(d.input_schema), 0)).toBeLessThanOrEqual(STRICT_LIMITS.unions);
    }
  });

  it('{ strict: false } manda todas sem strict', () => {
    expect((tools.definitionsFor(everything, { strict: false }) as Def[]).some((d) => d.strict)).toBe(false);
  });
});
