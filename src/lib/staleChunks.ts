import { toast } from 'sonner';

/**
 * Erros de chunk antigo: depois de um deploy, uma aba aberta pede um arquivo
 * da versão anterior que já saiu do servidor.
 */
const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading (?:CSS )?chunk \S+ failed/i;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error ?? '');
  return CHUNK_ERROR_RE.test(message);
}

/** Recarrega só quando o próprio usuário clica (nunca sozinho). */
export function reloadForNewVersion() {
  window.location.reload();
}

let listening = false;
let notified = false;

/**
 * Avisa uma única vez que há versão nova quando o Vite não consegue carregar
 * um chunk (evento vite:preloadError). Não recarrega a página sozinho.
 */
export function listenForStaleChunks() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('vite:preloadError', () => {
    if (notified) return;
    notified = true;
    toast.info('Há uma versão nova do sistema', {
      description: 'Atualize a página para continuar usando todas as telas.',
      duration: Infinity,
      action: { label: 'Atualizar agora', onClick: reloadForNewVersion },
    });
  });
}
