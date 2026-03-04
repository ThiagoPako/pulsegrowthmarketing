export type UserRole = 'admin' | 'videomaker' | 'social_media' | 'editor';

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export type DayOfWeek = 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado' | 'domingo';

export interface CompanySettings {
  startTime: string; // HH:mm
  endTime: string;
  workDays: DayOfWeek[];
  recordingDuration: number; // always 2 hours
}

export type ContentType = 'reels' | 'story' | 'produto';

export const CLIENT_COLORS = [
  { name: 'Vermelho', value: '0 72% 51%' },
  { name: 'Laranja', value: '25 95% 53%' },
  { name: 'Amarelo', value: '45 93% 47%' },
  { name: 'Verde', value: '142 71% 45%' },
  { name: 'Ciano', value: '187 85% 43%' },
  { name: 'Azul', value: '217 91% 60%' },
  { name: 'Roxo', value: '262 83% 58%' },
  { name: 'Rosa', value: '330 81% 60%' },
  { name: 'Marrom', value: '25 50% 38%' },
  { name: 'Cinza', value: '220 10% 50%' },
] as const;

export interface Client {
  id: string;
  companyName: string;
  responsiblePerson: string;
  phone: string;
  color: string; // HSL value e.g. "0 72% 51%"
  fixedDay: DayOfWeek;
  fixedTime: string; // HH:mm
  videomaker: string; // user id
  backupTime: string; // HH:mm
  backupDay: DayOfWeek;
  extraDay: DayOfWeek;
  extraContentTypes: ContentType[];
  acceptsExtra: boolean;
  weeklyGoal: number;
}

export type RecordingType = 'fixa' | 'extra' | 'secundaria';
export type RecordingStatus = 'agendada' | 'concluida' | 'cancelada';

export interface Recording {
  id: string;
  clientId: string;
  videomakerId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  type: RecordingType;
  status: RecordingStatus;
}

export type KanbanColumn = 'backlog' | 'em_producao' | 'gravado' | 'finalizado';

export interface KanbanTask {
  id: string;
  clientId: string;
  title: string;
  column: KanbanColumn;
  checklist: { id: string; text: string; done: boolean }[];
  weekStart: string; // YYYY-MM-DD (monday)
  recordingDate?: string;
}

export const DAY_LABELS: Record<DayOfWeek, string> = {
  segunda: 'Segunda-feira',
  terca: 'Terça-feira',
  quarta: 'Quarta-feira',
  quinta: 'Quinta-feira',
  sexta: 'Sexta-feira',
  sabado: 'Sábado',
  domingo: 'Domingo',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  videomaker: 'Videomaker',
  social_media: 'Social Media',
  editor: 'Editor',
};

export const COLUMN_LABELS: Record<KanbanColumn, string> = {
  backlog: 'Backlog',
  em_producao: 'Em Produção',
  gravado: 'Gravado',
  finalizado: 'Finalizado',
};

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  reels: 'Reels',
  story: 'Story',
  produto: 'Produto',
};
