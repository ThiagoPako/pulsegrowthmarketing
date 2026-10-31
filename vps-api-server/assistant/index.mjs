// Assistente PULSE — agente de IA (Claude) que recebe comandos pelo WhatsApp (texto e áudio) de números autorizados
// e age no sistema. Registrado no server.mjs com uma chamada (registerAssistant).
//
//   schema.mjs     tabelas próprias (aditivo, na subida)
//   engine.mjs     comandos do privado do número com a função "assistente" (wa_inbound route = 'assistente')
//   tools.mjs      ferramentas do Claude (permissão por ferramenta e cidade conferidas no servidor)
//   actions.mjs    ações que esperam o "sim" e executam o payload guardado
//   finance.mjs    contas do financeiro iguais às telas
//   monitor.mjs    demandas pedidas pelos clientes nos grupos → aviso aos números com "alertas_grupos"
//   temperature.mjs temperatura do cliente (dados + falas no grupo) → aviso aos números com "alertas_satisfacao"
//                  (temperatureSignals.mjs: sinais de dados; temperatureScore.mjs: pesos e notas; temperatureRoutes.mjs: tela)
//   jobs.mjs       pedidos para os agentes dos PCs (/api/agent/jobs) e dados do relatório mensal
//   transcribe.mjs áudio → texto com whisper.cpp
//   routes.mjs     rotas da tela (admin)
//
// Variáveis de ambiente (todas opcionais):
//   ASSISTANT_DISABLED=1                desliga os laços (rotas continuam)
//   ASSISTANT_TICK_MS=1500              intervalo do laço de comandos
//   ASSISTANT_EFFORT=low                esforço do Claude nos comandos (low responde mais rápido; medium/high pensam mais)
//   ASSISTANT_RATE_LIMIT_HOUR=30        comandos por número por hora
//   ASSISTANT_MONITOR_TICK_MS=30000     intervalo do monitor de grupos
//   ASSISTANT_GROUP_DEBOUNCE_S=180      grupo parado há quanto tempo antes de analisar
//   WHISPER_BIN, WHISPER_MODEL, WHISPER_THREADS, FFMPEG_BIN, WA_PRIVATE_DIR
//   TEMPERATURE_DISABLED=1              desliga a análise diária da temperatura (rotas e leitura pelo monitor seguem;
//                                       ASSISTANT_DISABLED=1 também desliga)
//   TEMPERATURE_DAILY_HOUR=7            hora de Brasília da análise diária
//   TEMPERATURE_TICK_MS=600000          de quanto em quanto tempo confere se a análise do dia já rodou

import { ensureAssistantSchema } from './schema.mjs';
import { createDailyReport } from './dailyReport.mjs';
import { createClaude } from './claude.mjs';
import { createTools } from './tools.mjs';
import { configureActions } from './actions.mjs';
import { createEngine } from './engine.mjs';
import { createMonitor } from './monitor.mjs';
import { registerJobRoutes } from './jobs.mjs';
import { registerAdminRoutes } from './routes.mjs';
import { createTemperature } from './temperature.mjs';
import { registerTemperatureRoutes } from './temperatureRoutes.mjs';

const envNumber = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const envHour = (name, fallback) => {
  const raw = process.env[name];
  const n = Number(raw);
  return raw !== undefined && raw !== '' && Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback;
};

export function registerAssistant(app, {
  pool, verifyAdmin, isStrictAdmin, resolveAiConfig, resolveAiModel, uploadRoot, publicUploadsUrl, getClientInsights,
  verifyUser, userHasAnyRole, resolveActiveCity, notifyTeam, moveEditCard,
}) {
  const ensureSchema = () => ensureAssistantSchema(pool);
  ensureSchema().catch((error) => console.error('[assistente] esquema:', error.message));

  const claude = createClaude({ pool, resolveAiConfig, resolveAiModel });
  configureActions({ moveEditCard });
  const tools = createTools({ pool, publicUploadsUrl });
  registerAdminRoutes(app, { pool, verifyAdmin, isStrictAdmin, claude, ensureSchema });
  registerJobRoutes(app, { pool, uploadRoot, publicUploadsUrl, getClientInsights, ensureSchema });

  const temperature = createTemperature({
    pool, claude, notifyTeam,
    dailyHour: envHour('TEMPERATURE_DAILY_HOUR', 7),
    intervalMs: envNumber('TEMPERATURE_TICK_MS', 600_000),
  });
  temperature.ensureSchema().catch((error) => console.error('[temperatura] esquema:', error.message));
  if (verifyUser && userHasAnyRole && resolveActiveCity) {
    registerTemperatureRoutes(app, { pool, temperature, verifyUser, userHasAnyRole, resolveActiveCity });
  }

  const engine = createEngine({
    pool, claude, tools,
    effort: ['low', 'medium', 'high'].includes(process.env.ASSISTANT_EFFORT) ? process.env.ASSISTANT_EFFORT : 'low',
    intervalMs: envNumber('ASSISTANT_TICK_MS', 1500),
    rateLimitPerHour: envNumber('ASSISTANT_RATE_LIMIT_HOUR', 30),
  });
  const monitor = createMonitor({
    pool, claude,
    intervalMs: envNumber('ASSISTANT_MONITOR_TICK_MS', 30_000),
    debounceSeconds: envNumber('ASSISTANT_GROUP_DEBOUNCE_S', 180),
    onSatisfaction: (batch) => temperature.fromMonitor(batch),
  });
  if (process.env.ASSISTANT_DISABLED !== '1') {
    engine.start();
    monitor.start();
  }
  if (process.env.ASSISTANT_DISABLED !== '1' && process.env.TEMPERATURE_DISABLED !== '1') temperature.start();
  // resumo do dia às 18h no WhatsApp dos números com "resumo_diario" (dailyReport.mjs)
  const dailyReport = createDailyReport({ pool, hour: envHour('ASSISTANT_DAILY_REPORT_HOUR', 18), intervalMs: envNumber('ASSISTANT_DAILY_REPORT_TICK_MS', 300_000) });
  if (process.env.ASSISTANT_DISABLED !== '1') dailyReport.start();
  return { engine, monitor, claude, tools, temperature, dailyReport };
}
