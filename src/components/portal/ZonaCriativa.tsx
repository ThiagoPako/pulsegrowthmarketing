import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Film, Palette, Video, Image, Sparkles, User } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Script {
  id: string;
  title: string;
  content: string;
  content_format: string;
  video_type: string;
  created_at: string;
  created_by: string | null;
  priority: string;
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
}

const VIDEO_TYPE_CONFIG: Record<string, { label: string; icon: any; gradient: string; pattern: string }> = {
  reels: {
    label: 'Reels',
    icon: Film,
    gradient: 'from-rose-500/30 via-pink-600/20 to-purple-700/30',
    pattern: 'radial-gradient(circle at 20% 80%, rgba(244,63,94,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(168,85,247,0.15) 0%, transparent 50%)',
  },
  story: {
    label: 'Story',
    icon: Sparkles,
    gradient: 'from-amber-500/30 via-orange-500/20 to-red-600/30',
    pattern: 'radial-gradient(circle at 30% 70%, rgba(245,158,11,0.15) 0%, transparent 50%), radial-gradient(circle at 70% 30%, rgba(239,68,68,0.15) 0%, transparent 50%)',
  },
  criativo: {
    label: 'Criativo',
    icon: Palette,
    gradient: 'from-cyan-500/30 via-blue-500/20 to-indigo-600/30',
    pattern: 'radial-gradient(circle at 25% 75%, rgba(6,182,212,0.15) 0%, transparent 50%), radial-gradient(circle at 75% 25%, rgba(99,102,241,0.15) 0%, transparent 50%)',
  },
  institucional: {
    label: 'Institucional',
    icon: Video,
    gradient: 'from-emerald-500/30 via-teal-500/20 to-cyan-600/30',
    pattern: 'radial-gradient(circle at 20% 80%, rgba(16,185,129,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(6,182,212,0.15) 0%, transparent 50%)',
  },
  arte: {
    label: 'Arte',
    icon: Image,
    gradient: 'from-violet-500/30 via-purple-500/20 to-fuchsia-600/30',
    pattern: 'radial-gradient(circle at 30% 70%, rgba(139,92,246,0.15) 0%, transparent 50%), radial-gradient(circle at 70% 30%, rgba(217,70,239,0.15) 0%, transparent 50%)',
  },
};

const DEFAULT_CONFIG = {
  label: 'Conteúdo',
  icon: FileText,
  gradient: 'from-slate-500/30 via-gray-500/20 to-zinc-600/30',
  pattern: 'radial-gradient(circle at 50% 50%, rgba(148,163,184,0.1) 0%, transparent 50%)',
};

export default function ZonaCriativa({ clientId, clientColor }: Props) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [authors, setAuthors] = useState<Record<string, Author>>({});
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadScripts();
  }, [clientId]);

  const loadScripts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('scripts')
      .select('id, title, content, content_format, video_type, created_at, created_by, priority')
      .eq('client_id', clientId)
      .eq('is_endomarketing', false)
      .order('created_at', { ascending: false });

    if (data) {
      setScripts(data as Script[]);
      // Fetch authors
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

  const getConfig = (videoType: string) => VIDEO_TYPE_CONFIG[videoType] || DEFAULT_CONFIG;

  const stripHtml = (html: string) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-16 text-center">
        <div className="w-8 h-8 border-2 border-white/10 border-t-white/40 rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <motion.div
      key="criativa"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
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
            </p>
            <div className="flex gap-4 mt-6">
              <div className="text-center">
                <p className="text-2xl font-bold" style={{ color: `hsl(${clientColor})` }}>{scripts.length}</p>
                <p className="text-[10px] text-white/40">Roteiros</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-400">
                  {scripts.filter(s => s.video_type === 'reels').length}
                </p>
                <p className="text-[10px] text-white/40">Reels</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-400">
                  {scripts.filter(s => s.video_type === 'story').length}
                </p>
                <p className="text-[10px] text-white/40">Stories</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Scripts Grid */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 pb-20 -mt-4">
        {scripts.length === 0 ? (
          <div className="text-center py-24">
            <FileText size={48} className="mx-auto mb-4 text-white/10" />
            <p className="text-lg text-white/30 font-medium">Nenhum roteiro ainda</p>
            <p className="text-sm text-white/20 mt-1">Os roteiros criados pela equipe aparecerão aqui.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {scripts.map((script, idx) => {
              const config = getConfig(script.video_type);
              const Icon = config.icon;
              const author = script.created_by ? authors[script.created_by] : null;
              const plainContent = stripHtml(script.content);
              const excerpt = plainContent.length > 120 ? plainContent.slice(0, 120) + '...' : plainContent;

              return (
                <motion.button
                  key={script.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  onClick={() => setSelectedScript(script)}
                  className="group text-left rounded-2xl overflow-hidden border border-white/[0.06] hover:border-white/[0.12] transition-all duration-300 hover:scale-[1.02] hover:shadow-xl bg-white/[0.02]"
                >
                  {/* Cover */}
                  <div
                    className={`relative h-32 sm:h-36 bg-gradient-to-br ${config.gradient} overflow-hidden`}
                    style={{ backgroundImage: config.pattern }}
                  >
                    {/* Decorative elements */}
                    <div className="absolute inset-0 opacity-30">
                      <div className="absolute top-4 right-4 w-20 h-20 rounded-full border border-white/10" />
                      <div className="absolute bottom-4 left-4 w-12 h-12 rounded-lg border border-white/10 rotate-12" />
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        <Icon size={48} className="text-white/10" />
                      </div>
                    </div>

                    {/* Type badge */}
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/30 backdrop-blur-sm text-[10px] font-semibold text-white/90">
                      <Icon size={10} />
                      {config.label}
                    </div>

                    {/* Priority */}
                    {script.priority === 'alta' && (
                      <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-red-500/30 backdrop-blur-sm text-[9px] font-bold text-red-300">
                        PRIORIDADE
                      </div>
                    )}

                    {/* Date */}
                    <div className="absolute bottom-3 right-3 text-[10px] text-white/50 font-medium">
                      {format(new Date(script.created_at), "dd MMM", { locale: pt })}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-white/90 line-clamp-2 group-hover:text-white transition-colors">
                      {script.title}
                    </h4>
                    <p className="text-[11px] text-white/35 line-clamp-3 leading-relaxed">
                      {excerpt || 'Sem descrição'}
                    </p>

                    {/* Author */}
                    {author && (
                      <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04]">
                        {author.avatar_url ? (
                          <img
                            src={author.avatar_url}
                            alt={author.display_name || author.name}
                            className="w-6 h-6 rounded-full object-cover ring-1 ring-white/10"
                          />
                        ) : (
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                            style={{ background: `hsl(${clientColor})` }}
                          >
                            {(author.display_name || author.name).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-white/60 truncate">
                            {author.display_name || author.name}
                          </p>
                          {author.job_title && (
                            <p className="text-[9px] text-white/30 truncate">{author.job_title}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {/* Script Detail Modal */}
      <AnimatePresence>
        {selectedScript && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm overflow-y-auto"
            onClick={() => setSelectedScript(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="max-w-2xl mx-auto my-8 sm:my-16"
              onClick={e => e.stopPropagation()}
            >
              <div className="bg-[#14141f] border border-white/[0.08] rounded-2xl overflow-hidden">
                {/* Cover header */}
                {(() => {
                  const config = getConfig(selectedScript.video_type);
                  const Icon = config.icon;
                  return (
                    <div
                      className={`relative h-28 bg-gradient-to-br ${config.gradient}`}
                      style={{ backgroundImage: config.pattern }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Icon size={40} className="text-white/10" />
                      </div>
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/30 backdrop-blur-sm text-xs font-semibold text-white/90">
                        <Icon size={12} />
                        {config.label}
                      </div>
                      <button
                        onClick={() => setSelectedScript(null)}
                        className="absolute top-3 right-3 p-1.5 rounded-full bg-black/30 backdrop-blur-sm hover:bg-black/50 transition-colors"
                      >
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
