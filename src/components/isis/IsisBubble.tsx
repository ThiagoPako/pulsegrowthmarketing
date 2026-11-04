import { useLocation, useNavigate } from 'react-router-dom';
import IsisAvatar from '@/components/isis/IsisAvatar';
import { useIsisAccess } from '@/hooks/useIsis';

/**
 * O rostinho da Ísis no canto da tela, em todas as páginas, para quem tem o módulo (04/11/2026: "fácil acesso, a gente
 * ver o tempo inteiro ali no sistema"). Clicou, abre a conversa; a bolinha conta as respostas que a pessoa ainda não viu.
 */
export default function IsisBubble() {
  const { access, unread } = useIsisAccess();
  const location = useLocation();
  const navigate = useNavigate();
  if (!access || location.pathname.startsWith('/isis')) return null;
  return (
    <button
      type="button"
      onClick={() => navigate('/isis')}
      className="group fixed bottom-4 right-[5.25rem] sm:right-24 z-50 h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-gradient-to-br from-orange-100 to-pink-100 dark:from-orange-950 dark:to-pink-950 border-2 border-orange-400 shadow-lg shadow-orange-500/25 flex items-end justify-center overflow-hidden transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
      aria-label={unread ? `Ísis: ${unread} resposta${unread > 1 ? 's' : ''} nova${unread > 1 ? 's' : ''}` : 'Falar com a Ísis'}
      title="Falar com a Ísis"
    >
      <IsisAvatar size={58} className="translate-y-1.5" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center ring-2 ring-background">
          {unread}
        </span>
      )}
    </button>
  );
}
