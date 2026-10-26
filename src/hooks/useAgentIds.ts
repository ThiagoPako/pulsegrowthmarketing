import { useEffect, useState } from 'react';
import { vpsAuthedFetch } from '@/lib/vpsDb';
import { usePulsePlus } from '@/hooks/usePulsePlus';

/**
 * Ids dos membros que trabalham como agente de IA (chave de agente ativa), lidos de GET /api/agents/office.
 * Só para quem tem Pulse Plus (o servidor responde 403 para o resto): sem o acesso, o conjunto é sempre
 * vazio e nenhuma tela marca alguém como agente. Guardado por 5 min e dividido entre as telas: os Kanbans
 * usam para o filtro de responsável e os selos de agente. Sem a rota (ou offline), devolve um conjunto vazio.
 */
const TTL_MS = 5 * 60 * 1000;
const EMPTY: Set<string> = new Set<string>();
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
  const pulsePlus = usePulsePlus();
  const [ids, setIds] = useState<Set<string>>(() => cache?.ids ?? EMPTY);
  useEffect(() => {
    if (!pulsePlus) {
      // outra pessoa no mesmo navegador (ou acesso tirado): nada de agente guardado
      cache = null;
      setIds(EMPTY);
      return;
    }
    let alive = true;
    void loadAgentIds().then((next) => { if (alive) setIds(next); });
    return () => { alive = false; };
  }, [pulsePlus]);
  return pulsePlus ? ids : EMPTY;
}
