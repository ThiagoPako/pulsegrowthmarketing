import { useCallback, useEffect, useRef, useState } from 'react';
import { vpsAuthedFetch } from '@/lib/vpsDb';
import type { ScriptContentFormat, ScriptVideoType } from '@/types';

/** Victoria, a roteirista do módulo Copy (vps-api-server/victoriaRoutes.mjs). */

export type VictoriaRole = 'pedido' | 'victoria' | 'correcao';

export interface VictoriaTurn {
  role: VictoriaRole;
  text: string;
  reply?: VictoriaReply;
}

export interface VictoriaLesson {
  id: string;
  client_id: string | null;
  scope: 'cliente' | 'geral';
  rule: string;
  created_by_name: string | null;
  created_at: string;
}

export interface VictoriaSuggestion {
  titulo: string;
  ideia: string;
  por_que: string;
  tipo: ScriptVideoType | null;
}

export interface VictoriaSuggestions {
  status: 'pronta' | 'preparando';
  items: VictoriaSuggestion[];
}

export interface VictoriaReply {
  /** frase dela para quem pediu, no jeito alegre (pode vir vazia) */
  recado?: string;
  titulo: string;
  roteiro: string;
  legenda: string;
  referencias: { titulo: string; url: string; por_que: string }[];
  observacoes: string;
  aprendizados: VictoriaLesson[];
  usados: { roteiros_cliente: number; roteiros_agencia: number; regras: number; pesquisou: boolean; contexto_em_cache?: boolean };
  /** tempo no servidor, do pedido ao roteiro completo */
  ms?: number;
}

export interface VictoriaPrepared {
  ready: boolean;
  research: 'pronta' | 'preparando';
  research_date: string | null;
  usados: { roteiros_cliente: number; roteiros_agencia: number; regras: number };
  suggestions?: VictoriaSuggestions;
}

export interface VictoriaInfo {
  victoria: { registered: boolean; user_id: string | null; name: string; avatar_url: string | null };
  client?: { id: string; company_name: string; niche: string | null; city: string | null; editorial: string | null };
  scripts?: { total: number; recorded: number };
  lessons?: VictoriaLesson[];
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await vpsAuthedFetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'A Victoria não respondeu. Tente de novo.');
  return body as T;
}

export const fetchVictoriaInfo = (clientId?: string) =>
  call<VictoriaInfo>(`/victoria/info${clientId ? `?client_id=${encodeURIComponent(clientId)}` : ''}`);

export interface VictoriaRequest {
  client_id: string;
  content_format: ScriptContentFormat;
  video_type: ScriptVideoType;
  conversation: { role: VictoriaRole; text: string }[];
  search: boolean;
}

/** Ao escolher cliente e tipo: o servidor monta o contexto e deixa a pesquisa do nicho pronta (rápido depois). */
export const prepareVictoria = (payload: Pick<VictoriaRequest, 'client_id' | 'content_format' | 'video_type'>) =>
  call<VictoriaPrepared>('/victoria/prepare', { method: 'POST', body: JSON.stringify(payload) });

/** Sugestões de abertura (a tela pergunta de novo enquanto estão 'preparando'). */
export const fetchVictoriaSuggestions = (clientId: string, format: ScriptContentFormat) =>
  call<VictoriaSuggestions>(`/victoria/suggestions?client_id=${encodeURIComponent(clientId)}&content_format=${format}`);

/**
 * Pede o roteiro e recebe o texto enquanto ela escreve (text/event-stream: "delta" com pedaços, "done" com o roteiro,
 * "error"). onText recebe o texto acumulado até aqui. Servidor sem streaming responde JSON e também funciona.
 */
export async function askVictoria(payload: VictoriaRequest, onText?: (text: string) => void): Promise<VictoriaReply> {
  const response = await vpsAuthedFetch('/victoria/roteiro', {
    method: 'POST',
    body: JSON.stringify({ ...payload, stream: true }),
    headers: { Accept: 'text/event-stream' },
  });
  const type = response.headers.get('Content-Type') || '';
  if (!response.ok || !type.includes('text/event-stream') || !response.body) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'A Victoria não respondeu. Tente de novo.');
    return body as VictoriaReply;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut = buffer.indexOf('\n\n');
    while (cut >= 0) {
      const chunk = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      cut = buffer.indexOf('\n\n');
      const event = chunk.match(/^event: (.+)$/m)?.[1];
      const data = chunk.match(/^data: (.*)$/m)?.[1];
      if (!event || data == null) continue;
      const parsed = JSON.parse(data);
      if (event === 'delta') {
        text += parsed.text || '';
        onText?.(text);
      } else if (event === 'done') {
        return parsed as VictoriaReply;
      } else if (event === 'error') {
        throw new Error(parsed.error || 'A Victoria não respondeu. Tente de novo.');
      }
    }
  }
  throw new Error('A conexão caiu antes do fim do roteiro. Tente de novo.');
}

/** Pedaço do roteiro já escrito (entre ROTEIRO: e a próxima seção), mostrado enquanto a resposta chega. */
export function partialScript(text: string): string {
  const raw = String(text || '');
  const start = raw.search(/^\s*(?:\*\*)?ROTEIRO(?:\*\*)?\s*:/im);
  if (start < 0) return '';
  const after = raw.slice(start).replace(/^\s*(?:\*\*)?ROTEIRO(?:\*\*)?\s*:\s*/i, '');
  const end = after.search(/^\s*(?:\*\*)?(LEGENDA|OBSERVA[CÇ][OÕ]ES|APRENDIZADOS)(?:\*\*)?\s*:/im);
  return (end >= 0 ? after.slice(0, end) : after).trim();
}

export const removeVictoriaLesson = (id: string) => call<{ ok: boolean }>(`/victoria/lessons/${id}`, { method: 'DELETE' });

/** O que vai para o servidor: o texto de cada vez (a versão da Victoria vai como o roteiro dela). */
export function conversationPayload(turns: VictoriaTurn[]) {
  return turns.map((t) => ({
    role: t.role,
    text: t.role === 'victoria' && t.reply ? [t.reply.titulo, t.reply.roteiro, t.reply.legenda ? `LEGENDA: ${t.reply.legenda}` : ''].filter(Boolean).join('\n\n') : t.text,
  }));
}

/** Roteiro em texto → HTML do editor de roteiros (mesmo formato do "Gerar com IA" da tela Roteiros). */
export function scriptToHtml(text: string): string {
  const escaped = String(text || '').trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!escaped) return '';
  return escaped
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br/>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`)
    .join('');
}

// ── Ditado por voz (Web Speech API do navegador, pt-BR) ──
interface SpeechResultLike { isFinal: boolean; 0: { transcript: string } }
interface SpeechEventLike { resultIndex: number; results: ArrayLike<SpeechResultLike> }
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function speechCtor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/**
 * Fala → texto. onFinal recebe cada frase fechada; `interim` mostra o que está sendo ouvido.
 * Sem suporte no navegador (Firefox), `supported` é false e a tela esconde o microfone.
 */
export function useSpeechToText(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;
  const supported = !!speechCtor();

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = speechCtor();
    if (!Ctor) {
      setError('Este navegador não aceita ditado. Use o Chrome, o Edge ou o Safari.');
      return;
    }
    recognition.current?.stop();
    const rec = new Ctor();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let partial = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript || '';
        if (result.isFinal) finalRef.current(text.trim());
        else partial += text;
      }
      setInterim(partial.trim());
    };
    rec.onerror = (event) => {
      setError(event.error === 'not-allowed' ? 'Libere o microfone para o site e tente de novo.' : 'O ditado parou. Toque no microfone de novo.');
    };
    rec.onend = () => {
      setListening(false);
      setInterim('');
      recognition.current = null;
    };
    setError(null);
    recognition.current = rec;
    rec.start();
    setListening(true);
  }, []);

  useEffect(() => () => recognition.current?.stop(), []);

  return { supported, listening, interim, error, start, stop };
}
