export type UserRole = 'admin' | 'videomaker' | 'social_media' | 'editor' | 'endomarketing' | 'parceiro' | 'fotografo' | 'designer';

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  avatarUrl?: string; // base64 data URL
  displayName?: string;
  jobTitle?: string;
  fontScale?: string;
}

export type DayOfWeek = 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado' | 'domingo';

export interface CompanySettings {
  shiftAStart: string; // HH:mm
  shiftAEnd: string;
  shiftBStart: string;
  shiftBEnd: string;
  workDays: DayOfWeek[];
  recordingDuration: number; // in minutes
  editingDeadlineHours: number;
  reviewDeadlineHours: number;
  alterationDeadlineHours: number;
  approvalDeadlineHours: number;
}

export type ContentType = 'reels' | 'story' | 'produto';

export const CLIENT_COLORS = [
  { name: 'Vermelho', value: '0 72% 51%' },
  { name: 'Vermelho Escuro', value: '0 65% 38%' },
  { name: 'Laranja', value: '25 95% 53%' },
  { name: 'Laranja Queimado', value: '16 80% 45%' },
  { name: 'Amarelo', value: '45 93% 47%' },
  { name: 'Amarelo Ouro', value: '40 85% 42%' },
  { name: 'Lima', value: '85 65% 45%' },
  { name: 'Verde', value: '142 71% 45%' },
  { name: 'Verde Escuro', value: '155 60% 32%' },
  { name: 'Esmeralda', value: '160 84% 39%' },
  { name: 'Turquesa', value: '174 72% 40%' },
  { name: 'Ciano', value: '187 85% 43%' },
  { name: 'Azul Claro', value: '199 89% 55%' },
  { name: 'Azul', value: '217 91% 60%' },
  { name: 'Azul Royal', value: '225 73% 48%' },
  { name: 'Azul Marinho', value: '230 60% 35%' },
  { name: 'Índigo', value: '245 58% 51%' },
  { name: 'Roxo', value: '262 83% 58%' },
  { name: 'Violeta', value: '280 68% 50%' },
  { name: 'Magenta', value: '300 76% 52%' },
  { name: 'Rosa', value: '330 81% 60%' },
  { name: 'Rosa Claro', value: '340 82% 70%' },
  { name: 'Coral', value: '12 76% 61%' },
  { name: 'Salmão', value: '6 93% 71%' },
  { name: 'Marrom', value: '25 50% 38%' },
  { name: 'Terracota', value: '15 55% 42%' },
  { name: 'Cinza', value: '220 10% 50%' },
  { name: 'Cinza Escuro', value: '220 12% 35%' },
  { name: 'Grafite', value: '220 15% 25%' },
  { name: 'Preto', value: '0 0% 15%' },
] as const;

export interface Client {
  id: string;
  companyName: string;
  responsiblePerson: string;
  phone: string;
  email: string;
  city: string;
  color: string; // HSL value e.g. "0 72% 51%"
  logoUrl?: string; // public URL from storage
  fixedDay: DayOfWeek;
  fixedTime: string; // HH:mm
  videomaker: string; // user id
  backupTime: string; // HH:mm
  backupDay: DayOfWeek;
  extraDay: DayOfWeek;
  extraContentTypes: ContentType[];
  acceptsExtra: boolean;
  extraClientAppears: boolean;
  whatsapp: string; // 55+DDD+number format
  whatsappGroup?: string; // group ID for sending to groups instead of individual
  weeklyReels: number;
  weeklyCreatives: number;
  weeklyGoal: number;
  hasEndomarketing: boolean;
  hasVehicleFlyer: boolean;
  weeklyStories: number;
  presenceDays: number;
  monthlyRecordings: number;
  niche: string;
  clientLogin?: string;
  clientPassword?: string;
  driveLink?: string;
  driveFotos?: string;
  driveIdentidadeVisual?: string;
  editorial?: string;
  fullShiftRecording?: boolean; // client uses entire shift (morning or afternoon)
  preferredShift?: 'manha' | 'tarde'; // which shift the client prefers
  selectedWeeks: number[]; // which weeks of the month to schedule (e.g. [1,2,3,4])
}

export interface SocialAccount {
  id: string;
  clientId: string;
  platform: 'instagram' | 'facebook';
  facebookPageId?: string;
  instagramBusinessId?: string;
  accountName: string;
  status: 'connected' | 'disconnected' | 'expired';
  tokenExpiration?: string;
  createdAt: string;
}

export type RecordingType = 'fixa' | 'extra' | 'secundaria' | 'backup' | 'endomarketing' | 'avulso';
export type RecordingStatus = 'agendada' | 'concluida' | 'cancelada' | 'organizando_material';
export type ConfirmationStatus = 'pendente' | 'aguardando' | 'confirmada' | 'cancelada';

export interface Recording {
  id: string;
  clientId: string;
  videomakerId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  type: RecordingType;
  status: RecordingStatus;
  confirmationStatus?: ConfirmationStatus;
  prospectName?: string;
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
  endomarketing: 'Endomarketing',
  parceiro: 'Parceiro',
  fotografo: 'Fotografia',
  designer: 'Designer',
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

export type ScriptVideoType = 'vendas' | 'institucional' | 'reconhecimento' | 'educacional' | 'bastidores' | 'depoimento' | 'lancamento';

export const SCRIPT_VIDEO_TYPE_LABELS: Record<ScriptVideoType, string> = {
  vendas: 'Vendas',
  institucional: 'Institucional',
  reconhecimento: 'Reconhecimento',
  educacional: 'Educacional',
  bastidores: 'Bastidores',
  depoimento: 'Depoimento',
  lancamento: 'Lançamento',
};

export type ScriptContentFormat = 'reels' | 'story' | 'criativo';

export const SCRIPT_CONTENT_FORMAT_LABELS: Record<ScriptContentFormat, string> = {
  reels: 'Reels',
  story: 'Story',
  criativo: 'Criativo',
};

export type ScriptPriority = 'normal' | 'priority' | 'urgent';

export const SCRIPT_PRIORITY_LABELS: Record<ScriptPriority, string> = {
  normal: 'Normal',
  priority: 'Prioritário',
  urgent: 'Urgente',
};

export interface Script {
  id: string;
  clientId: string;
  title: string;
  videoType: ScriptVideoType;
  contentFormat: ScriptContentFormat;
  content: string; // HTML from rich editor
  recorded: boolean;
  priority: ScriptPriority;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
  isEndomarketing: boolean;
  endoClientId?: string;
  scheduledDate?: string; // YYYY-MM-DD
  createdBy?: string; // user id
  directToEditing?: boolean; // goes straight to editing queue
  caption?: string; // Instagram caption
  recordingId?: string; // linked avulso recording
}

export interface ActiveRecording {
  recordingId: string;
  videomarkerId: string;
  clientId: string;
  startedAt: string; // ISO datetime
  plannedScriptIds?: string[];
}
