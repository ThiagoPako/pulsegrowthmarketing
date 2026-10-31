import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AgentWorkBadge from '@/components/kanban/AgentWorkBadge';
import UrgentBadge from '@/components/kanban/UrgentBadge';
import AgentReviewBadge from '@/components/kanban/AgentReviewBadge';
import AgentReadinessBadge from '@/components/kanban/AgentReadinessBadge';
import AdjustmentRequestDialog from '@/components/kanban/AdjustmentRequestDialog';
import ConfirmActionDialog, { type ConfirmAction } from '@/components/kanban/ConfirmActionDialog';
import KanbanColumnJumpBar, { kanbanColumnDomId } from '@/components/kanban/KanbanColumnJumpBar';
import { useAgentIds } from '@/hooks/useAgentIds';
import { agentReviewOf, agentWorkState, isUrgent, matchesOwnerFilter, ownerFilterOptions, type OwnerFilter } from '@/lib/agentCardStatus';
import { usePulsePlus } from '@/hooks/usePulsePlus';
import {
  ANALYSIS_FORBIDDEN_MSG, EDITING_NEEDS_FOOTAGE_MSG, SEND_TO_CLIENT_FORBIDDEN_MSG,
  canReleaseAnalysis, isContentManager, missingFootageForEditing,
} from '@/lib/contentKanbanRules';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { useAuth, profileHasRole } from '@/hooks/useAuth';
import { supabase, vpsAuthedFetch } from '@/lib/vpsDb';
import { useCity, CITY_LABELS, type CityCode } from '@/contexts/CityContext';

/** Escopo de visualização do quadro: cidade ativa, uma praça específica ou todas. */
type CityView = 'active' | 'all' | CityCode;

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Plus, GripVertical, Film, Megaphone, Image, Palette, Calendar, Trash2, Edit, X, Search, Filter, FileText, CheckCircle2, AlertTriangle, Clock, ExternalLink, ThumbsUp, MessageSquareWarning, Link2, ArrowRight, ArrowLeft, Send, Eye, Maximize2, Rocket, Download, ChevronLeft, ChevronRight, ArrowDownUp, Lightbulb, Video, Pin, PinOff } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import ClientLogo from '@/components/ClientLogo';
import DeadlineBadge from '@/components/DeadlineBadge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Client, Recording, Script } from '@/types';
import { getWhatsAppConfig, sendWhatsAppMessage } from '@/services/whatsappService';
import { syncContentTaskColumnChange, buildSyncContext } from '@/lib/contentTaskSync';
import ContentTaskDetailSheet from '@/components/content/ContentTaskDetailSheet';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { sanitizeScriptHtml } from '@/lib/highlightQuotes';
import { PINNABLE_COLUMNS, pinToggleMessage, pinToggleUpdate } from '@/lib/pinCard';

const normalizeDateValue = (value?: string | null) => {
  if (!value) return null;
  const normalized = value.includes('T') ? value.slice(0, 10) : value;
  const parsed = new Date(`${normalized}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const safeFormatDate = (value?: string | null, pattern = 'dd/MM/yyyy') => {
  const parsed = normalizeDateValue(value);
  if (!parsed) return '—';

  try {
    return format(parsed, pattern, { locale: ptBR });
  } catch {
    return '—';
  }
};

/* ─── Mini Rocket Icon for headers ─────────────────────────── */
function MiniRocket({ size = 18 }: { size?: number }) {
  return (
    <motion.svg width={size} height={size} viewBox="0 0 64 64" fill="none"
      animate={{ y: [0, -2, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
      <motion.ellipse cx="32" cy="56" rx="5" ry="3"
        animate={{ ry: [3, 5, 3], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 0.4, repeat: Infinity }}
        fill="url(#miniFlame)" />
      <path d="M32 10C27 10 24 18 24 30V42C24 44.5 27 47 32 47C37 47 40 44.5 40 42V30C40 18 37 10 32 10Z" fill="white" fillOpacity="0.95" />
      <circle cx="32" cy="28" r="5" fill="rgba(0,0,0,0.7)" />
      <ellipse cx="31" cy="27.5" rx="2" ry="2.5" fill="white" />
      <ellipse cx="34" cy="27.5" rx="1.5" ry="2" fill="white" />
      <motion.circle cx="31.5" cy="28" r="1" fill="rgba(0,0,0,0.8)"
        animate={{ cx: [31.5, 32, 31, 31.5] }} transition={{ duration: 2.5, repeat: Infinity }} />
      <path d="M24 36L20 42C20 42 22 43.5 24 42.5V36Z" fill="white" fillOpacity="0.7" />
      <path d="M40 36L44 42C44 42 42 43.5 40 42.5V36Z" fill="white" fillOpacity="0.7" />
      <defs>
        <radialGradient id="miniFlame"><stop stopColor="#fbbf24" /><stop offset="1" stopColor="#ef4444" /></radialGradient>
      </defs>
    </motion.svg>
  );
}

// Drag-to-scroll container
function DragScrollContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, [role="button"], [draggable="true"]')) return;
    isDragging.current = true;
    startX.current = e.pageX - el.offsetLeft;
    scrollLeft.current = el.scrollLeft;
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !ref.current) return;
    e.preventDefault();
    const x = e.pageX - ref.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    ref.current.scrollLeft = scrollLeft.current - walk;
  };

  const onMouseUp = () => {
    isDragging.current = false;
    if (ref.current) {
      ref.current.style.cursor = 'grab';
      ref.current.style.userSelect = '';
    }
  };

  return (
    <div
      ref={ref}
      className={`overflow-x-auto cursor-grab ${className || ''}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {children}
    </div>
  );
}

// ─── COLUMN DEFINITIONS ───────────────────────────────────────
const KANBAN_COLUMNS = [
  { id: 'ideias', label: 'Zona de Ideias', lucideIcon: 'lightbulb', gradient: 'from-violet-500 to-purple-600', glow: 'shadow-violet-500/20' },
  { id: 'captacao', label: 'Captação', lucideIcon: 'video', gradient: 'from-orange-400 to-orange-600', glow: 'shadow-orange-500/20' },
  { id: 'edicao', label: 'Edição de Vídeo', lucideIcon: 'film', gradient: 'from-blue-400 to-blue-600', glow: 'shadow-blue-500/20' },
  { id: 'pre_revisao', label: 'Análise', lucideIcon: 'eye', gradient: 'from-purple-400 to-fuchsia-600', glow: 'shadow-purple-500/20' },
  { id: 'revisao', label: 'Revisão', lucideIcon: 'eye', gradient: 'from-teal-400 to-emerald-600', glow: 'shadow-teal-500/20' },
  { id: 'alteracao', label: 'Alteração', lucideIcon: 'edit', gradient: 'from-amber-400 to-yellow-500', glow: 'shadow-amber-500/20' },
  { id: 'envio', label: 'Enviado p/ Cliente', lucideIcon: 'send', gradient: 'from-emerald-400 to-green-600', glow: 'shadow-emerald-500/20' },
  { id: 'agendamentos', label: 'Agendamentos', lucideIcon: 'calendar', gradient: 'from-rose-400 to-red-500', glow: 'shadow-rose-500/20' },
  { id: 'acompanhamento', label: 'Acompanhamento', lucideIcon: 'rocket', gradient: 'from-primary to-blue-600', glow: 'shadow-primary/20' },
] as const;

type KanbanColumnId = typeof KANBAN_COLUMNS[number]['id'];

const COLUMN_ICONS: Record<string, typeof Rocket> = {
  ideias: Lightbulb, captacao: Video, edicao: Film, pre_revisao: Eye, revisao: Eye,
  alteracao: Edit, envio: Send, agendamentos: Calendar, acompanhamento: Rocket,
};

const CONTENT_TYPES = [
  { value: 'reels', label: 'Reels', icon: Film, color: 'text-blue-700 bg-blue-50 border border-blue-200/60 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' },
  { value: 'criativo', label: 'Criativos', icon: Megaphone, color: 'text-purple-700 bg-purple-50 border border-purple-200/60 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800' },
  { value: 'story', label: 'Story', icon: Image, color: 'text-pink-700 bg-pink-50 border border-pink-200/60 dark:bg-pink-900/30 dark:text-pink-400 dark:border-pink-800' },
  { value: 'arte', label: 'Arte', icon: Palette, color: 'text-amber-700 bg-amber-50 border border-amber-200/60 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800' },
  { value: 'otimizacao', label: 'Otimização', icon: Rocket, color: 'text-fuchsia-700 bg-fuchsia-50 border border-fuchsia-200/60 dark:bg-fuchsia-900/30 dark:text-fuchsia-300 dark:border-fuchsia-800' },
];

interface ContentTask {
  id: string;
  client_id: string;
  title: string;
  content_type: string;
  kanban_column: string;
  description: string | null;
  recording_id: string | null;
  script_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  edited_by: string | null;
  scheduled_recording_date: string | null;
  scheduled_recording_time: string | null;
  drive_link: string | null;
  edited_video_link: string | null;
  adjustment_notes: string | null;
  approved_at: string | null;
  approval_sent_at: string | null;
  editing_priority: boolean;
  immediate_alteration: boolean;
  urgent_at?: string | null;
  agent_step_by?: string | null;
  review_deadline: string | null;
  alteration_deadline: string | null;
  approval_deadline: string | null;
  editing_deadline: string | null;
  position: number;
  editing_started_at: string | null;
  created_at: string;
  updated_at: string;
  reviewing_by: string | null;
  reviewing_by_name: string | null;
  reviewing_at: string | null;
  prospect_name: string | null;
  /** Praça de origem da tarefa (usada na visualização multi-cidade). */
  city?: string | null;
  /** Agente de IA com o card (gravado pela API dos agentes no pegar/etapa). */
  agent_step?: string | null;
  agent_heartbeat_at?: string | null;
  /** Parecer do revisor IA na Análise (POST /api/agent/tasks/:id/review). */
  agent_review_verdict?: string | null;
  agent_review_notes?: string | null;
  agent_review_at?: string | null;
  agent_review_by?: string | null;
  /** Fixado para a equipe presencial (src/lib/pinCard.ts): a IA não pega até desfixar. */
  pinned_at?: string | null;
  pinned_by?: string | null;
}

/** Ordem dos cards nas colunas: última movimentação ou prazo da etapa. */
type SortMode = 'recent' | 'deadline';

/** Prazo da etapa em que o card está (o mesmo que o selo de prazo mostra). */
function columnDeadline(task: ContentTask): string | null {
  switch (task.kanban_column) {
    case 'edicao': return task.editing_deadline;
    case 'revisao': return task.review_deadline;
    case 'alteracao': return task.immediate_alteration ? null : task.alteration_deadline;
    case 'envio': return task.approval_deadline;
    case 'agendamentos':
    case 'acompanhamento': return task.scheduled_recording_date;
    default: return null;
  }
}

/**
 * Setas do card (papéis sem restrição): seguem o fluxo, não a coluna vizinha na tela. Antes a seta
 * de Alteração mandava ao cliente pulando a revisão e a de Revisão ia para Alteração sem ajuste.
 * Onde a coluna tem botão próprio (→ Edição, Liberar/Devolver, Aprovar/Ajustes, Reenviar,
 * → Agendamentos, Agendar, Confirmar Postagem) a seta não repete a ação.
 */
const FLOW_ARROWS: Record<string, { forward?: string; backward?: string }> = {
  ideias: { forward: 'captacao' },
  captacao: { backward: 'ideias' },
  edicao: { backward: 'captacao', forward: 'revisao' },
  pre_revisao: {},
  revisao: {},
  alteracao: { forward: 'revisao' },
  envio: { backward: 'alteracao' },
  agendamentos: { backward: 'envio' },
  acompanhamento: { backward: 'agendamentos' },
};

/** Destinos que abrem um diálogo antes de mover (ajuste, agendamento ou confirmação de envio). */
const DIALOG_TARGETS = new Set(['alteracao', 'acompanhamento', 'envio']);

const SEND_TO_CLIENT_DESCRIPTION = (
  <>
    <p>O vídeo fica visível no portal do cliente e ele recebe o aviso pelo WhatsApp.</p>
    <p>Use quando a revisão já aprovou o vídeo. Não dá para desfazer o aviso.</p>
  </>
);

export default function ContentKanban() {
  const { clients, recordings, scripts, users } = useApp();
  const { user, profile } = useAuth();
  const { activeCity, availableCities } = useCity();
  const [tasks, setTasks] = useState<ContentTask[]>([]);
  // Visualização por cidade: permite ver todas as praças sem trocar de cidade ativa.
  const [cityView, setCityView] = useState<CityView>('active');
  // Clientes de outras cidades (somente leitura) para exibir o nome no cartão.
  const [foreignClients, setForeignClients] = useState<Record<string, { id: string; companyName: string; color: string; logoUrl?: string }>>({});
  const [loading, setLoading] = useState(true);
  // Card que acabou de mudar de coluna: brilha e a tela rola até ele (o usuário vê para onde foi)
  const [flashId, setFlashId] = useState<string | null>(null);
  const flashCard = useCallback((id: string) => {
    setFlashId(id);
    window.setTimeout(() => setFlashId(cur => (cur === id ? null : cur)), 1500);
    window.requestAnimationFrame(() => window.setTimeout(() => {
      document.getElementById(`task-card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }, 60));
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ContentTask | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClient, setFilterClient] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  // Filtro "Responsável": agente de IA, equipe, sem responsável, prontos para a IA, agente sem sinal
  const [filterOwner, setFilterOwner] = useState<OwnerFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const agentIds = useAgentIds();
  // Sem Pulse Plus: nada que marque card ou pessoa como agente (selos, filtros, parecer)
  const pulsePlus = usePulsePlus();
  // Confirmação de ação que não dá para desfazer pela tela (enviar ao cliente)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  // Drag state
  const [draggedTask, setDraggedTask] = useState<ContentTask | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Form state
  const [formClientId, setFormClientId] = useState<string | null>('');
  const [formProspectName, setFormProspectName] = useState('');
  const [isUnregistered, setIsUnregistered] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState('reels');
  const [formDescription, setFormDescription] = useState('');
  const [formColumn, setFormColumn] = useState<KanbanColumnId>('ideias');
  const [formAssignedTo, setFormAssignedTo] = useState('');
  const [formRecordingId, setFormRecordingId] = useState('');
  const [formScriptId, setFormScriptId] = useState('');
  const [formSchedDate, setFormSchedDate] = useState('');
  const [formSchedTime, setFormSchedTime] = useState('');
  const [formDriveLink, setFormDriveLink] = useState('');
  const [formVideoLink, setFormVideoLink] = useState('');
  // Coluna em que o diálogo abriu (card novo): base da validação de editor/videomaker
  const [dialogInitialColumn, setDialogInitialColumn] = useState<string>('ideias');

  // Quick link dialog
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDialogTask, setLinkDialogTask] = useState<ContentTask | null>(null);
  const [linkDialogType, setLinkDialogType] = useState<'drive' | 'video'>('drive');
  const [linkDialogValue, setLinkDialogValue] = useState('');

  // Quick schedule dialog
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleDialogTask, setScheduleDialogTask] = useState<ContentTask | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [deleteTaskTitle, setDeleteTaskTitle] = useState('');

  // Detail sheet
  const [detailTask, setDetailTask] = useState<ContentTask | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  // Tracks which highlight IDs have already been opened (avoids re-opening after close)
  const handledHighlightRef = useRef<Set<string>>(new Set());
  // ─── FETCH ─────────────────────────────────────────────────
  // Cidades que devem ser carregadas conforme o botão de visualização escolhido.
  const citiesToLoad = useMemo<CityCode[]>(() => {
    if (cityView === 'active') return [activeCity];
    if (cityView === 'all') {
      const list = availableCities.length ? availableCities : [activeCity];
      return Array.from(new Set([activeCity, ...list])) as CityCode[];
    }
    return [cityView];
  }, [cityView, activeCity, availableCities]);

  /**
   * Consulta as tarefas de uma cidade específica.
   * O header `x-pulse-city` é sobrescrito por requisição, então é possível ler
   * outra praça sem alterar a cidade ativa do usuário (que continua sendo a
   * única em que ele pode editar).
   */
  const fetchTasksForCity = useCallback(async (city: CityCode): Promise<ContentTask[]> => {
    const response = await vpsAuthedFetch('/db/query', {
      method: 'POST',
      headers: { 'x-pulse-city': city },
      // Arquivados não aparecem no Kanban: o filtro fica no servidor (antes vinha a tabela
      // inteira a cada 15 s e o descarte era só na tela)
      body: JSON.stringify({
        table: 'content_tasks',
        operation: 'select',
        select: '*',
        filters: [{ column: '_or', op: 'or', value: 'kanban_column.neq.arquivado,kanban_column.is.null' }],
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error?.message || payload?.error || `HTTP ${response.status}`);
    }
    const rows: ContentTask[] = Array.isArray(payload?.data) ? payload.data : [];
    // Marca a praça de origem para exibir o selo e bloquear edição fora da cidade ativa.
    return rows.map(t => ({ ...t, city: (t as any).city || city } as ContentTask));
  }, []);

  // Retry com backoff exponencial para resistir a falhas transitórias de rede
  // (ex.: PM2 restart, picos de latência). Não exibe erro ao usuário até esgotar.
  const fetchTasks = useCallback(async () => {
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const results = await Promise.all(citiesToLoad.map(city => fetchTasksForCity(city)));
        // Tarefas sem cidade definida aparecem em todas as consultas — deduplicar por id.
        const byId = new Map<string, ContentTask>();
        for (const list of results) {
          for (const task of list) if (!byId.has(task.id)) byId.set(task.id, task);
        }
        const data = Array.from(byId.values());
        // Fallback: tarefas sem recording_id presas em 'captacao' voltam visualmente para 'ideias'
        const normalized = data.map(t =>
          (t.kanban_column === 'captacao' && !t.recording_id)
            ? { ...t, kanban_column: 'ideias' }
            : t
        ).sort((a, b) => {
          const posA = typeof a.position === 'number' ? a.position : Number.MAX_SAFE_INTEGER;
          const posB = typeof b.position === 'number' ? b.position : Number.MAX_SAFE_INTEGER;
          if (posA !== posB) return posA - posB;
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
        setTasks(normalized);
        setLoading(false);
        return;
      } catch (err: any) {
        const isLast = attempt === MAX_ATTEMPTS;
        if (isLast) {
          console.error('Error fetching content_tasks (after retries):', err?.message || err);
          setLoading(false);
          return;
        }
        // Backoff: 500ms, 1500ms
        await new Promise(r => setTimeout(r, attempt * 500 + 500 * (attempt - 1)));
      }
    }
  }, [citiesToLoad, fetchTasksForCity]);

  // Carrega os clientes das outras praças apenas para leitura dos cartões.
  useEffect(() => {
    const foreignCities = citiesToLoad.filter(c => c !== activeCity);
    if (foreignCities.length === 0) { setForeignClients({}); return; }
    let cancelled = false;
    (async () => {
      const map: Record<string, { id: string; companyName: string; color: string; logoUrl?: string }> = {};
      await Promise.all(foreignCities.map(async city => {
        try {
          const response = await vpsAuthedFetch('/db/query', {
            method: 'POST',
            headers: { 'x-pulse-city': city },
            body: JSON.stringify({ table: 'clients', operation: 'select', select: 'id,company_name,color,logo_url' }),
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !Array.isArray(payload?.data)) return;
          for (const row of payload.data) {
            map[row.id] = {
              id: row.id,
              companyName: row.company_name || 'Cliente',
              color: row.color || '220 10% 50%',
              logoUrl: row.logo_url || undefined,
            };
          }
        } catch {
          /* silencioso: a visualização de outra praça é apenas informativa */
        }
      }));
      if (!cancelled) setForeignClients(map);
    })();
    return () => { cancelled = true; };
  }, [citiesToLoad, activeCity]);


  // "Reprocessar presas" chamava a edge function content-tasks-autofix, que não existe na VPS:
  // falhava sempre (e disparava a cada abertura do Kanban). Botão e painel foram retirados; os
  // cards saem de Captação pelo fluxo da gravação (Agenda/Videomaker).

  useEffect(() => {
    fetchTasks();
    // Poll every 15s for near real-time updates (VPS has no websocket channels).
    // Com a aba escondida não consulta; atualiza na hora em que a aba volta a ficar visível.
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      fetchTasks();
    }, 15000);
    const onVisibility = () => { if (document.visibilityState === 'visible') fetchTasks(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchTasks]);

  // Deep-link highlight: open detail sheet of mentioned card and scroll to it.
  // Robust on page reload: waits tasks to load, falls back to direct DB fetch,
  // and never re-opens after the user closes the sheet.
  useEffect(() => {
    if (!highlightId) return;
    if (handledHighlightRef.current.has(highlightId)) return;
    if (loading) return; // wait until first fetch completes

    let cancelled = false;

    const openCard = (task: ContentTask) => {
      if (cancelled) return;
      handledHighlightRef.current.add(highlightId);
      setDetailTask(task);
      setDetailOpen(true);
      setSearchParams({}, { replace: true });
      // Wait for the card to actually exist in the DOM before scrolling.
      // Uses MutationObserver instead of a fixed timeout so it works regardless
      // of render timing (lazy lists, animations, async children, etc.).
      const cardSelector = `#task-card-${highlightId}`;
      const scrollToCard = (el: Element) => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
      const existing = document.querySelector(cardSelector);
      if (existing) {
        scrollToCard(existing);
        return;
      }
      const observer = new MutationObserver(() => {
        const el = document.querySelector(cardSelector);
        if (el) {
          scrollToCard(el);
          observer.disconnect();
          clearTimeout(failSafe);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      // Safety net: stop observing after 5s to avoid leaks if card never renders
      const failSafe = window.setTimeout(() => observer.disconnect(), 5000);
    };

    const local = tasks.find(t => t.id === highlightId);
    if (local) {
      openCard(local);
      return;
    }

    // Fallback: task not in current state (stale cache, recently created, etc.)
    // Fetch directly from DB to guarantee the right card opens.
    (async () => {
      try {
        const { data, error } = await supabase
          .from('content_tasks')
          .select('*')
          .eq('id', highlightId)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          handledHighlightRef.current.add(highlightId);
          toast.error('Card não encontrado (pode ter sido removido)');
          setSearchParams({}, { replace: true });
          return;
        }
        openCard(data as ContentTask);
      } catch {
        if (!cancelled) {
          handledHighlightRef.current.add(highlightId);
          setSearchParams({}, { replace: true });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [highlightId, tasks, loading, setSearchParams]);

  // ─── HELPERS ───────────────────────────────────────────────
  const getClient = (id: string) => clients.find(c => c.id === id) || (foreignClients[id] as any);
  // Tarefas de outra praça são apenas para consulta: edições continuam na cidade ativa.
  const normalizeCity = (value?: string | null) =>
    String(value || activeCity).trim().toLowerCase().replace('ç', 'c');
  const isForeignTask = (task: ContentTask) => normalizeCity(task.city) !== activeCity;

  const getTypeConfig = (type: string) => CONTENT_TYPES.find(t => t.value === type) || CONTENT_TYPES[0];
  const getUser = (id: string | null) => id ? users.find(u => u.id === id) : null;

  const clientRecordings = useMemo(() => {
    if (!formClientId) return [];
    return recordings.filter(r => r.clientId === formClientId && r.status === 'agendada');
  }, [formClientId, recordings]);

  const clientScripts = useMemo(() => {
    if (!formClientId) return [];
    return scripts.filter(s => s.clientId === formClientId && !s.recorded);
  }, [formClientId, scripts]);

  // ─── FILTERED TASKS ────────────────────────────────────────
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      // Hide archived cards ('postado' = publicados pelo robô antes da correção; caíam na Zona de Ideias)
      if (t.kanban_column === 'arquivado' || t.kanban_column === 'postado') return false;
      // Rule: approved criativos only appear in Traffic Management
      if (t.content_type === 'criativo' && t.approved_at) return false;
      if (filterClient !== 'all' && t.client_id !== filterClient) return false;
      if (filterType !== 'all' && t.content_type !== filterType) return false;
      if (filterOwner !== 'all' && !matchesOwnerFilter(t, filterOwner, agentIds)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const client = getClient(t.client_id);
        if (!t.title.toLowerCase().includes(q) && !client?.companyName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tasks, filterClient, filterType, filterOwner, agentIds, searchQuery, clients, foreignClients]);

  const tasksByColumn = useMemo(() => {
    const map: Record<string, ContentTask[]> = {};
    KANBAN_COLUMNS.forEach(col => { map[col.id] = []; });
    filteredTasks.forEach(t => {
      if (map[t.kanban_column]) map[t.kanban_column].push(t);
      else map['ideias'].push(t);
    });
    // Ordem: última movimentação no topo, ou (Ordem: prazo) imediata/prioridade e prazo da etapa mais próximo
    const byRecent = (a: ContentTask, b: ContentTask) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    const deadlineTime = (t: ContentTask) => {
      const value = columnDeadline(t);
      const time = value ? new Date(value).getTime() : NaN;
      return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
    };
    // fixados (equipe presencial) no topo das colunas de edição
    // 🔥 urgentes acima de tudo (prioridade total), depois os fixados (equipe presencial)
    const byPinned = (a: ContentTask, b: ContentTask) => (Number(isUrgent(b)) - Number(isUrgent(a)))
      || (Number(!!b.pinned_at) - Number(!!a.pinned_at));
    Object.keys(map).forEach(colId => {
      map[colId].sort(sortMode === 'deadline'
        ? (a, b) => byPinned(a, b) || (Number(!!b.immediate_alteration) - Number(!!a.immediate_alteration))
          || (Number(!!b.editing_priority) - Number(!!a.editing_priority))
          || (deadlineTime(a) - deadlineTime(b))
          || byRecent(a, b)
        : (a, b) => byPinned(a, b) || byRecent(a, b));
    });
    return map;
  }, [filteredTasks, sortMode]);

  // ─── CRUD ──────────────────────────────────────────────────
  const resetForm = () => {
    setFormClientId(''); setFormProspectName(''); setIsUnregistered(false);
    setFormTitle(''); setFormType('reels');
    setFormDescription(''); setFormColumn('ideias'); setFormAssignedTo('');
    setFormRecordingId(''); setFormScriptId('');
    setFormSchedDate(''); setFormSchedTime('');
    setFormDriveLink(''); setFormVideoLink('');
    setEditingTask(null);
  };

  const openNew = (column?: KanbanColumnId) => {
    resetForm();
    if (column) setFormColumn(column);
    setDialogInitialColumn(column || 'ideias');
    setDialogOpen(true);
  };

  const openEdit = (task: ContentTask) => {
    setEditingTask(task);
    setFormClientId(task.client_id || '');
    setFormProspectName(task.prospect_name || '');
    setIsUnregistered(!task.client_id && !!task.prospect_name);
    setFormTitle(task.title);
    setFormType(task.content_type);
    setFormDescription(task.description || '');
    setFormColumn(task.kanban_column as KanbanColumnId);
    setFormAssignedTo(task.assigned_to || '');
    setFormRecordingId(task.recording_id || '');
    setFormScriptId(task.script_id || '');
    setFormSchedDate(task.scheduled_recording_date || '');
    setFormSchedTime(task.scheduled_recording_time || '');
    setFormDriveLink(task.drive_link || '');
    setFormVideoLink(task.edited_video_link || '');
    setDialogOpen(true);
  };

  const handleSave = async (confirmedSend = false) => {
    if ((!formClientId && !isUnregistered) || !formTitle) {
      toast.error('Preencha cliente e título');
      return;
    }
    if (isUnregistered && !formProspectName.trim()) {
      toast.error('Informe o nome do cliente');
      return;
    }
    const payload: any = {
      client_id: isUnregistered ? null : formClientId,
      prospect_name: isUnregistered ? formProspectName : null,
      title: formTitle,
      content_type: formType,
      kanban_column: formColumn,
      description: formDescription || null,
      assigned_to: (formAssignedTo && formAssignedTo !== 'none') ? formAssignedTo : null,
      recording_id: (formRecordingId && formRecordingId !== 'none') ? formRecordingId : null,
      script_id: (formScriptId && formScriptId !== 'none') ? formScriptId : null,
      scheduled_recording_date: formSchedDate || null,
      scheduled_recording_time: formSchedTime || null,
      drive_link: formDriveLink || null,
      edited_video_link: formVideoLink || null,
      updated_at: new Date().toISOString(),
    };

    // Entrar em Alteração pelo diálogo deixava o editor sem saber o que mudar; ir para "Enviado p/
    // Cliente" libera o vídeo no portal e avisa o cliente: pede confirmação, como no arrastar.
    const enteringColumn = editingTask
      ? (editingTask.kanban_column !== payload.kanban_column ? payload.kanban_column : null)
      : payload.kanban_column;
    // Trocar a coluna pelo "Editar" passa pelas mesmas regras do arrastar, para todos os papéis
    // (papel, Análise, brutos para Edição, vídeo para Revisão). Antes só editor/videomaker.
    if (editingTask && enteringColumn) {
      const transitionError = validateKanbanTransition(
        { ...editingTask, ...payload, kanban_column: editingTask.kanban_column } as ContentTask,
        enteringColumn
      );
      if (transitionError) { toast.error(transitionError); return; }
    }
    if (!editingTask) {
      // Card novo fora da coluna em que o diálogo abriu: mesmas regras do arrastar
      if (isRestricted && payload.kanban_column !== dialogInitialColumn) {
        const transitionError = validateKanbanTransition(
          { ...payload, kanban_column: dialogInitialColumn } as ContentTask,
          payload.kanban_column
        );
        if (transitionError) { toast.error(transitionError); return; }
      }
      // Card novo direto em Edição também precisa dos brutos (entra livre na fila)
      if (payload.kanban_column === 'edicao' && missingFootageForEditing(payload)) {
        toast.error(EDITING_NEEDS_FOOTAGE_MSG);
        return;
      }
    }
    if (enteringColumn === 'alteracao') {
      toast.error('Para mandar para Alteração use "Ajustes" no card: o editor precisa saber o que mudar.');
      return;
    }
    if (enteringColumn === 'envio' && !confirmedSend) {
      setConfirmAction({
        title: 'Enviar ao cliente?',
        description: SEND_TO_CLIENT_DESCRIPTION,
        confirmLabel: 'Salvar e enviar ao cliente',
        onConfirm: () => handleSave(true),
      });
      return;
    }

    if (editingTask) {
      // Auto-move to acompanhamento if in agendamentos and date+time are set
      if (payload.kanban_column === 'agendamentos' && payload.scheduled_recording_date && payload.scheduled_recording_time) {
        payload.kanban_column = 'acompanhamento';
      }
      const columnChanged = editingTask.kanban_column !== payload.kanban_column;
      // (a troca de coluna já passou pelas regras do arrastar lá em cima)
      const { error } = await supabase.from('content_tasks').update(payload).eq('id', editingTask.id);
      if (error) { toast.error(`Não foi possível salvar o cartão${error.message ? `: ${error.message}` : '. Tente de novo.'}`); return; }
      toast.success(payload.kanban_column === 'acompanhamento' && editingTask.kanban_column === 'agendamentos'
        ? 'Agendado! Movido para Acompanhamento'
        : 'Cartão atualizado');

      // If column changed, sync with social media and other modules
      if (columnChanged) {
        // Mantém a coluna de origem no card passado ao sync (ele sabe de onde o card veio)
        const updatedTask = { ...editingTask, ...payload, kanban_column: editingTask.kanban_column };
        await syncOnColumnChange(updatedTask, payload.kanban_column);
      }

      // Sync: if moved to captacao and has recording, mark recording accordingly
      if (payload.kanban_column === 'captacao' && formRecordingId) {
        // Link exists, no extra action needed
      }
      // If moved to edicao and has script, mark script as recorded
      if (payload.kanban_column === 'edicao' && formScriptId) {
        await supabase.from('scripts').update({ recorded: true } as any).eq('id', formScriptId);
      }
    } else {
      // (as regras do card novo já foram conferidas lá em cima)
      payload.created_by = user?.id || null;
      payload.position = tasksByColumn[formColumn]?.length || 0;
      const { data: inserted, error } = await supabase.from('content_tasks').insert(payload).select().single();
      if (error || !inserted) { toast.error(`Não foi possível criar o cartão${error?.message ? `: ${error.message}` : '. Tente de novo.'}`); return; }
      toast.success('Cartão criado');

      // Trigger sync for the initial column (sets deadlines, etc.)
      if (payload.kanban_column !== 'ideias') {
        const client = clients.find(c => c.id === inserted.client_id);
        const ctx = buildSyncContext(inserted as any, {
          userId: user?.id,
          clientName: client?.companyName,
          clientWhatsapp: client?.whatsapp,
        });
        await syncContentTaskColumnChange(payload.kanban_column, ctx);
      }
    }
    setDialogOpen(false);
    resetForm();
    fetchTasks();
  };

  const openDeleteConfirm = (task: ContentTask) => {
    setDeleteTaskId(task.id);
    setDeleteTaskTitle(task.title);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTaskId) return;
    try {
      const { deleteContentTask } = await import('@/lib/contentDeleteSync');
      await deleteContentTask(deleteTaskId);
      toast.success('Tarefa excluída com sucesso');
    } catch (err: any) {
      toast.error(`Não foi possível excluir${err?.message ? `: ${err.message}` : '. Tente de novo.'}`);
    }
    setDeleteDialogOpen(false);
    setDeleteTaskId(null);
    fetchTasks();
  };

  // ─── DRAG & DROP ───────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, task: ContentTask) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, targetColumn: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (!draggedTask || draggedTask.kanban_column === targetColumn) {
      setDraggedTask(null);
      return;
    }

    // Agente com sinal recente está renderizando: mover agora faz a entrega dele ser recusada
    const agentBlock = agentBusyMessage(draggedTask);
    if (agentBlock) {
      toast.error(agentBlock);
      setDraggedTask(null);
      return;
    }

    // ─── VALIDATION RULES ─────────────────────────────────
    const validationError = validateKanbanTransition(draggedTask, targetColumn);
    if (validationError) {
      toast.error(validationError);
      setDraggedTask(null);
      return;
    }
    // Alteração pede o ajuste, Acompanhamento pede a data e "Enviado p/ Cliente" pede confirmação
    if (DIALOG_TARGETS.has(targetColumn)) {
      requestMove(draggedTask, targetColumn);
      setDraggedTask(null);
      return;
    }

    const oldColumn = draggedTask.kanban_column;
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === draggedTask.id ? { ...t, kanban_column: targetColumn } : t
    ));
    flashCard(draggedTask.id);

    const result = await updateTaskRow(draggedTask.id, {
      kanban_column: targetColumn,
      // Revisão tira o editor; Edição entra livre na fila (humanos e agentes pegam)
      ...(targetColumn === 'revisao' || targetColumn === 'edicao' ? { assigned_to: null } : {}),
      updated_at: new Date().toISOString(),
    });

    if (result.status !== 'ok') {
      toast.error(updateErrorMessage(result, 'mover o cartão'));
      setTasks(prev => prev.map(t =>
        t.id === draggedTask.id ? { ...t, kanban_column: oldColumn } : t
      ));
    } else {
      // Sync with other modules
      await syncOnColumnChange(draggedTask, targetColumn);
      toast.success(`Movido para ${KANBAN_COLUMNS.find(c => c.id === targetColumn)?.label}`);
    }
    setDraggedTask(null);
  };

  // ─── ROLE-BASED COLUMN PERMISSIONS ────────────────────────
  // Decisão do dono (26/10/2026): só a gestão (admin, social media, gestor de projetos) move qualquer
  // card e manda para "Enviado p/ Cliente". Editor e videomaker movem só nas colunas deles; os
  // outros papéis só visualizam. O servidor também recusa o envio ao cliente de quem não é da gestão.
  const ROLE_ALLOWED_COLUMNS: Record<string, string[]> = {
    editor: ['edicao', 'alteracao', 'revisao'], // editor can move to edicao/alteracao/revisao only
    // videomaker: Ideias/Captação, entrega para Edição (com os brutos) e alteração de stories
    videomaker: ['ideias', 'captacao', 'edicao', 'alteracao', 'revisao'],
  };

  const isManager = isContentManager(profile);
  // Papel que vale para as regras do quadro: a gestão pelo papel principal; fora dela, editor ou
  // videomaker (também como papel adicional); qualquer outro só visualiza
  const userRole = isManager
    ? (profile?.role || '')
    : profileHasRole(profile, 'editor') ? 'editor'
      : profileHasRole(profile, 'videomaker') ? 'videomaker'
        : (profile?.role || '');
  const isRestricted = !isManager;

  // All columns visible to everyone (view-only for non-permitted columns)
  const visibleColumns = useMemo(() => [...KANBAN_COLUMNS], []);

  // Columns where user can interact (drag, add, execute actions)
  const interactiveColumns = useMemo(() => {
    if (isManager) return KANBAN_COLUMNS.map(c => c.id) as string[];
    if (userRole === 'editor') return ['edicao', 'revisao', 'alteracao'];
    if (userRole === 'videomaker') return ['ideias', 'captacao', 'alteracao', 'revisao'];
    return [] as string[];
  }, [isManager, userRole]);

  const isColumnInteractive = (colId: string) => interactiveColumns.includes(colId);

  // ─── VALIDATION FOR TRANSITIONS ───────────────────────────
  const validateKanbanTransition = (task: ContentTask, targetColumn: string): string | null => {
    // Role-based restrictions
    if (isRestricted) {
      if (targetColumn === 'envio') return SEND_TO_CLIENT_FORBIDDEN_MSG;
      const allowed = ROLE_ALLOWED_COLUMNS[userRole];
      if (!allowed) return 'Seu papel só visualiza este quadro: quem move os cards é a gestão.';
      if (allowed && !allowed.includes(targetColumn)) {
        const roleLabel = userRole === 'editor' ? 'Editores' : 'Videomakers';
        return `${roleLabel} não têm permissão para mover cards para esta coluna.`;
      }
      // Editor can only move FROM their allowed columns
      if (userRole === 'editor' && !['edicao', 'alteracao'].includes(task.kanban_column)) {
        return 'Editores só podem mover cards que estejam em Edição ou Alteração.';
      }
      // Videomaker: own columns + alteração apenas em stories
      if (userRole === 'videomaker') {
        const allowedFrom = ['ideias', 'captacao'];
        const isStoryAlteracao = task.kanban_column === 'alteracao' && task.content_type === 'story';
        if (!allowedFrom.includes(task.kanban_column) && !isStoryAlteracao) {
          return 'Videomakers só podem mover cards em Ideias, Captação ou Alteração de Stories.';
        }
        // Restrict alteração transitions to story content
        if (targetColumn === 'alteracao' && task.content_type !== 'story') {
          return 'Videomakers só podem atuar em alterações de Stories.';
        }
      }
    }
    // Análise: liberar para a revisão humana ou devolver é do admin e da social media (e da chefe IA)
    if (task.kanban_column === 'pre_revisao' && targetColumn !== 'pre_revisao' && !canReleaseAnalysis(profile)) {
      return ANALYSIS_FORBIDDEN_MSG;
    }
    // Para entrar em Edição só o link dos brutos é obrigatório. Antes exigia responsável, e quem era
    // escolhido virava dono: o card saía da fila livre dos editores e dos agentes.
    if (targetColumn === 'edicao' && task.kanban_column !== 'edicao' && missingFootageForEditing(task)) {
      return EDITING_NEEDS_FOOTAGE_MSG;
    }
    // edicao → revisao: needs edited_video_link
    if (targetColumn === 'revisao' && !task.edited_video_link) {
      return 'O editor precisa adicionar o link do vídeo editado antes de enviar para revisão';
    }
    // revisao → envio: should go through social media flow
    // envio → agendamentos: needs approval (approved_at)
    return null;
  };

  // ─── SYNC WITH OTHER MODULES ──────────────────────────────
  const syncOnColumnChange = async (task: ContentTask, newColumn: string, historyDetails?: string | null) => {
    const client = clients.find(c => c.id === task.client_id);
    const ctx = buildSyncContext(task as any, {
      userId: user?.id,
      clientName: client?.companyName,
      clientWhatsapp: client?.whatsapp,
      historyDetails,
    });
    await syncContentTaskColumnChange(newColumn, ctx);
  };

  // Update do card conferindo se alguma linha mudou: card de outra cidade (ou já removido)
  // volta vazio do servidor, sem erro. Antes o handler seguia, mostrava sucesso e sincronizava.
  const MISSING_TASK_MSG = 'Este card não está na cidade ativa (ou foi removido). Nada foi alterado.';
  type UpdateResult = { status: 'ok' } | { status: 'missing' } | { status: 'error'; message: string | null };
  const updateTaskRow = async (taskId: string, payload: Record<string, any>): Promise<UpdateResult> => {
    const { data, error } = await supabase.from('content_tasks').update(payload as any).eq('id', taskId).select('id');
    if (error) return { status: 'error', message: error.message || null };
    if (!data || (Array.isArray(data) && data.length === 0)) return { status: 'missing' };
    return { status: 'ok' };
  };
  // Mensagem de erro com o motivo do servidor (antes era só "Erro ao mover cartão")
  const updateErrorMessage = (result: UpdateResult, action: string) => {
    if (result.status === 'missing') return MISSING_TASK_MSG;
    const message = result.status === 'error' ? result.message : null;
    return `Não foi possível ${action}${message ? `: ${message}` : '. Tente de novo.'}`;
  };

  // ─── APPROVE FROM REVISÃO ─────────────────────────────────
  const handleApproveTask = async (task: ContentTask) => {
    const result = await updateTaskRow(task.id, {
      kanban_column: 'envio',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (result.status !== 'ok') { toast.error(updateErrorMessage(result, 'aprovar')); return; }
    await syncOnColumnChange(task, 'envio');
    toast.success('✅ Conteúdo aprovado! Movido para Enviado p/ Cliente');
    fetchTasks();
  };

  // ─── REQUEST ADJUSTMENTS ──────────────────────────────────
  // Toda ida para Alteração passa por aqui (botão Ajustes, Devolver da Análise, seta ou arrastar)
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [adjustmentTask, setAdjustmentTask] = useState<ContentTask | null>(null);
  const [adjustmentInitialNotes, setAdjustmentInitialNotes] = useState('');

  const openAdjustmentDialog = (task: ContentTask, initialNotes = '') => {
    setAdjustmentTask(task);
    setAdjustmentInitialNotes(initialNotes);
    setAdjustmentDialogOpen(true);
  };

  const handleRequestAdjustments = async (notes: string, immediate: boolean): Promise<boolean> => {
    if (!adjustmentTask || !notes.trim()) {
      toast.error('Descreva os ajustes necessários');
      return false;
    }

    const result = await updateTaskRow(adjustmentTask.id, {
      kanban_column: 'alteracao',
      adjustment_notes: notes.trim(),
      immediate_alteration: immediate,
      assigned_to: null,
      updated_at: new Date().toISOString(),
    });
    if (result.status !== 'ok') { toast.error(updateErrorMessage(result, 'pedir os ajustes')); return false; }

    // Use shared sync for full cross-module synchronization. O texto do ajuste vai para o
    // histórico (antes só ficava no card e se perdia na alteração seguinte).
    const client = clients.find(c => c.id === adjustmentTask.client_id);
    const ctx = buildSyncContext({ ...adjustmentTask, immediate_alteration: immediate } as any, {
      userId: user?.id,
      clientName: client?.companyName,
      clientWhatsapp: client?.whatsapp,
      historyDetails: `${adjustmentTask.kanban_column === 'pre_revisao' ? 'Devolvido da Análise · ' : ''}Ajustes: ${notes.trim()}`,
    });
    await syncContentTaskColumnChange('alteracao', ctx);

    toast.success(immediate ? '🚨 Ajustes IMEDIATOS solicitados!' : '📝 Ajustes solicitados! Movido para Alteração');
    setAdjustmentTask(null);
    fetchTasks();
    return true;
  };

  // ─── CONFIRM POSTED (archive card) ────────────────────────
  const handleConfirmPosted = async (task: ContentTask) => {
    const result = await updateTaskRow(task.id, {
      kanban_column: 'arquivado',
      updated_at: new Date().toISOString(),
    });

    if (result.status !== 'ok') { toast.error(updateErrorMessage(result, 'arquivar')); return; }

    await supabase.from('social_media_deliveries').update({
      status: 'postado',
      posted_at: format(new Date(), 'yyyy-MM-dd'),
    } as any).eq('content_task_id', task.id);
    // Mesmo efeito do "Postado" do Social Media: cancela a postagem automática pendente (senão o
    // robô postava de novo), registra o histórico e avisa o portal
    await syncOnColumnChange(task, 'arquivado');

    toast.success(`✅ ${task.title} confirmado como postado e arquivado!`);
    fetchTasks();
  };

  // ─── FIXAR (equipe presencial; a IA não pega até desfixar) ─
  const canPin = isManager || userRole === 'editor' || userRole === 'videomaker';
  const handleTogglePin = async (task: ContentTask) => {
    if (!user) return;
    const pinning = !task.pinned_at;
    const result = await updateTaskRow(task.id, pinToggleUpdate(task, user.id, agentIds));
    if (result.status !== 'ok') { toast.error(updateErrorMessage(result, pinning ? 'fixar o cartão' : 'desfixar o cartão')); return; }
    toast.success(pinToggleMessage(pinning, pulsePlus));
    fetchTasks();
  };

  // ─── QUICK LINK DIALOG ────────────────────────────────────
  const openLinkDialog = (task: ContentTask, type: 'drive' | 'video') => {
    setLinkDialogTask(task);
    setLinkDialogType(type);
    setLinkDialogValue(type === 'drive' ? (task.drive_link || '') : (task.edited_video_link || ''));
    setLinkDialogOpen(true);
  };

  const handleSaveLink = async () => {
    if (!linkDialogTask || !linkDialogValue.trim()) {
      toast.error('Insira um link válido');
      return;
    }
    if (!/^https?:\/\//i.test(linkDialogValue.trim())) {
      toast.error('Cole o link completo, começando com https://');
      return;
    }
    const field = linkDialogType === 'drive' ? 'drive_link' : 'edited_video_link';
    const result = await updateTaskRow(linkDialogTask.id, {
      [field]: linkDialogValue.trim(),
      updated_at: new Date().toISOString(),
    });
    if (result.status !== 'ok') { toast.error(updateErrorMessage(result, 'salvar o link')); return; }
    toast.success(linkDialogType === 'drive' ? '📁 Link do Drive salvo!' : '🎬 Link do vídeo salvo!');
    setLinkDialogOpen(false);
    setLinkDialogTask(null);
    fetchTasks();
  };

  // ─── QUICK MOVE TO ANY COLUMN ────────────────────────────
  const handleMoveToColumn = async (task: ContentTask, targetColumn: string, historyDetails?: string | null) => {
    const validationError = validateKanbanTransition(task, targetColumn);
    if (validationError) { toast.error(validationError); return; }

    const updatePayload: Record<string, any> = {
      kanban_column: targetColumn,
      updated_at: new Date().toISOString(),
    };
    // Clear assigned_to when moving to revisao or envio; Edição entra livre na fila (humanos e agentes pegam)
    if (targetColumn === 'revisao' || targetColumn === 'envio' || targetColumn === 'edicao') {
      updatePayload.assigned_to = null;
    }

    const oldColumn = task.kanban_column;
    // Optimistic
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, kanban_column: targetColumn } : t));
    flashCard(task.id);

    const result = await updateTaskRow(task.id, updatePayload);
    if (result.status !== 'ok') {
      toast.error(updateErrorMessage(result, 'mover o cartão'));
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, kanban_column: oldColumn } : t));
      return;
    }

    await syncOnColumnChange(task, targetColumn, historyDetails);
    toast.success(`Movido para ${KANBAN_COLUMNS.find(c => c.id === targetColumn)?.label}`);
    fetchTasks();
  };

  // Alias for backward compat
  const handleMoveToNext = handleMoveToColumn;

  /**
   * Movimento pedido por seta, arrastar ou botão: Alteração abre o pedido de ajuste, Acompanhamento
   * abre o agendamento (data e hora) e "Enviado p/ Cliente" pede confirmação (o cliente é avisado).
   */
  const requestMove = (task: ContentTask, targetColumn: string) => {
    const validationError = validateKanbanTransition(task, targetColumn);
    if (validationError) { toast.error(validationError); return; }
    if (targetColumn === 'alteracao') {
      const review = agentReviewOf(task);
      openAdjustmentDialog(task, review?.verdict === 'ajustes' ? review.notes || '' : '');
      return;
    }
    if (targetColumn === 'acompanhamento') { openScheduleDialog(task); return; }
    if (targetColumn === 'envio') {
      setConfirmAction({
        title: 'Enviar ao cliente?',
        description: SEND_TO_CLIENT_DESCRIPTION,
        confirmLabel: 'Enviar ao cliente',
        onConfirm: () => handleMoveToColumn(task, 'envio'),
      });
      return;
    }
    void handleMoveToColumn(task, targetColumn);
  };

  // Análise: liberar a entrega do agente para a revisão humana (o que a Marcely faz pelo `pulse mover`)
  const handleReleaseAnalysis = (task: ContentTask) => {
    const review = agentReviewOf(task);
    void handleMoveToColumn(task, 'revisao',
      `Liberado da Análise por ${profile?.name || 'equipe'}${review ? ` (parecer: ${review.verdict})` : pulsePlus ? ' (sem parecer)' : ''}`);
  };

  // Card com agente dando sinal (menos de 30 min): não se move pela tela. Parado, pode (destravar).
  const agentBusyMessage = (task: ContentTask): string | null => {
    const work = agentWorkState(task, { agentIds });
    if (work?.state !== 'working') return null;
    const name = (users.find(u => u.id === task.assigned_to)?.name || 'Um agente').trim().split(/\s+/)[0];
    return `${name} está trabalhando neste card (${work.step}). Espere a entrega ou peça à chefe para liberar (pulse liberar).`;
  };

  // Seta do card para papéis sem restrição (FLOW_ARROWS). Com um agente trabalhando no card não
  // há seta: ele entrega pela fila (mover no meio da renderização cancelava a entrega).
  const flowArrow = (task: ContentTask, direction: 'forward' | 'backward') => {
    if (agentWorkState(task, { agentIds })?.state === 'working') return null;
    const target = FLOW_ARROWS[task.kanban_column]?.[direction];
    if (!target) return null;
    const label = target === 'alteracao' ? 'Pedir ajuste'
      : target === 'envio' ? 'Enviar ao cliente'
      : KANBAN_COLUMNS.find(c => c.id === target)?.label || target;
    return { target, label };
  };

  // Quem aparece no card: depois da edição, quem editou; na alteração, quem corrige
  const responsibleOf = (task: ContentTask): { id: string | null; label: string } => {
    const column = task.kanban_column;
    if (['pre_revisao', 'revisao', 'envio', 'agendamentos', 'acompanhamento', 'arquivado'].includes(column)) {
      return { id: task.edited_by || task.assigned_to, label: task.edited_by ? 'Editado por' : 'Responsável' };
    }
    if (column === 'alteracao') {
      return { id: task.assigned_to || task.edited_by, label: task.assigned_to ? 'Corrigindo' : 'Quem corrige' };
    }
    return { id: task.assigned_to, label: 'Responsável' };
  };

  // ─── QUICK SCHEDULE (agendamentos) ────────────────────────
  const openScheduleDialog = (task: ContentTask) => {
    setScheduleDialogTask(task);
    setScheduleDate(task.scheduled_recording_date || '');
    setScheduleTime(task.scheduled_recording_time || '');
    setScheduleDialogOpen(true);
  };

  const handleSaveSchedule = async () => {
    if (!scheduleDialogTask || !scheduleDate || !scheduleTime) {
      toast.error('Preencha data e horário');
      return;
    }
    const result = await updateTaskRow(scheduleDialogTask.id, {
      scheduled_recording_date: scheduleDate,
      scheduled_recording_time: scheduleTime,
      kanban_column: 'acompanhamento',
      updated_at: new Date().toISOString(),
    });
    if (result.status !== 'ok') { toast.error(updateErrorMessage(result, 'agendar')); return; }

    await syncOnColumnChange(scheduleDialogTask, 'acompanhamento');
    toast.success('📅 Agendado! Movido para Acompanhamento');
    setScheduleDialogOpen(false);
    setScheduleDialogTask(null);
    fetchTasks();
  };

  // ─── RESUBMIT FROM ALTERAÇÃO ──────────────────────────────
  const handleResubmitFromAlteracao = async (task: ContentTask) => {
    if (!task.edited_video_link) {
      toast.error('Adicione o link do vídeo editado antes de reenviar');
      return;
    }
    const result = await updateTaskRow(task.id, {
      kanban_column: 'revisao',
      updated_at: new Date().toISOString(),
    });
    if (result.status !== 'ok') { toast.error(updateErrorMessage(result, 'reenviar')); return; }

    await syncOnColumnChange(task, 'revisao');
    toast.success('🔄 Reenviado para Revisão!');
    fetchTasks();
  };

  // ─── RENDER ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <motion.svg width={64} height={64} viewBox="0 0 64 64" fill="none"
          animate={{ y: [0, -8, 0], rotate: [0, 5, -5, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}>
          <motion.ellipse cx="32" cy="58" rx="6" ry="4"
            animate={{ ry: [4, 7, 4], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 0.4, repeat: Infinity }}
            fill="url(#loadFlame)" />
          <path d="M32 8C26 8 22 18 22 32V46C22 49 26 52 32 52C38 52 42 49 42 46V32C42 18 38 8 32 8Z" fill="hsl(var(--primary))" />
          <circle cx="32" cy="28" r="7" fill="#1a1a2e" stroke="#e0e0e0" strokeWidth="1.5" />
          <ellipse cx="30" cy="27" rx="3" ry="3.5" fill="white" />
          <ellipse cx="35" cy="27" rx="2.5" ry="3" fill="white" />
          <motion.circle cx="30.5" cy="27.5" r="1.5" fill="#1a1a2e"
            animate={{ cx: [30.5, 31.5, 30, 30.5] }} transition={{ duration: 2, repeat: Infinity }} />
          <motion.circle cx="35" cy="27.5" r="1.2" fill="#1a1a2e"
            animate={{ cx: [35, 35.5, 34.5, 35] }} transition={{ duration: 2, repeat: Infinity }} />
          <path d="M22 38L16 46C16 46 18 48 22 46V38Z" fill="hsl(var(--primary))" />
          <path d="M42 38L48 46C48 46 46 48 42 46V38Z" fill="hsl(var(--primary))" />
          <defs><radialGradient id="loadFlame"><stop stopColor="#fbbf24" /><stop offset="1" stopColor="#ef4444" /></radialGradient></defs>
        </motion.svg>
        <p className="text-muted-foreground animate-pulse font-medium">Carregando pipeline...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-7rem)]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <MiniRocket size={28} />
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Criação de Conteúdo</h1>
            <p className="text-xs text-muted-foreground">{visibleColumns.reduce((sum, col) => sum + (tasksByColumn[col.id]?.length || 0), 0)} cartões no pipeline</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Visualização por praça — evita trocar a cidade ativa só para consultar */}
          {availableCities.length > 1 && (
            <div className="inline-flex items-center gap-1 rounded-xl bg-secondary/50 border border-border/50 p-1">
              {([
                { value: 'all' as CityView, label: 'Todas' },
                ...availableCities.map(c => ({ value: c as CityView, label: CITY_LABELS[c] })),
              ]).map(opt => {
                const isActive = cityView === opt.value || (cityView === 'active' && opt.value === activeCity);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCityView(opt.value)}
                    className={`h-7 px-3 rounded-lg text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="relative w-full sm:w-auto">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 h-9 w-full sm:w-44 text-sm rounded-xl bg-secondary/50 border-border/50 focus:bg-card"
            />
          </div>
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="h-9 flex-1 min-w-[140px] sm:flex-none sm:w-40 text-sm rounded-xl bg-secondary/50 border-border/50">
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Clientes</SelectItem>
              {clients.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-9 flex-1 min-w-[120px] sm:flex-none sm:w-36 text-sm rounded-xl bg-secondary/50 border-border/50">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Tipos</SelectItem>
              {CONTENT_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterOwner} onValueChange={v => setFilterOwner(v as OwnerFilter)}>
            <SelectTrigger className="h-9 flex-1 min-w-[160px] sm:flex-none sm:w-48 text-sm rounded-xl bg-secondary/50 border-border/50" title="Filtrar por quem está com o card">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              {ownerFilterOptions(pulsePlus).map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Antes "Organizar" reordenava por movimentação, que já é a ordem das colunas */}
          <motion.div whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.03 }}>
            <Button size="sm" variant="outline" onClick={() => setSortMode(m => m === 'recent' ? 'deadline' : 'recent')}
              title={sortMode === 'recent' ? 'Cards mais recentes no topo. Clique para ordenar por prazo.' : 'Imediatas e prioridades no topo, depois o prazo mais próximo. Clique para ordenar por movimentação.'}
              className="gap-1.5 rounded-xl h-9 px-3 font-medium border-border/60">
              <ArrowDownUp size={14} /> {sortMode === 'recent' ? 'Ordem: recentes' : 'Ordem: prazo'}
            </Button>
          </motion.div>
          <motion.div whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.03 }}>
            <Button size="sm" onClick={() => openNew()}
              className="gap-1.5 rounded-xl h-9 px-4 font-semibold shadow-md bg-gradient-to-r from-primary to-primary/80 hover:shadow-lg hover:shadow-primary/25 transition-shadow">
              <Rocket size={14} /> Novo Conteúdo
            </Button>
          </motion.div>
        </div>
      </div>

      {/* Celular: atalho para cada coluna (arrastar não funciona no toque) */}
      <KanbanColumnJumpBar columns={visibleColumns.map(c => ({ id: c.id, label: c.label, count: tasksByColumn[c.id]?.length || 0 }))} />

      {/* Kanban Board */}
      <DragScrollContainer className="flex-1">
        <div className="flex gap-3 h-full min-w-max pb-2 items-stretch">
          {visibleColumns.map((col, colIdx) => {
            const colTasks = tasksByColumn[col.id] || [];
            const isDragOver = dragOverColumn === col.id;

            return (
              <div
                key={col.id}
                id={kanbanColumnDomId(col.id)}
                className={`flex flex-col w-[85vw] max-w-[288px] sm:w-[288px] shrink-0 min-h-0 rounded-2xl border border-border/40 transition-colors duration-150 ${
                  !isColumnInteractive(col.id) ? 'opacity-75' : ''
                } ${
                  isDragOver && isColumnInteractive(col.id) ? 'ring-2 ring-primary/50 bg-primary/5' : 'bg-muted/30'
                }`}
                onDragOver={e => isColumnInteractive(col.id) ? handleDragOver(e, col.id) : e.preventDefault()}
                onDragLeave={handleDragLeave}
                onDrop={e => isColumnInteractive(col.id) ? handleDrop(e, col.id) : e.preventDefault()}
              >
                {/* Cabeçalho da coluna: cor da etapa, ícone, total e "+" (sem animação contínua: o quadro fica leve) */}
                <div className={`flex items-center gap-2 pl-3 pr-1.5 h-10 rounded-t-2xl bg-gradient-to-r ${col.gradient} shadow-sm ${col.glow}`}>
                  {(() => { const Icon = COLUMN_ICONS[col.id] || Rocket; return <Icon size={15} className="text-white/90 shrink-0" />; })()}
                  <span className="text-[13px] font-semibold text-white flex-1 truncate">{col.label}</span>
                  <span key={colTasks.length} className="animate-kanban-bump text-[11px] font-bold text-white bg-white/20 rounded-full px-2 py-0.5 min-w-[24px] text-center tabular-nums">
                    {colTasks.length}
                  </span>
                  {isColumnInteractive(col.id) && (
                    <button
                      type="button"
                      onClick={() => openNew(col.id)}
                      title={`Novo cartão em ${col.label}`}
                      aria-label={`Novo cartão em ${col.label}`}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white/90 hover:text-white hover:bg-white/20 transition-colors"
                    >
                      <Plus size={15} />
                    </button>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 px-2 py-2 overflow-y-auto min-h-0 [scrollbar-width:thin]">
                    <div className="space-y-2">
                      {/* Arrastando por cima: mostra onde o card vai cair */}
                      {isDragOver && isColumnInteractive(col.id) && draggedTask && draggedTask.kanban_column !== col.id && (
                        <div className="animate-kanban-in h-14 rounded-xl border-2 border-dashed border-primary/60 bg-primary/5 flex items-center justify-center text-[11px] font-semibold text-primary">
                          Solte aqui para mover para {col.label}
                        </div>
                      )}
                      {colTasks.map((task, taskIdx) => (
                        <div
                          id={`task-card-${task.id}`}
                          key={task.id}
                          // entra de leve (só quando aparece) e brilha quando acabou de chegar de outra coluna
                          className={`rounded-xl animate-kanban-in ${flashId === task.id ? 'animate-kanban-flash' : ''}`}
                          style={{ animationDelay: flashId === task.id ? undefined : `${Math.min(taskIdx, 8) * 25}ms` }}
                        >
                          <TaskCard
                            viewOnly={!isColumnInteractive(col.id) || isForeignTask(task)}
                            cityLabel={isForeignTask(task) ? CITY_LABELS[normalizeCity(task.city) as CityCode] || undefined : undefined}

                            task={task}
                            client={getClient(task.client_id)}
                            assignedUser={getUser(responsibleOf(task).id)}
                            responsibleLabel={responsibleOf(task).label}
                            users={users}
                            agentIds={agentIds}
                            videomaker={(() => {
                              if (task.kanban_column !== 'captacao') return null;
                              const rec = task.recording_id ? recordings.find(r => r.id === task.recording_id) : null;
                              const vmId = rec?.videomakerId || task.assigned_to;
                              return getUser(vmId);
                            })()}
                            recordingStatus={(() => {
                              if (task.kanban_column !== 'captacao' || !task.recording_id) return null;
                              const rec = recordings.find(r => r.id === task.recording_id);
                              return rec?.status ?? null;
                            })()}
                            linkedScript={task.script_id ? scripts.find(s => s.id === task.script_id) : undefined}
                            isDragging={draggedTask?.id === task.id}
                            onDragStart={e => handleDragStart(e, task)}
                            onEdit={() => openEdit(task)}
                            onDelete={(profile?.role === 'admin' || profile?.role === 'social_media') ? () => openDeleteConfirm(task) : undefined}
                            onCardClick={() => { setDetailTask(task); setDetailOpen(true); }}
                            onConfirmPosted={task.kanban_column === 'acompanhamento' && isManager ? () => handleConfirmPosted(task) : undefined}
                            // Aprovar manda ao cliente: só a gestão (admin, social media, gestor de projetos)
                            onApprove={task.kanban_column === 'revisao' && isManager ? () => handleApproveTask(task) : undefined}
                            onRequestAdjustments={task.kanban_column === 'revisao' && isManager ? () => openAdjustmentDialog(task) : undefined}
                            // Análise: quem decide é a chefe (IA) pelo `pulse mover`; admin e social media também, por aqui
                            onReleaseAnalysis={task.kanban_column === 'pre_revisao' && canReleaseAnalysis(profile) ? () => handleReleaseAnalysis(task) : undefined}
                            onReturnAnalysis={task.kanban_column === 'pre_revisao' && canReleaseAnalysis(profile) ? () => requestMove(task, 'alteracao') : undefined}
                            onAddDriveLink={(['captacao', 'edicao'].includes(task.kanban_column)) && userRole !== 'videomaker' || (userRole === 'videomaker' && task.kanban_column === 'captacao') ? () => openLinkDialog(task, 'drive') : undefined}
                            onAddVideoLink={(task.kanban_column === 'edicao' || task.kanban_column === 'alteracao') && userRole !== 'videomaker' ? () => openLinkDialog(task, 'video') : undefined}
                            onMoveToNext={
                              task.kanban_column === 'captacao' && task.drive_link && (userRole !== 'editor') ? () => handleMoveToNext(task, 'edicao') :
                              task.kanban_column === 'envio' && isManager ? () => handleMoveToNext(task, 'agendamentos') :
                              undefined
                            }
                            nextColumnLabel={
                              task.kanban_column === 'captacao' ? 'Edição' :
                              task.kanban_column === 'envio' ? 'Agendamentos' :
                              undefined
                            }
                            onSchedule={task.kanban_column === 'agendamentos' && isManager ? () => openScheduleDialog(task) : undefined}
                            onTogglePin={canPin && PINNABLE_COLUMNS.includes(task.kanban_column) ? () => handleTogglePin(task) : undefined}
                            onResubmit={task.kanban_column === 'alteracao' && (userRole === 'editor' || isManager || (userRole === 'videomaker' && task.content_type === 'story')) && agentWorkState(task, { agentIds })?.state !== 'working' ? () => handleResubmitFromAlteracao(task) : undefined}
                            onMoveForward={(() => {
                              if (isRestricted) {
                                // Editor: Edição → Revisão (na Alteração o card já tem "Reenviar Revisão")
                                if (userRole === 'editor' && task.kanban_column === 'edicao' && agentWorkState(task, { agentIds })?.state !== 'working') {
                                  return () => handleMoveToColumn(task, 'revisao');
                                }
                                // Videomaker: ideias→captacao (alteração de story usa "Reenviar Revisão")
                                if (userRole === 'videomaker' && task.kanban_column === 'ideias') {
                                  return () => handleMoveToColumn(task, 'captacao');
                                }
                                return undefined;
                              }
                              const arrow = flowArrow(task, 'forward');
                              // Alteração com "Reenviar Revisão" no card: a seta não repete
                              if (!arrow || task.kanban_column === 'alteracao') return undefined;
                              return () => requestMove(task, arrow.target);
                            })()}
                            onMoveBackward={(() => {
                              if (isRestricted) {
                                // Videomaker: backward from captacao→ideias
                                if (userRole === 'videomaker' && task.kanban_column === 'captacao') {
                                  return () => handleMoveToColumn(task, 'ideias');
                                }
                                // Editor: no backward (edicao is their start)
                                return undefined;
                              }
                              const arrow = flowArrow(task, 'backward');
                              return arrow ? () => requestMove(task, arrow.target) : undefined;
                            })()}
                            forwardLabel={(() => {
                              if (userRole === 'editor' && task.kanban_column === 'edicao') return 'Revisão';
                              if (userRole === 'videomaker' && task.kanban_column === 'ideias') return 'Captação';
                              if (isRestricted) return undefined;
                              return flowArrow(task, 'forward')?.label;
                            })()}
                            backwardLabel={(() => {
                              if (userRole === 'videomaker' && task.kanban_column === 'captacao') return 'Ideias';
                              if (isRestricted) return undefined;
                              return flowArrow(task, 'backward')?.label;
                            })()}
                            // Card de outra praça ou coluna em que o papel não atua: só consulta
                            {...(isForeignTask(task) || !isColumnInteractive(col.id) ? FOREIGN_TASK_NO_ACTIONS : {})}
                          />
                        </div>
                      ))}
                      {colTasks.length === 0 && (
                        <div className="mx-1 py-8 rounded-xl border border-dashed border-border/60 text-center text-[11px] text-muted-foreground/70">
                          {isColumnInteractive(col.id) ? 'Nenhum cartão. Arraste um para cá.' : 'Nenhum cartão'}
                        </div>
                      )}
                    </div>
                </div>

                {/* Add button at bottom */}
                {isColumnInteractive(col.id) && (
                  <button
                    onClick={() => openNew(col.id)}
                    className="mx-2 mb-2 h-8 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-background/70 transition-colors flex items-center justify-center gap-1.5 font-medium"
                  >
                    <Plus size={13} /> Adicionar cartão
                  </button>
                )}
                {!isColumnInteractive(col.id) && (
                  <div className="mx-2 mb-2 py-1.5 text-center text-[10px] text-muted-foreground/50 italic flex items-center justify-center gap-1">
                    <Eye size={10} /> Visualização
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DragScrollContainer>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTask ? 'Editar Cartão' : 'Novo Conteúdo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Cliente *</Label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isUnregisteredContent"
                  checked={isUnregistered}
                  onChange={(e) => setIsUnregistered(e.target.checked)}
                  className="h-3 w-3 rounded border-gray-300"
                />
                <label htmlFor="isUnregisteredContent" className="text-[10px] font-medium cursor-pointer">Não cadastrado</label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                {!isUnregistered ? (
                  <Select value={formClientId || ''} onValueChange={v => { setFormClientId(v); setFormRecordingId(''); setFormScriptId(''); }}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {clients.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={formProspectName}
                    onChange={e => setFormProspectName(e.target.value)}
                    placeholder="Nome do cliente"
                    className="h-9"
                  />
                )}
              </div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTENT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Título do Conteúdo *</Label>
              <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Ex: Reels de vendas" className="h-9" />
            </div>

            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} rows={2} placeholder="Detalhes do conteúdo..." />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Coluna</Label>
                <Select value={formColumn} onValueChange={v => setFormColumn(v as KanbanColumnId)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {/* Editor/videomaker só escolhem as colunas em que atuam (mais a de origem) */}
                    {(isRestricted
                      ? visibleColumns.filter(c => interactiveColumns.includes(c.id) || c.id === (editingTask?.kanban_column ?? dialogInitialColumn))
                      : visibleColumns
                    ).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Responsável</Label>
                <Select value={formAssignedTo} onValueChange={setFormAssignedTo}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Connections */}
            {formClientId && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Gravação vinculada</Label>
                  <Select value={formRecordingId} onValueChange={setFormRecordingId}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {clientRecordings.map(r => (
                        <SelectItem key={r.id} value={r.id}>
                          {safeFormatDate(r.date, 'dd/MM')} {r.startTime}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Roteiro vinculado</Label>
                  <Select value={formScriptId} onValueChange={setFormScriptId}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {clientScripts.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data de gravação</Label>
                <Input type="date" value={formSchedDate} onChange={e => setFormSchedDate(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Horário</Label>
                <Input type="time" value={formSchedTime} onChange={e => setFormSchedTime(e.target.value)} className="h-9" />
              </div>
            </div>

            {/* Links section */}
            <div className="grid grid-cols-1 gap-3 border-t pt-3">
              <div>
                <Label className="text-xs flex items-center gap-1"><Link2 size={11} /> Link dos Materiais (Drive)</Label>
                <Input value={formDriveLink} onChange={e => setFormDriveLink(e.target.value)} placeholder="https://drive.google.com/..." className="h-9" />
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1"><Film size={11} /> Link do Vídeo Editado</Label>
                <Input value={formVideoLink} onChange={e => setFormVideoLink(e.target.value)} placeholder="https://drive.google.com/..." className="h-9" />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={() => handleSave()}>{editingTask ? 'Salvar' : 'Criar Cartão'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pedido de ajuste: toda ida para Alteração (botão, seta, arrastar, devolver da Análise) */}
      <AdjustmentRequestDialog
        open={adjustmentDialogOpen}
        title={adjustmentTask?.kanban_column === 'pre_revisao' ? 'Devolver da Análise para Alteração' : 'Solicitar Ajustes'}
        taskTitle={adjustmentTask?.title}
        initialNotes={adjustmentInitialNotes}
        onOpenChange={v => { setAdjustmentDialogOpen(v); if (!v) setAdjustmentTask(null); }}
        onSubmit={handleRequestAdjustments}
      />

      {/* Confirmação de ação que avisa o cliente */}
      <ConfirmActionDialog action={confirmAction} onClose={() => setConfirmAction(null)} />

      {/* Quick Link Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={v => { if (!v) { setLinkDialogOpen(false); setLinkDialogTask(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 size={18} className="text-primary" />
              {linkDialogType === 'drive' ? 'Link dos Materiais (Drive)' : 'Link do Vídeo Editado'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {linkDialogTask && (
              <p className="text-sm text-muted-foreground">
                Conteúdo: <span className="font-medium text-foreground">{linkDialogTask.title}</span>
              </p>
            )}
            <div>
              <Label className="text-xs">{linkDialogType === 'drive' ? 'URL do Google Drive' : 'URL do vídeo editado'} *</Label>
              <Input
                value={linkDialogValue}
                onChange={e => setLinkDialogValue(e.target.value)}
                placeholder="https://drive.google.com/..."
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setLinkDialogOpen(false); setLinkDialogTask(null); }}>Cancelar</Button>
            <Button onClick={handleSaveLink}>
              <Link2 size={14} /> Salvar Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={v => { if (!v) { setScheduleDialogOpen(false); setScheduleDialogTask(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar size={18} className="text-primary" />
              Agendar Postagem
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {scheduleDialogTask && (
              <p className="text-sm text-muted-foreground">
                Conteúdo: <span className="font-medium text-foreground">{scheduleDialogTask.title}</span>
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data *</Label>
                <Input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Horário *</Label>
                <Input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setScheduleDialogOpen(false); setScheduleDialogTask(null); }}>Cancelar</Button>
            <Button onClick={handleSaveSchedule}>
              <Calendar size={14} /> Agendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task Detail Sheet */}
      <ContentTaskDetailSheet
        task={detailTask}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onRefresh={fetchTasks}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a tarefa <strong>"{deleteTaskTitle}"</strong>? Esta ação é irreversível e removerá também o histórico e entregas associadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirmed} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}



// ─── TASK CARD COMPONENT ─────────────────────────────────────
interface TaskCardProps {
  task: ContentTask;
  client?: Client;
  assignedUser?: { id?: string; name: string; avatarUrl?: string } | null;
  /** "Responsável", "Editado por", "Quem corrige"… (o que o avatar do card representa). */
  responsibleLabel?: string;
  /** Equipe (nome do agente e do revisor nos selos) e ids dos agentes de IA. */
  users?: { id: string; name?: string | null }[];
  agentIds?: ReadonlySet<string>;
  videomaker?: { id?: string; name: string; avatarUrl?: string } | null;
  recordingStatus?: string | null;
  linkedScript?: Script;
  isDragging: boolean;
  viewOnly?: boolean;
  /** Nome da praça exibido quando o cartão vem de outra cidade (somente leitura). */
  cityLabel?: string;

  onDragStart: (e: React.DragEvent) => void;
  onEdit: () => void;
  onDelete?: () => void;
  onCardClick?: () => void;
  onConfirmPosted?: () => void;
  onApprove?: () => void;
  onRequestAdjustments?: () => void;
  /** Análise: liberar para a Revisão / devolver para Alteração (admin). */
  onReleaseAnalysis?: () => void;
  onReturnAnalysis?: () => void;
  onAddDriveLink?: () => void;
  onAddVideoLink?: () => void;
  onMoveToNext?: () => void;
  nextColumnLabel?: string;
  onSchedule?: () => void;
  onResubmit?: () => void;
  /** Fixar / desfixar para a equipe presencial (colunas de edição). */
  onTogglePin?: () => void;
  onMoveForward?: () => void;
  onMoveBackward?: () => void;
  forwardLabel?: string;
  backwardLabel?: string;
}

// Card de outra cidade é só para consulta: sem aprovar, ajustes, setas, links nem agendar.
// O servidor não altera nada fora da cidade ativa, e as ações geravam registros fantasmas.
const FOREIGN_TASK_NO_ACTIONS: Partial<TaskCardProps> = {
  onDelete: undefined,
  onConfirmPosted: undefined,
  onApprove: undefined,
  onRequestAdjustments: undefined,
  onReleaseAnalysis: undefined,
  onReturnAnalysis: undefined,
  onAddDriveLink: undefined,
  onAddVideoLink: undefined,
  onMoveToNext: undefined,
  onSchedule: undefined,
  onResubmit: undefined,
  onTogglePin: undefined,
  onMoveForward: undefined,
  onMoveBackward: undefined,
};

function TaskCard({ task, client, assignedUser, responsibleLabel = 'Responsável', users = [], agentIds, videomaker, recordingStatus, linkedScript, isDragging, viewOnly, cityLabel, onDragStart, onEdit, onDelete, onCardClick, onConfirmPosted, onApprove, onRequestAdjustments, onReleaseAnalysis, onReturnAnalysis, onAddDriveLink, onAddVideoLink, onMoveToNext, nextColumnLabel, onSchedule, onResubmit, onTogglePin, onMoveForward, onMoveBackward, forwardLabel, backwardLabel }: TaskCardProps) {
  const [scriptPreviewOpen, setScriptPreviewOpen] = useState(false);
  const typeConfig = CONTENT_TYPES.find(t => t.value === task.content_type) || CONTENT_TYPES[0];
  const TypeIcon = typeConfig.icon;
  const clientColor = client?.color || '217 91% 60%';

  const isCaptacao = task.kanban_column === 'captacao';
  // Aguardando link: SOMENTE quando o videomaker já finalizou a gravação
  // (recording está em "organizando_material" ou "concluida") mas ainda não anexou o drive_link.
  const isAwaitingLink =
    isCaptacao &&
    Boolean(task.recording_id) &&
    !task.drive_link &&
    (recordingStatus === 'organizando_material' || recordingStatus === 'concluida');
  const isRevisao = task.kanban_column === 'revisao' || task.kanban_column === 'alteracao';
  const isAcompanhamento = task.kanban_column === 'acompanhamento';
  const scheduledRecordingDate = normalizeDateValue(task.scheduled_recording_date);
  const reviewHeartbeatAt = task.reviewing_at ? new Date(task.reviewing_at) : null;
  const hasValidReviewHeartbeat = reviewHeartbeatAt && !Number.isNaN(reviewHeartbeatAt.getTime());
  const isOverdue = Boolean(
    isAcompanhamento && scheduledRecordingDate && scheduledRecordingDate.getTime() < Date.now()
  );

  // Check if someone is actively reviewing (within last 60s)
  const isBeingReviewed = Boolean(
    task.kanban_column === 'revisao' &&
    task.reviewing_by_name &&
    hasValidReviewHeartbeat &&
    reviewHeartbeatAt &&
    (Date.now() - reviewHeartbeatAt.getTime()) < 60000
  );

  // Selos de exceção (o que pede atenção). Os que só repetiam a coluna (Gravando, Agendar,
  // Para Postar, enviado/aguarda) saíram: o cabeçalho da coluna já diz isso.
  const pills: { key: string; label: string; tone: string; dot?: boolean; title?: string }[] = [];
  if (task.pinned_at) pills.push({ key: 'fixado', label: '📌 Fixado · presencial', tone: 'bg-orange-500/15 text-orange-700 border-orange-500/40 dark:text-orange-300', title: 'Reservado para a equipe presencial' });
  if (task.immediate_alteration && task.kanban_column === 'alteracao') pills.push({ key: 'imediato', label: 'Imediato', tone: 'bg-red-600 text-white', dot: true });
  if (task.editing_priority) pills.push({ key: 'prioridade', label: 'Prioridade', tone: 'bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300' });
  if (isOverdue) pills.push({ key: 'vence', label: 'Vence hoje', tone: 'bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300' });
  if (isAwaitingLink) pills.push({ key: 'material', label: 'Aguardando material', tone: 'bg-amber-400/20 text-amber-800 border-amber-400/50 dark:text-amber-200', dot: true, title: `Status da gravação: ${recordingStatus ?? 'desconhecido'}` });
  if (isBeingReviewed) pills.push({ key: 'revisando', label: `${task.reviewing_by_name} revisando`, tone: 'bg-teal-500/10 text-teal-700 border-teal-500/30 dark:text-teal-300', dot: true });
  if (task.content_type === 'otimizacao') pills.push({ key: 'otimizar', label: 'Otimizar', tone: 'bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-500/30 dark:text-fuchsia-300' });
  if (task.adjustment_notes && !task.immediate_alteration) pills.push({ key: 'alterado', label: 'Já teve ajuste', tone: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300' });

  const clientName = client?.companyName || task.prospect_name || 'Cliente';
  // Links (brutos, portal, baixar): discretos, ícone colorido, sem quebrar linha
  const secondaryBtn = 'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-secondary/60 hover:bg-secondary text-[11px] font-medium text-foreground/80 hover:text-foreground whitespace-nowrap transition-[background-color,transform] active:scale-95';
  // Ações: uma linha só, nunca quebra; o texto encolhe com reticências se faltar espaço
  const primaryBtn = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-[11px] font-semibold whitespace-nowrap min-w-0 transition-[background-color,transform,box-shadow] active:scale-[0.97] [&>span]:truncate';

  return (
    <>
      <div
        draggable={!viewOnly}
        onDragStart={viewOnly ? undefined : onDragStart}
        onClick={onCardClick}
        style={{ borderLeftColor: `hsl(${clientColor})` }}
        className={`group relative rounded-xl overflow-hidden border border-l-[3px] bg-card transition-[box-shadow,transform,border-color,opacity] duration-200 ease-out ${
          task.pinned_at ? 'border-orange-400/70 ring-1 ring-orange-500/40' : isAwaitingLink ? 'border-amber-300/70 dark:border-amber-500/40' : isOverdue ? 'border-red-400/60' : 'border-border/60 hover:border-primary/30'
        } ${
          viewOnly ? 'cursor-default opacity-80' : 'cursor-grab active:cursor-grabbing'
        } ${
          isDragging ? 'opacity-40 scale-[0.97] rotate-1 shadow-none' : 'shadow-sm hover:shadow-lg hover:-translate-y-0.5'
        }`}
      >
        {/* Selo de praça: cartões de outra cidade (somente leitura) */}
        {cityLabel && (
          <div className="px-3 py-1 bg-secondary/80 border-b border-border/50 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {cityLabel} · somente leitura
          </div>
        )}

        {/* Agente de IA com o card (Edição/Alteração) e parecer da Análise */}
        <UrgentBadge task={task} />
        <AgentWorkBadge task={task} users={users} agentIds={agentIds} />
        <AgentReviewBadge task={task} users={users} />

        <div className="p-3 space-y-2.5">
          {/* Cliente + ações rápidas (sempre visíveis no celular; no hover no computador) */}
          <div className="flex items-center gap-2 min-w-0">
            <ClientLogo client={{ companyName: clientName, color: clientColor, logoUrl: client?.logoUrl }} size="sm" className="!w-6 !h-6" />
            <span className="text-[11px] font-semibold text-muted-foreground truncate flex-1">{clientName}</span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${typeConfig.color}`}>
              <TypeIcon size={10} /> {typeConfig.label}
            </span>
            {!viewOnly && (
              <div className="flex gap-0.5 shrink-0 [@media(hover:hover)]:w-0 [@media(hover:hover)]:overflow-hidden [@media(hover:hover)]:group-hover:w-auto [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity">
                <button onClick={e => { e.stopPropagation(); onEdit(); }} title="Editar cartão" aria-label="Editar cartão" className="w-8 h-8 [@media(hover:hover)]:w-6 [@media(hover:hover)]:h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <Edit size={12} />
                </button>
                {onDelete && (
                  <button onClick={e => { e.stopPropagation(); onDelete(); }} title="Excluir cartão" aria-label="Excluir cartão" className="w-8 h-8 [@media(hover:hover)]:w-6 [@media(hover:hover)]:h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Título do conteúdo: o que mais importa, em destaque */}
          <h3 className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2" title={task.title || undefined}>
            {task.title || 'Sem título'}
          </h3>

          {/* Selos de atenção + prazo da etapa + fila dos agentes */}
          {(pills.length > 0 || task.editing_deadline || task.review_deadline || task.alteration_deadline || task.approval_deadline) && (
            <div className="flex flex-wrap gap-1">
              {pills.map(pl => (
                <span key={pl.key} title={pl.title} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border border-transparent ${pl.tone}`}>
                  {pl.dot && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
                  {pl.label}
                </span>
              ))}
              {task.kanban_column === 'edicao' && task.editing_deadline && (
                <DeadlineBadge showAudit={false} deadline={task.editing_deadline} label="Edição" startedAt={task.editing_started_at} totalHours={48} />
              )}
              {task.kanban_column === 'revisao' && task.review_deadline && (
                <DeadlineBadge showAudit={false} deadline={task.review_deadline} label="Revisão" totalHours={24} />
              )}
              {task.kanban_column === 'alteracao' && task.alteration_deadline && !task.immediate_alteration && (
                <DeadlineBadge showAudit={false} deadline={task.alteration_deadline} label="Alteração" totalHours={24} />
              )}
              {task.kanban_column === 'envio' && task.approval_deadline && (
                <DeadlineBadge showAudit={false} deadline={task.approval_deadline} label="Aprovação" startedAt={task.approval_sent_at} totalHours={24} />
              )}
            </div>
          )}
          <AgentReadinessBadge task={task} agentIds={agentIds} />

          {/* Data, roteiro e responsável numa linha de metadados */}
          {(task.scheduled_recording_date || linkedScript || assignedUser) && (
            <div className="space-y-1.5">
              {task.scheduled_recording_date && (
                <div className={`flex items-center gap-1.5 text-[11px] ${isOverdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                  <Calendar size={12} className="shrink-0" />
                  <span>
                    {task.kanban_column === 'acompanhamento' || task.kanban_column === 'agendamentos' ? 'Postagem' : 'Gravação'}:{' '}
                    <span className="text-foreground/85 font-medium">
                      {safeFormatDate(task.scheduled_recording_date)}{task.scheduled_recording_time ? ` · ${task.scheduled_recording_time}` : ''}
                    </span>
                  </span>
                </div>
              )}
              {linkedScript && (
                <button
                  onClick={e => { e.stopPropagation(); setScriptPreviewOpen(true); }}
                  className="flex items-center gap-1.5 text-[11px] text-primary hover:underline max-w-full text-left"
                >
                  <FileText size={12} className="shrink-0" />
                  <span className="truncate">Roteiro: {linkedScript.title}</span>
                </button>
              )}
              {assignedUser && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
                  <UserAvatar user={{ name: assignedUser.name, avatarUrl: assignedUser.avatarUrl }} size="sm" />
                  <span className="truncate"><span className="text-muted-foreground/80">{responsibleLabel}</span> · <span className="text-foreground/85 font-medium">{assignedUser.name}</span></span>
                </div>
              )}
            </div>
          )}

          {/* Videomaker (em Captação) */}
          {isCaptacao && videomaker && (
            <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border ${isAwaitingLink ? 'bg-amber-400/10 border-amber-400/40' : 'bg-orange-500/5 border-orange-500/25'}`}>
              <UserAvatar user={{ name: videomaker.name, avatarUrl: videomaker.avatarUrl }} size="sm" />
              <div className="min-w-0 flex-1 leading-tight">
                <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 block">{isAwaitingLink ? 'Gravado · falta o link' : 'Gravando'}</span>
                <span className="text-[11px] text-foreground/85 truncate block font-medium">{videomaker.name}</span>
              </div>
            </div>
          )}

          {/* Pedido de ajuste (Alteração) */}
          {task.adjustment_notes && task.kanban_column === 'alteracao' && (
            <div className="px-2.5 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-[11px] leading-snug text-amber-800 dark:text-amber-300">
              <span className="font-semibold">Ajustes:</span> <span className="line-clamp-3">{task.adjustment_notes}</span>
            </div>
          )}

          {/* Links do material e do vídeo */}
          {(() => {
            const links: JSX.Element[] = [];
            if (task.drive_link && ['captacao', 'edicao', 'pre_revisao', 'alteracao'].includes(task.kanban_column)) {
              links.push(
                <a key="drive" href={task.drive_link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  className={secondaryBtn}>
                  <Link2 size={12} className="text-blue-500" /> Brutos <ExternalLink size={10} className="opacity-50" />
                </a>
              );
            }
            if (isRevisao && task.edited_video_link) {
              links.push(
                <a key="portal" href={task.client_id ? `/portal/${task.client_id}` : `/video-avulso/${task.id}`} onClick={e => e.stopPropagation()}
                  className={secondaryBtn}>
                  <Eye size={12} className="text-teal-500" /> Portal
                </a>
              );
            }
            if (task.edited_video_link && (isRevisao || ['pre_revisao', 'envio', 'agendamentos', 'acompanhamento'].includes(task.kanban_column))) {
              links.push(
                <a key="baixar" href={task.edited_video_link} download target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  className={secondaryBtn}>
                  <Download size={12} className="text-violet-500" /> Baixar
                </a>
              );
            }
            if (onAddDriveLink && !task.drive_link) {
              links.push(
                <button key="add-drive" onClick={e => { e.stopPropagation(); onAddDriveLink(); }}
                  className={`${secondaryBtn} border border-dashed border-blue-500/40 bg-transparent`}>
                  <Plus size={12} className="text-blue-500" /> Brutos
                </button>
              );
            }
            if (onAddVideoLink && !task.edited_video_link) {
              links.push(
                <button key="add-video" onClick={e => { e.stopPropagation(); onAddVideoLink(); }}
                  className={`${secondaryBtn} border border-dashed border-teal-500/40 bg-transparent`}>
                  <Plus size={12} className="text-teal-500" /> Vídeo
                </button>
              );
            }
            return links.length ? <div className="flex flex-wrap gap-1.5">{links}</div> : null;
          })()}

          {/* Decisão da Revisão / da Análise */}
          {task.kanban_column === 'revisao' && (onApprove || onRequestAdjustments) && (
            <div className="flex gap-1.5 [&>button:first-child]:flex-1">
              {onApprove && (
                <button onClick={e => { e.stopPropagation(); onApprove(); }}
                  className={`${primaryBtn} bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm shadow-emerald-600/20`}>
                  <ThumbsUp size={12} className="shrink-0" /> <span>Aprovar e enviar</span>
                </button>
              )}
              {onRequestAdjustments && (
                <button onClick={e => { e.stopPropagation(); onRequestAdjustments(); }}
                  className={`${primaryBtn} shrink-0 border border-amber-500/40 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 dark:text-amber-200`}>
                  <MessageSquareWarning size={12} className="shrink-0" /> <span>Ajustes</span>
                </button>
              )}
            </div>
          )}
          {task.kanban_column === 'pre_revisao' && (onReleaseAnalysis || onReturnAnalysis) && (
            <div className="flex gap-1.5 [&>button:first-child]:flex-1">
              {onReleaseAnalysis && (
                <button onClick={e => { e.stopPropagation(); onReleaseAnalysis(); }}
                  className={`${primaryBtn} bg-teal-600 text-white hover:bg-teal-500 shadow-sm shadow-teal-600/20`}>
                  <CheckCircle2 size={12} className="shrink-0" /> <span>Liberar p/ Revisão</span>
                </button>
              )}
              {onReturnAnalysis && (
                <button onClick={e => { e.stopPropagation(); onReturnAnalysis(); }}
                  className={`${primaryBtn} shrink-0 border border-amber-500/40 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 dark:text-amber-200`}>
                  <ArrowLeft size={12} className="shrink-0" /> <span>Devolver</span>
                </button>
              )}
            </div>
          )}

          {/* Fixar: card reservado para a equipe presencial */}
          {onTogglePin && (
            <button onClick={e => { e.stopPropagation(); onTogglePin(); }}
              className={`${primaryBtn} w-full border ${task.pinned_at ? 'border-orange-500/40 bg-orange-500/10 text-orange-800 hover:bg-orange-500/20 dark:text-orange-200' : 'border-border bg-background text-foreground/80 hover:bg-secondary'}`}>
              {task.pinned_at ? <PinOff size={12} className="shrink-0" /> : <Pin size={12} className="shrink-0" />}
              <span>{task.pinned_at ? 'Desfixar' : 'Fixar'}</span>
            </button>
          )}

          {/* Ação principal da coluna */}
          {onMoveToNext && (
            <button onClick={e => { e.stopPropagation(); onMoveToNext(); }}
              className={`${primaryBtn} w-full bg-primary text-primary-foreground hover:bg-primary/90`}>
              <ArrowRight size={12} className="shrink-0" /> <span>Mover para {nextColumnLabel}</span>
            </button>
          )}
          {onSchedule && (
            <button onClick={e => { e.stopPropagation(); onSchedule(); }}
              className={`${primaryBtn} w-full bg-primary text-primary-foreground hover:bg-primary/90`}>
              <Calendar size={12} className="shrink-0" /> <span>Agendar postagem</span>
            </button>
          )}
          {onResubmit && (
            <button onClick={e => { e.stopPropagation(); onResubmit(); }}
              className={`${primaryBtn} w-full bg-teal-600 text-white hover:bg-teal-500`}>
              <Send size={12} className="shrink-0" /> <span>Reenviar Revisão</span>
            </button>
          )}
          {onConfirmPosted && (
            <button onClick={e => { e.stopPropagation(); onConfirmPosted(); }}
              className={`${primaryBtn} w-full ${isOverdue ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/20 dark:text-emerald-200'}`}>
              <CheckCircle2 size={12} className="shrink-0" /> <span>Confirmar postagem</span>
            </button>
          )}

          {/* Setas do fluxo */}
          {(onMoveBackward || onMoveForward) && (
            <div className="flex items-center gap-1.5 pt-0.5">
              {onMoveBackward && (
                <button onClick={e => { e.stopPropagation(); onMoveBackward(); }}
                  className="flex items-center gap-1 flex-1 min-w-0 justify-center h-7 px-2 rounded-lg border border-border/60 bg-secondary/40 hover:bg-secondary text-muted-foreground hover:text-foreground text-[11px] font-medium transition-[background-color,transform] active:scale-95"
                  title={`Mover para ${backwardLabel}`}>
                  <ChevronLeft size={12} className="shrink-0" />
                  <span className="truncate">{backwardLabel}</span>
                </button>
              )}
              {onMoveForward && (
                <button onClick={e => { e.stopPropagation(); onMoveForward(); }}
                  className="flex items-center gap-1 flex-1 min-w-0 justify-center h-7 px-2 rounded-lg border border-primary/25 bg-primary/5 hover:bg-primary/10 text-primary text-[11px] font-semibold transition-[background-color,transform] active:scale-95"
                  title={`Mover para ${forwardLabel}`}>
                  <span className="truncate">{forwardLabel}</span>
                  <ChevronRight size={12} className="shrink-0" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Script Preview Dialog */}
      {linkedScript && (
        <Dialog open={scriptPreviewOpen} onOpenChange={setScriptPreviewOpen}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText size={18} className="text-primary" />
                {linkedScript.title}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs">{typeConfig.label}</Badge>
                <Badge variant={linkedScript.recorded ? 'default' : 'secondary'} className="text-xs">
                  {linkedScript.recorded ? '✅ Gravado' : '⏳ Pendente'}
                </Badge>
                {linkedScript.priority !== 'normal' && (
                  <Badge variant="destructive" className="text-xs">
                    {linkedScript.priority === 'priority' ? '🔴 Alta' : linkedScript.priority === 'urgent' ? '🚨 Urgente' : linkedScript.priority}
                  </Badge>
                )}
              </div>
              <div className="border rounded-lg p-4 bg-muted/30">
                {linkedScript.content ? (
                  <div
                    className="prose prose-sm max-w-none text-foreground text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: sanitizeScriptHtml(linkedScript.content) }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground italic">Sem conteúdo no roteiro.</p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}