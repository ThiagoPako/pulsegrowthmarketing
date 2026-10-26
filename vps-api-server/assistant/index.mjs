// Assistente PULSE — agente de IA (Claude) que recebe comandos pelo WhatsApp (texto e áudio) de números autorizados
// e age no sistema. Registrado no server.mjs com uma chamada (registerAssistant).
//
//   schema.mjs     tabelas próprias (aditivo, na subida)
//   engine.mjs     comandos do privado do número com a função "assistente" (wa_inbound route = 'assistente')
//   tools.mjs      ferramentas do Claude (permissão por ferramenta e cidade conferidas no servidor)
//   actions.mjs    ações que esperam o "sim" e executam o payload guardado
//   finance.mjs    contas do financeiro iguais às telas
//   monitor.mjs    demandas pedidas pelos clientes nos grupos → aviso aos números com "alertas_grupos"
//   jobs.mjs       pedidos para os agentes dos PCs (/api/agent/jobs) e dados do relatório mensal
//   transcribe.mjs áudio → texto com whisper.cpp
//   routes.mjs     rotas da tela (admin)
//
// Variáveis de ambiente (todas opcionais):
//   ASSISTANT_DISABLED=1                desliga os laços (rotas continuam)
//   ASSISTANT_TICK_MS=3000              intervalo do laço de comandos
//   ASSISTANT_RATE_LIMIT_HOUR=30        comandos por número por hora
//   ASSISTANT_MONITOR_TICK_MS=30000     intervalo do monitor de grupos
//   ASSISTANT_GROUP_DEBOUNCE_S=180      grupo parado há quanto tempo antes de analisar
//   WHISPER_BIN, WHISPER_MODEL, WHISPER_THREADS, FFMPEG_BIN, WA_PRIVATE_DIR

import { ensureAssistantSchema } from './schema.mjs';
import { createClaude } from './claude.mjs';
import { createTools } from './tools.mjs';
import { createEngine } from './engine.mjs';
import { createMonitor } from './monitor.mjs';
import { registerJobRoutes } from './jobs.mjs';
import { registerAdminRoutes } from './routes.mjs';

const envNumber = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function registerAssistant(app, {
  pool, verifyAdmin, isStrictAdmin, resolveAiConfig, resolveAiModel, uploadRoot, publicUploadsUrl, getClientInsights,
}) {
  const ensureSchema = () => ensureAssistantSchema(pool);
  ensureSchema().catch((error) => console.error('[assistente] esquema:', error.message));

  const claude = createClaude({ pool, resolveAiConfig, resolveAiModel });
  const tools = createTools({ pool, publicUploadsUrl });
  registerAdminRoutes(app, { pool, verifyAdmin, isStrictAdmin, claude, ensureSchema });
  registerJobRoutes(app, { pool, uploadRoot, publicUploadsUrl, getClientInsights, ensureSchema });

  const engine = createEngine({
    pool, claude, tools,
    intervalMs: envNumber('ASSISTANT_TICK_MS', 3000),
    rateLimitPerHour: envNumber('ASSISTANT_RATE_LIMIT_HOUR', 30),
  });
  const monitor = createMonitor({
    pool, claude,
    intervalMs: envNumber('ASSISTANT_MONITOR_TICK_MS', 30_000),
    debounceSeconds: envNumber('ASSISTANT_GROUP_DEBOUNCE_S', 180),
  });
  if (process.env.ASSISTANT_DISABLED !== '1') {
    engine.start();
    monitor.start();
  }
  return { engine, monitor, claude, tools };
}
