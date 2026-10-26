import { useEffect, useState } from 'react';
import { vpsAuthedFetch } from '@/lib/vpsDb';

/**
 * Ids dos membros que trabalham como agente de IA (chave de agente ativa), lidos do Escritório
 * Virtual (GET /api/agents/office, aberto a toda a equipe). Guardado por 5 min e dividido entre
 * as telas: os Kanbans usam para o filtro "Com agente de IA" e os selos de agente.
 * Sem a rota (ou offline), devolve um conjunto vazio e as telas seguem como antes.
 */
const TTL_MS = 5 * 60 * 1000;
let cache: { ids: Set<string>; at: number } | null = null;
let inflight: Promise<Set<string>> | null = null;

function loadAgentIds(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.ids);
  if (!inflight) {
    inflight = (async () => {
      try {
        const response = await vpsAuthedFetch('/agents/office');
        if (!response.ok) return cache?.ids ?? new Set<string>();
        const body = await response.json().catch(() => null);
        const ids = new Set<string>(
          (Array.isArray(body?.agents) ? body.agents : []).map((a: { user_id: string }) => String(a.user_id))
        );
        cache = { ids, at: Date.now() };
        return ids;
      } catch {
        return cache?.ids ?? new Set<string>();
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}

export function useAgentIds(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(() => cache?.ids ?? new Set<string>());
  useEffect(() => {
    let alive = true;
    void loadAgentIds().then((next) => { if (alive) setIds(next); });
    return () => { alive = false; };
  }, []);
  return ids;
}
