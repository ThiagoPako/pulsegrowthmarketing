import { useState, useEffect, useMemo } from 'react';
import { portalAction } from '@/lib/portalApi';
import { FileText, Film, Palette, Video, Image, Sparkles, User, Tag, AlertTriangle, Flame, Rocket, ChevronRight, Pencil, Save, X as XIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { syncPortalScriptPriority, syncPortalScriptEdit } from '@/lib/portalSync';
import { highlightQuotes } from '@/lib/highlightQuotes';

interface Script {
  id: string;
  title: string;
  content: string;
  caption: string;
  content_format: string;
  video_type: string;
  created_at: string;
  created_by: string | null;
  priority: string;
  client_priority: string;
  client_edited: boolean;
  client_edited_at: string | null;
}

interface Author {
  id: string;
  name: string;
  display_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
}

interface Props {
  clientId: string;
  clientColor: string;
  isAuthenticated?: boolean;
}

const VIDEO_TYPE_TAGS: Record<string, { label: string; bg: string; text: string; border: string }> = {
  vendas: { label: 'Vendas', bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/20' },
  institucional: { label: 'Institucional', bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/20' },
  reconhecimento: { label: 'Reconhecimento', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/20' },
  educacional: { label: 'Educacional', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  bastidores: { label: 'Bastidores', bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/20' },
  depoimento: { label: 'Depoimento', bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/20' },
  lancamento: { label: 'Lançamento', bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/20' },
};

const FORMAT_CONFIG: Record<string, { label: string; icon: any; gradient: string; pattern: string }> = {
  reels: {
    label: 'Reels', icon: Film,
    gradient: 'from-rose-500/30 via-pink-600/20 to-purple-700/30',
    pattern: 'radial-gradient(circle at 20% 80%, rgba(244,63,94,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(168,85,247,0.15) 0%, transparent 50%)',
  },
  story: {
    label: 'Story', icon: Sparkles,
    gradient: 'from-amber-500/30 via-orange-500/20 to-red-600/30',
    pattern: 'radial-gradient(circle at 30% 70%, rgba(245,158,11,0.15) 0%, transparent 50%), radial-gradient(circle at 70% 30%, rgba(239,68,68,0.15) 0%, transparent 50%)',
  },
  criativo: {
    label: 'Criativo', icon: Palette,
    gradient: 'from-cyan-500/30 via-blue-500/20 to-indigo-600/30',
    pattern: 'radial-gradient(circle at 25% 75%, rgba(6,182,212,0.15) 0%, transparent 50%), radial-gradient(circle at 75% 25%, rgba(99,102,241,0.15) 0%, transparent 50%)',
  },
};

const VIDEO_TYPE_COVERS: Record<string, { gradient: string; pattern: string }> = {
  vendas: { gradient: 'from-blue-500/30 via-indigo-500/20 to-blue-700/30', pattern: 'radial-gradient(circle at 20% 80%, rgba(59,130,246,0.2) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(99,102,241,0.15) 0%, transparent 50%)' },
  institucional: { gradient: 'from-purple-500/30 via-violet-500/20 to-purple-700/30', pattern: 'radial-gradient(circle at 20% 80%, rgba(168,85,247,0.2) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(139,92,246,0.15) 0%, transparent 50%)' },
  reconhecimento: { gradient: 'from-amber-500/30 via-yellow-500/20 to-amber-700/30', pattern: 'radial-gradient(circle at 20% 80%, rgba(245,158,11,0.2) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(234,179,8,0.15) 0%, transparent 50%)' },
  educacional: { gradient: 'from-emerald-500/30 via-green-500/20 to-emerald-700/30', pattern: 'radial-gradient(circle at 20% 80%, rgba(16,185,129,0.2) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(34,197,94,0.15) 0%, transparent 50%)' },
  bastidores: { gradient: 'from-orange-500/30 via-amber-500/20 to-orange-700/30', pattern: 'radial-gradient(circle at 20% 80%, rgba(249,115,22,0.2) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(245,158,11,0.15) 0%, transparent 50%)' },
  depoimento: { gradient: 'from-rose-500/30 via-pink-500/20 to-rose-700/30', pattern: 'radial-gradient(circle at 20% 80%, rgba(244,63,94,0.2) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(236,72,153,0.15) 0%, transparent 50%)' },
  lancamento: { gradient: 'from-cyan-500/30 via-teal-500/20 to-cyan-700/30', pattern: 'radial-gradient(circle at 20% 80%, rgba(6,182,212,0.2) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(20,184,166,0.15) 0%, transparent 50%)' },
};

const DEFAULT_FORMAT = {
  label: 'Conteúdo', icon: FileText,
  gradient: 'from-slate-500/30 via-gray-500/20 to-zinc-600/30',
  pattern: 'radial-gradient(circle at 50% 50%, rgba(148,163,184,0.1) 0%, transparent 50%)',
};

/* ── Animated fire particles for urgent scripts ── */
function FireParticles() {
  const particles = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      x: 10 + Math.random() * 80,
      delay: Math.random() * 2,
      size: 6 + Math.random() * 10,
      duration: 1.2 + Math.random() * 0.8,
    })), []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute bottom-0"
          style={{ left: `${p.x}%` }}
          initial={{ opacity: 0, y: 0, scale: 0.5 }}
          animate={{
            opacity: [0, 0.9, 0.7, 0],
            y: [0, -40, -70, -100],
            scale: [0.5, 1, 0.8, 0.3],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        >
          <span style={{ fontSize: p.size }} className="select-none">🔥</span>
        </motion.div>
      ))}
      {/* Ambient glow */}
      <motion.div
        className="absolute bottom-0 inset-x-0 h-16"
        style={{ background: 'linear-gradient(to top, rgba(239,68,68,0.15), transparent)' }}
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

/* ── Rocket animation for priority scripts ── */
function RocketAnimation() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className="absolute bottom-2 right-4"
        animate={{
          y: [0, -6, 0, -3, 0],
          rotate: [-2, 2, -1, 1, 0],
        }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span className="text-2xl select-none drop-shadow-lg">🚀</span>
      </motion.div>
      {/* Exhaust trail */}
      <motion.div
        className="absolute bottom-0 right-6 w-4"
        animate={{ opacity: [0.3, 0.7, 0.3], scaleY: [0.8, 1.2, 0.8] }}
        transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="text-[8px] text-center leading-none select-none">🔥</div>
      </motion.div>
      {/* Ambient glow */}
      <motion.div
        className="absolute bottom-0 inset-x-0 h-12"
        style={{ background: 'linear-gradient(to top, rgba(245,158,11,0.1), transparent)' }}
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

/* ── Glowing border for urgent/priority cards ── */
function GlowBorder({ color, intensity }: { color: string; intensity: 'low' | 'high' }) {
  return (
    <motion.div
      className="absolute inset-0 rounded-2xl pointer-events-none"
      style={{
        boxShadow: `0 0 ${intensity === 'high' ? '20px' : '12px'} ${color}`,
      }}
      animate={{
        boxShadow: [
          `0 0 ${intensity === 'high' ? '8px' : '4px'} ${color}`,
          `0 0 ${intensity === 'high' ? '24px' : '14px'} ${color}`,
          `0 0 ${intensity === 'high' ? '8px' : '4px'} ${color}`,
        ],
      }}
      transition={{ duration: intensity === 'high' ? 1.5 : 2.5, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

export default function ZonaCriativa({ clientId, clientColor, isAuthenticated }: Props) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [authors, setAuthors] = useState<Record<string, Author>>({});
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editCaption, setEditCaption] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadScripts(); }, [clientId]);

  useEffect(() => {
    // Poll for script changes every 30s
    const interval = setInterval(loadScripts, 30000);
    return () => clearInterval(interval);
  }, [clientId]);

  const loadScripts = async () => {
    setLoading(true);
    const result = await portalAction({ action: 'get_scripts', client_id: clientId });
    
    if (result?.error) { console.error('Error loading scripts for portal:', result.error); setLoading(false); return; }
    
    if (result?.scripts) {
      setScripts(result.scripts as Script[]);
      if (result.authors) {
        const map: Record<string, Author> = {};
        Object.entries(result.authors).forEach(([id, p]: [string, any]) => { map[id] = p as Author; });
        setAuthors(map);
      }
    }
    setLoading(false);
  };

  const handleSetClientPriority = async (scriptId: string, newPriority: string) => {
    const current = scripts.find(s => s.id === scriptId);
    const finalPriority = current?.client_priority === newPriority ? 'normal' : newPriority;
    
    const result = await portalAction({ action: 'set_script_priority', client_id: clientId, script_id: scriptId, priority: finalPriority });
    setScripts(prev => prev.map(s => s.id === scriptId ? { ...s, client_priority: finalPriority } : s));
    if (selectedScript?.id === scriptId) {
      setSelectedScript(prev => prev ? { ...prev, client_priority: finalPriority } : null);
    }
    toast.success(finalPriority === 'normal' ? 'Prioridade removida' : `Marcado como ${finalPriority === 'urgent' ? 'Urgente 🔥' : 'Prioridade 🚀'}`);
    
    if (current) {
      syncPortalScriptPriority(clientId, current.title, finalPriority, result?.company_name || '').catch(console.error);
    }
  };

  const handleStartEdit = (script: Script) => {
    const plain = stripHtml(script.content);
    setEditContent(plain);
    setEditCaption(script.caption || '');
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedScript) return;
    setSaving(true);
    const result = await portalAction({
      action: 'client_edit_script',
      client_id: clientId,
      script_id: selectedScript.id,
      content: editContent,
      caption: editCaption,
    });
    if (result?.error) {
      toast.error('Erro ao salvar edição');
    } else {
      toast.success('Roteiro editado com sucesso!');
      setScripts(prev => prev.map(s => s.id === selectedScript.id ? { ...s, content: `<p>${editContent.replace(/\n/g, '</p><p>')}</p>`, caption: editCaption, client_edited: true, client_edited_at: new Date().toISOString() } : s));
      setSelectedScript(prev => prev ? { ...prev, content: `<p>${editContent.replace(/\n/g, '</p><p>')}</p>`, caption: editCaption, client_edited: true, client_edited_at: new Date().toISOString() } : null);
      setEditing(false);
    }
    setSaving(false);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditContent('');
    setEditCaption('');
  };

  const getCoverConfig = (script: Script) => {
    const vtCover = VIDEO_TYPE_COVERS[script.video_type];
    const fmtConfig = FORMAT_CONFIG[script.content_format] || DEFAULT_FORMAT;
    return { icon: fmtConfig.icon, label: fmtConfig.label, gradient: vtCover?.gradient || fmtConfig.gradient, pattern: vtCover?.pattern || fmtConfig.pattern };
  };

  const getTag = (videoType: string) => VIDEO_TYPE_TAGS[videoType] || { label: videoType, bg: 'bg-white/10', text: 'text-white/60', border: 'border-white/10' };

  const stripHtml = (html: string) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  const videoTypes = [...new Set(scripts.map(s => s.video_type))];
  
  const sortedScripts = [...(filterType ? scripts.filter(s => s.video_type === filterType) : scripts)].sort((a, b) => {
    const order: Record<string, number> = { urgent: 0, priority: 1, normal: 2 };
    return (order[a.client_priority] ?? 2) - (order[b.client_priority] ?? 2);
  });

  const urgentCount = scripts.filter(s => s.client_priority === 'urgent').length;
  const priorityCount = scripts.filter(s => s.client_priority === 'priority').length;

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-16 text-center">
        <motion.div
          className="w-10 h-10 mx-auto"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Sparkles size={40} className="text-white/20" />
        </motion.div>
        <p className="text-white/30 text-sm mt-4">Carregando roteiros...</p>
      </div>
    );
  }

  return (
    <motion.div key="criativa" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, hsl(${clientColor} / 0.15), transparent 60%)` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#080810]" />
        <div className="relative max-w-[1400px] mx-auto px-4 sm:px-8 py-12 sm:py-16">
          <motion.div
            initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-white/70 mb-4">
              <motion.span animate={{ rotate: [0, 15, -15, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
                <Sparkles size={12} style={{ color: `hsl(${clientColor})` }} />
              </motion.span>
              Zona Criativa
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Roteiros & Ideias</h2>
            <p className="text-white/50 mt-2 text-sm sm:text-base max-w-md">
              Acompanhe os roteiros criados pela nossa equipe para o seu conteúdo.
              {isAuthenticated && <span className="block text-white/30 text-xs mt-1">Você pode marcar roteiros como prioridade ou urgente.</span>}
            </p>

            {/* Stats row */}
            <div className="flex gap-5 mt-6">
              <motion.div
                className="text-center"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.4 }}
              >
                <p className="text-2xl font-bold" style={{ color: `hsl(${clientColor})` }}>{scripts.length}</p>
                <p className="text-[10px] text-white/40">Roteiros</p>
              </motion.div>
              {urgentCount > 0 && (
                <motion.div
                  className="text-center"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3, duration: 0.4 }}
                >
                  <p className="text-2xl font-bold text-red-400">{urgentCount} 🔥</p>
                  <p className="text-[10px] text-white/40">Urgentes</p>
                </motion.div>
              )}
              {priorityCount > 0 && (
                <motion.div
                  className="text-center"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.35, duration: 0.4 }}
                >
                  <p className="text-2xl font-bold text-amber-400">{priorityCount} 🚀</p>
                  <p className="text-[10px] text-white/40">Prioridade</p>
                </motion.div>
              )}
              {videoTypes.map((vt, i) => {
                const tag = getTag(vt);
                const count = scripts.filter(s => s.video_type === vt).length;
                return (
                  <motion.div
                    key={vt}
                    className="text-center"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 + i * 0.05, duration: 0.4 }}
                  >
                    <p className={`text-2xl font-bold ${tag.text}`}>{count}</p>
                    <p className="text-[10px] text-white/40">{tag.label}</p>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Filter tags */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 -mt-2 mb-6">
        <motion.div
          className="flex flex-wrap gap-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <button
            onClick={() => setFilterType(null)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border active:scale-95 ${
              !filterType ? 'bg-white/15 text-white border-white/20' : 'bg-white/[0.04] text-white/50 border-white/[0.06] hover:bg-white/[0.08]'
            }`}
          >
            Todos ({scripts.length})
          </button>
          {videoTypes.map(vt => {
            const tag = getTag(vt);
            const count = scripts.filter(s => s.video_type === vt).length;
            return (
              <button
                key={vt}
                onClick={() => setFilterType(filterType === vt ? null : vt)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border active:scale-95 ${
                  filterType === vt
                    ? `${tag.bg} ${tag.text} ${tag.border}`
                    : `bg-white/[0.04] text-white/50 border-white/[0.06] hover:${tag.bg} hover:${tag.text}`
                }`}
              >
                <Tag size={10} />
                {tag.label} ({count})
              </button>
            );
          })}
        </motion.div>
      </div>

      {/* Scripts Grid */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 pb-20">
        {sortedScripts.length === 0 ? (
          <motion.div
            className="text-center py-24"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <FileText size={48} className="mx-auto mb-4 text-white/10" />
            <p className="text-lg text-white/30 font-medium">
              {filterType ? `Nenhum roteiro de ${getTag(filterType).label}` : 'Nenhum roteiro ainda'}
            </p>
            <p className="text-sm text-white/20 mt-1">Os roteiros criados pela equipe aparecerão aqui.</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <AnimatePresence mode="popLayout">
              {sortedScripts.map((script, idx) => {
                const cover = getCoverConfig(script);
                const Icon = cover.icon;
                const tag = getTag(script.video_type);
                const author = script.created_by ? authors[script.created_by] : null;
                const plainContent = stripHtml(script.content);
                const excerpt = plainContent.length > 120 ? plainContent.slice(0, 120) + '...' : plainContent;
                const isUrgent = script.client_priority === 'urgent';
                const isPriority = script.client_priority === 'priority';

                return (
                  <motion.div
                    key={script.id}
                    layout
                    initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{
                      delay: idx * 0.06,
                      duration: 0.5,
                      ease: [0.16, 1, 0.3, 1],
                      layout: { duration: 0.3 },
                    }}
                    className="relative group"
                  >
                    {/* Glow effect for priority cards */}
                    {isUrgent && <GlowBorder color="rgba(239,68,68,0.25)" intensity="high" />}
                    {isPriority && <GlowBorder color="rgba(245,158,11,0.2)" intensity="low" />}

                    <div className={`relative rounded-2xl overflow-hidden border transition-all duration-300 bg-white/[0.02] ${
                      isUrgent
                        ? 'border-red-500/30 hover:border-red-500/50'
                        : isPriority
                        ? 'border-amber-500/25 hover:border-amber-500/40'
                        : 'border-white/[0.06] hover:border-white/[0.12]'
                    }`}>
                      <button onClick={() => setSelectedScript(script)} className="w-full text-left">
                        {/* Cover */}
                        <div className={`relative h-32 sm:h-36 bg-gradient-to-br ${cover.gradient} overflow-hidden`} style={{ backgroundImage: cover.pattern }}>
                          {/* Decorative shapes */}
                          <div className="absolute inset-0 opacity-30">
                            <motion.div
                              className="absolute top-4 right-4 w-20 h-20 rounded-full border border-white/10"
                              animate={{ scale: [1, 1.1, 1], rotate: [0, 90, 0] }}
                              transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                            />
                            <motion.div
                              className="absolute bottom-4 left-4 w-12 h-12 rounded-lg border border-white/10"
                              animate={{ rotate: [12, -12, 12] }}
                              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                            />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                              <Icon size={48} className="text-white/10" />
                            </div>
                          </div>

                          {/* Fire particles for urgent */}
                          {isUrgent && <FireParticles />}
                          {/* Rocket for priority */}
                          {isPriority && <RocketAnimation />}

                          {/* Format badge */}
                          <motion.div
                            className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/30 backdrop-blur-sm text-[10px] font-semibold text-white/90"
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: idx * 0.06 + 0.3 }}
                          >
                            <Icon size={10} /> {cover.label}
                          </motion.div>

                          {/* Video type tag */}
                          <motion.div
                            className={`absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full ${tag.bg} ${tag.text} border ${tag.border} backdrop-blur-sm text-[9px] font-bold`}
                            initial={{ x: 20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: idx * 0.06 + 0.35 }}
                          >
                            <Tag size={8} /> {tag.label}
                          </motion.div>

                          {/* Priority badge */}
                          {isUrgent && (
                            <motion.div
                              className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/25 backdrop-blur-sm text-[10px] font-bold text-red-300 border border-red-500/30"
                              animate={{ scale: [1, 1.05, 1] }}
                              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                            >
                              <Flame size={10} /> Urgente 🔥
                            </motion.div>
                          )}
                          {isPriority && (
                            <motion.div
                              className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/25 backdrop-blur-sm text-[10px] font-bold text-amber-300 border border-amber-500/30"
                              animate={{ y: [0, -2, 0] }}
                              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                            >
                              <Rocket size={10} /> Prioridade 🚀
                            </motion.div>
                          )}

                          {/* Date */}
                          <div className="absolute bottom-3 right-3 text-[10px] text-white/50 font-medium">
                            {format(new Date(script.created_at), "dd MMM", { locale: pt })}
                          </div>
                        </div>

                        {/* Content */}
                        <div className="p-4 space-y-3">
                          <div className="flex items-start gap-2">
                            <h4 className="text-sm font-semibold text-white/90 line-clamp-2 group-hover:text-white transition-colors duration-200 flex-1">
                              {script.title}
                            </h4>
                            {script.client_edited && (
                              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20 text-[8px] font-bold whitespace-nowrap shrink-0">
                                <Pencil size={7} /> Editado
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-white/35 line-clamp-3 leading-relaxed">{excerpt || 'Sem descrição'}</p>

                          {author && (
                            <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04]">
                              {author.avatar_url ? (
                                <img src={author.avatar_url} alt={author.display_name || author.name} className="w-6 h-6 rounded-full object-cover ring-1 ring-white/10" />
                              ) : (
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: `hsl(${clientColor})` }}>
                                  {(author.display_name || author.name).charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-medium text-white/60 truncate">{author.display_name || author.name}</p>
                                {author.job_title && <p className="text-[9px] text-white/30 truncate">{author.job_title}</p>}
                              </div>
                              <ChevronRight size={12} className="text-white/20 group-hover:text-white/40 transition-colors" />
                            </div>
                          )}
                        </div>
                      </button>

                      {/* Priority buttons */}
                      {isAuthenticated && (
                        <div className="px-4 pb-3 flex gap-2">
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleSetClientPriority(script.id, 'priority')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-semibold transition-all duration-200 border ${
                              isPriority
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                                : 'bg-white/[0.04] text-white/40 border-white/[0.06] hover:bg-amber-500/10 hover:text-amber-300 hover:border-amber-500/20'
                            }`}
                          >
                            {isPriority ? <Rocket size={10} /> : <AlertTriangle size={10} />}
                            {isPriority ? '🚀 Prioridade' : 'Prioridade'}
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleSetClientPriority(script.id, 'urgent')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-semibold transition-all duration-200 border ${
                              isUrgent
                                ? 'bg-red-500/20 text-red-300 border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
                                : 'bg-white/[0.04] text-white/40 border-white/[0.06] hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/20'
                            }`}
                          >
                            {isUrgent ? <Flame size={10} /> : <Flame size={10} />}
                            {isUrgent ? '🔥 Urgente' : 'Urgente'}
                          </motion.button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Script Detail Modal */}
      <AnimatePresence>
        {selectedScript && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm overflow-y-auto"
            onClick={() => { setSelectedScript(null); setEditing(false); }}
          >
            <motion.div
              initial={{ opacity: 0, y: 40, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: 40, filter: 'blur(10px)' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="max-w-2xl mx-auto my-8 sm:my-16 px-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="bg-[#14141f] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl">
                {/* Cover header */}
                {(() => {
                  const cover = getCoverConfig(selectedScript);
                  const Icon = cover.icon;
                  const tag = getTag(selectedScript.video_type);
                  const isUrgent = selectedScript.client_priority === 'urgent';
                  const isPriority = selectedScript.client_priority === 'priority';
                  return (
                    <div className={`relative h-32 bg-gradient-to-br ${cover.gradient}`} style={{ backgroundImage: cover.pattern }}>
                      {isUrgent && <FireParticles />}
                      {isPriority && <RocketAnimation />}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Icon size={40} className="text-white/10" />
                      </div>
                      <div className="absolute top-3 left-3 flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/30 backdrop-blur-sm text-xs font-semibold text-white/90">
                          <Icon size={12} /> {cover.label}
                        </span>
                        <span className={`flex items-center gap-1 px-2 py-1 rounded-full ${tag.bg} ${tag.text} border ${tag.border} backdrop-blur-sm text-[10px] font-bold`}>
                          <Tag size={9} /> {tag.label}
                        </span>
                        {isUrgent && (
                          <motion.span
                            className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/25 text-red-300 border border-red-500/30 backdrop-blur-sm text-[10px] font-bold"
                            animate={{ scale: [1, 1.05, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                          >
                            <Flame size={9} /> Urgente 🔥
                          </motion.span>
                        )}
                        {isPriority && (
                          <motion.span
                            className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/25 text-amber-300 border border-amber-500/30 backdrop-blur-sm text-[10px] font-bold"
                            animate={{ y: [0, -2, 0] }}
                            transition={{ duration: 2, repeat: Infinity }}
                          >
                            <Rocket size={9} /> Prioridade 🚀
                          </motion.span>
                        )}
                      </div>
                      <button onClick={() => { setSelectedScript(null); setEditing(false); }} className="absolute top-3 right-3 p-1.5 rounded-full bg-black/30 backdrop-blur-sm hover:bg-black/50 transition-colors active:scale-95">
                        <span className="text-white/70 text-sm">✕</span>
                      </button>
                    </div>
                  );
                })()}

                <div className="p-6 space-y-4">
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-bold">{selectedScript.title}</h2>
                        <p className="text-xs text-white/40 mt-1">
                          {format(new Date(selectedScript.created_at), "dd 'de' MMMM 'de' yyyy", { locale: pt })}
                        </p>
                      </div>
                      {selectedScript.client_edited && (
                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20 text-[10px] font-bold whitespace-nowrap shrink-0">
                          <Pencil size={9} /> Editado pelo cliente
                        </span>
                      )}
                    </div>
                  </motion.div>

                  {/* Priority actions + Edit button */}
                  {isAuthenticated && (
                    <motion.div className="flex gap-2 flex-wrap" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        onClick={() => handleSetClientPriority(selectedScript.id, 'priority')}
                        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 border ${
                          selectedScript.client_priority === 'priority'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 shadow-[0_0_16px_rgba(245,158,11,0.15)]'
                            : 'bg-white/[0.04] text-white/40 border-white/[0.06] hover:bg-amber-500/10 hover:text-amber-300'
                        }`}
                      >
                        <Rocket size={12} /> {selectedScript.client_priority === 'priority' ? '🚀 Prioridade ativa' : 'Quero gravar primeiro'}
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        onClick={() => handleSetClientPriority(selectedScript.id, 'urgent')}
                        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 border ${
                          selectedScript.client_priority === 'urgent'
                            ? 'bg-red-500/20 text-red-300 border-red-500/30 shadow-[0_0_16px_rgba(239,68,68,0.15)]'
                            : 'bg-white/[0.04] text-white/40 border-white/[0.06] hover:bg-red-500/10 hover:text-red-300'
                        }`}
                      >
                        <Flame size={12} /> {selectedScript.client_priority === 'urgent' ? '🔥 Urgente ativo' : 'Urgente'}
                      </motion.button>
                      {!editing && (
                        <motion.button
                          whileTap={{ scale: 0.96 }}
                          onClick={() => handleStartEdit(selectedScript)}
                          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 border bg-white/[0.04] text-white/40 border-white/[0.06] hover:bg-violet-500/10 hover:text-violet-300 hover:border-violet-500/20 ml-auto"
                        >
                          <Pencil size={12} /> Editar roteiro
                        </motion.button>
                      )}
                    </motion.div>
                  )}

                  {/* Author */}
                  {selectedScript.created_by && authors[selectedScript.created_by] && (() => {
                    const author = authors[selectedScript.created_by!];
                    return (
                      <motion.div
                        className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                      >
                        {author.avatar_url ? (
                          <img src={author.avatar_url} alt={author.name} className="w-9 h-9 rounded-full object-cover ring-1 ring-white/10" />
                        ) : (
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: `hsl(${clientColor})` }}>
                            {(author.display_name || author.name).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-semibold text-white/80">{author.display_name || author.name}</p>
                          <p className="text-[11px] text-white/40">{author.job_title || 'Equipe Criativa'}</p>
                        </div>
                        <div className="ml-auto text-[10px] text-white/30 flex items-center gap-1">
                          <User size={10} /> Autor
                        </div>
                      </motion.div>
                    );
                  })()}

                  {/* Editing mode */}
                  {editing ? (
                    <motion.div className="space-y-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider font-semibold text-white/40 mb-1.5 block">📝 Legenda</label>
                        <textarea
                          value={editCaption}
                          onChange={e => setEditCaption(e.target.value)}
                          className="w-full min-h-[60px] rounded-xl bg-white/[0.06] border border-white/[0.1] text-sm text-white/80 p-3 resize-y focus:outline-none focus:border-violet-500/40 placeholder:text-white/20"
                          placeholder="Legenda do conteúdo..."
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider font-semibold text-white/40 mb-1.5 block">📄 Roteiro</label>
                        <textarea
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          className="w-full min-h-[200px] rounded-xl bg-white/[0.06] border border-white/[0.1] text-sm text-white/80 p-3 resize-y focus:outline-none focus:border-violet-500/40 placeholder:text-white/20 leading-relaxed"
                          placeholder="Conteúdo do roteiro..."
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <motion.button
                          whileTap={{ scale: 0.96 }}
                          onClick={handleCancelEdit}
                          disabled={saving}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white/[0.04] text-white/40 border border-white/[0.06] hover:bg-white/[0.08]"
                        >
                          <XIcon size={12} /> Cancelar
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.96 }}
                          onClick={handleSaveEdit}
                          disabled={saving}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 disabled:opacity-50"
                        >
                          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                          {saving ? 'Salvando...' : 'Salvar edição'}
                        </motion.button>
                      </div>
                    </motion.div>
                  ) : (
                    <>
                      {/* Caption */}
                      {selectedScript.caption && (
                        <motion.div
                          className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.25 }}
                        >
                          <p className="text-[10px] uppercase tracking-wider font-semibold text-white/40 mb-1.5">📝 Legenda</p>
                          <p className="text-sm text-white/70 leading-relaxed">{selectedScript.caption}</p>
                        </motion.div>
                      )}

                      {/* Script content */}
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                        <div
                          className="prose prose-invert prose-sm max-w-none text-white/75 leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: highlightQuotes(selectedScript.content) }}
                        />
                      </motion.div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
