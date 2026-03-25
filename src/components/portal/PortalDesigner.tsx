import { useState, useEffect } from 'react';
import { portalAction } from '@/lib/portalApi';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Palette, Plus, Check, MessageSquare, X, Loader2, AlertCircle,
  Eye, Clock, Image as ImageIcon, Send, ChevronDown
} from 'lucide-react';

interface DesignTask {
  id: string;
  title: string;
  description: string | null;
  format_type: string;
  priority: string;
  kanban_column: string;
  attachment_url: string | null;
  mockup_url: string | null;
  created_at: string;
  completed_at: string | null;
  client_approved_at: string | null;
  observations: string | null;
}

interface Props {
  clientId: string;
  clientColor: string;
}

const FORMAT_LABELS: Record<string, string> = {
  feed: 'Feed', story: 'Story', logomarca: 'Logomarca', midia_fisica: 'Mídia Física',
};

const COLUMN_LABELS: Record<string, string> = {
  nova_tarefa: 'Nova Tarefa', executando: 'Em Produção', em_analise: 'Em Análise',
  enviar_cliente: 'Aguardando Aprovação', aprovado: 'Aprovado', ajustes: 'Em Ajuste',
};

const COLUMN_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  nova_tarefa: { bg: 'bg-blue-500/15', text: 'text-blue-400', dot: 'bg-blue-400' },
  executando: { bg: 'bg-amber-500/15', text: 'text-amber-400', dot: 'bg-amber-400' },
  em_analise: { bg: 'bg-purple-500/15', text: 'text-purple-400', dot: 'bg-purple-400' },
  enviar_cliente: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', dot: 'bg-cyan-400' },
  aprovado: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  ajustes: { bg: 'bg-orange-500/15', text: 'text-orange-400', dot: 'bg-orange-400' },
};

export default function PortalDesigner({ clientId, clientColor }: Props) {
  const [tasks, setTasks] = useState<DesignTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [artLimit, setArtLimit] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [formatType, setFormatType] = useState('feed');
  const [submitting, setSubmitting] = useState(false);
  const [selectedTask, setSelectedTask] = useState<DesignTask | null>(null);
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [showAdjustment, setShowAdjustment] = useState(false);

  useEffect(() => {
    loadDesignData();
  }, [clientId]);

  const loadDesignData = async () => {
    setLoading(true);
    const result = await portalAction({ action: 'get_design_tasks', client_id: clientId });
    if (result?.tasks) setTasks(result.tasks);
    if (result?.art_requests_limit !== undefined) setArtLimit(result.art_requests_limit);
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    const result = await portalAction({
      action: 'create_design_request',
      client_id: clientId,
      title: title.trim(),
      description: description.trim() || null,
      format_type: formatType,
    });
    if (result?.success) {
      toast.success('Solicitação de arte enviada com sucesso!');
      setTitle('');
      setDescription('');
      setFormatType('feed');
      setShowForm(false);
      loadDesignData();
    } else {
      toast.error(result?.error || 'Erro ao enviar solicitação');
    }
    setSubmitting(false);
  };

  const handleApproveDesign = async (taskId: string) => {
    const result = await portalAction({
      action: 'approve_design_task',
      client_id: clientId,
      task_id: taskId,
    });
    if (result?.success) {
      toast.success('Arte aprovada com sucesso!');
      setSelectedTask(null);
      loadDesignData();
    }
  };

  const handleRequestDesignAdjustment = async (taskId: string) => {
    if (!adjustmentNote.trim()) return;
    const result = await portalAction({
      action: 'request_design_adjustment',
      client_id: clientId,
      task_id: taskId,
      note: adjustmentNote.trim(),
    });
    if (result?.success) {
      toast.success('Ajuste solicitado com sucesso!');
      setAdjustmentNote('');
      setShowAdjustment(false);
      setSelectedTask(null);
      loadDesignData();
    }
  };

  // Count arts used this month
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthlyRequests = tasks.filter(t => {
    const d = new Date(t.created_at);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;
  const remaining = artLimit !== null ? Math.max(0, artLimit - monthlyRequests) : null;
  const canRequest = artLimit === null || remaining! > 0;

  // Separate tasks into categories
  const pendingApproval = tasks.filter(t => t.kanban_column === 'enviar_cliente');
  const inProgress = tasks.filter(t => ['nova_tarefa', 'executando', 'em_analise'].includes(t.kanban_column));
  const inAdjustment = tasks.filter(t => t.kanban_column === 'ajustes');
  const approved = tasks.filter(t => t.kanban_column === 'aprovado');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-white/30" />
      </div>
    );
  }

  return (
    <motion.div
      key="designer"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8 pb-20 space-y-8"
    >
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
              <div className="p-2.5 rounded-xl" style={{ background: `hsl(${clientColor} / 0.15)` }}>
                <Palette size={22} style={{ color: `hsl(${clientColor})` }} />
              </div>
              Designer
            </h2>
            <p className="text-white/40 text-sm mt-1">Solicite artes e acompanhe a produção</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Counter */}
            {artLimit !== null && (
              <div className="px-4 py-2 rounded-xl bg-white/[0.06] border border-white/[0.08] text-center">
                <p className="text-xs text-white/40">Solicitações restantes</p>
                <p className="text-xl font-bold" style={{ color: remaining! > 0 ? `hsl(${clientColor})` : '#ef4444' }}>
                  {remaining} <span className="text-xs font-normal text-white/30">/ {artLimit}</span>
                </p>
              </div>
            )}

            <button
              onClick={() => setShowForm(true)}
              disabled={!canRequest}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full font-semibold text-sm text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
              style={{ background: canRequest ? `hsl(${clientColor})` : undefined }}
            >
              <Plus size={16} /> Solicitar Arte
            </button>
          </div>
        </div>
      </motion.div>

      {/* Alert info */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5"
      >
        <div className="flex items-start gap-3">
          <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-white/60 space-y-1">
            <p className="font-medium text-white/80">Como funciona a solicitação de artes:</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs text-white/50">
              <li>Preencha o título e descreva detalhadamente o que deseja na arte</li>
              <li>Escolha o formato adequado (Feed, Story, Logomarca ou Mídia Física)</li>
              <li>Inclua referências visuais e textos que devem aparecer na arte</li>
              <li>Quanto mais detalhes, mais assertiva será a produção</li>
              <li>Sua solicitação será enviada diretamente para o time de design</li>
            </ul>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Aguardando Aprovação', count: pendingApproval.length, color: 'text-cyan-400' },
          { label: 'Em Produção', count: inProgress.length, color: 'text-amber-400' },
          { label: 'Em Ajuste', count: inAdjustment.length, color: 'text-orange-400' },
          { label: 'Aprovadas', count: approved.length, color: 'text-emerald-400' },
        ].map(s => (
          <div key={s.label} className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
            <p className="text-[11px] text-white/40 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Pending approval section */}
      {pendingApproval.length > 0 && (
        <div>
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <span className="w-1 h-5 rounded-full bg-cyan-400" />
            Aguardando sua aprovação
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingApproval.map(task => (
              <DesignCard key={task.id} task={task} clientColor={clientColor} onSelect={setSelectedTask} />
            ))}
          </div>
        </div>
      )}

      {/* In adjustment */}
      {inAdjustment.length > 0 && (
        <div>
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <span className="w-1 h-5 rounded-full bg-orange-400" />
            Em Ajuste
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {inAdjustment.map(task => (
              <DesignCard key={task.id} task={task} clientColor={clientColor} onSelect={setSelectedTask} />
            ))}
          </div>
        </div>
      )}

      {/* In progress */}
      {inProgress.length > 0 && (
        <div>
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <span className="w-1 h-5 rounded-full bg-amber-400" />
            Em Produção
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {inProgress.map(task => (
              <DesignCard key={task.id} task={task} clientColor={clientColor} onSelect={setSelectedTask} />
            ))}
          </div>
        </div>
      )}

      {/* Approved */}
      {approved.length > 0 && (
        <div>
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <span className="w-1 h-5 rounded-full bg-emerald-400" />
            Artes Aprovadas
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {approved.map(task => (
              <DesignCard key={task.id} task={task} clientColor={clientColor} onSelect={setSelectedTask} />
            ))}
          </div>
        </div>
      )}

      {tasks.length === 0 && (
        <div className="text-center py-16">
          <Palette size={48} className="mx-auto mb-4 text-white/10" />
          <p className="text-white/30 text-lg font-medium">Nenhuma arte solicitada ainda</p>
          <p className="text-white/20 text-sm mt-1">Clique em "Solicitar Arte" para começar</p>
        </div>
      )}

      {/* ── Request form modal ── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md bg-[#12121a] border border-white/[0.08] rounded-2xl p-6 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Palette size={18} style={{ color: `hsl(${clientColor})` }} />
                  Nova Solicitação de Arte
                </h3>
                <button onClick={() => setShowForm(false)} className="p-1.5 rounded-full hover:bg-white/10">
                  <X size={16} />
                </button>
              </div>

              {/* Info alert */}
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300/80 flex gap-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>Descreva com o máximo de detalhes possível: textos, cores, referências e onde a arte será utilizada.</span>
              </div>

              <div>
                <label className="text-xs font-medium text-white/60 mb-1 block">Título da arte *</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ex: Arte para promoção de Natal"
                  className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 transition-all"
                  style={{ '--tw-ring-color': `hsl(${clientColor})` } as any}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-white/60 mb-1 block">Formato</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(FORMAT_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setFormatType(key)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                        formatType === key
                          ? 'border-white/20 bg-white/10 text-white'
                          : 'border-white/[0.06] bg-white/[0.03] text-white/50 hover:text-white/70'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-white/60 mb-1 block">Descrição / Detalhes da solicitação *</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Descreva o que deseja na arte: textos, cores, referências visuais, onde será utilizada..."
                  className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 transition-all resize-none"
                  style={{ '--tw-ring-color': `hsl(${clientColor})` } as any}
                  rows={4}
                />
              </div>

              {artLimit !== null && (
                <p className="text-xs text-white/30 text-center">
                  {remaining} solicitação(ões) restante(s) neste mês
                </p>
              )}

              <button
                onClick={handleSubmit}
                disabled={!title.trim() || !description.trim() || submitting || !canRequest}
                className="w-full py-3 rounded-full font-semibold text-sm text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
                style={{ background: `hsl(${clientColor})` }}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> Enviando...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Send size={14} /> Enviar Solicitação
                  </span>
                )}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Task detail modal ── */}
      <AnimatePresence>
        {selectedTask && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm overflow-y-auto"
            onClick={() => { setSelectedTask(null); setShowAdjustment(false); setAdjustmentNote(''); }}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="max-w-2xl mx-auto my-8 px-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-end mb-2">
                <button onClick={() => { setSelectedTask(null); setShowAdjustment(false); }} className="p-2 rounded-full bg-white/10 hover:bg-white/20">
                  <X size={18} />
                </button>
              </div>

              {/* Preview */}
              {(selectedTask.attachment_url || selectedTask.mockup_url) && (
                <div className="bg-[#0c0c14] rounded-2xl overflow-hidden mb-6">
                  <img
                    src={selectedTask.attachment_url || selectedTask.mockup_url || ''}
                    alt={selectedTask.title}
                    className="w-full max-h-[60vh] object-contain"
                  />
                </div>
              )}

              <div className="space-y-5">
                <div>
                  <h3 className="text-xl font-bold">{selectedTask.title}</h3>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-white/[0.08] text-white/60">
                      {FORMAT_LABELS[selectedTask.format_type] || selectedTask.format_type}
                    </span>
                    {(() => {
                      const style = COLUMN_COLORS[selectedTask.kanban_column] || COLUMN_COLORS.nova_tarefa;
                      return (
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${style.bg} ${style.text} flex items-center gap-1`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          {COLUMN_LABELS[selectedTask.kanban_column] || selectedTask.kanban_column}
                        </span>
                      );
                    })()}
                    <span className="text-xs text-white/30">
                      {new Date(selectedTask.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>

                {selectedTask.description && (
                  <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4">
                    <p className="text-xs font-medium text-white/40 mb-1">Descrição</p>
                    <p className="text-sm text-white/70 whitespace-pre-wrap">{selectedTask.description}</p>
                  </div>
                )}

                {selectedTask.observations && (
                  <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4">
                    <p className="text-xs font-medium text-white/40 mb-1">Observações do designer</p>
                    <p className="text-sm text-white/70 whitespace-pre-wrap">{selectedTask.observations}</p>
                  </div>
                )}

                {/* Actions for pending approval */}
                {selectedTask.kanban_column === 'enviar_cliente' && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => handleApproveDesign(selectedTask.id)}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm bg-emerald-500 hover:bg-emerald-400 text-white transition-all hover:scale-105 active:scale-95"
                      >
                        <Check size={16} /> Aprovar Arte
                      </button>
                      <button
                        onClick={() => setShowAdjustment(!showAdjustment)}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold text-sm bg-white/10 hover:bg-white/15 text-white transition-all hover:scale-105 active:scale-95"
                      >
                        <MessageSquare size={16} /> Solicitar Ajuste
                      </button>
                    </div>

                    <AnimatePresence>
                      {showAdjustment && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-3">
                            <textarea
                              value={adjustmentNote}
                              onChange={e => setAdjustmentNote(e.target.value)}
                              placeholder="Descreva o ajuste necessário..."
                              className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl p-3 text-sm text-white placeholder:text-white/30 resize-none focus:outline-none focus:ring-1 transition-all"
                              style={{ '--tw-ring-color': `hsl(${clientColor})` } as any}
                              rows={3}
                            />
                            <div className="flex justify-end">
                              <button
                                onClick={() => handleRequestDesignAdjustment(selectedTask.id)}
                                disabled={!adjustmentNote.trim()}
                                className="px-5 py-2 rounded-full text-sm font-semibold disabled:opacity-30 text-white transition-all hover:scale-105"
                                style={{ background: `hsl(${clientColor})` }}
                              >
                                Enviar ajuste
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {selectedTask.kanban_column === 'aprovado' && (
                  <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                    <Check size={16} /> Arte aprovada
                    {selectedTask.client_approved_at && (
                      <span className="text-emerald-400/60 text-xs ml-1">
                        em {new Date(selectedTask.client_approved_at).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Design Card ── */
function DesignCard({ task, clientColor, onSelect }: {
  task: DesignTask;
  clientColor: string;
  onSelect: (t: DesignTask) => void;
}) {
  const style = COLUMN_COLORS[task.kanban_column] || COLUMN_COLORS.nova_tarefa;
  const fileUrl = task.attachment_url || task.mockup_url;
  const isImage = fileUrl && /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(fileUrl);

  return (
    <button
      onClick={() => onSelect(task)}
      className="group text-left bg-white/[0.04] border border-white/[0.06] rounded-xl overflow-hidden hover:bg-white/[0.06] transition-all hover:scale-[1.02]"
    >
      {/* Thumbnail */}
      {isImage ? (
        <div className="aspect-video bg-[#0c0c14] overflow-hidden relative">
          <img src={fileUrl} alt={task.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Eye size={20} className="text-white/80" />
          </div>
        </div>
      ) : (
        <div className="aspect-video bg-white/[0.02] flex items-center justify-center">
          <ImageIcon size={28} className="text-white/10" />
        </div>
      )}

      <div className="p-3 space-y-2">
        <p className="text-sm font-medium truncate">{task.title}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-white/50">
            {FORMAT_LABELS[task.format_type] || task.format_type}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${style.bg} ${style.text} flex items-center gap-1`}>
            <span className={`w-1 h-1 rounded-full ${style.dot}`} />
            {COLUMN_LABELS[task.kanban_column] || task.kanban_column}
          </span>
        </div>
        <p className="text-[10px] text-white/25">
          {new Date(task.created_at).toLocaleDateString('pt-BR')}
        </p>
      </div>
    </button>
  );
}
