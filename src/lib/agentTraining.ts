import { vpsAuthedFetch } from '@/lib/vpsDb';

/**
 * Treino dos agentes (vps-api-server/agentTrainingRoutes.mjs): a equipe escreve e anexa arquivos para ensinar um
 * agente; o agente lê com `pulse treino`. Quem pode: Pulse Plus ou a função 'treino_agentes' (tela Equipe).
 */
export const AGENT_TRAINER_MODULE = 'treino_agentes';
export const MAX_TRAINING_TEXT = 8000;
export const MAX_TRAINING_ATTACHMENTS = 10;
export const MAX_TRAINING_FILE_BYTES = 2 * 1024 * 1024 * 1024; // limite do upload da equipe (2 GB)

export type AttachmentKind = 'imagem' | 'video' | 'pdf' | 'audio' | 'texto' | 'arquivo';

export interface TrainingAttachment {
  url: string;
  name: string;
  type: string;
  kind: AttachmentKind;
  size: number | null;
}

export interface TrainingMessage {
  id: string;
  author_id: string | null;
  author_name: string | null;
  from_agent: boolean;
  client_id: string | null;
  client_name: string | null;
  body: string;
  attachments: TrainingAttachment[];
  created_at: string;
  read_at: string | null;
}

export interface TrainableAgent {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  roles: string;
  lessons: number;
  unread: number;
  last_at: string | null;
}

/** Mesmo critério do servidor (lib/agentTraining.mjs attachmentKind). */
export function attachmentKind(nameOrUrl: string, mime = ''): AttachmentKind {
  const type = String(mime || '').toLowerCase();
  const ext = (String(nameOrUrl || '').split('?')[0].match(/\.([a-z0-9]{1,5})$/i)?.[1] || '').toLowerCase();
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'svg'].includes(ext)) return 'imagem';
  if (type.startsWith('video/') || ['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'].includes(ext)) return 'video';
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (type.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'ogg', 'aac'].includes(ext)) return 'audio';
  if (type.startsWith('text/') || ['txt', 'md', 'csv', 'json', 'srt'].includes(ext)) return 'texto';
  return 'arquivo';
}

export function formatBytes(size: number | null | undefined): string {
  if (!size) return '';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2).replace('.', ',')} GB`;
}

/** Pasta do upload: uma por agente, para os arquivos do treino não se misturarem com o resto. */
export function trainingUploadFolder(agentId: string): string {
  return `treino-agentes/${agentId.replace(/[^a-zA-Z0-9-]/g, '')}`;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await vpsAuthedFetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Falha ao falar com o sistema');
  return body as T;
}

export const fetchTrainingAccess = () => call<{ can_train: boolean; can_grant: boolean }>('/agent-training/me');
export const fetchTrainableAgents = () => call<{ agents: TrainableAgent[] }>('/agent-training/agents').then((b) => b.agents || []);
export const fetchTrainingMessages = (agentId: string) =>
  call<{ agent: { user_id: string; name: string | null; roles: string }; messages: TrainingMessage[] }>(`/agent-training/${agentId}/messages`);
export const sendTrainingMessage = (agentId: string, payload: { body: string; client_id?: string | null; attachments: Omit<TrainingAttachment, 'kind'>[] }) =>
  call<{ message: TrainingMessage }>(`/agent-training/${agentId}/messages`, { method: 'POST', body: JSON.stringify(payload) }).then((b) => b.message);
export const fetchAgentTrainers = () =>
  call<{ members: { user_id: string }[] }>('/team/agent-trainers').then((b) => new Set((b.members || []).map((m) => String(m.user_id))));
export const setAgentTrainer = (userId: string, enabled: boolean) =>
  call<{ ok: boolean }>(`/team/${userId}/agent-trainer`, { method: enabled ? 'POST' : 'DELETE' });
