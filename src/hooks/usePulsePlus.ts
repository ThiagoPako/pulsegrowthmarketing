import { useEffect, useSyncExternalStore } from 'react';
import { useModuleAccess } from '@/hooks/useModuleAccess';

/**
 * Pulse Plus: acesso às configurações e informações internas dos agentes (Painel de Agentes, chaves,
 * computadores, PULSE, selos e filtros de agente, etapa e parecer nos cards) e aos Agendamentos.
 * Vem só da lista do servidor (module_access 'pulse_plus', marcada na tela Equipe), nunca do papel.
 * Sem resposta do servidor, nada é liberado. O servidor também trava (vps-api-server/pulsePlus.mjs).
 */
export const PULSE_PLUS_MODULE = 'pulse_plus';

// Último valor que uma tela leu: os selos de cada card consultam este valor sem abrir uma consulta por card.
let known = false;
const listeners = new Set<() => void>();

function publish(next: boolean) {
  if (next === known) return;
  known = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Use no nível da tela (Kanban, detalhe do card, Configurações, Equipe, menu). */
export function usePulsePlus(): boolean {
  const { has } = useModuleAccess();
  const value = has(PULSE_PLUS_MODULE);
  // enquanto carrega (ou ao trocar de usuário) vale false: nada aparece antes da resposta
  useEffect(() => { publish(value); }, [value]);
  return value;
}

/** Leitura barata para componentes repetidos (selo de cada card): o valor que a tela aberta já carregou. */
export function usePulsePlusKnown(): boolean {
  return useSyncExternalStore(subscribe, () => known, () => false);
}
