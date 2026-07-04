// Paleta padrão por categoria — usada por Layout (sidebar) e QuickShortcutsBar.
// Classes literais para o Tailwind detectar via purge.

export type TintKey = 'blue' | 'emerald' | 'amber' | 'pink' | 'cyan' | 'rose' | 'violet' | 'slate';

export const CATEGORY_TINT: Record<TintKey, {
  icon: string;
  label: string;
  activeBg: string;
  activeText: string;
  hoverBg: string;
  dot: string;
  ring: string;
  hoverRing: string;
  glow: string;
  hoverGlow: string;
  iconGlow: string;
  hoverIconGlow: string;
  panel: string;      // painel neon da categoria no menu lateral
  chipActive: string; // pílula ativa (QuickShortcuts)
  chipHover: string;  // pílula hover
}> = {
  blue:    { icon: 'text-blue-500',    label: 'text-blue-500/80',    activeBg: 'bg-blue-500/15',    activeText: 'text-blue-600 dark:text-blue-300',    hoverBg: 'hover:bg-blue-500/10',    dot: 'bg-blue-500',    ring: 'ring-1 ring-blue-500/30',    hoverRing: 'hover:ring-1 hover:ring-blue-500/30',    glow: 'shadow-[0_0_12px_-2px_rgba(59,130,246,0.55)]',   hoverGlow: 'hover:shadow-[0_0_12px_-2px_rgba(59,130,246,0.55)]',   iconGlow: 'drop-shadow-[0_0_5px_rgba(59,130,246,0.7)]',   hoverIconGlow: 'group-hover:drop-shadow-[0_0_5px_rgba(59,130,246,0.7)]',   panel: 'bg-blue-500/10 ring-1 ring-blue-500/25 shadow-[0_0_14px_-6px_rgba(59,130,246,0.55)]',       chipActive: 'bg-blue-500/20 text-blue-600 dark:text-blue-300 ring-1 ring-blue-500/40 shadow-[0_0_10px_-2px_rgba(59,130,246,0.6)]',       chipHover: 'hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-300' },
  emerald: { icon: 'text-emerald-500', label: 'text-emerald-500/80', activeBg: 'bg-emerald-500/15', activeText: 'text-emerald-600 dark:text-emerald-300', hoverBg: 'hover:bg-emerald-500/10', dot: 'bg-emerald-500', ring: 'ring-1 ring-emerald-500/30', hoverRing: 'hover:ring-1 hover:ring-emerald-500/30', glow: 'shadow-[0_0_12px_-2px_rgba(16,185,129,0.55)]',  hoverGlow: 'hover:shadow-[0_0_12px_-2px_rgba(16,185,129,0.55)]',  iconGlow: 'drop-shadow-[0_0_5px_rgba(16,185,129,0.7)]',  hoverIconGlow: 'group-hover:drop-shadow-[0_0_5px_rgba(16,185,129,0.7)]',  panel: 'bg-emerald-500/10 ring-1 ring-emerald-500/25 shadow-[0_0_14px_-6px_rgba(16,185,129,0.55)]', chipActive: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 ring-1 ring-emerald-500/40 shadow-[0_0_10px_-2px_rgba(16,185,129,0.6)]', chipHover: 'hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-300' },
  amber:   { icon: 'text-amber-500',   label: 'text-amber-500/80',   activeBg: 'bg-amber-500/15',   activeText: 'text-amber-600 dark:text-amber-300',   hoverBg: 'hover:bg-amber-500/10',   dot: 'bg-amber-500',   ring: 'ring-1 ring-amber-500/30',   hoverRing: 'hover:ring-1 hover:ring-amber-500/30',   glow: 'shadow-[0_0_12px_-2px_rgba(245,158,11,0.55)]',  hoverGlow: 'hover:shadow-[0_0_12px_-2px_rgba(245,158,11,0.55)]',  iconGlow: 'drop-shadow-[0_0_5px_rgba(245,158,11,0.7)]',  hoverIconGlow: 'group-hover:drop-shadow-[0_0_5px_rgba(245,158,11,0.7)]',  panel: 'bg-amber-500/10 ring-1 ring-amber-500/25 shadow-[0_0_14px_-6px_rgba(245,158,11,0.55)]',    chipActive: 'bg-amber-500/20 text-amber-600 dark:text-amber-300 ring-1 ring-amber-500/40 shadow-[0_0_10px_-2px_rgba(245,158,11,0.6)]',     chipHover: 'hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-300' },
  pink:    { icon: 'text-pink-500',    label: 'text-pink-500/80',    activeBg: 'bg-pink-500/15',    activeText: 'text-pink-600 dark:text-pink-300',    hoverBg: 'hover:bg-pink-500/10',    dot: 'bg-pink-500',    ring: 'ring-1 ring-pink-500/30',    hoverRing: 'hover:ring-1 hover:ring-pink-500/30',    glow: 'shadow-[0_0_12px_-2px_rgba(236,72,153,0.55)]',  hoverGlow: 'hover:shadow-[0_0_12px_-2px_rgba(236,72,153,0.55)]',  iconGlow: 'drop-shadow-[0_0_5px_rgba(236,72,153,0.7)]',  hoverIconGlow: 'group-hover:drop-shadow-[0_0_5px_rgba(236,72,153,0.7)]',  panel: 'bg-pink-500/10 ring-1 ring-pink-500/25 shadow-[0_0_14px_-6px_rgba(236,72,153,0.55)]',      chipActive: 'bg-pink-500/20 text-pink-600 dark:text-pink-300 ring-1 ring-pink-500/40 shadow-[0_0_10px_-2px_rgba(236,72,153,0.6)]',         chipHover: 'hover:bg-pink-500/10 hover:text-pink-600 dark:hover:text-pink-300' },
  cyan:    { icon: 'text-cyan-500',    label: 'text-cyan-500/80',    activeBg: 'bg-cyan-500/15',    activeText: 'text-cyan-600 dark:text-cyan-300',    hoverBg: 'hover:bg-cyan-500/10',    dot: 'bg-cyan-500',    ring: 'ring-1 ring-cyan-500/30',    hoverRing: 'hover:ring-1 hover:ring-cyan-500/30',    glow: 'shadow-[0_0_12px_-2px_rgba(6,182,212,0.55)]',   hoverGlow: 'hover:shadow-[0_0_12px_-2px_rgba(6,182,212,0.55)]',   iconGlow: 'drop-shadow-[0_0_5px_rgba(6,182,212,0.7)]',   hoverIconGlow: 'group-hover:drop-shadow-[0_0_5px_rgba(6,182,212,0.7)]',   panel: 'bg-cyan-500/10 ring-1 ring-cyan-500/25 shadow-[0_0_14px_-6px_rgba(6,182,212,0.55)]',        chipActive: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 ring-1 ring-cyan-500/40 shadow-[0_0_10px_-2px_rgba(6,182,212,0.6)]',          chipHover: 'hover:bg-cyan-500/10 hover:text-cyan-600 dark:hover:text-cyan-300' },
  rose:    { icon: 'text-rose-500',    label: 'text-rose-500/80',    activeBg: 'bg-rose-500/15',    activeText: 'text-rose-600 dark:text-rose-300',    hoverBg: 'hover:bg-rose-500/10',    dot: 'bg-rose-500',    ring: 'ring-1 ring-rose-500/30',    hoverRing: 'hover:ring-1 hover:ring-rose-500/30',    glow: 'shadow-[0_0_12px_-2px_rgba(244,63,94,0.55)]',   hoverGlow: 'hover:shadow-[0_0_12px_-2px_rgba(244,63,94,0.55)]',   iconGlow: 'drop-shadow-[0_0_5px_rgba(244,63,94,0.7)]',   hoverIconGlow: 'group-hover:drop-shadow-[0_0_5px_rgba(244,63,94,0.7)]',   panel: 'bg-rose-500/10 ring-1 ring-rose-500/25 shadow-[0_0_14px_-6px_rgba(244,63,94,0.55)]',        chipActive: 'bg-rose-500/20 text-rose-600 dark:text-rose-300 ring-1 ring-rose-500/40 shadow-[0_0_10px_-2px_rgba(244,63,94,0.6)]',          chipHover: 'hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-300' },
  violet:  { icon: 'text-violet-500',  label: 'text-violet-500/80',  activeBg: 'bg-violet-500/15',  activeText: 'text-violet-600 dark:text-violet-300', hoverBg: 'hover:bg-violet-500/10', dot: 'bg-violet-500', ring: 'ring-1 ring-violet-500/30', hoverRing: 'hover:ring-1 hover:ring-violet-500/30', glow: 'shadow-[0_0_12px_-2px_rgba(139,92,246,0.55)]', hoverGlow: 'hover:shadow-[0_0_12px_-2px_rgba(139,92,246,0.55)]', iconGlow: 'drop-shadow-[0_0_5px_rgba(139,92,246,0.7)]', hoverIconGlow: 'group-hover:drop-shadow-[0_0_5px_rgba(139,92,246,0.7)]', panel: 'bg-violet-500/10 ring-1 ring-violet-500/25 shadow-[0_0_14px_-6px_rgba(139,92,246,0.55)]', chipActive: 'bg-violet-500/20 text-violet-600 dark:text-violet-300 ring-1 ring-violet-500/40 shadow-[0_0_10px_-2px_rgba(139,92,246,0.6)]', chipHover: 'hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-300' },
  slate:   { icon: 'text-slate-300',   label: 'text-slate-300/80',   activeBg: 'bg-slate-500/20',   activeText: 'text-slate-100',                        hoverBg: 'hover:bg-slate-500/10',   dot: 'bg-slate-300',   ring: 'ring-1 ring-slate-400/30',   hoverRing: 'hover:ring-1 hover:ring-slate-400/30',   glow: 'shadow-[0_0_12px_-2px_rgba(148,163,184,0.55)]', hoverGlow: 'hover:shadow-[0_0_12px_-2px_rgba(148,163,184,0.55)]', iconGlow: 'drop-shadow-[0_0_5px_rgba(148,163,184,0.7)]', hoverIconGlow: 'group-hover:drop-shadow-[0_0_5px_rgba(148,163,184,0.7)]', panel: 'bg-slate-500/10 ring-1 ring-slate-400/25 shadow-[0_0_14px_-6px_rgba(148,163,184,0.55)]',   chipActive: 'bg-slate-500/25 text-slate-100 ring-1 ring-slate-400/40 shadow-[0_0_10px_-2px_rgba(148,163,184,0.6)]',                       chipHover: 'hover:bg-slate-500/15 hover:text-foreground' },
};

// Categoria por rota — fonte única de verdade para cor de qualquer módulo.
export const PATH_CATEGORY: Record<string, TintKey> = {
  // Principal (blue)
  '/dashboard': 'blue', '/conteudo': 'blue', '/roteiros': 'blue',
  // Gestão de Tarefas (emerald) — controles e agenda
  '/controle-gravacoes': 'emerald', '/controle-edicao': 'emerald', '/agenda': 'emerald',
  // Produção (violet)
  '/edicao': 'violet', '/edicao/kanban': 'violet', '/videomakers': 'violet',
  // Produção Criativo (cyan)
  '/entregas-social': 'cyan', '/trafego': 'cyan', '/desempenho': 'cyan',
  '/conteudos-portal': 'cyan', '/encurtador': 'cyan', '/clube-descontos': 'cyan',
  // Designer (pink)
  '/designer': 'pink', '/landing-admin': 'pink',
  // Ferramentas (slate)
  '/panfletagem': 'slate',
  // Gestão (amber)
  '/clientes': 'amber', '/relacionamento': 'amber', '/depoimentos': 'amber',
  '/onboarding-gestao': 'amber', '/equipe': 'amber', '/planos': 'amber', '/relatorios': 'amber',
  '/endomarketing/tarefas': 'amber',
  // Comercial (rose)
  '/crm': 'rose', '/propostas': 'rose', '/apresentacao': 'rose', '/metas': 'rose',
  // Endomarketing (emerald)
  '/endomarketing': 'emerald', '/endomarketing/contratos': 'emerald',
  '/endomarketing/relatorios': 'emerald', '/endomarketing/calendario': 'emerald',
  // Administrativa (emerald — destaque especial via speedometer)
  '/financeiro': 'emerald', '/custo-conteudo': 'emerald',
  // Sistema (slate)
  '/financeiro/chat': 'slate', '/financeiro/apis': 'slate', '/whatsapp': 'slate',
  '/automacoes': 'slate', '/painel-tv': 'slate',
  '/treinamento': 'slate', '/treinamento-gestao': 'slate',
  '/portal-videos': 'slate', '/configuracoes': 'slate',
};

export const getTintForPath = (path: string): TintKey => {
  if (PATH_CATEGORY[path]) return PATH_CATEGORY[path];
  // Longest-prefix match para rotas aninhadas (ex.: /crm/123 → 'rose').
  let best: { key: TintKey; len: number } | null = null;
  for (const [prefix, key] of Object.entries(PATH_CATEGORY)) {
    if (path === prefix || path.startsWith(prefix + '/')) {
      if (!best || prefix.length > best.len) best = { key, len: prefix.length };
    }
  }
  return best?.key ?? 'slate';
};

// Cores CSS puras por categoria — úteis para gradients/inline styles em cabeçalhos/breadcrumbs.
export const CATEGORY_RGB: Record<TintKey, string> = {
  blue: '59,130,246',
  emerald: '16,185,129',
  amber: '245,158,11',
  pink: '236,72,153',
  cyan: '6,182,212',
  rose: '244,63,94',
  violet: '139,92,246',
  slate: '148,163,184',
};

export const getCategoryRgb = (path: string): string => CATEGORY_RGB[getTintForPath(path)];
