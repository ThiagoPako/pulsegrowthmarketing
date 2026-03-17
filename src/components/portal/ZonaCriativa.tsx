import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Film, Palette, Video, Image, Sparkles, User, Tag, AlertTriangle, Flame } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { syncPortalScriptPriority } from '@/lib/portalSync';

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

const CLIENT_PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  priority: { label: 'Prioridade', color: 'text-amber-300', bg: 'bg-amber-500/20', border: 'border-amber-500/30', icon: AlertTriangle },
  urgent: { label: 'Urgente', color: 'text-red-300', bg: 'bg-red-500/20', border: 'border-red-500/30', icon: Flame },
};

export default function ZonaCriativa({ clientId, clientColor, isAuthenticated }: Props) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [authors, setAuthors] = useState<Record<string, Author>>({});
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadScripts(); }, [clientId]);

  useEffect(() => {
    const channel = supabase
      .channel(`scripts_portal_${clientId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scripts', filter: `client_id=eq.${clientId}` }, () => loadScripts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId]);

  const loadScripts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('scripts')
      .select('id, title, content, caption, content_format, video_type, created_at, created_by, priority, client_priority')
      .eq('client_id', clientId)
      .eq('is_endomarketing', false)
      .order('created_at', { ascending: false });

    if (error) { console.error('Error loading scripts for portal:', error); setLoading(false); return; }

    if (data) {
      setScripts(data as Script[]);
      const authorIds = [...new Set(data.filter(s => s.created_by).map(s => s.created_by!))];
      if (authorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name, display_name, avatar_url, job_title')
          .in('id', authorIds);
        if (profiles) {
          const map: Record<string, Author> = {};
          profiles.forEach(p => { map[p.id] = p as Author; });
          setAuthors(map);
        }
      }
    }
    setLoading(false);
  };

  const handleSetClientPriority = async (scriptId: string, newPriority: string) => {
    const current = scripts.find(s => s.id === scriptId);
    const finalPriority = current?.client_priority === newPriority ? 'normal' : newPriority;
    
    await supabase.from('scripts').update({ client_priority: finalPriority } as any).eq('id', scriptId);
    setScripts(prev => prev.map(s => s.id === scriptId ? { ...s, client_priority: finalPriority } : s));
    if (selectedScript?.id === scriptId) {
      setSelectedScript(prev => prev ? { ...prev, client_priority: finalPriority } : null);
    }
    toast.success(finalPriority === 'normal' ? 'Prioridade removida' : `Marcado como ${finalPriority === 'urgent' ? 'Urgente' : 'Prioridade'}`);
    
    // Sync priority change to internal system
    if (current) {
      // Get client name for notification
      const { data: clientData } = await supabase.from('clients').select('company_name').eq('id', clientId).single();
      syncPortalScriptPriority(clientId, current.title, finalPriority, clientData?.company_name || '').catch(console.error);
    }
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
  
  // Sort: urgent first, then priority, then normal
  const sortedScripts = [...(filterType ? scripts.filter(s => s.video_type === filterType) : scripts)].sort((a, b) => {
    const order: Record<string, number> = { urgent: 0, priority: 1, normal: 2 };
    return (order[a.client_priority] ?? 2) - (order[b.client_priority] ?? 2);
  });

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-16 text-center">
        <div className="w-8 h-8 border-2 border-white/10 border-t-white/40 rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <motion.div key="criativa" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, hsl(${clientColor} / 0.15), transparent 60%)` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#080810]" />
        <div className="relative max-w-[1400px] mx-auto px-4 sm:px-8 py-12 sm:py-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-white/70 mb-4">
              <Sparkles size={12} style={{ color: `hsl(${clientColor})` }} />
              Zona Criativa
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Roteiros & Ideias</h2>
            <p className="text-white/50 mt-2 text-sm sm:text-base max-w-md">
              Acompanhe os roteiros criados pela nossa equipe para o seu conteúdo.
              {isAuthenticated && <span className="block text-white/30 text-xs mt-1">Você pode marcar roteiros como prioridade ou urgente.</span>}
            </p>
            <div className="flex gap-4 mt-6">
              <div className="text-center">
                <p className="text-2xl font-bold" style={{ color: `hsl(${clientColor})` }}>{scripts.length}</p>
                <p className="text-[10px] text-white/40">Roteiros</p>
              </div>
              {videoTypes.map(vt => {
                const tag = getTag(vt);
                const count = scripts.filter(s => s.video_type === vt).length;
                return (
                  <div key={vt} className="text-center">
                    <p className={`text-2xl font-bold ${tag.text}`}>{count}</p>
                    <p className="text-[10px] text-white/40">{tag.label}</p>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Filter tags */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 -mt-2 mb-6">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterType(null)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
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
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
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
        </div>
      </div>

      {/* Scripts Grid */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 pb-20">
        {sortedScripts.length === 0 ? (
          <div className="text-center py-24">
            <FileText size={48} className="mx-auto mb-4 text-white/10" />
            <p className="text-lg text-white/30 font-medium">
              {filterType ? `Nenhum roteiro de ${getTag(filterType).label}` : 'Nenhum roteiro ainda'}
            </p>
            <p className="text-sm text-white/20 mt-1">Os roteiros criados pela equipe aparecerão aqui.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedScripts.map((script, idx) => {
              const cover = getCoverConfig(script);
              const Icon = cover.icon;
              const tag = getTag(script.video_type);
              const author = script.created_by ? authors[script.created_by] : null;
              const plainContent = stripHtml(script.content);
              const excerpt = plainContent.length > 120 ? plainContent.slice(0, 120) + '...' : plainContent;
              const cp = CLIENT_PRIORITY_CONFIG[script.client_priority];

              return (
                <motion.div
                  key={script.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className={`group text-left rounded-2xl overflow-hidden border transition-all duration-300 hover:scale-[1.02] hover:shadow-xl bg-white/[0.02] ${
                    cp ? `${cp.border} ring-1 ring-inset ${cp.border}` : 'border-white/[0.06] hover:border-white/[0.12]'
                  }`}
                >
                  <button onClick={() => setSelectedScript(script)} className="w-full text-left">
                    {/* Cover */}
                    <div className={`relative h-32 sm:h-36 bg-gradient-to-br ${cover.gradient} overflow-hidden`} style={{ backgroundImage: cover.pattern }}>
                      <div className="absolute inset-0 opacity-30">
                        <div className="absolute top-4 right-4 w-20 h-20 rounded-full border border-white/10" />
                        <div className="absolute bottom-4 left-4 w-12 h-12 rounded-lg border border-white/10 rotate-12" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                          <Icon size={48} className="text-white/10" />
                        </div>
                      </div>
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/30 backdrop-blur-sm text-[10px] font-semibold text-white/90">
                        <Icon size={10} /> {cover.label}
                      </div>
                      <div className={`absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full ${tag.bg} ${tag.text} border ${tag.border} backdrop-blur-sm text-[9px] font-bold`}>
                        <Tag size={8} /> {tag.label}
                      </div>
                      {cp && (
                        <div className={`absolute bottom-3 left-3 flex items-center gap-1 px-2 py-0.5 rounded-full ${cp.bg} backdrop-blur-sm text-[9px] font-bold ${cp.color} border ${cp.border} animate-pulse`}>
                          <cp.icon size={9} /> {cp.label}
                        </div>
                      )}
                      <div className="absolute bottom-3 right-3 text-[10px] text-white/50 font-medium">
                        {format(new Date(script.created_at), "dd MMM", { locale: pt })}
                      </div>
                    </div>
                    {/* Content */}
                    <div className="p-4 space-y-3">
                      <h4 className="text-sm font-semibold text-white/90 line-clamp-2 group-hover:text-white transition-colors">{script.title}</h4>
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
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Priority buttons (only for authenticated clients) */}
                  {isAuthenticated && (
                    <div className="px-4 pb-3 flex gap-2">
                      <button
                        onClick={() => handleSetClientPriority(script.id, 'priority')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all border ${
                          script.client_priority === 'priority'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : 'bg-white/[0.04] text-white/40 border-white/[0.06] hover:bg-amber-500/10 hover:text-amber-300'
                        }`}
                      >
                        <AlertTriangle size={10} /> Prioridade
                      </button>
                      <button
                        onClick={() => handleSetClientPriority(script.id, 'urgent')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all border ${
                          script.client_priority === 'urgent'
                            ? 'bg-red-500/20 text-red-300 border-red-500/30'
                            : 'bg-white/[0.04] text-white/40 border-white/[0.06] hover:bg-red-500/10 hover:text-red-300'
                        }`}
                      >
                        <Flame size={10} /> Urgente
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Script Detail Modal */}
      <AnimatePresence>
        {selectedScript && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm overflow-y-auto"
            onClick={() => setSelectedScript(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="max-w-2xl mx-auto my-8 sm:my-16"
              onClick={e => e.stopPropagation()}
            >
              <div className="bg-[#14141f] border border-white/[0.08] rounded-2xl overflow-hidden">
                {/* Cover header */}
                {(() => {
                  const cover = getCoverConfig(selectedScript);
                  const Icon = cover.icon;
                  const tag = getTag(selectedScript.video_type);
                  const cp = CLIENT_PRIORITY_CONFIG[selectedScript.client_priority];
                  return (
                    <div className={`relative h-28 bg-gradient-to-br ${cover.gradient}`} style={{ backgroundImage: cover.pattern }}>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Icon size={40} className="text-white/10" />
                      </div>
                      <div className="absolute top-3 left-3 flex items-center gap-2">
                        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/30 backdrop-blur-sm text-xs font-semibold text-white/90">
                          <Icon size={12} /> {cover.label}
                        </span>
                        <span className={`flex items-center gap-1 px-2 py-1 rounded-full ${tag.bg} ${tag.text} border ${tag.border} backdrop-blur-sm text-[10px] font-bold`}>
                          <Tag size={9} /> {tag.label}
                        </span>
                        {cp && (
                          <span className={`flex items-center gap-1 px-2 py-1 rounded-full ${cp.bg} ${cp.color} border ${cp.border} backdrop-blur-sm text-[10px] font-bold animate-pulse`}>
                            <cp.icon size={9} /> {cp.label}
                          </span>
                        )}
                      </div>
                      <button onClick={() => setSelectedScript(null)} className="absolute top-3 right-3 p-1.5 rounded-full bg-black/30 backdrop-blur-sm hover:bg-black/50 transition-colors">
                        <span className="text-white/70 text-sm">✕</span>
                      </button>
                    </div>
                  );
                })()}

                <div className="p-6 space-y-4">
                  <div>
                    <h2 className="text-xl font-bold">{selectedScript.title}</h2>
                    <p className="text-xs text-white/40 mt-1">
                      {format(new Date(selectedScript.created_at), "dd 'de' MMMM 'de' yyyy", { locale: pt })}
                    </p>
                  </div>

                  {/* Priority actions in modal */}
                  {isAuthenticated && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSetClientPriority(selectedScript.id, 'priority')}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                          selectedScript.client_priority === 'priority'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : 'bg-white/[0.04] text-white/40 border-white/[0.06] hover:bg-amber-500/10 hover:text-amber-300'
                        }`}
                      >
                        <AlertTriangle size={12} /> Quero gravar primeiro
                      </button>
                      <button
                        onClick={() => handleSetClientPriority(selectedScript.id, 'urgent')}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                          selectedScript.client_priority === 'urgent'
                            ? 'bg-red-500/20 text-red-300 border-red-500/30'
                            : 'bg-white/[0.04] text-white/40 border-white/[0.06] hover:bg-red-500/10 hover:text-red-300'
                        }`}
                      >
                        <Flame size={12} /> Urgente
                      </button>
                    </div>
                  )}

                  {/* Author */}
                  {selectedScript.created_by && authors[selectedScript.created_by] && (() => {
                    const author = authors[selectedScript.created_by!];
                    return (
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
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
                      </div>
                    );
                  })()}

                  {/* Script content */}
                  <ScrollArea className="max-h-[50vh]">
                    <div
                      className="prose prose-invert prose-sm max-w-none text-white/75 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: selectedScript.content }}
                    />
                  </ScrollArea>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
