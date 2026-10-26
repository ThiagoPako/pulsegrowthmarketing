import { supabase } from '@/lib/vpsDb';

/**
 * Menções não lidas da pessoa logada, numa consulta só para o popup e o indicador.
 * Antes cada um consultava a mesma coisa no seu ritmo (5 s e 8 s); agora os dois
 * recebem o mesmo resultado a cada 5 s (o ritmo do popup, que é rápido de propósito).
 */
export interface MentionRow {
  id: string;
  title: string;
  message: string;
  link: string | null;
  type?: string;
  read?: boolean;
  created_at: string;
}

type Listener = (rows: MentionRow[]) => void;

const POLL_MS = 5000;
/** O indicador lista até 20; o popup olha só as 5 mais novas (slice no componente). */
const LIMIT = 20;

interface Feed {
  listeners: Set<Listener>;
  timer: ReturnType<typeof setInterval> | null;
  inFlight: Promise<void> | null;
}

const feeds = new Map<string, Feed>();

function poll(userId: string): Promise<void> {
  const feed = feeds.get(userId);
  if (!feed) return Promise.resolve();
  if (feed.inFlight) return feed.inFlight;
  const run = (async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id,title,message,link,type,read,created_at')
        .eq('user_id', userId)
        .eq('type', 'mention')
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(LIMIT);
      // Saiu (logout/troca de conta) enquanto a consulta voltava: ninguém mais ouve.
      if (feeds.get(userId) !== feed || error || !data) return;
      const rows = data as MentionRow[];
      feed.listeners.forEach((listener) => listener(rows));
    } catch {
      /* rede: tenta de novo no próximo ciclo */
    } finally {
      feed.inFlight = null;
    }
  })();
  feed.inFlight = run;
  return run;
}

/** Recebe as menções não lidas na hora e a cada 5 s. Devolve a função de cancelar. */
export function subscribeMentions(userId: string, listener: Listener): () => void {
  let feed = feeds.get(userId);
  if (!feed) {
    feed = { listeners: new Set(), timer: null, inFlight: null };
    feeds.set(userId, feed);
  }
  feed.listeners.add(listener);
  void poll(userId);
  if (feed.timer === null) {
    feed.timer = setInterval(() => { void poll(userId); }, POLL_MS);
  }
  const current = feed;
  return () => {
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      if (current.timer !== null) clearInterval(current.timer);
      current.timer = null;
      if (feeds.get(userId) === current) feeds.delete(userId);
    }
  };
}

/** Consulta de novo agora (ex.: uma menção foi lida em outro lugar). */
export function refreshMentions(userId: string): Promise<void> {
  return poll(userId);
}
